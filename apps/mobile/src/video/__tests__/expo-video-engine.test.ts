import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const listeners = new Map<string, Set<(payload: unknown) => void>>(); let source: unknown;
  const emit = (name: string, payload: unknown = {}) => { for (const listener of [...listeners.get(name) ?? []]) listener(payload); };
  const player = {
    status: 'idle', playing: false, muted: true, duration: 8, currentTime: 0, bufferedPosition: 0,
    loop: false, audioMixingMode: '', staysActiveInBackground: false, showNowPlayingNotification: false, timeUpdateEventInterval: 0,
    bufferOptions: {},
    addListener: vi.fn((name: string, listener: (payload: unknown) => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(listener);
      return { remove: () => { listeners.get(name)?.delete(listener); } };
    }),
    replace: vi.fn((next: unknown): void => {
      queueMicrotask(() => {
        player.status = 'loading'; emit('statusChange', { status: 'loading' });
        if (source !== next) { source = next; emit('sourceChange', { source }); }
        queueMicrotask(() => { player.status = 'readyToPlay'; emit('statusChange', { status: 'readyToPlay' }); });
      });
    }),
    play: vi.fn((): void => { player.playing = true; emit('playingChange', { isPlaying: true }); }),
    pause: vi.fn((): void => { player.playing = false; emit('playingChange', { isPlaying: false }); }),
    release: vi.fn(),
  };
  return { player, emit, reset: () => { listeners.clear(); source = undefined; player.status = 'idle'; player.playing = false; player.muted = true; player.currentTime = 0; } };
});
vi.mock('expo-video', () => ({ createVideoPlayer: () => fake.player }));
vi.mock('../../services/playback/MediaPlaybackCoordinator', () => ({ mediaPlaybackCoordinator: { owner: 'video' } }));
const leases = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock('../../catalog/catalog-runtime', () => ({ mediaLeases: leases }));
import { ExpoVideoEngine } from '../ExpoVideoEngine';
let engine: ExpoVideoEngine;
beforeEach(() => { fake.reset(); vi.clearAllMocks(); engine = new ExpoVideoEngine(); });
afterEach(() => { engine.dispose(); vi.useRealTimers(); });

describe('Expo SDK 52 adapter contract (native module mocked)', () => {
  it('resolves catalog video by trusted ID and forces a fresh URL when retrying a native error', async () => {
    const id = '10000000-0000-4000-8000-000000000001';
    leases.resolve.mockResolvedValue(new Map([[id, 'https://media.example.test/fixture?signature=test']]));
    await engine.load({ kind: 'catalog', trackId: id, attribution: 'Synthetic test source' });
    expect(leases.resolve).toHaveBeenLastCalledWith([id], 'VIDEO', false);
    expect(fake.player.replace).toHaveBeenLastCalledWith({ uri: 'https://media.example.test/fixture?signature=test' });
    fake.player.status = 'error'; await engine.load({ kind: 'catalog', trackId: id, attribution: 'Synthetic test source' });
    expect(leases.resolve).toHaveBeenLastCalledWith([id], 'VIDEO', true);
  });
  it('never replaces native media if catalog authorization fails', async () => {
    leases.resolve.mockRejectedValueOnce(new Error('Unavailable'));
    await expect(engine.load({ kind: 'catalog', trackId: '10000000-0000-4000-8000-000000000001', attribution: 'Test source' })).rejects.toThrow('Unavailable');
    expect(fake.player.replace).not.toHaveBeenCalled();
  });
  it('configures bounded foreground-only playback and reloads the same source without requiring a sourceChange event', async () => {
    expect(fake.player).toMatchObject({ muted: true, audioMixingMode: 'doNotMix', timeUpdateEventInterval: 0.5, staysActiveInBackground: false, showNowPlayingNotification: false });
    expect(fake.player.bufferOptions).toMatchObject({ maxBufferBytes: 6 * 1024 * 1024, preferredForwardBufferDuration: 6 });
    await engine.load({ kind: 'asset', asset: 1 }); await engine.load({ kind: 'asset', asset: 1 });
    expect(engine.snapshot().status).toBe('ready'); expect(fake.player.replace).toHaveBeenCalledTimes(2);
  });
  it('can retry after an old error without rejecting before the native replace is acknowledged', async () => {
    fake.player.status = 'error'; await engine.load({ kind: 'asset', asset: 1 }); expect(engine.snapshot().status).toBe('ready');
  });
  it('uses event-confirmed progress, exposes end state and pauses/mutes before handing off', async () => {
    await engine.load({ kind: 'asset', asset: 1 }); await engine.play(); expect(engine.snapshot().playing).toBe(true);
    fake.emit('timeUpdate', { currentTime: 3, bufferedPosition: 6 }); expect(engine.snapshot()).toMatchObject({ position: 3, buffered: 6, duration: 8 });
    await engine.seek(5); expect(engine.snapshot().position).toBe(3);
    fake.emit('timeUpdate', { currentTime: 5, bufferedPosition: 7 }); expect(engine.snapshot().position).toBe(5);
    await engine.pauseAndConfirm(); expect(fake.player).toMatchObject({ playing: false, muted: true });
    fake.emit('playToEnd'); expect(engine.snapshot().ended).toBe(true);
  });
  it('cleans pending load waits/timers on disposal without an obsolete autoplay', async () => {
    vi.useFakeTimers(); fake.player.replace.mockImplementationOnce(() => {});
    const loading = engine.load({ kind: 'asset', asset: 1 }); const rejected = expect(loading).rejects.toThrow('closed');
    await Promise.resolve(); await Promise.resolve(); engine.dispose(); await rejected;
    expect(fake.player.release).toHaveBeenCalledOnce(); expect(fake.player.play).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it('times out an unresponsive load and rejects unattributed HTTP streaming input', async () => {
    vi.useFakeTimers(); fake.player.replace.mockImplementationOnce(() => {});
    const result = expect(engine.load({ kind: 'asset', asset: 1 })).rejects.toThrow('respond in time');
    await vi.advanceTimersByTimeAsync(20_001); await result;
    await expect(engine.load({ kind: 'https', uri: 'http://invalid.example/test.mp4', attribution: '' })).rejects.toThrow('authorized HTTPS');
  });
  it('loads local storage video at any resolution without requiring HTTPS streaming leases', async () => {
    await engine.load({ kind: 'local', uri: 'file:///storage/emulated/0/Movies/sample_1080p.mp4', resolution: '1080p' });
    expect(fake.player.replace).toHaveBeenLastCalledWith({ uri: 'file:///storage/emulated/0/Movies/sample_1080p.mp4' });
    expect(engine.snapshot().status).toBe('ready');
  });
});
