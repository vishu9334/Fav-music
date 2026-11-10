import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../server/.env') });

import { PrismaDatabaseService } from '../infrastructure/database/index.js';
import { RedisCacheService } from '../infrastructure/cache/index.js';
import { AadatServerApplication } from '../index.js';

const isLiveEnabled = process.env['TEST_LIVE_CONNECTIVITY'] === 'true';

describe.runIf(isLiveEnabled)('GATE 3B: Isolated Live Connectivity Verification', () => {
  const databaseUrl = process.env['DATABASE_URL'];
  const redisUrl = process.env['REDIS_URL'] || process.env['REDIS_HOST'];

  let dbService: PrismaDatabaseService;
  let cacheService: RedisCacheService;
  let app: AadatServerApplication;

  beforeAll(() => {
    expect(databaseUrl).toBeDefined();
    expect(redisUrl).toBeDefined();

    // Confirm development/test environment without printing credentials
    const dbParsed = new URL(databaseUrl!);
    expect(dbParsed.protocol).toMatch(/^postgres(ql)?:$/);
    expect(dbParsed.hostname).toBeDefined();

    const redisTarget = redisUrl!.startsWith('redis')
      ? redisUrl!
      : `redis://${redisUrl}:${process.env['REDIS_PORT'] || 6379}`;
    const redisParsed = new URL(redisTarget);
    expect(redisParsed.protocol).toMatch(/^rediss?:$/);
    expect(redisParsed.hostname).toBeDefined();

    dbService = new PrismaDatabaseService({
      connectionString: databaseUrl!,
      logQueries: false,
    });

    cacheService = new RedisCacheService({
      url: redisUrl!.startsWith('redis') ? redisUrl! : undefined,
      host: !redisUrl!.startsWith('redis') ? redisUrl! : undefined,
      port: Number(process.env['REDIS_PORT'] || 6379),
      useTls: redisUrl!.startsWith('rediss://'),
    });

    app = new AadatServerApplication(
      {
        port: 4001,
        host: '127.0.0.1',
        enableLogging: false,
      },
      {
        databaseService: dbService,
        cacheService: cacheService,
      }
    );
  });

  afterAll(async () => {
    if (app) {
      await app.stop();
    }
    if (cacheService && cacheService.isConnected()) {
      await cacheService.disconnect();
    }
    if (dbService && dbService.isConnected()) {
      await dbService.disconnect();
    }
  });

  it('connects to isolated PostgreSQL test instance and completes non-destructive SELECT 1 probe', async () => {
    await dbService.connect();
    expect(dbService.isConnected()).toBe(true);

    const isAlive = await dbService.ping();
    expect(isAlive).toBe(true);
  });

  it('connects to isolated Redis test instance, completes PING, and verifies namespaced isolated key lifecycle', async () => {
    await cacheService.connect();
    expect(cacheService.isConnected()).toBe(true);

    // 1. PING Check
    const pingResponse = await cacheService.ping();
    expect(pingResponse).toBe('PONG');

    // 2. Namespaced isolated key test with short TTL
    const testKey = `__aadat:isolated_test:${Date.now()}`;
    const testValue = `probe_payload_${Math.random().toString(36).substring(7)}`;

    // Write with 15s TTL
    await cacheService.set(testKey, testValue, 15);

    // Read back
    const readValue = await cacheService.get(testKey);
    expect(readValue).toBe(testValue);

    // Exists check
    const existsBeforeDelete = await cacheService.exists(testKey);
    expect(existsBeforeDelete).toBe(true);

    // Cleanup delete
    await cacheService.delete(testKey);
    const existsAfterDelete = await cacheService.exists(testKey);
    expect(existsAfterDelete).toBe(false);
  });

  it('verifies Fastify /health and /health/ready endpoints report healthy connected services', async () => {
    const fastify = app.getFastifyInstance();
    await fastify.ready();

    // 1. Aggregated /health
    const healthRes = await fastify.inject({
      method: 'GET',
      url: '/health',
    });
    expect(healthRes.statusCode).toBe(200);
    const healthBody = JSON.parse(healthRes.payload);
    expect(healthBody.status).toBe('ok');
    expect(healthBody.services.database).toBe('up');
    expect(healthBody.services.cache).toBe('up');

    // 2. Readiness /health/ready
    const readyRes = await fastify.inject({
      method: 'GET',
      url: '/health/ready',
    });
    expect(readyRes.statusCode).toBe(200);
    const readyBody = JSON.parse(readyRes.payload);
    expect(readyBody.status).toBe('ready');
    expect(readyBody.ready).toBe(true);

    // 3. GraphQL query { health { ... } }
    const gqlRes = await fastify.inject({
      method: 'POST',
      url: '/graphql',
      headers: {
        'content-type': 'application/json',
      },
      payload: JSON.stringify({
        query: `
          query LiveHealthCheck {
            health {
              status
              uptimeSeconds
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

    expect(gqlRes.statusCode).toBe(200);
    const gqlBody = JSON.parse(gqlRes.payload);
    expect(gqlBody.errors).toBeUndefined();
    expect(gqlBody.data.health).toMatchObject({
      status: 'ok',
      version: '0.1.0',
      services: {
        database: 'up',
        cache: 'up',
      },
    });
  });
});
