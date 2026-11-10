import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../services/auth.service';
import { AuthController } from '../controllers/auth.controller';
import type { AuthUser, IAuthRepository, IGoogleAuthProvider, ISessionRepository, LoginResult, SessionTokens, StoredSession } from '../contracts/auth.contract';

const user: AuthUser = { id: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.invalid', displayName: 'Fixture', avatarUrl: null, chatRetentionPreference: 'EPHEMERAL_SESSION_ONLY', createdAt: '2026-11-07' };
const tokens: SessionTokens = { accessToken: 'fixture-access', refreshToken: 'fixture-refresh', expiresIn: 900 };
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) }; }
function fixture() {
  let saved: StoredSession = {};
  const writes: StoredSession[] = [];
  const storage: ISessionRepository = { read: vi.fn(async () => saved), write: vi.fn(async value => { saved = value; writes.push(value); }) };
  const repository: IAuthRepository = { login: vi.fn(async () => ({ ...tokens, user })), refresh: vi.fn(async () => tokens), me: vi.fn(async () => user), logout: vi.fn(async () => {}) };
  const google: IGoogleAuthProvider = { signIn: vi.fn(async () => 'fixture-google-token'), signOut: vi.fn(async () => {}) };
  return { repository, storage, google, writes, saved: () => saved, seed: (value: StoredSession) => { saved = value; }, service: new AuthService(repository, storage, google, () => 1000) };
}

describe('latest account intent wins over delayed authentication', () => {
  it('keeps an incomplete Google sign-in visible instead of silently returning to an unexplained anonymous screen', async () => {
    const f = fixture(); vi.mocked(f.google.signIn).mockResolvedValueOnce(null);
    const controller = new AuthController(f.service); await controller.login();
    expect(controller.getSnapshot()).toMatchObject({ status: 'anonymous', user: null, message: 'Google sign-in didn’t finish. Please try again.' });
    expect(f.repository.login).not.toHaveBeenCalled();
  });
  it('does not redirect a failed Google sign-in or persist credentials for it', async () => {
    const f = fixture(); vi.mocked(f.google.signIn).mockRejectedValueOnce(new Error('Native SDK failure'));
    const controller = new AuthController(f.service); await controller.login();
    expect(controller.getSnapshot()).toMatchObject({ status: 'error', user: null });
    expect(f.repository.login).not.toHaveBeenCalled(); expect(f.writes).toEqual([]);
  });
  it('retires a server login arriving after logout without exposing it as an authenticated result', async () => {
    const f = fixture(), reply = deferred<LoginResult>();
    vi.mocked(f.repository.login).mockReturnValueOnce(reply.promise);
    const login = f.service.login();
    await vi.waitFor(() => expect(f.repository.login).toHaveBeenCalledOnce());
    const logout = f.service.logout(); reply.resolve({ ...tokens, user });
    expect(await login).toBeNull(); await logout;
    expect(f.writes.some(value => !!value.refreshToken)).toBe(false);
    expect(f.repository.logout).toHaveBeenCalledWith(tokens.refreshToken);
    expect(f.saved().refreshToken).toBeUndefined();
  });
  it('retires refresh credentials arriving after logout before requesting a profile', async () => {
    const f = fixture(), reply = deferred<SessionTokens>(); f.seed({ refreshToken: 'old-fixture', userId: user.id });
    vi.mocked(f.repository.refresh).mockReturnValueOnce(reply.promise);
    const restore = f.service.restore();
    await vi.waitFor(() => expect(f.repository.refresh).toHaveBeenCalledOnce());
    const logout = f.service.logout(); reply.resolve(tokens);
    expect(await restore).toBeNull(); await logout;
    expect(f.repository.me).not.toHaveBeenCalled();
    expect(f.repository.logout).toHaveBeenCalledWith(tokens.refreshToken);
    expect(f.saved().refreshToken).toBeUndefined();
  });
  it('does not return a delayed cached-session profile after logout', async () => {
    const f = fixture(), reply = deferred<AuthUser>(); await f.service.login();
    vi.mocked(f.repository.me).mockReturnValueOnce(reply.promise);
    const restore = f.service.restore();
    await vi.waitFor(() => expect(f.repository.me).toHaveBeenCalledOnce());
    const logout = f.service.logout(); reply.resolve(user);
    expect(await restore).toBeNull(); await logout;
    expect(f.service.getExpiresAt()).toBeNull();
  });
  it('allows a new sign-in intent after logout instead of coalescing it into the obsolete login', async () => {
    const f = fixture(), reply = deferred<LoginResult>(), nextUser = { ...user, id: '22222222-2222-4222-8222-222222222222' };
    vi.mocked(f.repository.login).mockReturnValueOnce(reply.promise).mockResolvedValueOnce({ ...tokens, refreshToken: 'next-fixture', user: nextUser });
    const controller = new AuthController(f.service), first = controller.login();
    await vi.waitFor(() => expect(f.repository.login).toHaveBeenCalledOnce());
    const logout = controller.logout(), next = controller.login();
    expect(next).not.toBe(first); reply.resolve({ ...tokens, user });
    await Promise.all([first, logout, next]);
    expect(controller.getSnapshot()).toMatchObject({ status: 'authenticated', user: nextUser });
    expect(f.google.signIn).toHaveBeenCalledTimes(2);
    expect(f.saved()).toMatchObject({ refreshToken: 'next-fixture', userId: nextUser.id });
  });
});
