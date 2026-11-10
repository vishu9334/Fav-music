import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaybackState } from '@aadat/contracts';
import { SAMPLE_TRACKS } from '../../../data/sample-tracks';
import type { AudioPlaybackService } from '../AudioPlaybackService';
import type { NativeMock } from './track-player.mock';
import type { IPlayableTrack } from '../../../data/sample-tracks';

vi.mock('react-native-track-player', async () =>
  (await import('./track-player.mock')).trackPlayerModule);

let native: NativeMock;
let service: AudioPlaybackService;
beforeEach(async () => {
  vi.resetModules();
  native = (await import('react-native-track-player')).default as unknown as NativeMock;
  native.__reset();
  service = (await import('../AudioPlaybackService')).AudioPlaybackService.getInstance();
  service.configureInitialQueue(SAMPLE_TRACKS);
});
afterEach(async () => { await service.destroy(); });

async function remoteService(): Promise<void> {
  await (await import('../playback-service')).playbackService();
}

describe('TrackPlayer queue lifecycle', () => {
  it('shares one service instance', async () => {
    expect((await import('../AudioPlaybackService')).AudioPlaybackService.getInstance()).toBe(service);
  });

  it('initializes one native player, queue and listener set for concurrent callers', async () => {
    await Promise.all([service.initialize(), service.initialize(), service.initialize()]);
    expect(native.setupPlayer).toHaveBeenCalledTimes(1);
    expect(native.add).toHaveBeenCalledTimes(1);
    expect(native.reset).not.toHaveBeenCalled();
    expect(native.__listenerCount('playback-state')).toBe(1);
    expect(await native.getQueue()).toHaveLength(3);
  });

  it('adopts an existing native selection without rewinding or resetting it', async () => {
    native.__seed(SAMPLE_TRACKS, 2);
    native.__setPosition(42);
    await service.initialize();
    const track = vi.fn(); const progress = vi.fn();
    service.onTrackChange(track); service.onProgress(progress);
    expect(track).toHaveBeenLastCalledWith(2);
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ position: 42 }));
    expect(native.reset).not.toHaveBeenCalled();
    expect(native.add).not.toHaveBeenCalled();
    expect(native.skip).not.toHaveBeenCalled();
  });

  it('does not swallow a real setup failure and allows a later retry', async () => {
    native.setupPlayer.mockRejectedValueOnce(new Error('Native setup failed'));
    await expect(service.initialize()).rejects.toThrow('Native setup failed');
    expect(service.getPlaybackState()).toBe(PlaybackState.ERROR);
    await service.initialize();
    expect(native.setupPlayer).toHaveBeenCalledTimes(2);
    expect(await native.getQueue()).toHaveLength(3);
  });

  it('can attach to an already initialized native player', async () => {
    native.setupPlayer.mockRejectedValueOnce(Object.assign(new Error('Already initialized'), {
      code: 'player_already_initialized',
    }));
    await service.initialize();
    expect(await native.getQueue()).toHaveLength(3);
  });

  it('retries failed options without setting up the player or listeners twice', async () => {
    native.updateOptions.mockRejectedValueOnce(new Error('Options failed'));
    await expect(service.initialize()).rejects.toThrow('Options failed');
    await service.initialize();
    expect(native.setupPlayer).toHaveBeenCalledTimes(1);
    expect(native.updateOptions).toHaveBeenCalledTimes(2);
    expect(native.__listenerCount('playback-state')).toBe(1);
  });

  it('does not duplicate an explicitly loaded queue for concurrent identical requests', async () => {
    await Promise.all([service.loadQueue(SAMPLE_TRACKS, 2), service.loadQueue(SAMPLE_TRACKS, 2)]);
    expect(await native.getQueue()).toHaveLength(3);
    expect(native.add).toHaveBeenCalledTimes(1);
    expect(await native.getActiveTrackIndex()).toBe(2);
  });

  it('preserves queue, index and position through remote Stop → Play', async () => {
    await service.loadQueue(SAMPLE_TRACKS, 2);
    await service.seekTo(28);
    await service.play();
    await remoteService();
    await native.__emit('remote-stop');
    expect(service.getPlaybackState()).toBe(PlaybackState.STOPPED);
    expect(await native.getQueue()).toHaveLength(3);
    expect(await native.getActiveTrackIndex()).toBe(2);
    expect(native.reset).not.toHaveBeenCalled();
    await native.__emit('remote-play');
    expect(native.retry).toHaveBeenCalledTimes(1);
    expect(service.getPlaybackState()).toBe(PlaybackState.PLAYING);
    expect((await native.getProgress()).position).toBe(28);
  });

  it('recovers the last selected index after an external reset and temporary index-0 events', async () => {
    await service.loadQueue(SAMPLE_TRACKS, 2);
    await native.reset();
    await service.play();
    expect(await native.getQueue()).toHaveLength(3);
    expect(await native.getActiveTrackIndex()).toBe(2);
    expect(service.getPlaybackState()).toBe(PlaybackState.PLAYING);
  });

  it('recovers through remote Play even before the screen mounts', async () => {
    await remoteService();
    await native.__emit('remote-play');
    expect(await native.getQueue()).toHaveLength(3);
    expect(service.getPlaybackState()).toBe(PlaybackState.PLAYING);
  });

  it('selects a missing active item without duplicating a nonempty queue', async () => {
    await service.loadQueue(SAMPLE_TRACKS, 2);
    native.__seed(SAMPLE_TRACKS, undefined);
    await service.play();
    expect(native.add).toHaveBeenCalledTimes(1);
    expect(await native.getActiveTrackIndex()).toBe(2);
  });

  it('serializes concurrent recovery and transport commands', async () => {
    await service.loadQueue(SAMPLE_TRACKS, 1);
    await native.reset();
    const adds = native.add.mock.calls.length;
    await Promise.all([service.play(), service.play(), service.skipToNext(), service.seekTo(37)]);
    expect(native.add).toHaveBeenCalledTimes(adds + 1);
    expect(await native.getQueue()).toHaveLength(3);
    expect(await native.getActiveTrackIndex()).toBe(2);
    expect((await native.getProgress()).position).toBe(37);
    expect(service.getPlaybackState()).toBe(PlaybackState.PLAYING);
  });

  it('waits for a pending add before executing Play or Seek', async () => {
    const originalAdd = native.add.getMockImplementation()!;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    native.add.mockImplementationOnce(async (tracks) => {
      await barrier;
      await originalAdd(tracks);
    });
    const loading = service.loadQueue(SAMPLE_TRACKS, 2);
    const playing = service.play();
    const seeking = service.seekTo(18);
    await vi.waitFor(() => { expect(native.add).toHaveBeenCalledTimes(1); });
    expect(native.play).not.toHaveBeenCalled();
    expect(native.seekTo).not.toHaveBeenCalled();
    release();
    await Promise.all([loading, playing, seeking]);
    expect(await native.getActiveTrackIndex()).toBe(2);
    expect((await native.getProgress()).position).toBe(18);
  });

  it('keeps a failed queue restore retryable and never plays an empty queue', async () => {
    native.add.mockRejectedValueOnce(new Error('Add failed'));
    const error = vi.fn(); service.onError(error);
    await service.play();
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: 'Add failed' }));
    expect(native.play).not.toHaveBeenCalled();
    await service.play();
    expect(await native.getQueue()).toHaveLength(3);
    expect(service.getPlaybackState()).toBe(PlaybackState.PLAYING);
  });

  it('rejects an explicitly empty playlist without issuing native Play', async () => {
    await service.loadQueue([]);
    const error = vi.fn(); service.onError(error);
    await service.play();
    expect(native.play).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: 'No tracks are available for playback' }));
  });
});

describe('Navigation, seek and native state', () => {
  it('wraps Next and Previous and restarts the current track after three seconds', async () => {
    await service.loadQueue(SAMPLE_TRACKS, 2);
    await service.skipToNext();
    expect(await native.getActiveTrackIndex()).toBe(0);
    await service.skipToPrevious();
    expect(await native.getActiveTrackIndex()).toBe(2);
    native.__setPosition(15);
    await service.skipToPrevious();
    expect(await native.getActiveTrackIndex()).toBe(2);
    expect((await native.getProgress()).position).toBe(0);
  });

  it('uses a native selection change when computing Next', async () => {
    await service.initialize();
    await native.skip(1);
    await service.skipToNext();
    expect(await native.getActiveTrackIndex()).toBe(2);
  });

  it('recovers an empty queue before Next, Previous or Seek', async () => {
    await service.loadQueue(SAMPLE_TRACKS, 1);
    await native.reset(); await service.skipToNext();
    expect(await native.getActiveTrackIndex()).toBe(2);
    await native.reset(); await service.skipToPrevious();
    expect(await native.getActiveTrackIndex()).toBe(1);
    await native.reset(); await service.seekTo(75);
    expect(await native.getActiveTrackIndex()).toBe(1);
    expect((await native.getProgress()).position).toBe(75);
  });

  it('reports confirmed native progress and leaves it unchanged after a failed Seek', async () => {
    await service.initialize();
    const progress = vi.fn(); service.onProgress(progress);
    await service.seekTo(45);
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ position: 45 }));
    native.seekTo.mockRejectedValueOnce(new Error('Seek failed'));
    await service.seekTo(90);
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ position: 45 }));
    expect(service.getPlaybackState()).toBe(PlaybackState.ERROR);
  });

  it.each([-1, NaN, Infinity])('rejects invalid seek position %s', async (position) => {
    await service.seekTo(position);
    expect(native.seekTo).not.toHaveBeenCalled();
    expect(service.getPlaybackState()).toBe(PlaybackState.ERROR);
  });

  it('toggles using native state rather than a stale cached event', async () => {
    await service.initialize();
    native.getPlaybackState.mockResolvedValueOnce({ state: 'playing' });
    await service.togglePlayPause();
    expect(native.pause).toHaveBeenCalledTimes(1);
    expect(native.play).not.toHaveBeenCalled();
  });

  it('registers remote handlers once and applies the same navigation and seek rules', async () => {
    await service.initialize();
    await remoteService(); await remoteService();
    expect(native.__listenerCount('remote-next')).toBe(1);
    await native.__emit('remote-next');
    expect(await native.getActiveTrackIndex()).toBe(1);
    await native.__emit('remote-seek', { position: 50 });
    await native.__emit('remote-previous');
    expect(await native.getActiveTrackIndex()).toBe(1);
    expect((await native.getProgress()).position).toBe(0);
    await native.__emit('remote-previous');
    expect(await native.getActiveTrackIndex()).toBe(0);
  });

  it('preserves the queue on permanent interruption and recovers on resume', async () => {
    await service.initialize(); await remoteService();
    await native.__emit('remote-duck', { permanent: true, paused: true });
    expect(await native.getQueue()).toHaveLength(3);
    expect(native.reset).not.toHaveBeenCalled();
    await native.__emit('remote-duck', { permanent: false, paused: false });
    expect(service.getPlaybackState()).toBe(PlaybackState.PLAYING);
  });

  it('removes native subscriptions when torn down', async () => {
    await service.initialize();
    await service.destroy();
    expect(native.__listenerCount('playback-state')).toBe(0);
    await service.initialize();
    expect(native.__listenerCount('playback-state')).toBe(1);
  });
});

describe('Authorized catalog source recovery', () => {
  const catalogTracks: readonly IPlayableTrack[] = SAMPLE_TRACKS.slice(0, 2).map((track, index) => ({ ...track,
    id: `10000000-0000-4000-8000-00000000000${index + 1}`, catalogSource: 'catalog', url: '' }));
  function resolver() {
    let revision = 0;
    return vi.fn(async (tracks: readonly IPlayableTrack[], force = false): Promise<readonly IPlayableTrack[]> => {
      if (force) revision++;
      return tracks.map((track) => ({ ...track, url: `https://media.example.test/${track.id}?revision=${revision}` }));
    });
  }
  it('rotates expired URLs without losing queue order, selection or seek position', async () => {
    const source = resolver(); service.configureSourceResolver(source);
    await service.loadQueue(catalogTracks, 1); await service.play(); await service.seekTo(37);
    await native.__emit('playback-error', { code: '403', message: 'Expired signature https://media.example.test/private?secret=hidden' });
    await vi.waitFor(() => expect(native.play).toHaveBeenCalledTimes(2));
    expect((await native.getQueue()).map((track) => track.id)).toEqual(catalogTracks.map((track) => track.id));
    expect(await native.getActiveTrackIndex()).toBe(1); expect((await native.getProgress()).position).toBe(37);
    expect((await native.getQueue())[1]?.url).toContain('revision=1');
    expect(service.getPlaybackState()).toBe(PlaybackState.PLAYING);
  });
  it('bounds automatic expiry recovery and permits an explicit Play retry', async () => {
    const source = resolver(); service.configureSourceResolver(source); await service.loadQueue(catalogTracks); await service.play();
    await native.__emit('playback-error', { code: '403', message: 'Expired' });
    await vi.waitFor(() => expect(native.play).toHaveBeenCalledTimes(2));
    const count = source.mock.calls.length;
    await native.__emit('playback-error', { code: '403', message: 'Expired' }); await Promise.resolve();
    expect(source).toHaveBeenCalledTimes(count); await service.play(); expect(native.play).toHaveBeenCalledTimes(3);
    expect(source.mock.calls.some((call) => call[1] === true)).toBe(true);
  });
  it('does not autoplay a late lease renewal after Pause', async () => {
    const source = resolver(); service.configureSourceResolver(source); await service.loadQueue(catalogTracks); await service.play();
    let release!: (tracks: readonly IPlayableTrack[]) => void;
    source.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    await native.__emit('playback-error', { code: '403', message: 'Expired' });
    await vi.waitFor(() => expect(typeof release).toBe('function'));
    await service.pause();
    release(catalogTracks.map((track) => ({ ...track, url: 'https://media.example.test/new' })));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(native.play).toHaveBeenCalledTimes(1); expect(service.getPlaybackState()).toBe(PlaybackState.PAUSED);
  });
  it('does not automatically play a prepared or paused track when an expiry event arrives', async () => {
    const source = resolver(); service.configureSourceResolver(source); await service.loadQueue(catalogTracks);
    await native.__emit('playback-error', { code: '403', message: 'Expired' });
    expect(source).toHaveBeenCalledTimes(1); expect(native.play).not.toHaveBeenCalled();
    await service.play(); await service.pause(); const count = source.mock.calls.length;
    await native.__emit('playback-error', { code: '403', message: 'Expired' });
    expect(source).toHaveBeenCalledTimes(count); expect(native.play).toHaveBeenCalledTimes(1);
  });
  it('does not reclaim audio from a newer video intent during URL renewal', async () => {
    const source = resolver(); service.configureSourceResolver(source); await service.loadQueue(catalogTracks); await service.play();
    let release!: (tracks: readonly IPlayableTrack[]) => void;
    source.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    await native.__emit('playback-error', { code: '410', message: 'Expired' });
    await vi.waitFor(() => expect(typeof release).toBe('function'));
    (await import('../MediaPlaybackCoordinator')).mediaPlaybackCoordinator.videoIntent();
    release(catalogTracks.map((track) => ({ ...track, url: 'https://media.example.test/new' })));
    await new Promise((resolve) => setTimeout(resolve, 5)); expect(native.play).toHaveBeenCalledTimes(1);
  });
  it('reports errors without signed URLs and keeps the old queue when authorization fails', async () => {
    const source = resolver(); service.configureSourceResolver(source); await service.loadQueue(catalogTracks); await service.play();
    const errors = vi.fn(); service.onError(errors);
    await native.__emit('playback-error', { code: 'NETWORK', message: 'Cannot load https://media.example.test/file?secret=private' });
    await vi.waitFor(() => expect(errors).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'Cannot load [media source]' })));
    const oldQueue = await native.getQueue(); source.mockRejectedValueOnce(new Error('Catalog unavailable'));
    await expect(service.loadQueue([...catalogTracks].reverse())).rejects.toThrow('Catalog unavailable');
    expect(await native.getQueue()).toEqual(oldQueue);
  });
  it('keeps Next, Previous, Seek and Stop → Play functional with catalog IDs', async () => {
    service.configureSourceResolver(resolver()); await service.loadQueue(catalogTracks); await service.play();
    await service.skipToNext(); expect(await native.getActiveTrackIndex()).toBe(1);
    await service.skipToPrevious(); expect(await native.getActiveTrackIndex()).toBe(0);
    await service.seekTo(22); await service.stop(); await service.play();
    expect((await native.getProgress()).position).toBe(22); expect(await native.getQueue()).toHaveLength(2);
  });

  describe('Repeat cycle and count behavior', () => {
    it('cycles through off -> 1 -> 2 -> infinite -> off on toggleRepeatCycle()', async () => {
      await service.initialize();
      expect(service.getRepeatMode()).toBe('off');
      expect(service.getRepeatCountRemaining()).toBe(0);

      // 1st tap: 1 extra repeat
      const mode1 = await service.toggleRepeatCycle();
      expect(mode1).toBe('1');
      expect(service.getRepeatMode()).toBe('1');
      expect(service.getRepeatCountRemaining()).toBe(1);
      expect(native.setRepeatMode).toHaveBeenCalledWith(1);

      // 2nd tap: 2 extra repeats
      const mode2 = await service.toggleRepeatCycle();
      expect(mode2).toBe('2');
      expect(service.getRepeatMode()).toBe('2');
      expect(service.getRepeatCountRemaining()).toBe(2);
      expect(native.setRepeatMode).toHaveBeenCalledWith(1);

      // 3rd tap: infinite
      const mode3 = await service.toggleRepeatCycle();
      expect(mode3).toBe('infinite');
      expect(service.getRepeatMode()).toBe('infinite');
      expect(service.getRepeatCountRemaining()).toBe(Infinity);
      expect(native.setRepeatMode).toHaveBeenCalledWith(1);

      // 4th tap: off
      const mode4 = await service.toggleRepeatCycle();
      expect(mode4).toBe('off');
      expect(service.getRepeatMode()).toBe('off');
      expect(service.getRepeatCountRemaining()).toBe(0);
      expect(native.setRepeatMode).toHaveBeenCalledWith(0);
    });

    it('decrements repeat count on loop and turns off after 1 extra repeat', async () => {
      await service.initialize();
      const listener = vi.fn();
      service.onRepeatChange(listener);
      expect(listener).toHaveBeenCalledWith('off', 0);

      await service.setRepeatCycleMode('1');
      expect(listener).toHaveBeenCalledWith('1', 1);

      // Simulate loop
      await service.handleTrackLooped();
      expect(service.getRepeatMode()).toBe('off');
      expect(service.getRepeatCountRemaining()).toBe(0);
      expect(listener).toHaveBeenCalledWith('off', 0);
      expect(native.setRepeatMode).toHaveBeenLastCalledWith(0);
    });

    it('decrements repeat count from 2 -> 1 -> off across loops', async () => {
      await service.initialize();
      const listener = vi.fn();
      service.onRepeatChange(listener);

      await service.setRepeatCycleMode('2');
      expect(listener).toHaveBeenCalledWith('2', 2);

      // 1st loop
      vi.spyOn(Date, 'now').mockReturnValue(10000);
      await service.handleTrackLooped();
      expect(service.getRepeatMode()).toBe('2');
      expect(service.getRepeatCountRemaining()).toBe(1);
      expect(listener).toHaveBeenCalledWith('2', 1);

      // 2nd loop
      vi.spyOn(Date, 'now').mockReturnValue(20000);
      await service.handleTrackLooped();
      expect(service.getRepeatMode()).toBe('off');
      expect(service.getRepeatCountRemaining()).toBe(0);
      expect(listener).toHaveBeenCalledWith('off', 0);
      expect(native.setRepeatMode).toHaveBeenLastCalledWith(0);
    });

    it('preserves infinite mode across multiple track loops without decrementing', async () => {
      await service.initialize();
      await service.setRepeatCycleMode('infinite');
      expect(service.getRepeatMode()).toBe('infinite');

      vi.spyOn(Date, 'now').mockReturnValue(10000);
      await service.handleTrackLooped();
      expect(service.getRepeatMode()).toBe('infinite');
      expect(service.getRepeatCountRemaining()).toBe(Infinity);

      vi.spyOn(Date, 'now').mockReturnValue(20000);
      await service.handleTrackLooped();
      expect(service.getRepeatMode()).toBe('infinite');
    });
  });
});
