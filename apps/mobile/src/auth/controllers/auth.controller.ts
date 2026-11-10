import { AuthError, AuthUser, IAuthService } from '../contracts/auth.contract';

export interface AuthState {
  readonly status: 'idle' | 'loading' | 'anonymous' | 'authenticated' | 'offline' | 'error';
  readonly user: AuthUser | null;
  readonly message: string | null;
}

/** Presentation state never contains Google tokens or application credentials. */
export class AuthController {
  private state: AuthState = { status: 'idle', user: null, message: null };
  private readonly listeners = new Set<() => void>();
  private inFlight: Promise<void> | null = null;
  private generation = 0;

  public constructor(private readonly service: IAuthService) {}
  public getSnapshot = (): AuthState => this.state;
  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  public getExpiresAt = (): number | null => this.service.getExpiresAt?.() ?? null;

  public restore = (): Promise<void> => this.run(() => this.service.restore());
  public login = (): Promise<void> => this.run(() => this.service.login(), 'Google sign-in didn’t finish. Please try again.');

  public updateUser = (patch: Partial<AuthUser>): Promise<void> => {
    if (!this.state.user) return Promise.resolve();
    const updated: AuthUser = { ...this.state.user, ...patch };
    this.set({ ...this.state, user: updated });
    return this.service.updateUser?.(patch) ?? Promise.resolve();
  };

  public logout = async (): Promise<void> => {
    const generation = ++this.generation;
    this.inFlight = null;
    this.set({ status: 'loading', user: null, message: null });
    try {
      const revoked = await this.service.logout();
      if (generation !== this.generation) return;
      this.set({ status: 'anonymous', user: null,
        message: revoked ? null : 'Signed out on this device. Server sign-out will finish when you reconnect.' });
    } catch (error) {
      if (generation === this.generation) this.fail(error);
    }
  };

  private run(operation: () => Promise<AuthUser | null>, incompleteMessage: string | null = null): Promise<void> {
    if (this.inFlight) return this.inFlight;
    const generation = ++this.generation;
    this.set({ status: 'loading', user: this.state.user, message: null });
    const pending = operation().then((user) => {
      if (generation !== this.generation) return;
      this.set({ status: user ? 'authenticated' : 'anonymous', user, message: user ? null : incompleteMessage });
    }).catch((error: unknown) => {
      if (generation === this.generation) this.fail(error);
    }).finally(() => { if (this.inFlight === pending) this.inFlight = null; });
    this.inFlight = pending;
    return pending;
  }

  private fail(error: unknown): void {
    this.set({ status: error instanceof AuthError && error.code === 'OFFLINE' ? 'offline' : 'error',
      user: null, message: error instanceof AuthError ? error.message : 'Authentication could not be completed. Please retry.' });
  }
  private set(state: AuthState): void {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
}
