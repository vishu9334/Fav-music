import {
  AuthError, AuthUser, IAuthRepository, IAuthService, IGoogleAuthProvider,
  ISessionRepository, SessionTokens, IAuthenticatedSession,
} from '../contracts/auth.contract';
import { LocalProfileRepository } from '../repositories/local-profile.repository';

/** Serializes login, rotation and logout; access tokens remain in memory only. */
export class AuthService implements IAuthService, IAuthenticatedSession {
  private access: { token: string; expiresAt: number; userId?: string } | null = null;
  private user: AuthUser | null = null;
  private epoch = 0;
  private logoutRequested = false;
  private pending: Promise<unknown> = Promise.resolve();

  public constructor(
    private readonly repository: IAuthRepository,
    private readonly sessions: ISessionRepository,
    private readonly google: IGoogleAuthProvider,
    private readonly now: () => number = Date.now,
    private readonly assertEnabled: () => void = () => {},
    private readonly profileRepo = new LocalProfileRepository()
  ) {}

  public async updateUser(patch: Partial<AuthUser>): Promise<void> {
    if (this.user) {
      this.user = { ...this.user, ...patch };
      await this.profileRepo.save(this.user.id, {
        displayName: patch.displayName,
        avatarUrl: patch.avatarUrl,
        chatRetentionPreference: patch.chatRetentionPreference,
      });
    }
  }

  private async enrichProfile(user: AuthUser): Promise<AuthUser> {
    try {
      const local = await this.profileRepo.load(user.id);
      if (!local) return user;
      return {
        ...user,
        displayName: local.displayName ?? user.displayName,
        avatarUrl: local.avatarUrl !== undefined ? local.avatarUrl : user.avatarUrl,
        chatRetentionPreference: local.chatRetentionPreference ?? user.chatRetentionPreference,
      };
    } catch {
      return user;
    }
  }

  public restore(): Promise<AuthUser | null> {
    const epoch = this.epoch;
    return this.serialize(() => this.restoreSession(epoch));
  }
  private async restoreSession(epoch = this.epoch): Promise<AuthUser | null> {
      if (epoch !== this.epoch) return null;
      this.assertEnabled();
      await this.persistLogoutIntent();
      await this.flushLogout();
      const stored = await this.sessions.read();
      if (epoch !== this.epoch) return null;
      if (!stored.refreshToken) { this.access = null; this.user = null; return null; }
      try {
        if (this.access && this.access.expiresAt > this.now() + 30000) {
          try {
            const user = await this.repository.me(this.access.token);
            if (epoch !== this.epoch) return null;
            this.bindIdentity(user, stored.userId ?? this.access.userId);
            const enriched = await this.enrichProfile(user);
            this.user = enriched;
            return enriched;
          } catch (error) {
            if (!(error instanceof AuthError) || error.code !== 'UNAUTHORIZED') throw error;
          }
        }
        const tokens = await this.repository.refresh(stored.refreshToken);
        if (!await this.commit(tokens, stored.userId, epoch)) return null;
        const user = await this.repository.me(tokens.accessToken);
        if (epoch !== this.epoch) return null;
        this.bindIdentity(user, stored.userId);
        await this.sessions.write({ refreshToken: tokens.refreshToken, userId: user.id });
        if (epoch !== this.epoch) { await this.retire(tokens); return null; }
        this.access!.userId = user.id;
        const enriched = await this.enrichProfile(user);
        this.user = enriched;
        return enriched;
      } catch (error) {
        if (error instanceof AuthError && (error.code === 'UNAUTHORIZED' || error.code === 'FORBIDDEN')) {
          this.access = null; this.user = null;
          const current = await this.sessions.read();
          await this.sessions.write({ pendingLogout: current.refreshToken ?? stored.refreshToken });
          try { await this.flushLogout(); } catch { /* Retry revocation when connected. */ }
        }
        throw error;
      }
  }
  private bindIdentity(user: AuthUser, expected?: string): void {
    if (expected && user.id !== expected) throw new AuthError('UNAUTHORIZED', 'The restored session identity changed. Sign in again.');
  }

  public login(): Promise<AuthUser | null> {
    const epoch = this.epoch;
    return this.serialize(async () => {
      if (epoch !== this.epoch) return null;
      this.assertEnabled();
      await this.persistLogoutIntent();
      await this.flushLogout();
      // Do not overwrite a still-restorable session with an unrelated login.
      const stored = await this.sessions.read();
      if (stored.refreshToken) {
        throw new AuthError('UNAUTHORIZED', 'Restore or sign out of the existing session before signing in again.');
      }
      await this.repository.prepare?.();
      if (epoch !== this.epoch) return null;
      const idToken = await this.google.signIn();
      if (!idToken || epoch !== this.epoch) return null;
      const result = await this.repository.login(idToken);
      if (!await this.commit(result, result.user.id, epoch)) return null;
      const enriched = await this.enrichProfile(result.user);
      this.user = enriched;
      return enriched;
    });
  }

  public logout(): Promise<boolean> {
    this.epoch++; this.access = null; this.user = null; this.logoutRequested = true;
    return this.serialize(async () => {
      // Persist revocation intent before removing the active local credentials.
      this.logoutRequested = true; // An older in-flight login may have just created a new credential.
      await this.persistLogoutIntent();
      this.access = null; this.user = null;
      let revoked = true;
      try { await this.flushLogout(); } catch { revoked = false; }
      try { await this.google.signOut(); } catch { /* Local app credentials are already removed. */ }
      return revoked;
    });
  }
  private async persistLogoutIntent(): Promise<void> {
    if (!this.logoutRequested) return;
    const epoch = this.epoch;
    const stored = await this.sessions.read();
    await this.sessions.write({ pendingLogout: stored.refreshToken ?? stored.pendingLogout });
    if (epoch === this.epoch) this.logoutRequested = false;
  }

  public getExpiresAt(): number | null { return this.access?.expiresAt ?? null; }

  /** Tokens stay inside this service; callers bind operations to a verified account. */
  public withAccessToken<T>(userId: string, request: (accessToken: string) => Promise<T>): Promise<T> {
    const epoch = this.epoch;
    return this.serialize(async () => {
      if (epoch !== this.epoch) throw new AuthError('UNAUTHORIZED', 'This account session is no longer active.');
      this.assertEnabled();
      const check = () => { if (epoch !== this.epoch || !this.access || this.user?.id !== userId) throw new AuthError('UNAUTHORIZED', 'This account session is no longer active.'); };
      if (!this.access || this.access.expiresAt <= this.now() + 30_000 || !this.user) await this.restoreSession(epoch);
      check();
      try { const result = await request(this.access!.token); check(); return result; }
      catch (error) {
        if (!(error instanceof AuthError) || error.code !== 'UNAUTHORIZED' || epoch !== this.epoch) throw error;
        this.access = null; await this.restoreSession(epoch); check();
        const result = await request(this.access!.token); check(); return result;
      }
    });
  }

  private async retire(tokens: SessionTokens): Promise<void> {
    this.access = null; this.user = null;
    try { await this.sessions.write({ pendingLogout: tokens.refreshToken }); }
    catch (error) {
      try { await this.repository.logout(tokens.refreshToken); } catch { /* Never expose an abandoned session. */ }
      throw error;
    }
  }

  private async commit(tokens: SessionTokens, userId: string | undefined, epoch: number): Promise<boolean> {
    if (epoch !== this.epoch) { await this.retire(tokens); return false; }
    try {
      await this.sessions.write({ refreshToken: tokens.refreshToken, ...(userId ? { userId } : {}) });
    } catch (error) {
      this.access = null;
      try { await this.repository.logout(tokens.refreshToken); } catch { /* Expiry bounds this orphaned session. */ }
      throw error;
    }
    if (epoch !== this.epoch) { await this.retire(tokens); return false; }
    this.access = { token: tokens.accessToken, expiresAt: this.now() + tokens.expiresIn * 1000, userId };
    return true;
  }

  private async flushLogout(): Promise<void> {
    const stored = await this.sessions.read();
    if (!stored.pendingLogout) return;
    await this.repository.logout(stored.pendingLogout);
    await this.sessions.write({ refreshToken: stored.refreshToken });
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation);
    this.pending = result.catch(() => {});
    return result;
  }
}
