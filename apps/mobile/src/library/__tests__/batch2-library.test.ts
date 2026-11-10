import { seedDemoFixture } from '../../catalog/__tests__/demo-fixture';
import { describe, expect, it, vi } from 'vitest';
import { WarehouseStatus } from '@aadat/contracts';
import { demoCatalog } from '../../catalog/demo-catalog';
import { emptyLibrary, ILibraryRepository } from '../library.contract';
import { LibraryService } from '../library.service';
import { FileLibraryRepository } from '../file-library.repository';
import { PlaylistNamingService } from '../playlist-naming.service';
import { warehouseIds, warehouseSources, warehouseStatus } from '../warehouse';
import { createLibraryStore } from '../../store/useLibraryStore';

function fixture(repository?: ILibraryRepository) {
  let data = emptyLibrary(), count = 0;
  const files = new Map<string, string>();
  const storage = { read: async (name: string) => files.get(name) ?? null,
    write: async (name: string, value: string) => { files.set(name, value); } };
  const repo = repository ?? new FileLibraryRepository(storage);
  const service = new LibraryService(repo, demoCatalog, (next) => { data = next; }, () => `test-${++count}`);
  return { service, snapshot: () => data, storage, repo };
}
const reel = 'https://www.instagram.com/reel/Ab_12-/';

describe('Hybrid local Warehouse and discovery persistence', () => {
  it('reads Batch 1 documents without new fields or data loss', async () => {
    const legacy = { version: 1, likes: ['sample-track-1'], favourites: [], bookmarks: [], warehouse: ['sample-track-2'],
      playlists: [{ id: 'legacy', name: 'Keep me', trackIds: ['sample-track-3'] }] };
    const f = fixture({ load: async () => legacy, save: vi.fn() }); await f.service.initialize();
    expect(f.snapshot()).toEqual({ ...legacy, version: 2, warehouseStates: [], instamus: [] });
    expect(warehouseIds(f.snapshot())).toEqual(['sample-track-2', 'sample-track-1']);
  });
  it('merges independent collections without duplicates and records provenance', async () => {
    const f = fixture(); await f.service.toggle('likes', 'sample-track-1'); await f.service.toggle('favourites', 'sample-track-1');
    await f.service.toggle('bookmarks', 'sample-track-2');
    expect(warehouseIds(f.snapshot())).toEqual(['sample-track-1', 'sample-track-2']);
    expect(warehouseSources(f.snapshot(), 'sample-track-1')).toEqual(['Liked', 'Favourite']);
  });
  it('archives and restores an automatically collected song without changing other collections or playlists', async () => {
    const f = fixture(); await f.service.toggle('likes', 'sample-track-1');
    const id = await f.service.createPlaylist('Stay', ['sample-track-1']);
    await f.service.toggle('warehouse', 'sample-track-1');
    expect(warehouseIds(f.snapshot())).toEqual([]);
    expect(warehouseIds(f.snapshot(), WarehouseStatus.ARCHIVED)).toEqual(['sample-track-1']);
    expect(f.snapshot().likes).toEqual(['sample-track-1']); expect(f.snapshot().playlists[0]).toEqual({ id, name: 'Stay', trackIds: ['sample-track-1'] });
    const restored = createLibraryStore(new FileLibraryRepository(f.storage)); await restored.getState().initialize();
    expect(warehouseStatus(restored.getState().data, 'sample-track-1')).toBe(WarehouseStatus.ARCHIVED);
    await restored.getState().setWarehouseStatus('sample-track-1', WarehouseStatus.ACTIVE);
    expect(warehouseIds(restored.getState().data)).toEqual(['sample-track-1']);
  });
  it('keeps removed and hidden tracks restorable even if their original collection flags are removed', async () => {
    const f = fixture(); await f.service.toggle('bookmarks', 'sample-track-2');
    await f.service.setWarehouseStatus('sample-track-2', WarehouseStatus.HIDDEN);
    await f.service.toggle('bookmarks', 'sample-track-2');
    expect(warehouseIds(f.snapshot(), WarehouseStatus.HIDDEN)).toEqual(['sample-track-2']);
    await f.service.toggle('warehouse', 'sample-track-2'); expect(warehouseIds(f.snapshot())).toEqual(['sample-track-2']);
    expect(f.snapshot().bookmarks).toEqual([]);
  });
  it('keeps the previous state on failed archive and rejects unknown tracks or statuses', async () => {
    const repo = { load: async () => ({ ...emptyLibrary(), likes: ['sample-track-1'] }), save: vi.fn().mockRejectedValue(new Error('Disk full')) };
    const f = fixture(repo); await f.service.initialize();
    await expect(f.service.setWarehouseStatus('sample-track-1', WarehouseStatus.ARCHIVED)).rejects.toThrow('Disk full');
    expect(warehouseIds(f.snapshot())).toEqual(['sample-track-1']);
    await expect(f.service.setWarehouseStatus('unknown', WarehouseStatus.HIDDEN)).rejects.toThrow('unavailable');
    await expect(f.service.setWarehouseStatus('sample-track-1', 'BAD' as WarehouseStatus)).rejects.toThrow('unavailable');
  });
  it('stores a reel note without making a match and bookmarks only a user-selected catalog track', async () => {
    const f = fixture(); await f.service.saveInstaMus(reel + '?utm_source=test', '  SoundHelix  ', null);
    expect(f.snapshot().instamus).toEqual([{ reelUrl: reel, query: 'SoundHelix', trackId: null }]);
    expect(f.snapshot().bookmarks).toEqual([]);
    await f.service.saveInstaMus(reel, 'Found it manually', 'sample-track-2');
    expect(f.snapshot().instamus).toHaveLength(1); expect(f.snapshot().instamus[0]?.trackId).toBe('sample-track-2');
    expect(f.snapshot().bookmarks).toEqual(['sample-track-2']);
    const reloaded = createLibraryStore(new FileLibraryRepository(f.storage)); await reloaded.getState().initialize();
    expect(reloaded.getState().data.instamus).toEqual(f.snapshot().instamus);
    await f.service.removeInstaMus(reel); expect(f.snapshot().instamus).toEqual([]); expect(f.snapshot().bookmarks).toEqual(['sample-track-2']);
  });
  it('rejects invalid discovery input before persisting anything', async () => {
    const repo = { load: async () => null, save: vi.fn() }, f = fixture(repo);
    await expect(f.service.saveInstaMus('https://evil.example/reel/a/', '', null)).rejects.toThrow('HTTPS');
    await expect(f.service.saveInstaMus(reel, '', 'unknown')).rejects.toThrow('unavailable');
    await expect(f.service.saveInstaMus(reel, 'x'.repeat(161), null)).rejects.toThrow('160');
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('sanitizes malformed state and untrusted saved notes during hydration', async () => {
    const f = fixture({ load: async () => ({ ...emptyLibrary(), warehouseStates: [null, { trackId: 'unknown', status: 'ACTIVE' },
      { trackId: 'sample-track-1', status: 'HIDDEN' }, { trackId: 'sample-track-1', status: 'ACTIVE' }],
      instamus: [{ reelUrl: 'https://evil.example/', query: '' }, { reelUrl: reel, query: 'Kept', trackId: 'unknown' }, { reelUrl: reel, query: 'Duplicate' }] }), save: vi.fn() });
    await f.service.initialize();
    expect(f.snapshot().warehouseStates).toEqual([{ trackId: 'sample-track-1', status: WarehouseStatus.HIDDEN }]);
    expect(warehouseIds(f.snapshot(), WarehouseStatus.HIDDEN)).toEqual(['sample-track-1']);
    expect(f.snapshot().instamus).toEqual([{ reelUrl: reel, query: 'Kept', trackId: null }]);
  });
  it('creates a shared playlist atomically and renames without changing its ID or track order', async () => {
    const f = fixture(), id = await f.service.createPlaylist('  Shared mix  ', ['sample-track-3', 'sample-track-1', 'sample-track-3']);
    expect(f.snapshot().playlists[0]).toEqual({ id, name: 'Shared mix', trackIds: ['sample-track-3', 'sample-track-1'] });
    await f.service.renamePlaylist(id, '  Renamed   mix  ');
    expect(f.snapshot().playlists[0]).toEqual({ id, name: 'Renamed mix', trackIds: ['sample-track-3', 'sample-track-1'] });
    await expect(f.service.renamePlaylist(id, '  ')).rejects.toThrow('1 and 60');
    await expect(f.service.renamePlaylist('missing', 'Valid')).rejects.toThrow('no longer exists');
    await expect(f.service.createPlaylist('Invalid', ['unknown'])).rejects.toThrow('unavailable');
  });
  it('captures imported track IDs before waiting for hydration and writes the new document version', async () => {
    let release!: (value: unknown) => void;
    const repo = { load: () => new Promise<unknown>((resolve) => { release = resolve; }), save: vi.fn(async () => {}) };
    const f = fixture(repo); const loading = f.service.initialize();
    const ids = ['sample-track-1'], created = f.service.createPlaylist('Captured', ids); ids.push('unknown');
    release({ version: 1, likes: [], favourites: [], bookmarks: [], warehouse: [], playlists: [] });
    await loading; await created;
    expect(f.snapshot().playlists[0]?.trackIds).toEqual(['sample-track-1']); expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ version: 2 }));
  });
  it('reports failed rename and note saves without publishing false success', async () => {
    const store = createLibraryStore({ load: async () => ({ ...emptyLibrary(), playlists: [{ id: 'one', name: 'Original', trackIds: [] }] }), save: async () => { throw new Error('Save failed'); } });
    await store.getState().initialize();
    expect(await store.getState().renamePlaylist('one', 'Changed')).toBe(false);
    expect(store.getState().data.playlists[0]?.name).toBe('Original');
    expect(await store.getState().saveInstaMus(reel, '', null)).toBe(false);
    expect(store.getState().data.instamus).toEqual([]);
  });
});

describe('Editable, deterministic playlist naming', () => {
  const naming = new PlaylistNamingService(demoCatalog);
  it('uses actual shared artist/album metadata and provides generic names for empty playlists', () => {
    expect(naming.suggestions(['sample-track-1'], [])).toContain('Aadat Studio Ensemble Essentials');
    expect(naming.suggestions(['sample-track-1', 'sample-track-2'], [])[0]).toBe('Atmospheric Waves Vol. 1 Mix');
    expect(naming.suggestions([], [])).toEqual(['My next mix', 'Quiet moments', 'On repeat']);
  });
  it('avoids case-insensitive collisions and stays within the length limit when suffixing', () => {
    expect(naming.suggestions([], ['MY NEXT MIX', 'My next mix 2'])[0]).toBe('My next mix 3');
    const long = 'x'.repeat(60); expect(naming.availableName(long, [long])).toBe('x'.repeat(58) + ' 2');
    expect(naming.suggestions([], [])).toEqual(naming.suggestions([], []));
  });
});

seedDemoFixture();
