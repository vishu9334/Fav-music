import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaybackState } from '@aadat/contracts';
import type { CatalogSong } from '@aadat/contracts';
import type { NativeMock } from '../../services/playback/__tests__/track-player.mock';
import type { AudioPlaybackService } from '../../services/playback/AudioPlaybackService';
vi.mock('react-native-track-player', async () => (await import('../../services/playback/__tests__/track-player.mock')).trackPlayerModule);
vi.mock('../catalog-runtime', () => ({ resolveCatalogTracks: vi.fn(async () => { throw new Error('Observed provider source failure: HTTP 404'); }) }));
const song = (JSON.parse(await readFile(new URL('./fixtures/jiosaavn-captured-metadata.json', import.meta.url), 'utf8')) as CatalogSong[])[0]!;
let native: NativeMock, service: AudioPlaybackService, store: typeof import('../../store/usePlayerStore').usePlayerStore;
beforeEach(async () => {
  vi.resetModules(); native = (await import('react-native-track-player')).default as unknown as NativeMock; native.__reset();
  store = (await import('../../store/usePlayerStore')).usePlayerStore;
  service = (await import('../../services/playback/AudioPlaybackService')).AudioPlaybackService.getInstance();
});
afterEach(async () => { await service.destroy(); });
describe('real metadata is not a successful playback claim', () => {
  it('shows a source failure and never starts native playback when the provider cannot resolve audio', async () => {
    await store.getState().playQueue([{ id: song.id, title: song.title, artist: song.artistName, duration: song.durationSeconds,
      artwork: '', url: '', catalogSource: 'catalog', developmentOnly: true }], song.id, 'Real provider search');
    expect(store.getState().playbackState).toBe(PlaybackState.ERROR);
    expect(store.getState().errorMessage).toContain('media could not be loaded');
    expect(native.play).not.toHaveBeenCalled();
    expect(await native.getQueue()).toEqual([]);
  });
});
