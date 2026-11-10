import { configureTestAuth } from './fixtures/auth-env.js';
import { describe, it, expect, vi } from 'vitest';
import { AadatServerApplication } from '../index.js';
import { IDatabaseService } from '../infrastructure/database/contracts/database.contract.js';
import { ICacheService } from '../infrastructure/cache/contracts/cache.contract.js';

configureTestAuth();

describe('AadatServerApplication (Bootstrap & Dependency Injection Tests)', () => {
  it('correctly orchestrates lifecycle with injected database and cache services', async () => {
    const mockDatabaseService: IDatabaseService = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      getClient: vi.fn() as unknown as IDatabaseService['getClient'],
      isConnected: vi.fn().mockReturnValue(true),
      ping: vi.fn().mockResolvedValue(true),
    };

    const mockCacheService: ICacheService = {
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

    const app = new AadatServerApplication(
      { port: 0, host: '127.0.0.1' },
      {
        databaseService: mockDatabaseService,
        cacheService: mockCacheService,
      }
    );

    expect(app.getStatus().isRunning).toBe(false);

    await app.start();
    expect(app.getStatus().isRunning).toBe(true);
    expect(mockDatabaseService.connect).toHaveBeenCalledTimes(1);
    expect(mockCacheService.connect).toHaveBeenCalledTimes(1);

    await app.stop();
    expect(app.getStatus().isRunning).toBe(false);
    expect(mockDatabaseService.disconnect).toHaveBeenCalledTimes(1);
    expect(mockCacheService.disconnect).toHaveBeenCalledTimes(1);
  });
});

