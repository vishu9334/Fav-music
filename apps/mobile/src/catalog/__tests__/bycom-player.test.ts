import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaybackState, type CatalogSong } from '@aadat/contracts';
import type { NativeMock } from '../../services/playback/__tests__/track-player.mock';
import type { AudioPlaybackService } from '../../services/playback/AudioPlaybackService';
vi.mock('react-native-track-player', async () => (await import('../../services/playback/__tests__/track-player.mock')).trackPlayerModule);
// Offline native boundary test: real captured IDs/metadata, explicit test-only sources; no audible playback claim.
vi.mock('../catalog-runtime', () => ({ resolveCatalogTracks: vi.fn(async (tracks: readonly { id: string }[]) => tracks.map(track => ({ ...track, url: `https://media.example.invalid/test-only/${track.id}.mp4`, artwork: '' }))) }));
const songs = JSON.parse(await readFile(new URL('./fixtures/bycom-captured-metadata.json', import.meta.url), 'utf8')) as CatalogSong[];
const tracks = songs.slice(0, 2).map(song => ({ id: song.id, title: song.title, artist: song.artistName, duration: song.durationSeconds, url: '', artwork: '', catalogSource: 'catalog' as const, developmentOnly: true }));
let native: NativeMock, service: AudioPlaybackService, store: typeof import('../../store/usePlayerStore').usePlayerStore;
beforeEach(async () => {
  vi.resetModules(); native = (await import('react-native-track-player')).default as unknown as NativeMock; native.__reset();
  store = (await import('../../store/usePlayerStore')).usePlayerStore;
  service = (await import('../../services/playback/AudioPlaybackService')).AudioPlaybackService.getInstance();
});
afterEach(async () => { await service.destroy(); });
describe('Bycom captured catalog through existing audio queue (native mock)', () => {
  it('preserves UUID order and media URIs through Play/Pause, Next/Previous and Seek', async () => {
    await store.getState().playQueue(tracks, tracks[0]!.id, 'Actual catalog metadata');
    expect((await native.getQueue()).map(t => t.id)).toEqual(tracks.map(t => t.id));
    expect((await native.getQueue())[0]!.url).toBe(`https://media.example.invalid/test-only/${tracks[0]!.id}.mp4`);
    await store.getState().pause(); expect(store.getState().playbackState).toBe(PlaybackState.PAUSED);
    await store.getState().play(); await store.getState().skipToNext(); expect(store.getState().activeTrackIndex).toBe(1);
    await store.getState().seekTo(40); expect(store.getState().position).toBe(40);
    await store.getState().skipToPrevious(); expect(store.getState().position).toBe(0);
    await store.getState().skipToPrevious(); expect(store.getState().activeTrackIndex).toBe(0);
  });
  it('preserves the queue through remote Stop and restores real catalog IDs after native queue loss', async () => {
    await store.getState().playQueue(tracks, tracks[1]!.id, 'Actual catalog metadata');
    await (await import('../../services/playback/playback-service')).playbackService();
    await native.__emit('remote-stop'); expect(await native.getQueue()).toHaveLength(2);
    await native.__emit('remote-play'); expect(store.getState()).toMatchObject({ activeTrackIndex: 1, playbackState: PlaybackState.PLAYING });
    await native.reset(); await store.getState().play();
    expect((await native.getQueue()).map(t => t.id)).toEqual(tracks.map(t => t.id));
    expect(store.getState()).toMatchObject({ activeTrackIndex: 1, playbackState: PlaybackState.PLAYING });
  });
});
