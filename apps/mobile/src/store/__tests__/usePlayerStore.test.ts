import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaybackState } from '@aadat/contracts';
import { SAMPLE_TRACKS } from '../../data/sample-tracks';
import type { NativeMock } from '../../services/playback/__tests__/track-player.mock';
import type { AudioPlaybackService } from '../../services/playback/AudioPlaybackService';

vi.mock('react-native-track-player', async () =>
  (await import('../../services/playback/__tests__/track-player.mock')).trackPlayerModule);

let native: NativeMock;
let store: typeof import('../usePlayerStore').usePlayerStore;
let service: AudioPlaybackService;
beforeEach(async () => {
  vi.resetModules();
  native = (await import('react-native-track-player')).default as unknown as NativeMock;
  native.__reset();
  store = (await import('../usePlayerStore')).usePlayerStore;
  service = (await import('../../services/playback/AudioPlaybackService')).AudioPlaybackService.getInstance();
  service.configureInitialQueue(SAMPLE_TRACKS);
  store.setState({tracks:SAMPLE_TRACKS,duration:SAMPLE_TRACKS[0]?.duration??0});
});
afterEach(async () => { await service.destroy(); });

async function registerRemote(): Promise<void> {
  await (await import('../../services/playback/playback-service')).playbackService();
}

describe('Player store and native service integration', () => {
  it('plays a collection in its own order and preserves Next/Previous/Seek behavior', async () => {
    const tracks = [SAMPLE_TRACKS[2]!, SAMPLE_TRACKS[0]!];
    await store.getState().playQueue(tracks, 'sample-track-1', 'Quiet playlist');
    expect((await native.getQueue()).map((t) => t.id)).toEqual(['sample-track-3', 'sample-track-1']);
    expect(store.getState()).toMatchObject({ activeTrackIndex: 1, queueLabel: 'Quiet playlist', playbackState: PlaybackState.PLAYING });
    await store.getState().skipToNext(); expect(store.getState().activeTrackIndex).toBe(0);
    await store.getState().seekTo(40); expect(store.getState().position).toBe(40);
    await store.getState().skipToPrevious(); expect(store.getState()).toMatchObject({ activeTrackIndex: 0, position: 0 });
    await store.getState().skipToPrevious(); expect(store.getState().activeTrackIndex).toBe(1);
  });

  it('serializes rapid collection selections and finishes on the latest requested queue', async () => {
    await Promise.all([
      store.getState().playQueue([SAMPLE_TRACKS[1]!], 'sample-track-2', 'First'),
      store.getState().playQueue([SAMPLE_TRACKS[2]!, SAMPLE_TRACKS[0]!], 'sample-track-3', 'Latest'),
    ]);
    expect(store.getState()).toMatchObject({ activeTrackIndex: 0, queueLabel: 'Latest', playbackState: PlaybackState.PLAYING });
    expect((await native.getQueue()).map((t) => t.id)).toEqual(['sample-track-3', 'sample-track-1']);
    expect(native.setupPlayer).toHaveBeenCalledTimes(1);
  });

  it('does not rewind or duplicate the queue when selecting the same playing song again', async () => {
    await store.getState().playQueue(SAMPLE_TRACKS, 'sample-track-2', 'Demo');
    await store.getState().seekTo(22);
    const adds = native.add.mock.calls.length;
    await store.getState().playQueue(SAMPLE_TRACKS, 'sample-track-2', 'Demo');
    expect(store.getState()).toMatchObject({ activeTrackIndex: 1, position: 22, playbackState: PlaybackState.PLAYING });
    expect(native.add).toHaveBeenCalledTimes(adds);
  });

  it('retains a playlist queue through remote Stop, queue loss, screen remount and Play recovery', async () => {
    const tracks = [SAMPLE_TRACKS[2]!, SAMPLE_TRACKS[0]!];
    await store.getState().playQueue(tracks, 'sample-track-1', 'Saved playlist'); await registerRemote();
    await native.__emit('remote-stop'); await native.reset();
    await store.getState().initializePlayer(); await store.getState().play();
    expect(store.getState()).toMatchObject({ tracks, activeTrackIndex: 1, queueLabel: 'Saved playlist', playbackState: PlaybackState.PLAYING });
    expect((await native.getQueue()).map((t) => t.id)).toEqual(['sample-track-3', 'sample-track-1']);
  });

  it('rejects empty, missing-selection and duplicate-ID queues without changing native playback', async () => {
    await store.getState().initializePlayer();
    await store.getState().playQueue([], 'sample-track-1', 'Empty');
    await store.getState().playQueue(SAMPLE_TRACKS, 'missing', 'Missing');
    await store.getState().playQueue([SAMPLE_TRACKS[0]!, SAMPLE_TRACKS[0]!], 'sample-track-1', 'Duplicate');
    expect(store.getState().errorMessage).toContain('available track');
    expect(await native.getQueue()).toEqual(SAMPLE_TRACKS);
    expect(native.play).not.toHaveBeenCalled();
  });

  it('initializes with the three sample tracks', () => {
    expect(store.getState().tracks).toEqual(SAMPLE_TRACKS);
    expect(store.getState().activeTrackIndex).toBe(0);
  });

  it('shares in-flight initialization and subscribes once across repeated mounts', async () => {
    const first = store.getState().initializePlayer();
    expect(store.getState().initializePlayer()).toBe(first);
    await first;
    await store.getState().initializePlayer();
    expect(native.setupPlayer).toHaveBeenCalledTimes(1);
    expect(native.add).toHaveBeenCalledTimes(1);
    expect(native.reset).not.toHaveBeenCalled();
    const listener = vi.fn(); const unsubscribe = store.subscribe(listener);
    native.__setState('playing');
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    // One coherent native snapshot may publish both progress and state.
    expect(native.__listenerCount('playback-state')).toBe(1);
    unsubscribe();
  });

  it('does not rewind a selected, playing track when the screen initializes again', async () => {
    await store.getState().initializePlayer();
    await store.getState().skipToIndex(2);
    await store.getState().seekTo(44);
    await store.getState().play();
    await store.getState().initializePlayer();
    expect(store.getState()).toMatchObject({
      activeTrackIndex: 2, position: 44, playbackState: PlaybackState.PLAYING,
    });
    expect(native.add).toHaveBeenCalledTimes(1);
    expect(native.reset).not.toHaveBeenCalled();
  });

  it('reports remote Stop → Play in the UI without clearing the native queue', async () => {
    await store.getState().initializePlayer(); await registerRemote();
    await store.getState().skipToIndex(2);
    await store.getState().seekTo(19);
    await native.__emit('remote-play');
    expect(store.getState().playbackState).toBe(PlaybackState.PLAYING);
    await native.__emit('remote-stop');
    expect(store.getState()).toMatchObject({
      playbackState: PlaybackState.STOPPED, activeTrackIndex: 2, position: 19,
    });
    expect(await native.getQueue()).toHaveLength(3);
    await native.__emit('remote-play');
    expect(store.getState()).toMatchObject({
      playbackState: PlaybackState.PLAYING, activeTrackIndex: 2, position: 19,
    });
    expect(native.reset).not.toHaveBeenCalled();
  });

  it('clears stale UI progress on queue loss and restores the selected track on Play', async () => {
    await store.getState().initializePlayer();
    await store.getState().skipToIndex(2);
    await store.getState().seekTo(65);
    await store.getState().play();
    await native.reset();
    await vi.waitFor(() => expect(store.getState().playbackState).toBe(PlaybackState.IDLE));
    expect(store.getState()).toMatchObject({
      playbackState: PlaybackState.IDLE, activeTrackIndex: 2, position: 0, buffered: 0,
    });
    await store.getState().play();
    expect(store.getState()).toMatchObject({
      playbackState: PlaybackState.PLAYING, activeTrackIndex: 2, position: 0,
    });
    expect(await native.getQueue()).toHaveLength(3);
    expect(await native.getActiveTrackIndex()).toBe(2);
  });

  it('updates selection and progress for Next, Previous, Seek and native progress events', async () => {
    await store.getState().initializePlayer();
    await store.getState().skipToNext();
    expect(store.getState().activeTrackIndex).toBe(1);
    await store.getState().seekTo(70);
    expect(store.getState().position).toBe(70);
    await store.getState().skipToPrevious();
    expect(store.getState()).toMatchObject({ activeTrackIndex: 1, position: 0 });
    await store.getState().skipToPrevious();
    expect(store.getState().activeTrackIndex).toBe(0);
    await native.__emit('playback-progress-updated', {
      track: 0, position: 12, duration: 372, buffered: 20,
    });
    await vi.waitFor(() => expect(store.getState()).toMatchObject({ position: 12, duration: 372, buffered: 20 }));
  });

  it('ignores progress from a track that is no longer active', async () => {
    await store.getState().initializePlayer();
    await store.getState().skipToIndex(1);
    await native.__emit('playback-progress-updated', {
      track: 0, position: 200, duration: 372, buffered: 210,
    });
    expect(store.getState().position).toBe(0);
    expect(store.getState().duration).toBe(SAMPLE_TRACKS[1]?.duration);
  });

  it('does not display an unconfirmed seek or overwrite progress on failure', async () => {
    await store.getState().initializePlayer();
    await store.getState().seekTo(45);
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const originalSeek = native.seekTo.getMockImplementation()!;
    native.seekTo.mockImplementationOnce(async (position) => {
      await barrier; await originalSeek(position);
    });
    const seeking = store.getState().seekTo(90);
    expect(store.getState().position).toBe(45);
    release(); await seeking;
    expect(store.getState().position).toBe(90);
    native.seekTo.mockRejectedValueOnce(new Error('Native seek failed'));
    await store.getState().seekTo(120);
    expect(store.getState()).toMatchObject({
      position: 90, playbackState: PlaybackState.ERROR, errorMessage: 'Native seek failed',
    });
  });

  it('allows initialization to retry and clears the displayed error on success', async () => {
    native.setupPlayer.mockRejectedValueOnce(new Error('Setup failed'));
    await store.getState().initializePlayer();
    expect(store.getState()).toMatchObject({
      playbackState: PlaybackState.ERROR, errorMessage: 'Setup failed',
    });
    await store.getState().initializePlayer();
    expect(native.setupPlayer).toHaveBeenCalledTimes(2);
    expect(store.getState().errorMessage).toBeNull();
    expect(await native.getQueue()).toHaveLength(3);
  });

  it('shows native playback errors and uses native state for toggle', async () => {
    await store.getState().initializePlayer();
    await native.__emit('playback-error', { code: 'network', message: 'Stream unavailable' });
    expect(store.getState()).toMatchObject({
      playbackState: PlaybackState.ERROR, errorMessage: 'Stream unavailable',
    });
    await store.getState().togglePlayPause();
    expect(store.getState()).toMatchObject({ playbackState: PlaybackState.PLAYING, errorMessage: null });
    await store.getState().togglePlayPause();
    expect(store.getState().playbackState).toBe(PlaybackState.PAUSED);
  });

  it('preserves reduced-motion and explicit progress store actions', () => {
    store.getState().setReducedMotion(true);
    store.getState().setProgress(120, 360, 200);
    expect(store.getState()).toMatchObject({
      isReducedMotion: true, position: 120, duration: 360, buffered: 200,
    });
  });
  it('publishes only the newest queue, with no old autoplay after a newer Pause', async () => {
    let release!:(tracks:readonly (typeof SAMPLE_TRACKS)[number][])=>void;
    const first=[SAMPLE_TRACKS[1]!],last=[SAMPLE_TRACKS[2]!];
    const resolver=vi.fn(async(tracks:readonly (typeof SAMPLE_TRACKS)[number][])=>tracks);
    resolver.mockImplementationOnce(()=>new Promise(r=>{release=r;}));service.configureSourceResolver(resolver);
    const old=store.getState().playQueue(first,first[0]!.id,'Old queue');await vi.waitFor(()=>expect(resolver).toHaveBeenCalled());
    const latest=store.getState().playQueue(last,last[0]!.id,'Latest queue');await store.getState().pause();
    await latest;release(first);await old;
    expect(store.getState()).toMatchObject({activeTrackIndex:0,queueLabel:'Latest queue',playbackState:PlaybackState.PAUSED});
    expect(store.getState().tracks.map(t=>t.id)).toEqual([last[0]!.id]);expect(native.play).not.toHaveBeenCalled();
  });

  it('updates store repeatMode and repeatCount across toggleRepeat cycle and resets for account', async () => {
    await store.getState().initializePlayer();
    expect(store.getState().repeatMode).toBe('off');
    expect(store.getState().repeatCount).toBe(0);

    // 1st tap: 1 extra repeat
    await store.getState().toggleRepeat();
    expect(store.getState().repeatMode).toBe('1');
    expect(store.getState().repeatCount).toBe(1);

    // 2nd tap: 2 extra repeats
    await store.getState().toggleRepeat();
    expect(store.getState().repeatMode).toBe('2');
    expect(store.getState().repeatCount).toBe(2);

    // 3rd tap: infinite
    await store.getState().toggleRepeat();
    expect(store.getState().repeatMode).toBe('infinite');
    expect(store.getState().repeatCount).toBe('infinite');

    // 4th tap: off
    await store.getState().toggleRepeat();
    expect(store.getState().repeatMode).toBe('off');
    expect(store.getState().repeatCount).toBe(0);

    // Reset for account
    await store.getState().setRepeatMode('2');
    expect(store.getState().repeatMode).toBe('2');
    await store.getState().resetForAccount();
    expect(store.getState().repeatMode).toBe('off');
    expect(store.getState().repeatCount).toBe(0);
  });

});
