import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError, AuthUser, IAuthRepository, IGoogleAuthProvider, ISessionRepository, StoredSession } from '../contracts/auth.contract';
import { AuthService } from '../services/auth.service';
import { AuthController } from '../controllers/auth.controller';

const user: AuthUser = { id: 'server-user', email: 'verified@example.com', displayName: 'Listener',
  avatarUrl: null, chatRetentionPreference: 'EPHEMERAL_SESSION_ONLY', createdAt: '2026-11-05' };
const tokens = { accessToken: 'access', refreshToken: 'refresh', expiresIn: 900 };
let saved: StoredSession;
let repository: IAuthRepository;
let storage: ISessionRepository;
let google: IGoogleAuthProvider;
let service: AuthService;
beforeEach(() => {
  saved = {};
  repository = { login: vi.fn().mockResolvedValue({ ...tokens, user }),
    refresh: vi.fn().mockResolvedValue({ ...tokens, refreshToken: 'rotated' }),
    me: vi.fn().mockResolvedValue(user), logout: vi.fn().mockResolvedValue(undefined) };
  storage = { read: vi.fn(async () => saved), write: vi.fn(async (value) => { saved = value; }) };
  google = { signIn: vi.fn().mockResolvedValue('google-id-token'), signOut: vi.fn().mockResolvedValue(undefined) };
  service = new AuthService(repository, storage, google, () => 1000);
});

describe('Mobile authentication session lifecycle', () => {
  it('keeps authentication on hold before storage, Google or credential transmission', async () => {
    const blocked = new AuthService(repository, storage, google, Date.now, () => { throw new AuthError('CONFIGURATION', 'On hold'); });
    await expect(blocked.login()).rejects.toMatchObject({ code: 'CONFIGURATION' });
    await expect(blocked.restore()).rejects.toMatchObject({ code: 'CONFIGURATION' });
    expect(storage.read).not.toHaveBeenCalled(); expect(google.signIn).not.toHaveBeenCalled(); expect(repository.login).not.toHaveBeenCalled();
  });
  it('checks server readiness before presenting Google sign-in', async () => {
    repository.prepare = vi.fn().mockRejectedValue(new AuthError('CONFIGURATION', 'Server on hold'));
    await expect(service.login()).rejects.toMatchObject({ code: 'CONFIGURATION' });
    expect(google.signIn).not.toHaveBeenCalled(); expect(repository.login).not.toHaveBeenCalled();
  });
  it('uses only a Google ID token and trusts the server-returned user', async () => {
    expect(await service.login()).toEqual(user);
    expect(repository.login).toHaveBeenCalledWith('google-id-token');
    expect(saved).toEqual({ refreshToken: 'refresh', userId: user.id });
    expect(JSON.stringify(saved)).not.toContain('access');
  });
  it('treats Google cancellation as anonymous, without a backend call', async () => {
    vi.mocked(google.signIn).mockResolvedValueOnce(null);
    expect(await service.login()).toBeNull();
    expect(repository.login).not.toHaveBeenCalled();
  });
  it('rotates persisted credentials before fetching the restored profile', async () => {
    saved = { refreshToken: 'old' };
    await service.restore();
    expect(repository.refresh).toHaveBeenCalledWith('old');
    expect(saved).toEqual({ refreshToken: 'rotated', userId: user.id });
    expect(repository.me).toHaveBeenCalledWith('access');
  });
  it('rotates an expired in-memory access token before authenticated requests', async () => {
    let clock = 0;
    service = new AuthService(repository, storage, google, () => clock);
    await service.login();
    clock = 901000;
    await service.restore();
    expect(repository.refresh).toHaveBeenCalledWith('refresh');
  });
  it('does not rotate a still-valid access session unnecessarily', async () => {
    await service.login(); await service.restore();
    expect(repository.refresh).not.toHaveBeenCalled();
    expect(repository.me).toHaveBeenCalledWith('access');
  });
  it('refreshes after the access token is rejected', async () => {
    await service.login();
    vi.mocked(repository.me).mockRejectedValueOnce(new AuthError('UNAUTHORIZED', 'Expired'));
    expect(await service.restore()).toEqual(user);
    expect(repository.refresh).toHaveBeenCalledTimes(1);
  });
  it('preserves credentials when offline without fabricating a restored user', async () => {
    saved = { refreshToken: 'old' };
    vi.mocked(repository.refresh).mockRejectedValueOnce(new AuthError('OFFLINE', 'Offline'));
    await expect(service.restore()).rejects.toMatchObject({ code: 'OFFLINE' });
    expect(saved.refreshToken).toBe('old');
  });
  it('invalidates expired refresh credentials and attempts revocation', async () => {
    saved = { refreshToken: 'expired' };
    vi.mocked(repository.refresh).mockRejectedValueOnce(new AuthError('UNAUTHORIZED', 'Expired'));
    await expect(service.restore()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(saved).toEqual({ refreshToken: undefined });
    expect(repository.logout).toHaveBeenCalledWith('expired');
  });
  it('keeps a durable offline logout and retries it before login', async () => {
    await service.login();
    vi.mocked(repository.logout).mockRejectedValueOnce(new AuthError('OFFLINE', 'Offline'));
    expect(await service.logout()).toBe(false);
    expect(saved).toEqual({ pendingLogout: 'refresh' });
    await service.login();
    expect(repository.logout).toHaveBeenCalledTimes(2);
    expect(saved).toEqual({ refreshToken: 'refresh', userId: user.id });
  });
  it('does not overwrite pending offline revocation with a new login', async () => {
    saved = { pendingLogout: 'old' };
    vi.mocked(repository.logout).mockRejectedValueOnce(new AuthError('OFFLINE', 'Offline'));
    await expect(service.login()).rejects.toMatchObject({ code: 'OFFLINE' });
    expect(google.signIn).not.toHaveBeenCalled();
    expect(saved).toEqual({ pendingLogout: 'old' });
  });
  it('revokes a freshly issued session if secure persistence fails', async () => {
    vi.mocked(storage.write).mockRejectedValueOnce(new AuthError('STORAGE', 'Unavailable'));
    await expect(service.login()).rejects.toMatchObject({ code: 'STORAGE' });
    expect(repository.logout).toHaveBeenCalledWith('refresh');
  });
  it('serializes refresh operations so single-use refresh tokens are not raced', async () => {
    saved = { refreshToken: 'old' };
    await Promise.all([service.restore(), service.restore(), service.restore()]);
    expect(repository.refresh).toHaveBeenCalledTimes(1);
    expect(repository.me).toHaveBeenCalledTimes(3);
  });
  it('does not resurrect credentials when logout follows an in-flight login', async () => {
    let release!: (value: string) => void;
    vi.mocked(google.signIn).mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    const loggingIn = service.login();
    await vi.waitFor(() => { expect(google.signIn).toHaveBeenCalled(); });
    const loggingOut = service.logout();
    release('google-token');
    await Promise.all([loggingIn, loggingOut]);
    expect(saved.refreshToken).toBeUndefined();
    expect(await service.restore()).toBeNull();
  });
  it('cancels a queued sign-in before Google opens when logout is the latest intent', async () => {
    const login = service.login(), logout = service.logout(); await Promise.all([login, logout]);
    expect(google.signIn).not.toHaveBeenCalled(); expect(repository.login).not.toHaveBeenCalled(); expect(saved.refreshToken).toBeUndefined();
  });
  it('coalesces expiry refresh through serialized authenticated requests and binds them to the correct user', async () => {
    let now = 0; service = new AuthService(repository, storage, google, () => now); await service.login(); now = 901_000;
    const request = vi.fn(async (access: string) => access);
    expect(await Promise.all([service.withAccessToken(user.id, request), service.withAccessToken(user.id, request)])).toEqual(['access', 'access']);
    expect(repository.refresh).toHaveBeenCalledTimes(1); expect(saved.userId).toBe(user.id);
    const wrong = vi.fn(); await expect(service.withAccessToken('different-user', wrong)).rejects.toMatchObject({ code: 'UNAUTHORIZED' }); expect(wrong).not.toHaveBeenCalled();
  });
  it('retries a rejected access token once and leaves persistent errors visible', async () => {
    await service.login(); const request = vi.fn().mockRejectedValue(new AuthError('UNAUTHORIZED', 'Expired'));
    await expect(service.withAccessToken(user.id, request)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(request).toHaveBeenCalledTimes(2); expect(repository.refresh).toHaveBeenCalledTimes(1);
  });
  it('rejects a restored identity mismatch and revokes its rotated refresh family', async () => {
    saved = { refreshToken: 'old', userId: user.id };
    vi.mocked(repository.me).mockResolvedValueOnce({ ...user, id: 'different-user' });
    await expect(service.restore()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(repository.logout).toHaveBeenCalledWith('rotated'); expect(saved.refreshToken).toBeUndefined();
  });
  it('rejects late authorized responses after logout without resurrecting account state', async () => {
    await service.login(); let release!: (value: string) => void;
    const request = vi.fn(() => new Promise<string>((resolve) => { release = resolve; }));
    const pending = service.withAccessToken(user.id, request), rejected = expect(pending).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await vi.waitFor(() => expect(request).toHaveBeenCalled()); const logout = service.logout(); release('old account result');
    await Promise.all([rejected, logout]); expect(saved.refreshToken).toBeUndefined();
  });
  it('retries failed durable logout intent instead of silently restoring that account', async () => {
    await service.login(); vi.mocked(storage.write).mockRejectedValueOnce(new AuthError('STORAGE', 'Disk unavailable'));
    await expect(service.logout()).rejects.toMatchObject({ code: 'STORAGE' });
    expect(await service.restore()).toBeNull(); expect(repository.me).not.toHaveBeenCalled(); expect(saved.refreshToken).toBeUndefined();
  });
});

describe('Authentication presentation controller', () => {
  it('deduplicates sign-in taps and keeps credentials out of presentation state', async () => {
    const controller = new AuthController(service);
    const first = controller.login();
    expect(controller.login()).toBe(first);
    await first;
    expect(controller.getSnapshot()).toMatchObject({ status: 'authenticated', user });
    expect(JSON.stringify(controller.getSnapshot())).not.toContain('refreshToken');
    expect(repository.login).toHaveBeenCalledTimes(1);
  });
  it('reports cancellation without an error', async () => {
    vi.mocked(google.signIn).mockResolvedValueOnce(null);
    const controller = new AuthController(service);
    await controller.login();
    expect(controller.getSnapshot()).toEqual({ status: 'anonymous', user: null, message: 'Google sign-in didn’t finish. Please try again.' });
  });
  it('shows offline restore without a fake authenticated profile', async () => {
    saved = { refreshToken: 'old' };
    vi.mocked(repository.refresh).mockRejectedValueOnce(new AuthError('OFFLINE', 'Offline'));
    const controller = new AuthController(service);
    await controller.restore();
    expect(controller.getSnapshot()).toMatchObject({ status: 'offline', user: null });
  });
  it('prevents a late login result from restoring the UI after logout', async () => {
    let release!: (value: string) => void;
    vi.mocked(google.signIn).mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    const controller = new AuthController(service);
    const login = controller.login();
    await vi.waitFor(() => { expect(google.signIn).toHaveBeenCalled(); });
    const logout = controller.logout();
    release('signed-google-token');
    await Promise.all([login, logout]);
    expect(controller.getSnapshot()).toMatchObject({ status: 'anonymous', user: null });
    expect(saved.refreshToken).toBeUndefined();
  });

});
