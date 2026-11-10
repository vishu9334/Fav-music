import { beforeEach, describe, expect, it, vi } from 'vitest';
import { importReelShare } from '../reel-import.service';
import { DemoCatalog } from '../../catalog/demo-catalog';
import { LibraryService } from '../../library/library.service';
import type { LocalLibrary } from '../../library/library.contract';
import type { IPlayableTrack } from '../../data/sample-tracks';

const track: IPlayableTrack = { id: 'caption-song', title: 'Aadat', artist: 'Ninja', duration: 180, url: '', artwork: '', catalogSource: 'catalog' };
const reelUrl = 'https://www.instagram.com/reel/ImportFixture/';
function fixture() {
  const registry = new DemoCatalog([{ track, seasons: [] }]);
  let disk: LocalLibrary | null = null;
  const write = vi.fn(async (data: LocalLibrary) => { disk = data; });
  const library = new LibraryService({ load: async () => disk, save: write }, registry, () => {});
  const state = { scopeVersion: 1, status: 'ready', get data() { return library.getSnapshot(); },
    saveInstaMus: vi.fn(async (reel: string, query: string, id: string | null) => { await library.saveInstaMus(reel, query, id); return true; }) };
  return { state, library, write, saved: () => disk, current: () => state };
}

describe('FavInsta automatic import', () => {
  beforeEach(() => vi.clearAllMocks());
  it('durably saves a URL-only reel without guessing a song or calling search', async () => {
    const f = fixture(), search = vi.fn();
    expect(await importReelShare({ reelUrl }, f.current, search)).toBe('saved');
    expect(f.saved()?.instamus).toEqual([{ reelUrl, query: '', trackId: null }]);
    expect(search).not.toHaveBeenCalled();
  });
  it('searches shared metadata and bookmarks a unique exact title and artist match', async () => {
    const f = fixture(), search = vi.fn(async () => [track, { ...track, id: 'duplicate-provider-id' }]);
    expect(await importReelShare({ reelUrl, metadata: 'Aadat — Ninja' }, f.current, search)).toBe('matched');
    expect(search).toHaveBeenCalledExactlyOnceWith('Aadat — Ninja');
    expect(f.saved()?.instamus[0]?.trackId).toBe(track.id); expect(f.saved()?.bookmarks).toEqual([track.id]);
    await importReelShare({ reelUrl }, f.current, search);
    expect(search).toHaveBeenCalledTimes(1); expect(f.write).toHaveBeenCalledTimes(2);
  });
  it.each(['Aadat', 'Trending music', 'Aadat Ninja remix'])('leaves uncertain captions available for manual matching: %s', async metadata => {
    const f = fixture(), candidates = metadata.endsWith('remix') ? [track, { ...track, id: 'other', title: 'Remix' }] : [track];
    expect(await importReelShare({ reelUrl, metadata }, f.current, async () => candidates)).toBe('saved');
    expect(f.saved()?.instamus[0]?.trackId).toBeNull(); expect(f.saved()?.bookmarks).toEqual([]);
  });
  it('retains the reel on search failure and does not duplicate it on retry', async () => {
    const f = fixture();
    const search = vi.fn(async () => { throw new Error('Offline'); });
    expect(await importReelShare({ reelUrl, metadata: 'Aadat Ninja' }, f.current, search)).toBe('saved');
    expect(await importReelShare({ reelUrl, metadata: 'Aadat Ninja' }, f.current, search)).toBe('saved');
    expect(f.saved()?.instamus).toHaveLength(1); expect(f.write).toHaveBeenCalledTimes(1);
  });
  it('can match a previously saved URL-only reel when a later share supplies song metadata', async () => {
    const f = fixture();
    await importReelShare({ reelUrl }, f.current, vi.fn());
    expect(await importReelShare({ reelUrl, metadata: 'Aadat Ninja' }, f.current, async () => [track])).toBe('matched');
    expect(f.saved()?.instamus).toEqual([{ reelUrl, query: 'Aadat Ninja', trackId: track.id }]);
  });
  it('does not save after logout/account change while matching is in flight', async () => {
    const f = fixture(); let finish!: (tracks: readonly IPlayableTrack[]) => void;
    const search = vi.fn(() => new Promise<readonly IPlayableTrack[]>(resolve => { finish = resolve; }));
    const importing = importReelShare({ reelUrl, metadata: 'Aadat Ninja' }, f.current, search);
    await vi.waitFor(() => expect(search).toHaveBeenCalledOnce());
    f.state.scopeVersion++; finish([track]);
    expect(await importing).toBe('stale'); expect(f.saved()?.bookmarks).toEqual([]); expect(f.write).toHaveBeenCalledTimes(1);
  });
  it('does not resurrect a reel removed during search', async () => {
    const f = fixture();
    expect(await importReelShare({ reelUrl, metadata: 'Aadat Ninja' }, f.current, async () => {
      await f.library.removeInstaMus(reelUrl); return [track];
    })).toBe('saved');
    expect(f.saved()?.instamus).toEqual([]); expect(f.saved()?.bookmarks).toEqual([]);
  });
  it('stops before searching if storage fails or the account is locked', async () => {
    const f = fixture(), search = vi.fn(); f.state.saveInstaMus.mockResolvedValueOnce(false);
    expect(await importReelShare({ reelUrl, metadata: 'Aadat Ninja' }, f.current, search)).toBe('failed');
    f.state.status = 'locked';
    expect(await importReelShare({ reelUrl }, f.current, search)).toBe('stale');
    expect(search).not.toHaveBeenCalled();
  });
});
