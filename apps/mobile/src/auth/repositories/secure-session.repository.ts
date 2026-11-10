import { AuthError, ISessionRepository, StoredSession } from '../contracts/auth.contract';

/** Android Keystore-backed storage. Only refresh/revocation credentials persist. */
export class SecureSessionRepository implements ISessionRepository {
  private readonly key = 'aadat.auth.session.v1';

  public async read(): Promise<StoredSession> {
    try {
      const store = await import('expo-secure-store');
      const raw = await store.getItemAsync(this.key);
      if (!raw) return {};
      const value: unknown = JSON.parse(raw);
      if (!value || typeof value !== 'object') throw new Error('Invalid session record');
      const record = value as StoredSession;
      if ((record.refreshToken !== undefined && typeof record.refreshToken !== 'string')
        || (record.pendingLogout !== undefined && typeof record.pendingLogout !== 'string')
        || [record.refreshToken, record.pendingLogout].some((token) => token !== undefined && (!token || token.length > 4096 || /\s/.test(token)))
        || (record.userId !== undefined && (typeof record.userId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(record.userId)))
        || (record.refreshToken !== undefined && record.pendingLogout !== undefined)) {
        throw new Error('Invalid session credentials');
      }
      return { refreshToken: record.refreshToken, pendingLogout: record.pendingLogout, userId: record.userId };
    } catch {
      throw new AuthError('STORAGE', 'Secure sign-in is unavailable in this app version. Please update the app.');
    }
  }

  public async write(session: StoredSession): Promise<void> {
    try {
      const store = await import('expo-secure-store');
      if (!session.refreshToken && !session.pendingLogout) {
        await store.deleteItemAsync(this.key);
      } else {
        await store.setItemAsync(this.key, JSON.stringify({ refreshToken: session.refreshToken, pendingLogout: session.pendingLogout, userId: session.userId }), {
          keychainAccessible: store.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
      }
    } catch {
      throw new AuthError('STORAGE', 'Could not securely save the session. Please retry.');
    }
  }
}
