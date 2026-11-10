import { describe, it, expect, vi } from 'vitest';
import { Redis } from 'ioredis';
import pg from 'pg';
import { PrismaDatabaseService } from '../database/implementations/prisma-database.service.js';
import { RedisCacheService } from '../cache/implementations/redis-cache.service.js';
import { ServerEnvironmentConfig, ConfigurationError } from '../config/index.js';
import { S3StorageService } from '../storage/implementations/s3-storage.service.js';
import { OpenWeatherService } from '../weather/implementations/openweather.service.js';
import { JioSaavnMusicProviderService } from '../music-provider/implementations/jiosaavn-music-provider.service.js';
import { JwtAuthGuard } from '../../shared/guards/implementations/jwt-auth.guard.js';
import { UnauthorizedError } from '../../shared/errors/domain.error.js';

describe('Server Infrastructure Adapters (OOP & SOLID Tests)', () => {
  describe('PrismaDatabaseService', () => {
    it('instantiates with driver adapter and manages connection state', () => {
      const db = new PrismaDatabaseService({
        connectionString: 'postgresql://user:password@ep-sample-pooler.region.neon.tech/aadat_db?sslmode=require',
      });
      expect(db.isConnected()).toBe(false);
      expect(db.getClient()).toBeDefined();
    });

    it('implements non-destructive ping health check probe', async () => {
      const db = new PrismaDatabaseService({
        connectionString: 'postgresql://user:password@ep-sample-pooler.region.neon.tech/aadat_db?sslmode=require',
      });
      const query = vi.spyOn(pg.Pool.prototype, 'query').mockRejectedValueOnce(new Error('Database unavailable'));
      try {
        expect(await db.ping()).toBe(false);
      } finally {
        query.mockRestore();
      }
    });
  });

  describe('RedisCacheService (ioredis Integration)', () => {
    it('manages key-value pairs with TTL and deletion via injected client', async () => {
      const mockStorage = new Map<string, string>();
      const mockClient = {
        status: 'ready',
        on: vi.fn(),
        connect: vi.fn().mockResolvedValue(undefined),
        quit: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn(),
        get: vi.fn().mockImplementation(async (key: string) => mockStorage.get(key) ?? null),
        set: vi.fn().mockImplementation(async (key: string, val: string) => {
          mockStorage.set(key, val);
          return 'OK';
        }),
        del: vi.fn().mockImplementation(async (key: string) => {
          mockStorage.delete(key);
          return 1;
        }),
        exists: vi.fn().mockImplementation(async (key: string) => (mockStorage.has(key) ? 1 : 0)),
        ping: vi.fn().mockResolvedValue('PONG'),
      } as unknown as Redis;

      const cache = new RedisCacheService(
        { host: '127.0.0.1', port: 6379 },
        { client: mockClient }
      );

      expect(cache.isConnected()).toBe(true);
      await cache.connect();

      await cache.set('test:key:1', 'aadat-sample-value');
      const val = await cache.get('test:key:1');
      expect(val).toBe('aadat-sample-value');

      expect(await cache.exists('test:key:1')).toBe(true);
      expect(await cache.ping()).toBe('PONG');

      await cache.delete('test:key:1');
      expect(await cache.exists('test:key:1')).toBe(false);

      await cache.disconnect();
    });
  });

  describe('ServerEnvironmentConfig', () => {
    it('validates and parses valid environment variables', () => {
      const config = ServerEnvironmentConfig.fromEnv({
        NODE_ENV: 'test',
        PORT: '5000',
        HOST: '127.0.0.1',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/testdb',
        REDIS_URL: 'redis://default:secret@localhost:6379',
        GOOGLE_CLIENT_ID: 'test-google-client-id.apps.googleusercontent.com',
        JWT_SECRET: 'test-jwt-secret-min-32-chars-long-for-testing-purposes',
        JWT_ACCESS_EXPIRATION_SECONDS: '900',
        REFRESH_TOKEN_EXPIRATION_DAYS: '7',
      });

      expect(config.nodeEnv).toBe('test');
      expect(config.port).toBe(5000);
      expect(config.host).toBe('127.0.0.1');
      expect(config.redisPort).toBe(6379);
      expect(config.googleClientId).toBe('test-google-client-id.apps.googleusercontent.com');
      expect(config.jwtSecret).toBe('test-jwt-secret-min-32-chars-long-for-testing-purposes');
      expect(config.jwtAccessExpirationSeconds).toBe(900);
      expect(config.refreshTokenExpirationDays).toBe(7);

      // Verify safe logging redacts all sensitive URIs and credentials
      const safeLog = config.toSafeLog();
      expect(safeLog['databaseUrl']).toBe('[REDACTED_POSTGRESQL_URI]');
      expect(safeLog['redisUrl']).toBe('[REDACTED_REDIS_URI]');
      expect(safeLog['googleClientId']).toBe('[REDACTED_GOOGLE_CLIENT_ID]');
      expect(safeLog['jwtSecret']).toBe('[REDACTED_JWT_SECRET]');
      expect(JSON.stringify(safeLog)).not.toContain('secret');
      expect(JSON.stringify(safeLog)).not.toContain('pass');
      expect(JSON.stringify(safeLog)).not.toContain('test-jwt-secret');
    });

    it('fails fast with ConfigurationError when DATABASE_URL is missing', () => {
      expect(() => {
        ServerEnvironmentConfig.fromEnv({
          PORT: '4000',
          REDIS_URL: 'redis://localhost:6379',
          GOOGLE_CLIENT_ID: 'test-client-id',
          JWT_SECRET: 'test-jwt-secret-min-32-chars-long-for-testing-purposes',
        });
      }).toThrow(ConfigurationError);
    });

    it('fails fast with ConfigurationError when Redis config is missing', () => {
      expect(() => {
        ServerEnvironmentConfig.fromEnv({
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/testdb',
          GOOGLE_CLIENT_ID: 'test-client-id',
          JWT_SECRET: 'test-jwt-secret-min-32-chars-long-for-testing-purposes',
        });
      }).toThrow(ConfigurationError);
    });

    it('fails fast with ConfigurationError when GOOGLE_CLIENT_ID is missing', () => {
      expect(() => {
        ServerEnvironmentConfig.fromEnv({
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/testdb',
          REDIS_URL: 'redis://localhost:6379',
          JWT_SECRET: 'test-jwt-secret-min-32-chars-long-for-testing-purposes',
        });
      }).toThrow(ConfigurationError);
    });

    it('fails fast with ConfigurationError when JWT_SECRET is missing or too short', () => {
      expect(() => {
        ServerEnvironmentConfig.fromEnv({
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/testdb',
          REDIS_URL: 'redis://localhost:6379',
          GOOGLE_CLIENT_ID: 'test-client-id',
          JWT_SECRET: 'short-secret',
        });
      }).toThrow(ConfigurationError);
    });

    it('fails fast with ConfigurationError when PORT is invalid', () => {
      expect(() => {
        ServerEnvironmentConfig.fromEnv({
          PORT: 'invalid-port',
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/testdb',
          REDIS_URL: 'redis://localhost:6379',
          GOOGLE_CLIENT_ID: 'test-client-id',
          JWT_SECRET: 'test-jwt-secret-min-32-chars-long-for-testing-purposes',
        });
      }).toThrow(ConfigurationError);
    });
  });

  describe('S3StorageService', () => {
    it('generates presigned URLs from stored object keys', async () => {
      const s3 = new S3StorageService({
        bucketName: 'aadat-private-bucket',
        region: 'ap-south-1',
      });

      const downloadUrl = await s3.getPresignedDownloadUrl('tracks/audio/sample-uuid.mp3', 3600);
      expect(downloadUrl).toContain('aadat-private-bucket.s3.ap-south-1.amazonaws.com');
      expect(downloadUrl).toContain('tracks/audio/sample-uuid.mp3');
      expect(downloadUrl).toContain('X-Amz-Expires=3600');
      expect(downloadUrl).toContain('X-Amz-Signature=');

      const uploadUrl = await s3.getPresignedUploadUrl('avatars/user-1.jpg', 'image/jpeg');
      expect(uploadUrl).toContain('aadat-private-bucket.s3.ap-south-1.amazonaws.com');
      expect(uploadUrl).toContain('avatars/user-1.jpg');
      expect(uploadUrl).toContain('X-Amz-Signature=');
    });
  });

  describe('OpenWeatherService', () => {
    it('retrieves contextual weather condition', async () => {
      const weather = new OpenWeatherService({ apiKey: 'sample-api-key' });
      const snapshot = await weather.getCurrentWeather(19.076, 72.8777);
      expect(snapshot.condition).toBe('clear');
      expect(snapshot.tempCelsius).toBeGreaterThan(0);
    });
  });

  describe('JioSaavnMusicProviderService', () => {
    it('instantiates and provides search interface', async () => {
      const provider = new JioSaavnMusicProviderService({
        apiBaseUrl: 'https://saavn.bycomsolutions.com/api',
      });
      expect(provider.getConfig().apiBaseUrl).toBe('https://saavn.bycomsolutions.com/api');

      // Offline fallback check
      const emptyResults = await provider.searchSongs('');
      expect(emptyResults).toEqual([]);
    });
  });

  describe('JwtAuthGuard', () => {
    const guard = new JwtAuthGuard({ secret: 'secure-test-secret-key-64-characters-long' });

    it('rejects missing or malformed authorization header', async () => {
      await expect(guard.validateToken(undefined)).rejects.toThrow(UnauthorizedError);
      await expect(guard.validateToken('Basic invalid')).rejects.toThrow(UnauthorizedError);
      await expect(guard.validateToken('Bearer ')).rejects.toThrow(UnauthorizedError);
      await expect(guard.validateToken('Bearer not.a.valid.jwt.token')).rejects.toThrow(UnauthorizedError);
    });

    it('validates a structured JWT bearer token', async () => {
      const signedToken = await guard.getJwtTokenService().signAccessToken({
        userId: 'user-uuid-1234',
        email: 'listener@aadat.music',
        sessionId: 'session-uuid-5678',
      });
      const token = `Bearer ${signedToken}`;

      const context = await guard.validateToken(token);
      expect(context.userId).toBe('user-uuid-1234');
      expect(context.email).toBe('listener@aadat.music');
    });
  });
});
