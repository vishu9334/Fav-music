import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthConfig } from '../services/auth-config';
import { NativeGoogleAuthProvider } from '../adapters/native-google-auth.provider';
import { SecureSessionRepository } from '../repositories/secure-session.repository';

const mocks = vi.hoisted(() => ({ configure: vi.fn(), hasPlayServices: vi.fn(), signIn: vi.fn(), signOut: vi.fn(),
  getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }));
vi.mock('@react-native-google-signin/google-signin', () => ({ GoogleSignin: mocks }));
vi.mock('expo-secure-store', () => ({ ...mocks, WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only' }));
beforeEach(() => { vi.clearAllMocks(); mocks.hasPlayServices.mockResolvedValue(true); vi.spyOn(console, 'info').mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());
const configured = () => new AuthConfig('https://api.example.test/graphql', 'public-client.apps.googleusercontent.com', { enabled: true, verifiedEndpoint: 'https://api.example.test/graphql' });

describe('Native Google adapter', () => {
  it('does not load or invoke Google sign-in while authentication is on hold', async () => {
    await expect(new NativeGoogleAuthProvider(new AuthConfig('https://api.example.test/graphql', 'public-client.apps.googleusercontent.com')).signIn()).rejects.toMatchObject({ code: 'CONFIGURATION' });
    expect(mocks.signIn).not.toHaveBeenCalled(); expect(mocks.configure).not.toHaveBeenCalled();
  });
  it('handles unavailable Play Services and numeric network/cancellation errors', async () => {
    const provider = new NativeGoogleAuthProvider(configured()); mocks.hasPlayServices.mockResolvedValueOnce(false);
    await expect(provider.signIn()).rejects.toMatchObject({ code: 'PROVIDER' }); expect(mocks.signIn).not.toHaveBeenCalled();
    mocks.signIn.mockRejectedValueOnce({ code: 7 }); await expect(provider.signIn()).rejects.toMatchObject({ code: 'OFFLINE' });
    mocks.signIn.mockRejectedValueOnce({ code: 12501 }); expect(await provider.signIn()).toBeNull();
  });
  it('requests a backend-audienced ID token without offline Google access', async () => {
    mocks.signIn.mockResolvedValue({ type: 'success', data: { idToken: 'signed-id-token', user: { id: 'untrusted' } } });
    const provider = new NativeGoogleAuthProvider(configured());
    expect(await provider.signIn()).toBe('signed-id-token');
    expect(mocks.configure).toHaveBeenCalledWith({ webClientId: 'public-client.apps.googleusercontent.com', offlineAccess: false });
  });
  it('clears Google state after a restored app session without prior interactive sign-in', async () => {
    const provider = new NativeGoogleAuthProvider(configured());
    await provider.signOut();
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });
  it('handles cancellation and missing tokens', async () => {
    const provider = new NativeGoogleAuthProvider(configured());
    mocks.signIn.mockResolvedValueOnce({ type: 'cancelled', data: null });
    expect(await provider.signIn()).toBeNull();
    mocks.signIn.mockResolvedValueOnce({ type: 'success', data: { idToken: null } });
    await expect(provider.signIn()).rejects.toMatchObject({ code: 'CONFIGURATION' });
  });
  it('distinguishes signing configuration failures without leaking native details', async () => {
    const provider = new NativeGoogleAuthProvider(configured());
    for (const code of ['DEVELOPER_ERROR', 10]) {
      mocks.signIn.mockRejectedValueOnce({ code, message: 'private-native-details' });
      await expect(provider.signIn()).rejects.toMatchObject({ code: 'CONFIGURATION' });
    }
  });
  it('handles a Google picker already in progress without treating it as successful login', async () => {
    mocks.signIn.mockRejectedValueOnce({ code: 'IN_PROGRESS' });
    await expect(new NativeGoogleAuthProvider(configured()).signIn()).rejects.toMatchObject({ code: 'PROVIDER' });
  });
  it('logs only allowlisted status labels without native errors, identities or token-like codes', async () => {
    mocks.signIn.mockRejectedValueOnce({ code: 'private-token-code', message: 'private identity and credentials' });
    await expect(new NativeGoogleAuthProvider(configured()).signIn()).rejects.toMatchObject({ code: 'PROVIDER' });
    expect(console.info).toHaveBeenCalledWith('[GoogleSignIn] UNAVAILABLE');
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain('private');
  });
});

describe('Secure session repository', () => {
  it('uses SecureStore and device-only keychain accessibility', async () => {
    const repo = new SecureSessionRepository();
    await repo.write({ refreshToken: 'refresh-only' });
    expect(mocks.setItemAsync).toHaveBeenCalledWith('aadat.auth.session.v1',
      JSON.stringify({ refreshToken: 'refresh-only' }), { keychainAccessible: 'device-only' });
    await repo.write({});
    expect(mocks.deleteItemAsync).toHaveBeenCalledWith('aadat.auth.session.v1');
  });
  it('fails closed on malformed stored credentials', async () => {
    mocks.getItemAsync.mockResolvedValueOnce(JSON.stringify({ refreshToken: { attack: true } }));
    await expect(new SecureSessionRepository().read()).rejects.toMatchObject({ code: 'STORAGE' });
  });
  it('restores only bounded credentials and identity bindings, rejecting ambiguous active/logout records', async () => {
    mocks.getItemAsync.mockResolvedValueOnce(JSON.stringify({ refreshToken: 'r', userId: 'verified-user', accessToken: 'must-not-persist' }));
    expect(await new SecureSessionRepository().read()).toEqual({ refreshToken: 'r', pendingLogout: undefined, userId: 'verified-user' });
    for (const record of [{ refreshToken: 'x'.repeat(4097) }, { refreshToken: 'r', pendingLogout: 'r' }, { refreshToken: '' }, { userId: '../other-account' }]) {
      mocks.getItemAsync.mockResolvedValueOnce(JSON.stringify(record)); await expect(new SecureSessionRepository().read()).rejects.toMatchObject({ code: 'STORAGE' });
    }
  });
});
