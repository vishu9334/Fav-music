import { seedDemoFixture } from '../../catalog/__tests__/demo-fixture';
import { describe, expect, it, vi } from 'vitest';
import { demoCatalog } from '../../catalog/demo-catalog';
import { COLLECTIONS, emptyLibrary, IDocumentStorage, ILibraryRepository, LocalLibrary } from '../library.contract';
import { FileLibraryRepository } from '../file-library.repository';
import { LibraryService } from '../library.service';
import { createLibraryStore } from '../../store/useLibraryStore';
import { warehouseIds } from '../warehouse';

class MemoryDocuments implements IDocumentStorage {
  public readonly files = new Map<string, string>();
  public async read(name: string): Promise<string | null> { return this.files.get(name) ?? null; }
  public async write(name: string, value: string): Promise<void> { this.files.set(name, value); }
}
function fixture(repository?: ILibraryRepository) {
  const storage = new MemoryDocuments();
  const repo = repository ?? new FileLibraryRepository(storage);
  let data = emptyLibrary(), counter = 0;
  const service = new LibraryService(repo, demoCatalog, (next) => { data = next; }, () => `playlist-${++counter}`);
  return { service, storage, repo, snapshot: () => data };
}

describe('Local library service and persistence', () => {
  it.each(COLLECTIONS)('persists and restores %s independently', async (kind) => {
    const f = fixture(); await f.service.toggle(kind, 'sample-track-1');
    expect(f.snapshot()[kind]).toEqual(['sample-track-1']);
    for (const other of COLLECTIONS.filter((value) => value !== kind)) expect(f.snapshot()[other]).toEqual([]);
    let reloaded: LocalLibrary = emptyLibrary();
    await new LibraryService(new FileLibraryRepository(f.storage), demoCatalog, (next) => { reloaded = next; }).initialize();
    expect(reloaded[kind]).toEqual(['sample-track-1']);
    await f.service.toggle(kind, 'sample-track-1');
    expect(kind === 'warehouse' ? warehouseIds(f.snapshot()) : f.snapshot()[kind]).toEqual([]);
  });
  it('creates, edits and deletes a persisted playlist without duplicate song IDs', async () => {
    const f = fixture(); const id = await f.service.createPlaylist('  Quiet   mornings  ');
    await f.service.setPlaylistTrack(id, 'sample-track-3', true);
    await f.service.setPlaylistTrack(id, 'sample-track-1', true);
    await f.service.setPlaylistTrack(id, 'sample-track-3', true);
    expect(f.snapshot().playlists[0]).toEqual({ id, name: 'Quiet mornings', trackIds: ['sample-track-3', 'sample-track-1'] });
    await f.service.setPlaylistTrack(id, 'sample-track-3', false);
    const reloaded = createLibraryStore(new FileLibraryRepository(f.storage)); await reloaded.getState().initialize();
    expect(reloaded.getState().data.playlists[0]?.trackIds).toEqual(['sample-track-1']);
    await f.service.deletePlaylist(id); expect(f.snapshot().playlists).toEqual([]);
  });
  it('shares hydration and serializes user actions issued before it completes', async () => {
    let release!: (value: unknown) => void;
    const repository = { load: vi.fn(() => new Promise<unknown>((resolve) => { release = resolve; })), save: vi.fn(async () => {}) };
    const f = fixture(repository); const first = f.service.initialize();
    expect(f.service.initialize()).toBe(first);
    const operations = [f.service.toggle('likes', 'sample-track-1'), f.service.toggle('likes', 'sample-track-1'), f.service.toggle('bookmarks', 'sample-track-2')];
    release({ ...emptyLibrary(), favourites: ['sample-track-3'] });
    await first; await Promise.all(operations);
    expect(repository.load).toHaveBeenCalledTimes(1);
    expect(f.snapshot()).toMatchObject({ likes: [], bookmarks: ['sample-track-2'], favourites: ['sample-track-3'] });
  });
  it('does not publish a failed save and allows a later mutation to retry', async () => {
    const repo = { load: vi.fn(async () => null), save: vi.fn().mockRejectedValueOnce(new Error('Disk full')).mockResolvedValue(undefined) };
    const f = fixture(repo);
    await expect(f.service.toggle('likes', 'sample-track-1')).rejects.toThrow('Disk full');
    expect(f.snapshot().likes).toEqual([]);
    await f.service.toggle('likes', 'sample-track-1'); expect(f.snapshot().likes).toEqual(['sample-track-1']);
  });
  it('prevents edits from overwriting unreadable or unsupported saved data', async () => {
    const repo = { load: vi.fn(async () => ({ version: 3 })), save: vi.fn() };
    const f = fixture(repo);
    await expect(f.service.toggle('likes', 'sample-track-1')).rejects.toThrow('unsupported');
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('sanitizes stale catalog IDs, malformed playlists and duplicates during hydration', async () => {
    const f = fixture({ load: async () => ({ ...emptyLibrary(), likes: ['sample-track-1', 'unknown', 1, 'sample-track-1'],
      playlists: [null, { id: 'one', name: '  Saved  ', trackIds: ['sample-track-3', 'unknown'] }, { id: 'one', name: 'Duplicate', trackIds: [] }, { id: 'bad', name: '' }] }), save: vi.fn() });
    await f.service.initialize();
    expect(f.snapshot().likes).toEqual(['sample-track-1']);
    expect(f.snapshot().playlists).toEqual([{ id: 'one', name: 'Saved', trackIds: ['sample-track-3'] }]);
  });
  it('validates playlist names, missing playlists and unavailable tracks', async () => {
    const f = fixture();
    await expect(f.service.createPlaylist('   ')).rejects.toThrow('1 and 60');
    await expect(f.service.createPlaylist('x'.repeat(61))).rejects.toThrow('1 and 60');
    await expect(f.service.toggle('likes', 'removed')).rejects.toThrow('unavailable');
    await expect(f.service.setPlaylistTrack('missing', 'sample-track-1', true)).rejects.toThrow('no longer exists');
    expect(f.snapshot().playlists).toEqual([]);
  });
  it('retains the last good revision after a partial interrupted write', async () => {
    const storage = new MemoryDocuments(), repo = new FileLibraryRepository(storage);
    await repo.load(); await repo.save({ ...emptyLibrary(), likes: ['sample-track-1'] });
    await repo.save({ ...emptyLibrary(), favourites: ['sample-track-2'] });
    vi.spyOn(storage, 'write').mockImplementationOnce(async (name) => { storage.files.set(name, '{broken'); throw new Error('Interrupted'); });
    await expect(repo.save({ ...emptyLibrary(), bookmarks: ['sample-track-3'] })).rejects.toThrow('Interrupted');
    const restored = await new FileLibraryRepository(storage).load();
    expect(restored).toEqual({ ...emptyLibrary(), favourites: ['sample-track-2'] });
  });
  it('fails closed when all existing journal files are corrupt and reads missing files as a new library', async () => {
    const storage = new MemoryDocuments(); expect(await new FileLibraryRepository(storage).load()).toBeNull();
    storage.files.set('aadat-library-v1-0.json', 'null');
    storage.files.set('aadat-library-v1-1.json', '{broken');
    await expect(new FileLibraryRepository(storage).load()).rejects.toThrow('could not be read');
    expect(storage.files.size).toBe(2);
  });
  it('exposes hydration/save errors in Zustand without pretending data was saved', async () => {
    const repo = { load: vi.fn().mockRejectedValueOnce(new Error('Read failed')).mockResolvedValue(null), save: vi.fn().mockRejectedValue(new Error('Save failed')) };
    const store = createLibraryStore(repo);
    await store.getState().initialize(); expect(store.getState()).toMatchObject({ status: 'error', error: 'Read failed' });
    await store.getState().initialize(); expect(store.getState()).toMatchObject({ status: 'ready', error: null });
    await store.getState().toggle('likes', 'sample-track-1');
    expect(store.getState().data.likes).toEqual([]); expect(store.getState().error).toBe('Save failed');
    expect(await store.getState().createPlaylist('')).toBeNull();
  });
});

seedDemoFixture();
