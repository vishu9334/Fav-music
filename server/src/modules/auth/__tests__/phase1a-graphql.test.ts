import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';
import { AadatServerApplication } from '../../../index.js';
import { AuthModule } from '../auth.module.js';
import { JwtTokenService } from '../services/jwt-token.service.js';
import { IUserEntity, IUserRepository } from '../contracts/user-repository.contract.js';
import { IGoogleTokenVerifier, ISessionService } from '../contracts/auth-service.contract.js';
import { IDatabaseService } from '../../../infrastructure/database/contracts/database.contract.js';
import { ICacheService } from '../../../infrastructure/cache/contracts/cache.contract.js';
import { UnauthorizedError } from '../../../shared/errors/domain.error.js';
import { ChatRetentionPreference } from '@aadat/contracts';

let app: AadatServerApplication;
let user: IUserEntity;
let active: Set<string>;
let users: IUserRepository;
let sessions: ISessionService;
let verifier: IGoogleTokenVerifier;
let jwt: JwtTokenService;
beforeEach(() => {
  user = { id: 'verified-server-user', email: 'verified@example.com', displayName: 'Listener',
    googleSub: 'google-sub', status: 'ACTIVE', avatarKey: null,
    chatRetentionPreference: ChatRetentionPreference.EPHEMERAL_SESSION_ONLY,
    createdAt: new Date(), updatedAt: new Date() };
  active = new Set();
  users = { findByGoogleSub: vi.fn(async () => user), findById: vi.fn(async () => user),
    findByEmail: vi.fn(async () => null), create: vi.fn(async () => user),
    updateAvatarKey: vi.fn(), updateChatRetentionPreference: vi.fn() };
  verifier = { verifyIdToken: vi.fn(async (token) => {
    if (token !== 'verified-google-token') throw new UnauthorizedError('Invalid Google token');
    return { sub: 'google-sub', email: 'verified@example.com', emailVerified: true };
  }) };
  sessions = {
    createSession: vi.fn(async () => { active.add('session-1'); return { rawRefreshToken: 'refresh-1', familyId: 'family', sessionId: 'session-1' }; }),
    rotateRefreshToken: vi.fn(async (token) => {
      if (token !== 'refresh-1' || !active.has('session-1')) throw new UnauthorizedError('Expired refresh token');
      active.delete('session-1'); active.add('session-2');
      return { rawRefreshToken: 'refresh-2', familyId: 'family', sessionId: 'session-2', userId: user.id };
    }),
    revokeSession: vi.fn(async (token) => { active.delete(token.replace('refresh', 'session')); }),
    revokeSessionById: vi.fn(async (id) => { active.delete(id); }),
    revokeFamily: vi.fn(async () => { active.clear(); }),
    isSessionActive: vi.fn(async (id) => active.has(id)),
  };
  const db = { getClient: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), ping: vi.fn(async () => true), isConnected: () => true } as unknown as IDatabaseService;
  const cache = { connect: vi.fn(), disconnect: vi.fn(), get: vi.fn(), set: vi.fn(), delete: vi.fn(), exists: vi.fn(), eval: vi.fn(), ping: vi.fn(), isConnected: () => true } as ICacheService;
  jwt = new JwtTokenService('test-only-signing-key-never-use-in-production-1234567890');
  app = new AadatServerApplication({ port: 4000, host: '127.0.0.1', nodeEnv: 'test' }, {
    databaseService: db, cacheService: cache,
    authModule: new AuthModule({ databaseService: db, cacheService: cache,
      authenticationEnabled: true,
      userRepository: users, tokenVerifier: verifier, jwtTokenService: jwt, sessionService: sessions }),
  });
});
afterEach(async () => { await app.getFastifyInstance().close(); });
async function graphql(query: string, variables: Record<string, string> = {}, accessToken?: string): Promise<Record<string, any>> {
  const response = await app.getFastifyInstance().inject({ method: 'POST', url: '/graphql',
    headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {}, payload: { query, variables } });
  return { ...response.json(), httpStatus: response.statusCode };
}
async function login(): Promise<{ accessToken: string; refreshToken: string }> {
  const result = await graphql('mutation($idToken: String!) { loginWithGoogle(idToken: $idToken) { accessToken refreshToken expiresIn user { id email } } }',
    { idToken: 'verified-google-token' });
  expect(result.errors).toBeUndefined();
  expect(result.data.loginWithGoogle.user.id).toBe('verified-server-user');
  return result.data.loginWithGoogle;
}

describe('Phase 1A GraphQL authentication and authorization', () => {
  it('uses verified server identity and issues application sessions', async () => {
    const result = await login();
    expect((await jwt.verifyAccessToken(result.accessToken)).userId).toBe(user.id);
    expect(verifier.verifyIdToken).toHaveBeenCalledWith('verified-google-token');
  });
  it('rejects invalid Google credentials and never issues a session', async () => {
    const result = await graphql('mutation { loginWithGoogle(idToken: "invalid") { accessToken } }');
    expect(result.errors[0].extensions.code).toBe('UNAUTHORIZED');
    expect(sessions.createSession).not.toHaveBeenCalled();
  });
  it('rejects guest me and permits a valid authenticated me', async () => {
    expect((await graphql('{ me { id } }')).errors[0].extensions.code).toBe('UNAUTHORIZED');
    const auth = await login();
    expect((await graphql('{ me { id } }', {}, auth.accessToken)).data.me.id).toBe(user.id);
  });
  it('rotates sessions and invalidates the prior access token', async () => {
    const auth = await login();
    const refreshed = await graphql('mutation($token: String!) { refreshSession(refreshToken: $token) { accessToken refreshToken } }', { token: auth.refreshToken });
    expect(refreshed.data.refreshSession.refreshToken).toBe('refresh-2');
    expect((await graphql('{ me { id } }', {}, auth.accessToken)).httpStatus).toBe(401);
    expect((await graphql('{ me { id } }', {}, refreshed.data.refreshSession.accessToken)).data.me.id).toBe(user.id);
  });
  it('revokes logout sessions and prevents their reuse', async () => {
    const auth = await login();
    expect((await graphql('mutation($token: String!) { logout(refreshToken: $token) }', { token: auth.refreshToken })).data.logout).toBe(true);
    expect((await graphql('{ me { id } }', {}, auth.accessToken)).httpStatus).toBe(401);
    expect((await graphql('mutation { refreshSession(refreshToken: "refresh-1") { accessToken } }')).errors).toBeDefined();
  });
  it('blocks suspended accounts at login and on existing authenticated requests', async () => {
    const auth = await login();
    user = { ...user, status: 'SUSPENDED' };
    expect((await graphql('{ me { id } }', {}, auth.accessToken)).httpStatus).toBe(401);
    const result = await graphql('mutation { loginWithGoogle(idToken: "verified-google-token") { accessToken } }');
    expect(result.errors[0].extensions.code).toBe('UNAUTHORIZED');
    expect(sessions.createSession).toHaveBeenCalledTimes(1);
  });
  it('never accepts an arbitrary client identity as a login argument', async () => {
    const result = await graphql('mutation { loginWithGoogle(idToken: "verified-google-token", userId: "victim") { accessToken } }');
    expect(result.errors).toBeDefined();
    expect(verifier.verifyIdToken).not.toHaveBeenCalled();
  });
  it('rejects logout without credentials', async () => {
    const result = await graphql('mutation { logout }');
    expect(result.errors[0].extensions.code).toBe('UNAUTHORIZED');
  });
  it('revokes the session family when refresh discovers a disabled account', async () => {
    await login();
    user = { ...user, status: 'DEACTIVATED' };
    const result = await graphql('mutation { refreshSession(refreshToken: "refresh-1") { accessToken } }');
    expect(result.httpStatus).toBe(401);
    expect(sessions.revokeFamily).toHaveBeenCalledWith('family');
    expect(active.size).toBe(0);
  });

  it('rejects a cryptographically signed but expired access token', async () => {
    await login();
    const token = await new SignJWT({ email: user.email, sessionId: 'session-1' })
      .setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setJti('session-1')
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode('test-only-signing-key-never-use-in-production-1234567890'));
    expect((await graphql('{ me { id } }', {}, token)).httpStatus).toBe(401);
  });

  it('rejects a tampered access-token signature', async () => {
    const auth = await login();
    const parts = auth.accessToken.split('.');
    const signature = parts[2]!;
    parts[2] = (signature[0] === 'a' ? 'b' : 'a') + signature.slice(1);
    expect((await graphql('{ me { id } }', {}, parts.join('.'))).httpStatus).toBe(401);
  });

});
