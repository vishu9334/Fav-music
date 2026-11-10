import { configureTestAuth } from './fixtures/auth-env.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AadatServerApplication } from '../index.js';
import { IDatabaseService } from '../infrastructure/database/contracts/database.contract.js';
import { ICacheService } from '../infrastructure/cache/contracts/cache.contract.js';
import {
  NotFoundError,
  ValidationFailedError,
} from '../shared/errors/domain.error.js';

configureTestAuth();

describe('Aadat Music - Fastify Core Foundation Integration Tests (Gate 3A)', () => {
  let mockDatabaseService: IDatabaseService;
  let mockCacheService: ICacheService;
  let app: AadatServerApplication;

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
      }
    );
  });

  describe('Root Info Route', () => {
    it('returns 200 with service information on GET /', async () => {
      const fastify = app.getFastifyInstance();
      const response = await fastify.inject({
        method: 'GET',
        url: '/',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.name).toBe('Aadat Music API');
      expect(body.version).toBe('0.1.0');
      expect(body.status).toBe('online');
      expect(body.endpoints.health).toBe('/health');
      expect(body.endpoints.graphql).toBe('/graphql');
    });
  });

  describe('Health Check Endpoints (Zero Credential Exposure)', () => {
    it('returns 200 healthy status on GET /health when DB and Cache are connected', async () => {
      const fastify = app.getFastifyInstance();
      const response = await fastify.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('ok');
      expect(body.services.database).toBe('up');
      expect(body.services.cache).toBe('up');
      expect(typeof body.uptimeSeconds).toBe('number');
      expect(typeof body.timestamp).toBe('string');

      // Security check: Verify NO connection strings or passwords leaked
      const rawText = response.payload.toLowerCase();
      expect(rawText).not.toContain('postgres://');
      expect(rawText).not.toContain('postgresql://');
      expect(rawText).not.toContain('password');
      expect(rawText).not.toContain('neon.tech');
    });

    it('returns 200 degraded status on GET /health when cache is disconnected', async () => {
      vi.mocked(mockCacheService.isConnected).mockReturnValue(false);

      const fastify = app.getFastifyInstance();
      const response = await fastify.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('degraded');
      expect(body.services.database).toBe('up');
      expect(body.services.cache).toBe('down');
    });

    it('returns 503 unhealthy status on GET /health when both DB and cache are disconnected', async () => {
      vi.mocked(mockDatabaseService.isConnected).mockReturnValue(false);
      vi.mocked(mockCacheService.isConnected).mockReturnValue(false);

      const fastify = app.getFastifyInstance();
      const response = await fastify.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('unhealthy');
      expect(body.services.database).toBe('down');
      expect(body.services.cache).toBe('down');
    });

    it('returns 200 alive status on GET /health/live', async () => {
      const fastify = app.getFastifyInstance();
      const response = await fastify.inject({
        method: 'GET',
        url: '/health/live',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('alive');
      expect(typeof body.timestamp).toBe('string');
    });

    it('returns 200 ready status on GET /health/ready when dependencies are healthy', async () => {
      const fastify = app.getFastifyInstance();
      const response = await fastify.inject({
        method: 'GET',
        url: '/health/ready',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.ready).toBe(true);
      expect(body.status).toBe('ready');
      expect(typeof body.timestamp).toBe('string');
    });

    it('returns 503 not ready status on GET /health/ready when database is down', async () => {
      vi.mocked(mockDatabaseService.isConnected).mockReturnValue(false);

      const fastify = app.getFastifyInstance();
      const response = await fastify.inject({
        method: 'GET',
        url: '/health/ready',
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.payload);
      expect(body.ready).toBe(false);
      expect(body.status).toBe('not_ready');
      expect(typeof body.timestamp).toBe('string');
    });
  });

  describe('GraphQL Smoke Tests via Mercurius', () => {
    it('executes health query successfully with structured service statuses', async () => {
      const fastify = app.getFastifyInstance();
      const response = await fastify.inject({
        method: 'POST',
        url: '/graphql',
        headers: {
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          query: `
            query CheckHealth {
              health {
                status
                uptimeSeconds
                timestamp
                version
                services {
                  database
                  cache
                }
              }
            }
          `,
        }),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.errors).toBeUndefined();
      expect(body.data).toBeDefined();
      expect(body.data.health).toMatchObject({
        status: 'ok',
        version: '0.1.0',
        services: {
          database: 'up',
          cache: 'up',
        },
      });
      expect(typeof body.data.health.uptimeSeconds).toBe('number');
      expect(typeof body.data.health.timestamp).toBe('string');
    });

    it('rejects me query when unauthenticated without returning fake identities', async () => {
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
                displayName
                chatRetentionPreference
                createdAt
              }
            }
          `,
        }),
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.payload);
      expect(body.errors).toBeDefined();
      expect(body.errors[0].message).toContain('Authentication required');
      expect(body.data).toBeNull();
      // Verify no fake identity leaked
      expect(response.payload).not.toContain('system-guest-user');
      expect(response.payload).not.toContain('guest@aadat.music');
    });

    it('rejects unimplemented mutations explicitly without simulating artificial success', async () => {
      const fastify = app.getFastifyInstance();
      const response = await fastify.inject({
        method: 'POST',
        url: '/graphql',
        headers: {
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          query: `
            mutation UpdatePref {
              updateChatRetentionPreference(preference: PERSISTENT_HISTORY) {
                id
                chatRetentionPreference
              }
            }
          `,
        }),
      });

      expect(response.statusCode).toBe(501);
      const body = JSON.parse(response.payload);
      expect(body.errors).toBeDefined();
      expect(body.errors[0].message).toContain('not implemented');
      expect(body.data?.updateChatRetentionPreference).toBeUndefined();
    });

    it('requires authentication for catalog reads before querying persistence', async () => {
      const fastify = app.getFastifyInstance();
      const response = await fastify.inject({
        method: 'POST',
        url: '/graphql',
        headers: {
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          query: `
            query GetTrack {
              track(id: "non-existent-track") {
                id
                title
              }
            }
          `,
        }),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.errors[0].extensions.code).toBe('UNAUTHORIZED');
      expect(body.data.track).toBeNull();
    });
  });

  describe('Centralized Error Handling Middleware', () => {
    it('maps NotFoundError to 404 with structured response', async () => {
      const fastify = app.getFastifyInstance();

      // Register an ephemeral route throwing NotFoundError
      fastify.get('/test-not-found', async () => {
        throw new NotFoundError('Test resource not found');
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/test-not-found',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.statusCode).toBe(404);
      expect(body.error).toBe('Not Found');
      expect(body.message).toBe('Test resource not found');
      expect(typeof body.timestamp).toBe('string');
    });

    it('maps ValidationFailedError to 400 with structured response', async () => {
      const fastify = app.getFastifyInstance();

      fastify.get('/test-validation-failed', async () => {
        throw new ValidationFailedError('Invalid payload provided');
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/test-validation-failed',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.statusCode).toBe(400);
      expect(body.error).toBe('Validation Failed');
      expect(body.message).toBe('Invalid payload provided');
    });

    it('maps unhandled generic Error to 500 without leaking stack traces or sensitive details', async () => {
      const fastify = app.getFastifyInstance();

      fastify.get('/test-unhandled-error', async () => {
        throw new Error('Secret connection to postgresql://admin:secret@db.neon.tech failed');
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/test-unhandled-error',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.payload);
      expect(body.statusCode).toBe(500);
      expect(body.error).toBe('Internal Server Error');
      expect(body.message).toBe('An unexpected internal server error occurred');

      // Security check: verify no secrets or internal strings leaked
      expect(response.payload).not.toContain('secret');
      expect(response.payload).not.toContain('postgresql://');
      expect(response.payload).not.toContain('neon.tech');
      expect(body.stack).toBeUndefined();
    });
  });
});
