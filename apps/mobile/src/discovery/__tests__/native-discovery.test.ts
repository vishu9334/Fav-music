import { seedDemoFixture } from '../../catalog/__tests__/demo-fixture';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_TRACKS } from '../../data/sample-tracks';
import { PlaybackState } from '@aadat/contracts';
import type { NativeMock } from '../../services/playback/__tests__/track-player.mock';
import type { AudioPlaybackService } from '../../services/playback/AudioPlaybackService';
import { RecommendationService } from '../recommendation.service';
import { demoCatalog } from '../../catalog/demo-catalog';
import { createDiscoveryStore } from '../../store/createDiscoveryStore';
import { HistoryService } from '../history.service';
import { PlaybackHistoryObserver } from '../playback-history.observer';
import type { PlayedTrack } from '../discovery.types';

vi.mock('react-native-track-player', async () => (await import('../../services/playback/__tests__/track-player.mock')).trackPlayerModule);
let native: NativeMock, store: typeof import('../../store/usePlayerStore').usePlayerStore, service: AudioPlaybackService;
let observer: PlaybackHistoryObserver | null;
beforeEach(async () => {
  vi.resetModules(); native = (await import('react-native-track-player')).default as unknown as NativeMock; native.__reset();
  store = (await import('../../store/usePlayerStore')).usePlayerStore;
  service = (await import('../../services/playback/AudioPlaybackService')).AudioPlaybackService.getInstance(); observer = null;
});
afterEach(async () => { observer?.stop(); await service.destroy(); });

describe('Discovery through the real player store and mocked native contract', () => {
  it('integrates the recommendation queue with native Next/Previous/Seek and records only confirmed plays', async () => {
    let entries: readonly PlayedTrack[] = [];
    const history = new HistoryService({ load: async () => null, save: async () => {} }, (value) => { entries = value; });
    observer = new PlaybackHistoryObserver((await import('../native-history-source')).nativeHistorySource, (id) => history.record(id)); observer.start();
    const discovery = createDiscoveryStore({ load: async () => null, save: async () => {} }, new RecommendationService(demoCatalog, () => 0), {
      currentId: () => undefined, play: async (tracks, id, label) => {
        await store.getState().playQueue(tracks, id, label); return store.getState().playbackState === PlaybackState.PLAYING;
      },
    }, () => [], () => new Date(2026, 10, 6, 18));
    expect(await discovery.getState().playRandom()).toBe('sample-track-3');
    expect((await native.getQueue()).map((t) => t.id)).toEqual(['sample-track-3', 'sample-track-1', 'sample-track-2']);
    await vi.waitFor(() => expect(entries[0]?.trackId).toBe('sample-track-3'));
    await store.getState().seekTo(50); expect(store.getState().position).toBe(50);
    await store.getState().skipToPrevious(); expect(store.getState().position).toBe(0);
    await store.getState().skipToNext(); await vi.waitFor(() => expect(entries[0]?.trackId).toBe('sample-track-1'));
    await store.getState().pause(); await store.getState().play();
    await vi.waitFor(() => expect(entries).toHaveLength(2));
    const reads = native.getQueue.mock.calls.length;
    await native.__emit('playback-progress-updated', { track: 1, position: 10, duration: 372, buffered: 20 });
    expect(native.getQueue).toHaveBeenCalledTimes(reads); expect(entries).toHaveLength(2);
  });
  it('uses native identity rather than an optimistic UI selection, and excludes a failed play', async () => {
    const record = vi.fn(async (_id: string) => {});
    observer = new PlaybackHistoryObserver((await import('../native-history-source')).nativeHistorySource, record); observer.start();
    await store.getState().playQueue(SAMPLE_TRACKS, 'sample-track-1', 'Demo');
    await vi.waitFor(() => expect(record).toHaveBeenCalledWith('sample-track-1'));
    store.setState({ activeTrackIndex: 2 }); observer.refresh();
    await vi.waitFor(() => expect(native.getQueue.mock.calls.length).toBeGreaterThan(2));
    expect(record).not.toHaveBeenCalledWith('sample-track-3');
    native.play.mockRejectedValueOnce(new Error('Network failure'));
    await store.getState().playQueue([SAMPLE_TRACKS[1]!], 'sample-track-2', 'Failed selection');
    expect(store.getState().playbackState).toBe(PlaybackState.ERROR);
    observer.refresh(); await Promise.resolve(); await Promise.resolve();
    expect(record).not.toHaveBeenCalledWith('sample-track-2');
  });
});

seedDemoFixture();
