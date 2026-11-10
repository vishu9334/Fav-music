import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatRetentionPreference } from '@aadat/contracts';
import { AadatServerApplication } from '../../../index.js';
import { IDatabaseService } from '../../../infrastructure/database/contracts/database.contract.js';
import { ICacheService } from '../../../infrastructure/cache/contracts/cache.contract.js';
import { AuthModule } from '../auth.module.js';
import { IUserRepository, IUserEntity } from '../contracts/user-repository.contract.js';
import {
  IGoogleTokenVerifier,
  IJwtTokenService,
  ISessionService,
} from '../contracts/auth-service.contract.js';
import { UnauthorizedError } from '../../../shared/errors/domain.error.js';

describe('AuthController & GraphQL Identity Integration Tests (Gate 3C)', () => {
  let mockDatabaseService: IDatabaseService;
  let mockCacheService: ICacheService;
  let mockUserRepository: IUserRepository;
  let mockVerifier: IGoogleTokenVerifier;
  let mockJwtService: IJwtTokenService;
  let mockSessionService: ISessionService;
  let authModule: AuthModule;
  let app: AadatServerApplication;

  const sampleUser: IUserEntity = {
    status: 'ACTIVE',
    id: 'user-uuid-gate3c-1',
    email: 'gate3c.listener@aadat.music',
    displayName: 'Gate 3C Verified User',
    avatarKey: null,
    googleSub: 'google-sub-gate3c-999',
    chatRetentionPreference: ChatRetentionPreference.EPHEMERAL_SESSION_ONLY,
    createdAt: new Date('2026-11-04T08:00:00.000Z'),
    updatedAt: new Date('2026-11-04T08:00:00.000Z'),
  };

  beforeEach(() => {
    mockDatabaseService = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      getClient: vi.fn() as unknown as IDatabaseService['getClient'],
      isConnected: vi.fn().mockReturnValue(true),
      ping: vi.fn().mockResolvedValue(true),
    };

    mockCacheService = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      isConnected: vi.fn().mockReturnValue(true),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(false),
      ping: vi.fn().mockResolvedValue('PONG'),
      eval: vi.fn().mockResolvedValue(null),
    };

    mockUserRepository = {
      findById: vi.fn().mockImplementation(async (id: string) => {
        if (id === sampleUser.id) return sampleUser;
        return null;
      }),
      findByEmail: vi.fn().mockResolvedValue(null),
      findByGoogleSub: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(sampleUser),
      updateChatRetentionPreference: vi.fn().mockResolvedValue(sampleUser),
      updateAvatarKey: vi.fn().mockResolvedValue(sampleUser),
    };

    mockVerifier = {
      verifyIdToken: vi.fn().mockResolvedValue({
        sub: sampleUser.googleSub!,
        email: sampleUser.email,
        emailVerified: true,
        name: sampleUser.displayName,
      }),
    };

    mockJwtService = {
      signAccessToken: vi.fn().mockResolvedValue('valid-test-access-token-jwt'),
      verifyAccessToken: vi.fn().mockImplementation(async (token: string) => {
        if (token === 'valid-test-access-token-jwt') {
          return {
            userId: sampleUser.id,
            email: sampleUser.email,
            sessionId: 'valid-session-uuid',
          };
        }
        throw new UnauthorizedError('Invalid or expired access token');
      }),
    };

    mockSessionService = {
      createSession: vi.fn().mockResolvedValue({
        rawRefreshToken: 'valid-raw-refresh-token-hex',
        familyId: 'family-uuid-1',
        sessionId: 'valid-session-uuid',
      }),
      rotateRefreshToken: vi.fn().mockImplementation(async (token: string) => {
        if (token === 'valid-raw-refresh-token-hex') {
          return {
            rawRefreshToken: 'new-rotated-raw-refresh-token-hex',
            familyId: 'family-uuid-1',
            sessionId: 'new-rotated-session-uuid',
            userId: sampleUser.id,
          };
        }
        throw new UnauthorizedError('Invalid, expired or unrecognized refresh token');
      }),
      revokeSession: vi.fn().mockResolvedValue(undefined),
      revokeSessionById: vi.fn().mockResolvedValue(undefined),
      revokeFamily: vi.fn().mockResolvedValue(undefined),
      isSessionActive: vi.fn().mockImplementation(async (sessionId: string) => {
        return sessionId === 'valid-session-uuid' || sessionId === 'new-rotated-session-uuid';
      }),
    };

    authModule = new AuthModule({
      authenticationEnabled: true,
      databaseService: mockDatabaseService,
      cacheService: mockCacheService,
      userRepository: mockUserRepository,
      tokenVerifier: mockVerifier,
      jwtTokenService: mockJwtService,
      sessionService: mockSessionService,
    });

    app = new AadatServerApplication(
      {
        port: 4000,
        host: '0.0.0.0',
        enableLogging: false,
        enableGraphiql: false,
      },
      {
        databaseService: mockDatabaseService,
        cacheService: mockCacheService,
        authModule,
      }
    );
  });

  describe('REST Endpoints: /api/auth', () => {
    describe('POST /api/auth/google', () => {
      it('returns 400 ValidationFailedError when idToken is missing or empty', async () => {
        const fastify = app.getFastifyInstance();
        const response = await fastify.inject({
          method: 'POST',
          url: '/api/auth/google',
          payload: {},
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.payload);
        expect(body.error).toBe('Validation Failed');
        expect(body.message).toContain('idToken');
      });

      it('returns 200 with AuthSessionDto when Google ID token is valid', async () => {
        const fastify = app.getFastifyInstance();
        const response = await fastify.inject({
          method: 'POST',
          url: '/api/auth/google',
          payload: { idToken: 'valid-google-id-token' },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.accessToken).toBe('valid-test-access-token-jwt');
        expect(body.refreshToken).toBe('valid-raw-refresh-token-hex');
        expect(body.user.id).toBe(sampleUser.id);
        expect(body.user.email).toBe(sampleUser.email);
        expect(body.user.displayName).toBe(sampleUser.displayName);
      });

      it('returns 409 Conflict when existing account with same email prohibits automatic linking', async () => {
        vi.mocked(mockUserRepository.findByGoogleSub).mockResolvedValue(null);
        vi.mocked(mockUserRepository.findByEmail).mockResolvedValue(sampleUser);

        const fastify = app.getFastifyInstance();
        const response = await fastify.inject({
          method: 'POST',
          url: '/api/auth/google',
          payload: { idToken: 'valid-google-token-with-colliding-email' },
        });

        expect(response.statusCode).toBe(409);
        const body = JSON.parse(response.payload);
        expect(body.error).toBe('Conflict');
        expect(body.message).toContain('Automatic linking is prohibited');
      });

      it('returns 401 Unauthorized when Google token verification fails', async () => {
        vi.mocked(mockVerifier.verifyIdToken).mockRejectedValue(
          new UnauthorizedError('Google ID token verification failed: signature invalid')
        );

        const fastify = app.getFastifyInstance();
        const response = await fastify.inject({
          method: 'POST',
          url: '/api/auth/google',
          payload: { idToken: 'invalid-signature-token' },
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.payload);
        expect(body.error).toBe('Unauthorized');
      });
    });

    describe('POST /api/auth/refresh', () => {
      it('returns 400 when refreshToken is missing', async () => {
        const fastify = app.getFastifyInstance();
        const response = await fastify.inject({
          method: 'POST',
          url: '/api/auth/refresh',
          payload: {},
        });

        expect(response.statusCode).toBe(400);
      });

      it('returns 200 with rotated tokens when valid refresh token is presented', async () => {
        const fastify = app.getFastifyInstance();
        const response = await fastify.inject({
          method: 'POST',
          url: '/api/auth/refresh',
          payload: { refreshToken: 'valid-raw-refresh-token-hex' },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.accessToken).toBe('valid-test-access-token-jwt');
        expect(body.refreshToken).toBe('new-rotated-raw-refresh-token-hex');
        expect(body.expiresIn).toBe(900);
      });

      it('returns 401 when replaying an already consumed or invalid refresh token', async () => {
        const fastify = app.getFastifyInstance();
        const response = await fastify.inject({
          method: 'POST',
          url: '/api/auth/refresh',
          payload: { refreshToken: 'replayed-or-invalid-refresh-token' },
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.payload);
        expect(body.error).toBe('Unauthorized');
      });
    });

    describe('POST /api/auth/logout', () => {
      it('returns 200 and revokes active session', async () => {
        const fastify = app.getFastifyInstance();
        const response = await fastify.inject({
          method: 'POST',
          url: '/api/auth/logout',
          headers: {
            authorization: 'Bearer valid-test-access-token-jwt',
          },
          payload: { refreshToken: 'valid-raw-refresh-token-hex' },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(true);
        expect(mockSessionService.revokeSession).toHaveBeenCalledWith('valid-raw-refresh-token-hex');
      });
    });

    describe('GET /api/auth/me', () => {
      it('returns 401 Unauthorized when Authorization header is absent', async () => {
        const fastify = app.getFastifyInstance();
        const response = await fastify.inject({
          method: 'GET',
          url: '/api/auth/me',
        });

        expect(response.statusCode).toBe(401);
      });

      it('returns 200 with UserDto when valid Bearer token is provided', async () => {
        const fastify = app.getFastifyInstance();
        const response = await fastify.inject({
          method: 'GET',
          url: '/api/auth/me',
          headers: {
            authorization: 'Bearer valid-test-access-token-jwt',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.id).toBe(sampleUser.id);
        expect(body.email).toBe(sampleUser.email);
        expect(body.displayName).toBe(sampleUser.displayName);
        expect(body.chatRetentionPreference).toBe(sampleUser.chatRetentionPreference);
      });

      it('returns 401 Unauthorized when Bearer token session has been revoked', async () => {
        vi.mocked(mockSessionService.isSessionActive).mockResolvedValue(false);

        const fastify = app.getFastifyInstance();
        const response = await fastify.inject({
          method: 'GET',
          url: '/api/auth/me',
          headers: {
            authorization: 'Bearer valid-test-access-token-jwt',
          },
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.payload);
        expect(body.error).toBe('Unauthorized');
        expect(body.message).toContain('Session has expired or has been revoked');
      });
    });
  });

  describe('GraphQL Identity & Security (Gate 3C)', () => {
    it('executes me query with valid Bearer token and returns real persisted user identity', async () => {
      const fastify = app.getFastifyInstance();
      const response = await fastify.inject({
        method: 'POST',
        url: '/graphql',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer valid-test-access-token-jwt',
        },
        payload: JSON.stringify({
          query: `
            query GetMe {
              me {
                id
                email
                displayName
                chatRetentionPreference
                createdAt
              }
            }
          `,
        }),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.errors).toBeUndefined();
      expect(body.data.me.id).toBe(sampleUser.id);
      expect(body.data.me.email).toBe(sampleUser.email);
      expect(body.data.me.displayName).toBe(sampleUser.displayName);
      expect(body.data.me.chatRetentionPreference).toBe(sampleUser.chatRetentionPreference);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(sampleUser.id);
    });

    it('rejects me query with 401 when unauthenticated', async () => {
      const fastify = app.getFastifyInstance();
      const response = await fastify.inject({
        method: 'POST',
        url: '/graphql',
        headers: {
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          query: `
            query GetMe {
              me {
                id
                email
              }
            }
          `,
        }),
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.payload);
      expect(body.errors).toBeDefined();
      expect(body.errors[0].message).toContain('Authentication required');
    });

    it('MANDATORY SECURITY RULE: rejects invalid Bearer token with 401 instead of silently treating as guest', async () => {
      const fastify = app.getFastifyInstance();
      const response = await fastify.inject({
        method: 'POST',
        url: '/graphql',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer malformed.invalid.tampered-token',
        },
        payload: JSON.stringify({
          query: `
            query GetHealth {
              health {
                status
              }
            }
          `,
        }),
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toContain('Invalid or expired access token');
    });
  });
});
