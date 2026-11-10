import { configureTestAuth } from './fixtures/auth-env.js';
import { describe, expect, it, vi } from 'vitest';
import { AadatServerApplication } from '../index.js';
import { IDatabaseService } from '../infrastructure/database/contracts/database.contract.js';
import { ICacheService } from '../infrastructure/cache/contracts/cache.contract.js';

configureTestAuth();
function fixture(): { app: AadatServerApplication; database: IDatabaseService; cache: ICacheService } {
  const database: IDatabaseService = { connect: vi.fn(async () => {}), disconnect: vi.fn(async () => {}),
    getClient: vi.fn() as unknown as IDatabaseService['getClient'], isConnected: () => true, ping: vi.fn(async () => true) };
  const cache: ICacheService = { connect: vi.fn(async () => {}), disconnect: vi.fn(async () => {}),
    get: vi.fn(), set: vi.fn(), delete: vi.fn(), exists: vi.fn(), eval: vi.fn(), isConnected: () => true, ping: vi.fn(async () => 'PONG') };
  return { app: new AadatServerApplication({ port: 0, host: '127.0.0.1' }, { databaseService: database, cacheService: cache }), database, cache };
}
describe('Application startup and shutdown resource ownership', () => {
  it('shares startup and shutdown across concurrent callers', async () => {
    const { app, database, cache } = fixture();
    await Promise.all([app.start(), app.start()]);
    expect(database.connect).toHaveBeenCalledTimes(1);
    expect(cache.connect).toHaveBeenCalledTimes(1);
    await Promise.all([app.stop(), app.stop()]);
    expect(database.disconnect).toHaveBeenCalledTimes(1);
    expect(cache.disconnect).toHaveBeenCalledTimes(1);
    expect(app.getStatus().isRunning).toBe(false);
  });
  it('disconnects initialized resources when cache startup fails', async () => {
    const { app, database, cache } = fixture();
    vi.mocked(cache.connect).mockRejectedValueOnce(new Error('Cache unavailable'));
    await expect(app.start()).rejects.toThrow('Cache unavailable');
    expect(database.disconnect).toHaveBeenCalledTimes(1);
    expect(cache.disconnect).toHaveBeenCalledTimes(1);
    await app.stop();
    expect(database.disconnect).toHaveBeenCalledTimes(1);
    expect(cache.disconnect).toHaveBeenCalledTimes(1);
  });
  it('does not listen or start cache when the read-only database probe fails', async () => {
    const { app, database, cache } = fixture();
    vi.mocked(database.ping).mockResolvedValueOnce(false);
    await expect(app.start()).rejects.toThrow('Database readiness check failed');
    expect(cache.connect).not.toHaveBeenCalled();
    expect(database.disconnect).toHaveBeenCalledTimes(1);
    expect(app.getStatus().isRunning).toBe(false);
  });

});
