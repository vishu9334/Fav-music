import { describe, it, expect, vi } from 'vitest';
import { OAuth2Client } from 'google-auth-library';
import { GoogleTokenVerifier } from '../adapters/google-token-verifier.js';
import { UnauthorizedError } from '../../../shared/errors/domain.error.js';

describe('GoogleTokenVerifier (Isolated Adapter Tests)', () => {
  const TEST_CLIENT_ID = 'test-client-id-123.apps.googleusercontent.com';

  it('instantiates correctly with client ID and exposes it', () => {
    const verifier = new GoogleTokenVerifier(TEST_CLIENT_ID);
    expect(verifier.getClientId()).toBe(TEST_CLIENT_ID);
  });

  it('fails fast if client ID is missing or empty', () => {
    expect(() => new GoogleTokenVerifier('')).toThrow('Google Client ID must be configured');
  });

  it('rejects empty, undefined or invalid type ID tokens with UnauthorizedError', async () => {
    const verifier = new GoogleTokenVerifier(TEST_CLIENT_ID);

    await expect(verifier.verifyIdToken('')).rejects.toThrow(UnauthorizedError);
    await expect(verifier.verifyIdToken('   ')).rejects.toThrow(UnauthorizedError);
    await expect(verifier.verifyIdToken(undefined as unknown as string)).rejects.toThrow(UnauthorizedError);
  });

  it('successfully verifies a valid Google ID token via injected mock OAuth2Client', async () => {
    const mockOAuthClient = {
      verifyIdToken: vi.fn().mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-987654',
          email: 'listener@gmail.com',
          email_verified: true,
          name: 'Aadat Listener',
          picture: 'https://lh3.googleusercontent.com/photo.jpg',
        }),
      }),
    } as unknown as OAuth2Client;

    const verifier = new GoogleTokenVerifier(TEST_CLIENT_ID, mockOAuthClient);
    const payload = await verifier.verifyIdToken('valid-mock-google-id-token');

    expect(mockOAuthClient.verifyIdToken).toHaveBeenCalledWith({
      idToken: 'valid-mock-google-id-token',
      audience: TEST_CLIENT_ID,
    });
    expect(payload.sub).toBe('google-sub-987654');
    expect(payload.email).toBe('listener@gmail.com');
    expect(payload.emailVerified).toBe(true);
    expect(payload.name).toBe('Aadat Listener');
    expect(payload.picture).toBe('https://lh3.googleusercontent.com/photo.jpg');
  });

  it('rejects token when Google OAuth2Client verifyIdToken throws verification error', async () => {
    const mockOAuthClient = {
      verifyIdToken: vi.fn().mockRejectedValue(new Error('Token signature verification failed')),
    } as unknown as OAuth2Client;

    const verifier = new GoogleTokenVerifier(TEST_CLIENT_ID, mockOAuthClient);

    await expect(verifier.verifyIdToken('tampered-token')).rejects.toThrow(UnauthorizedError);
  });

  it('rejects token when Google payload is empty or missing sub claim', async () => {
    const mockOAuthClient = {
      verifyIdToken: vi.fn().mockResolvedValue({
        getPayload: () => ({
          email: 'listener@gmail.com',
          email_verified: true,
          // sub is missing
        }),
      }),
    } as unknown as OAuth2Client;

    const verifier = new GoogleTokenVerifier(TEST_CLIENT_ID, mockOAuthClient);

    await expect(verifier.verifyIdToken('token-without-sub')).rejects.toThrow(UnauthorizedError);
  });
  it('does not leak provider errors containing the submitted token', async () => {
    const client = { verifyIdToken: vi.fn().mockRejectedValue(new Error('Rejected secret-id-token')) } as unknown as OAuth2Client;
    await expect(new GoogleTokenVerifier(TEST_CLIENT_ID, client).verifyIdToken('secret-id-token'))
      .rejects.not.toThrow('secret-id-token');
  });

  it('does not interpret the string false as a verified Google email', async () => {
    const client = { verifyIdToken: vi.fn().mockResolvedValue({ getPayload: () => ({
      sub: 'google-sub', email: 'listener@example.com', email_verified: 'false',
    }) }) } as unknown as OAuth2Client;
    expect((await new GoogleTokenVerifier(TEST_CLIENT_ID, client).verifyIdToken('signed-token')).emailVerified).toBe(false);
  });

});

