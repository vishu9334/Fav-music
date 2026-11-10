import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import mercurius from 'mercurius';
import { GRAPHQL_SCHEMA_STRING } from '@aadat/contracts';
import { AuthService } from '../services/auth.service.js';
import { AuthGraphQLController } from '../controllers/auth-graphql.controller.js';
import { AuthController } from '../controllers/auth.controller.js';
import { GraphQLErrorFormatter } from '../../../shared/graphql/graphql-error-formatter.js';
import { ErrorHandlerMiddleware } from '../../../shared/middleware/error-handler.middleware.js';
import { IUserRepository } from '../contracts/user-repository.contract.js';
import { IGoogleTokenVerifier, IJwtTokenService, ISessionService } from '../contracts/auth-service.contract.js';

describe('Database HOLD across public readiness, GraphQL and REST', () => {
  it('advertises HOLD without touching identity/session dependencies and rejects credential mutations before any writes', async () => {
    const calls = vi.fn(() => { throw new Error('Forbidden dependency access during HOLD'); });
    const users = new Proxy({}, { get: () => calls }) as IUserRepository;
    const sessions = new Proxy({}, { get: () => calls }) as ISessionService;
    const verifier = new Proxy({}, { get: () => calls }) as IGoogleTokenVerifier;
    const jwt = new Proxy({}, { get: () => calls }) as IJwtTokenService;
    const held = new AuthService({ userRepository: users, sessionService: sessions, tokenVerifier: verifier, jwtTokenService: jwt });
    const app = Fastify(); app.setErrorHandler(ErrorHandlerMiddleware.handle);
    new AuthController({ authService: held, authGuard: { validateToken: calls } }).registerRoutes(app);
    await app.register(mercurius, { schema: GRAPHQL_SCHEMA_STRING, resolvers: new AuthGraphQLController(held).buildResolvers(), errorFormatter: GraphQLErrorFormatter.format });
    try {
      const capability = await app.inject({ method: 'POST', url: '/graphql', payload: { query: '{ authCapabilities { service version authenticationEnabled cloudCollectionsEnabled } }' } });
      expect(capability.json()).toEqual({ data: { authCapabilities: { service: 'aadat-music', version: 1, authenticationEnabled: false, cloudCollectionsEnabled: false } } });
      for (const query of ['mutation { loginWithGoogle(idToken:"fixture") { accessToken } }', 'mutation { refreshSession(refreshToken:"fixture") { accessToken } }', 'mutation { logout(refreshToken:"fixture") }']) {
        const result = await app.inject({ method: 'POST', url: '/graphql', payload: { query } }); expect(result.json().errors[0].extensions.code).toBe('AUTH_ON_HOLD');
      }
      for (const [url, payload] of [['/api/auth/google', { idToken: 'fixture' }], ['/api/auth/refresh', { refreshToken: 'fixture' }], ['/api/auth/logout', { refreshToken: 'fixture' }]] as const) {
        const result = await app.inject({ method: 'POST', url, payload }); expect(result.statusCode).toBe(503); expect(result.json().message).toContain('on hold');
      }
      expect(calls).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
});
