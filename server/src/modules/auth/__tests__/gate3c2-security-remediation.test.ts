import { configureTestAuth } from '../../../__tests__/fixtures/auth-env.js';
import { describe, it, expect, vi } from 'vitest';
import { AadatServerApplication } from '../../../index.js';
import { IDatabaseService } from '../../../infrastructure/database/contracts/database.contract.js';
import { ICacheService } from '../../../infrastructure/cache/contracts/cache.contract.js';
import { ConfigurationError } from '../../../infrastructure/config/server-environment.config.js';
import { PrismaUserRepository } from '../repositories/prisma-user.repository.js';
import { ConflictError } from '../../../shared/errors/domain.error.js';
import { AuthModule } from '../auth.module.js';

configureTestAuth();

describe('GATE 3C.2 — Security Remediation Integration Tests', () => {
  const createMockDb = (): IDatabaseService => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    getClient: vi.fn() as unknown as IDatabaseService['getClient'],
    isConnected: vi.fn().mockReturnValue(true),
    ping: vi.fn().mockResolvedValue(true),
  });

  const createMockCache = (): ICacheService => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(false),
    ping: vi.fn().mockResolvedValue('PONG'),
    eval: vi.fn().mockResolvedValue(null),
  });

  describe('1. Rate Limiting Enforcement & HTTP 429 Retry-After Headers', () => {
    it('enforces rate limits on /api/auth routes and returns HTTP 429 with Retry-After header', async () => {
      const mockDb = createMockDb();
      const mockCache = createMockCache();

      // Configure a strict limit of 2 requests for testing
      const app = new AadatServerApplication(
        {
          port: 4000,
          host: '0.0.0.0',
          rateLimitGlobalMax: 10,
          rateLimitAuthMax: 2,
          rateLimitAuthTimeWindowMs: 60000,
        },
        {
          databaseService: mockDb,
          cacheService: mockCache,
        }
      );

      const fastify = app.getFastifyInstance();
      await fastify.ready();

      // Request 1: Should succeed / proceed to route handler (fails validation because empty payload, but status 400 is fine)
      const res1 = await fastify.inject({
        method: 'POST',
        url: '/api/auth/google',
        payload: {},
      });
      expect(res1.statusCode).toBe(400); // Route reached

      // Request 2: Should succeed / proceed to route handler
      const res2 = await fastify.inject({
        method: 'POST',
        url: '/api/auth/google',
        payload: {},
      });
      expect(res2.statusCode).toBe(400); // Route reached

      // Request 3: Exceeds auth rate limit of 2 -> MUST return HTTP 429
      const res3 = await fastify.inject({
        method: 'POST',
        url: '/api/auth/google',
        payload: {},
      });

      expect(res3.statusCode).toBe(429);
      expect(res3.headers['retry-after']).toBeDefined();
      expect(Number(res3.headers['retry-after'])).toBeGreaterThan(0);

      const body = JSON.parse(res3.payload);
      expect(body.statusCode).toBe(429);
      expect(body.error).toBe('Too Many Requests');
      expect(body.message).toContain('Rate limit exceeded');
      expect(body.timestamp).toBeDefined();
    });

    it('applies stricter rate limits to /api/auth routes without blocking non-auth endpoints', async () => {
      const mockDb = createMockDb();
      const mockCache = createMockCache();

      const app = new AadatServerApplication(
        {
          port: 4000,
          host: '0.0.0.0',
          rateLimitGlobalMax: 20,
          rateLimitAuthMax: 1, // Auth blocked after 1 request
          rateLimitAuthTimeWindowMs: 60000,
        },
        {
          databaseService: mockDb,
          cacheService: mockCache,
        }
      );

      const fastify = app.getFastifyInstance();
      await fastify.ready();

      // Exhaust auth route limit
      await fastify.inject({
        method: 'POST',
        url: '/api/auth/google',
        payload: {},
      });

      // 2nd auth request is blocked
      const authRes = await fastify.inject({
        method: 'POST',
        url: '/api/auth/google',
        payload: {},
      });
      expect(authRes.statusCode).toBe(429);

      // Non-auth route (e.g., /health/live) still succeeds under the higher global limit
      const healthRes = await fastify.inject({
        method: 'GET',
        url: '/health/live',
      });
      expect(healthRes.statusCode).toBe(200);
    });
  });

  describe('2. Production Guard Against Silent In-Memory Limiting Fallback', () => {
    it('fails fast with ConfigurationError when in production without RedisCacheService', () => {
      const mockDb = createMockDb();
      // Generic cache service that is NOT an instance of RedisCacheService
      const mockCache = createMockCache();

      expect(() => {
        new AadatServerApplication(
          {
            port: 4000,
            host: '0.0.0.0',
            nodeEnv: 'production',
          },
          {
            databaseService: mockDb,
            cacheService: mockCache,
          }
        );
      }).toThrow(ConfigurationError);

      expect(() => {
        new AadatServerApplication(
          {
            port: 4000,
            host: '0.0.0.0',
            nodeEnv: 'production',
          },
          {
            databaseService: mockDb,
            cacheService: mockCache,
          }
        );
      }).toThrow(/Redis-backed distributed rate limiting is mandatory in production/);
    });
  });

  describe('3. Prisma P2002 Uniqueness Error Sanitization & Conflict Mapping', () => {
    it('catches Prisma P2002 error and maps to domain ConflictError (409) without leaking DB table/column names', async () => {
      const mockDb: IDatabaseService = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        isConnected: vi.fn().mockReturnValue(true),
        ping: vi.fn().mockResolvedValue(true),
        getClient: vi.fn().mockReturnValue({
          user: {
            create: vi.fn().mockRejectedValue({
              code: 'P2002',
              meta: {
                target: ['email'],
                modelName: 'User',
                table: 'public.User',
              },
              message: 'Unique constraint failed on the fields: (`email`)',
            }),
          },
        }) as unknown as IDatabaseService['getClient'],
      };

      const repository = new PrismaUserRepository(mockDb);

      await expect(
        repository.create({
          email: 'duplicate@aadat.music',
          displayName: 'Duplicate User',
          googleSub: 'google-sub-duplicate',
        })
      ).rejects.toThrow(ConflictError);

      try {
        await repository.create({
          email: 'duplicate@aadat.music',
          displayName: 'Duplicate User',
          googleSub: 'google-sub-duplicate',
        });
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ConflictError);
        const conflict = err as ConflictError;
        expect(conflict.statusCode).toBe(409);
        expect(conflict.code).toBe('CONFLICT');
        // Ensure no internal DB table or constraint names leak
        expect(conflict.message).not.toContain('public.User');
        expect(conflict.message).not.toContain('Unique constraint failed on the fields');
        expect(conflict.message).toContain('Automatic account linking is prohibited');
      }
    });

    it('integrates P2002 conflict into REST response returning sanitized HTTP 409', async () => {
      const mockDb: IDatabaseService = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        isConnected: vi.fn().mockReturnValue(true),
        ping: vi.fn().mockResolvedValue(true),
        getClient: vi.fn().mockReturnValue({
          user: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockRejectedValue({
              code: 'P2002',
              meta: { target: ['googleSub'] },
              message: 'Unique constraint failed on the constraint: `User_googleSub_key`',
            }),
          },
        }) as unknown as IDatabaseService['getClient'],
      };

      const mockCache = createMockCache();

      const authModule = new AuthModule({
        databaseService: mockDb,
        cacheService: mockCache,
        tokenVerifier: {
          verifyIdToken: vi.fn().mockResolvedValue({
            sub: 'racing-google-sub',
            email: 'racing@aadat.music',
            emailVerified: true,
            name: 'Racing User',
          }),
        },
      });

      const app = new AadatServerApplication(
        { port: 4000, host: '0.0.0.0' },
        {
          databaseService: mockDb,
          cacheService: mockCache,
          authModule,
        }
      );

      const fastify = app.getFastifyInstance();
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/auth/google',
        payload: { idToken: 'valid-google-id-token' },
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.payload);
      expect(body.statusCode).toBe(409);
      expect(body.error).toBe('Conflict');
      expect(body.message).not.toContain('User_googleSub_key');
      expect(body.message).toContain('Automatic account linking is prohibited');
    });
  });

  describe('4. Error Sanitization & Security Boundary Verification', () => {
    it('sanitizes unexpected internal database failures to HTTP 500 without leaking credentials or raw SQL', async () => {
      const mockDb: IDatabaseService = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        isConnected: vi.fn().mockReturnValue(true),
        ping: vi.fn().mockResolvedValue(true),
        getClient: vi.fn().mockReturnValue({
          user: {
            findUnique: vi.fn().mockRejectedValue(
              new Error('FATAL: connection to server at "postgresql://user:secret@db.internal:5432" failed')
            ),
          },
        }) as unknown as IDatabaseService['getClient'],
      };

      const mockCache = createMockCache();
      const authModule = new AuthModule({
        databaseService: mockDb,
        cacheService: mockCache,
        tokenVerifier: {
          verifyIdToken: vi.fn().mockResolvedValue({
            sub: 'test-google-sub',
            email: 'test@aadat.music',
            emailVerified: true,
            name: 'Test Listener',
          }),
        },
      });

      const app = new AadatServerApplication(
        { port: 4000, host: '0.0.0.0' },
        { databaseService: mockDb, cacheService: mockCache, authModule }
      );

      const fastify = app.getFastifyInstance();
      await fastify.ready();
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/auth/google',
        payload: { idToken: 'valid-token' },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.payload);
      expect(body.statusCode).toBe(500);
      expect(body.error).toBe('Internal Server Error');
      expect(body.message).toBe('An unexpected internal server error occurred');
      expect(JSON.stringify(body)).not.toContain('secret');
      expect(JSON.stringify(body)).not.toContain('postgresql://');
      expect(JSON.stringify(body)).not.toContain('db.internal');
    });
  });
});
