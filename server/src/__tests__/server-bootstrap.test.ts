import { describe, expect, it, vi } from 'vitest';
import { ServerBootstrap } from '../bootstrap/server-bootstrap.js';

const deferred = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};

describe('Executable server bootstrap', () => {
  it('constructs and starts the application once for concurrent callers', async () => {
    const application = { start: vi.fn(async () => {}), stop: vi.fn(async () => {}) };
    const createApplication = vi.fn(() => application);
    const bootstrap = new ServerBootstrap({ createApplication, log: vi.fn() });
    await Promise.all([bootstrap.start(), bootstrap.start()]);
    expect(createApplication).toHaveBeenCalledTimes(1);
    expect(application.start).toHaveBeenCalledTimes(1);
  });

  it('waits for startup before shutting down and handles duplicate signals once', async () => {
    const gate = deferred();
    const application = { start: vi.fn(() => gate.promise), stop: vi.fn(async () => {}) };
    const bootstrap = new ServerBootstrap({ createApplication: () => application, log: vi.fn() });
    const starting = bootstrap.start();
    const stop = bootstrap.stop();
    expect(bootstrap.stop()).toBe(stop);
    expect(application.stop).not.toHaveBeenCalled();
    gate.resolve();
    await Promise.all([starting, stop]);
    expect(application.stop).toHaveBeenCalledTimes(1);
  });

  it('cleans up a partial startup and propagates the original failure', async () => {
    const application = { start: vi.fn(async () => { throw new Error('Cache unavailable'); }), stop: vi.fn(async () => {}) };
    const log = vi.fn();
    const bootstrap = new ServerBootstrap({ createApplication: () => application, log });
    await expect(bootstrap.start()).rejects.toThrow('Cache unavailable');
    expect(application.stop).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });

  it('does not hide a shutdown failure', async () => {
    const application = { start: vi.fn(async () => {}), stop: vi.fn(async () => { throw new Error('Cleanup failed'); }) };
    const bootstrap = new ServerBootstrap({ createApplication: () => application, log: vi.fn() });
    await bootstrap.start();
    await expect(bootstrap.stop()).rejects.toThrow('Cleanup failed');
  });
});
