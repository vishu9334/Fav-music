import { describe, expect, it, vi } from 'vitest';
import { AuthConfig } from '../services/auth-config';
import { GraphQLAuthRepository } from '../repositories/graphql-auth.repository';

const config = new AuthConfig('https://api.example.com/graphql', 'public-client.apps.googleusercontent.com', { enabled: true, verifiedEndpoint: 'https://api.example.com/graphql' });
const user = { id: '10000000-0000-4000-8000-000000000001', email: 'user@example.com', displayName: 'Listener', avatarUrl: null, chatRetentionPreference: 'EPHEMERAL_SESSION_ONLY', createdAt: '2026-11-06T00:00:00Z' };
function transport(body: unknown, status = 200): typeof fetch {
  return vi.fn(async (_uri: string, options?: RequestInit) => {
    const readiness = JSON.parse(options?.body as string).query.includes('AuthReadiness');
    return { ok: readiness || status < 400, status: readiness ? 200 : status, json: async () => readiness ? { data: { authCapabilities: { service: 'aadat-music', version: 1, authenticationEnabled: true, cloudCollectionsEnabled: false } } } : body } as Response;
  }) as unknown as typeof fetch;
}
describe('GraphQL authentication transport', () => {
  it('explains an unavailable tunnel before sending Google credentials', async () => {
    const fetcher = vi.fn(async () => ({ ok: false, status: 530, json: async () => ({}) }));
    await expect(new GraphQLAuthRepository(config, fetcher).login('private-google-token')).rejects.toMatchObject({
      code: 'SERVER', message: 'Fav Music’s sign-in server is unavailable. Please try again later.',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain('private-google-token');
  });
  it('requires both enablement and the exact reviewed HTTPS endpoint before any request', async () => {
    for (const policy of [{ enabled: false, verifiedEndpoint: config.endpoint }, { enabled: true, verifiedEndpoint: 'https://other.example.test/graphql' }]) {
      const fetcher = transport({});
      await expect(new GraphQLAuthRepository(new AuthConfig(config.endpoint, config.googleWebClientId, policy), fetcher).login('private-google-token')).rejects.toMatchObject({ code: 'CONFIGURATION' });
      expect(fetcher).not.toHaveBeenCalled();
    }
  });
  it('coalesces a credential-free readiness check and refuses a server on HOLD before sending credentials', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: { authCapabilities: {
      service: 'aadat-music', version: 1, authenticationEnabled: false, cloudCollectionsEnabled: false,
    } } }) }) as unknown as typeof fetch;
    const repo = new GraphQLAuthRepository(config, fetcher);
    await expect(Promise.all([repo.login('private-google-token'), repo.me('private-access')])).rejects.toMatchObject({ code: 'CONFIGURATION' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const options = vi.mocked(fetcher).mock.calls[0]?.[1];
    expect(options?.headers).not.toHaveProperty('Authorization');
    expect(options?.body).not.toMatch(/private-google-token|private-access/);
    expect(JSON.parse(options?.body as string).variables).toEqual({});
  });
  it.each(['https://api.example.test/graphql?secret=bad', 'https://api.example.test/graphql#bad', 'https://api.example.test\\@evil.test/graphql', 'https://user:password@api.example.test/graphql'])('rejects ambiguous credential endpoints %s', (uri) => {
    expect(() => new AuthConfig(uri).graphqlEndpoint()).toThrow();
  });
  it('strips unexpected private fields from a valid server response and validates profile identity', async () => {
    const repo = new GraphQLAuthRepository(config, transport({ data: { me: { ...user, refreshToken: 'private-extra' } } }));
    expect(await repo.me('access')).toEqual(user);
    await expect(new GraphQLAuthRepository(config, transport({ data: { me: { ...user, id: 'arbitrary-client-id' } } })).me('access')).rejects.toMatchObject({ code: 'SERVER' });
  });
  it('sends only the ID token to login and no stale bearer token', async () => {
    const fetcher = transport({ data: { loginWithGoogle: { accessToken: 'a', refreshToken: 'r', expiresIn: 900, user } } });
    await new GraphQLAuthRepository(config, fetcher).login('google-id');
    const options = vi.mocked(fetcher).mock.calls.at(-1)?.[1];
    expect(JSON.parse(options?.body as string).variables).toEqual({ idToken: 'google-id' });
    expect(options?.headers).not.toHaveProperty('Authorization');
    expect(options?.redirect).toBe('error');
  });
  it('uses bearer authentication for me', async () => {
    const fetcher = transport({ data: { me: user } });
    await new GraphQLAuthRepository(config, fetcher).me('access-token');
    expect(vi.mocked(fetcher).mock.calls.at(-1)?.[1]?.headers).toMatchObject({ Authorization: 'Bearer access-token' });
  });
  it('does not expose server error messages or credentials', async () => {
    const fetcher = transport({ errors: [{ message: 'secret-token', extensions: { code: 'UNAUTHORIZED' } }] });
    await expect(new GraphQLAuthRepository(config, fetcher).me('a')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(new GraphQLAuthRepository(config, fetcher).me('a')).rejects.not.toThrow('secret-token');
  });
  it.each([401, 403, 429, 500])('handles HTTP %s securely', async (status) => {
    await expect(new GraphQLAuthRepository(config, transport({}, status)).me('a')).rejects.toBeInstanceOf(Error);
  });
  it('maps transport failures to offline', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('Network failed')) as unknown as typeof fetch;
    await expect(new GraphQLAuthRepository(config, fetcher).me('a')).rejects.toMatchObject({ code: 'OFFLINE' });
  });
  it('refuses plaintext HTTP before sending any credentials', async () => {
    const fetcher = transport({});
    await expect(new GraphQLAuthRepository(new AuthConfig('http://localhost/graphql'), fetcher).me('a'))
      .rejects.toMatchObject({ code: 'CONFIGURATION' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('requires real public OAuth configuration without a fallback', () => {
    expect(() => new AuthConfig('', '').googleClientId()).toThrow();
    expect(() => new AuthConfig('https://user:password@example.com/graphql').graphqlEndpoint()).toThrow();
  });
  it('distinguishes malformed server JSON from an offline connection', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200,
      json: async () => { throw new SyntaxError('Bad JSON'); } }) as unknown as typeof fetch;
    await expect(new GraphQLAuthRepository(config, fetcher).me('a')).rejects.toMatchObject({ code: 'SERVER' });
  });

});
