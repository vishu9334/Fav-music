import {seedDemoFixture} from '../../catalog/__tests__/demo-fixture';
import { describe, expect, it, vi } from 'vitest';
import { WarehouseStatus } from '@aadat/contracts';
import { AccountLibraryService, AccountLibrarySnapshot, accountLibraryRepositories } from '../account-library.service';
import { IDocumentStorage, emptyLibrary } from '../library.contract';
import { GuestImportService } from '../guest-import.service';
import { FileLibraryRepository } from '../file-library.repository';
import { createLibraryStore } from '../../store/useLibraryStore';

const A = '10000000-0000-4000-8000-000000000001', B = '10000000-0000-4000-8000-000000000002', TRACK = '20000000-0000-4000-8000-000000000001';
class Documents implements IDocumentStorage {
  public readonly files = new Map<string, string>();
  public readonly read = vi.fn(async (name: string) => this.files.get(name) ?? null);
  public readonly write = vi.fn(async (name: string, value: string) => { this.files.set(name, value); });
}
function fixture(storage = new Documents()) {
  let snapshot: AccountLibrarySnapshot = { scope: null, data: emptyLibrary(), status: 'loading', error: null };
  const changes: AccountLibrarySnapshot[] = [];
  const service = new AccountLibraryService(accountLibraryRepositories(storage), (next) => { snapshot = next; changes.push(next); });
  return { storage, service, changes, current: () => snapshot };
}
const guestFiles = (storage: Documents) => [...storage.files].filter(([name]) => /^aadat-library-v1-/.test(name));

describe('Guest and verified-account library isolation', () => {
  it('coalesces repeated activation while the same account is loading', async () => {
    const f = fixture(), first = f.service.activate(A), second = f.service.activate(A);
    expect(second).toBe(first); await Promise.all([first, second]); expect(f.storage.read).toHaveBeenCalledTimes(2);
    expect(f.current()).toMatchObject({ scope: A, status: 'ready' });
  });
  it('retains legacy guest files, opens empty separate accounts and restores each collection without automatic copying', async () => {
    const f = fixture(); await f.service.activate(null);
    await f.service.run((library) => library.toggle('favourites', 'sample-track-1'));
    await f.service.run((library) => library.createPlaylist('Guest mix', ['sample-track-2']));
    const before = guestFiles(f.storage); expect(before).toHaveLength(2);
    await f.service.activate(A); expect(f.current().data).toEqual(emptyLibrary());
    await f.service.run((library) => library.toggle('bookmarks', 'sample-track-3'));
    await f.service.activate(B); expect(f.current().data).toEqual(emptyLibrary());
    await f.service.run((library) => library.toggle('likes', 'sample-track-2'));
    await f.service.activate(null); expect(f.current().data.favourites).toEqual(['sample-track-1']); expect(f.current().data.playlists[0]?.name).toBe('Guest mix');
    expect(guestFiles(f.storage)).toEqual(before);
    await f.service.activate(A); expect(f.current().data.bookmarks).toEqual(['sample-track-3']); expect(f.current().data.likes).toEqual([]);
    await f.service.activate(B); expect(f.current().data.likes).toEqual(['sample-track-2']);
    expect([...f.storage.files.keys()].some((name) => name.includes(A))).toBe(true);
  });
  it('serializes an in-flight save with account switching and rejects queued stale actions', async () => {
    const f = fixture(); await f.service.activate(A);
    let release!: () => void; const barrier = new Promise<void>((resolve) => { release = resolve; });
    f.storage.write.mockImplementationOnce(async (name, data) => { await barrier; f.storage.files.set(name, data); });
    const saving = f.service.run((library) => library.toggle('favourites', 'sample-track-1'));
    const saveResult = expect(saving).rejects.toThrow('account changed');
    await vi.waitFor(() => expect(f.storage.write).toHaveBeenCalled());
    const queued = f.service.run((library) => library.toggle('likes', 'sample-track-3'));
    const queuedResult = expect(queued).rejects.toThrow('account changed');
    const switching = f.service.activate(B); expect(f.current()).toMatchObject({ scope: B, data: emptyLibrary(), status: 'loading' });
    release(); await Promise.all([saveResult, queuedResult, switching]);
    expect(f.current()).toMatchObject({ scope: B, data: emptyLibrary(), status: 'ready' });
    expect(f.changes.filter((state) => state.scope === B).every((state) => state.data.favourites.length === 0)).toBe(true);
    await f.service.activate(A); expect(f.current().data.favourites).toEqual(['sample-track-1']); expect(f.current().data.likes).toEqual([]);
  });
  it('rejects unverified/path-traversal namespaces and keeps corrupt account files from affecting guest storage', async () => {
    const f = fixture(); await f.service.activate(null); await f.service.run((library) => library.toggle('likes', 'sample-track-1'));
    const guest = guestFiles(f.storage);
    await expect(f.service.activate('../guest')).rejects.toThrow('verified');
    expect(() => new FileLibraryRepository(f.storage, '../guest')).toThrow('namespace');
    f.storage.files.set(`aadat-library-account-v1-${A}-0.json`, '{broken');
    await expect(f.service.activate(A)).rejects.toThrow('could not be read');
    expect(f.current()).toMatchObject({ scope: A, data: emptyLibrary(), status: 'error' });
    await expect(f.service.run((library) => library.toggle('likes', 'sample-track-2'))).rejects.toThrow('account changed');
    expect(guestFiles(f.storage)).toEqual(guest); await f.service.activate(null); expect(f.current().data.likes).toEqual(['sample-track-1']);
  });
  it('reuses the existing Zustand actions for account favourites, playlists and Warehouse across restart', async () => {
    const storage = new Documents(), repositories = accountLibraryRepositories(storage);
    const store = createLibraryStore(undefined, repositories); await store.getState().initialize(); await store.getState().toggle('likes', 'sample-track-1');
    await store.getState().activateAccount(A); await store.getState().toggle('favourites', 'sample-track-3');
    const playlist = await store.getState().createPlaylist('Account mix', ['sample-track-3']);
    await store.getState().setWarehouseStatus('sample-track-3', WarehouseStatus.ARCHIVED);
    const reloaded = createLibraryStore(undefined, repositories); await reloaded.getState().activateAccount(A);
    expect(reloaded.getState().data).toMatchObject({ favourites: ['sample-track-3'], playlists: [{ id: playlist, name: 'Account mix', trackIds: ['sample-track-3'] }], warehouseStates: [{ trackId: 'sample-track-3', status: WarehouseStatus.ARCHIVED }] });
    await reloaded.getState().activateAccount(null); expect(reloaded.getState().data.likes).toEqual(['sample-track-1']); expect(reloaded.getState().data.favourites).toEqual([]);
  });
  it('keeps a delayed save failure out of the next account’s Zustand state', async () => {
    const storage = new Documents(), store = createLibraryStore(undefined, accountLibraryRepositories(storage));
    await store.getState().activateAccount(A);
    let fail!: (error: Error) => void;
    storage.write.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    const saving = store.getState().toggle('likes', 'sample-track-1');
    await vi.waitFor(() => expect(fail).toBeTypeOf('function'));
    const switching = store.getState().activateAccount(B);
    fail(new Error('Previous account save failed')); await Promise.all([saving, switching]);
    expect(store.getState()).toMatchObject({ scope: B, error: null, status: 'ready', data: emptyLibrary() });
    expect(storage.files.size).toBe(0);
  });
});

describe('Explicit one-time guest-to-account copy', () => {
  it('reports unloaded legacy song IDs before normalization can silently omit them from an account transfer', async () => {
    const docs = new Documents();
    await new FileLibraryRepository(docs).save({ ...emptyLibrary(), likes: ['legacy-song-not-in-the-current-catalog'] });
    const before = [...docs.files];
    const service = new AccountLibraryService(accountLibraryRepositories(docs), () => {}, undefined, true);
    await service.activate(A);
    await expect(service.previewGuestImport()).rejects.toThrow('unsupported song references');
    expect([...docs.files]).toEqual(before);
  });
  it('previews without writes, preserves conflicting account choices, keeps both playlists and persists one atomic receipt', async () => {
    const f = fixture(); await f.service.activate(null);
    await f.service.run((library) => library.toggle('favourites', 'sample-track-1'));
    await f.service.run((library) => library.createPlaylist('Same name', ['sample-track-1', TRACK]));
    const guest = guestFiles(f.storage);
    await f.service.activate(A); await f.service.run((library) => library.setWarehouseStatus('sample-track-1', WarehouseStatus.ARCHIVED));
    await f.service.run((library) => library.createPlaylist('Same name', ['sample-track-2']));
    const writes = f.storage.write.mock.calls.length, preview = await f.service.previewGuestImport();
    expect(f.storage.write).toHaveBeenCalledTimes(writes);
    expect(preview.summary).toMatchObject({ playlistsAdded: 1, renamedPlaylists: 1 });
    await f.service.applyGuestImport(preview.id); expect(f.storage.write).toHaveBeenCalledTimes(writes + 1);
    expect(f.current().data).toMatchObject({ guestImportCompleted: true, favourites: ['sample-track-1'], warehouseStates: [{ trackId: 'sample-track-1', status: WarehouseStatus.ARCHIVED }] });
    expect(f.current().data.playlists.map((p) => p.name)).toEqual(['Same name', 'Same name · Guest copy']);
    expect(f.current().data.playlists[1]?.trackIds).toEqual(['sample-track-1', TRACK]); expect(guestFiles(f.storage)).toEqual(guest);
    await f.service.run((library) => library.toggle('favourites', 'sample-track-1'));
    const next = fixture(f.storage); await next.service.activate(A);
    await expect(next.service.previewGuestImport()).rejects.toThrow('already been copied'); expect(next.current().data.favourites).toEqual([]);
    await next.service.activate(B); expect((await next.service.previewGuestImport()).summary.playlistsAdded).toBe(1);
  });
  it('invalidates previews after local edits or account changes without writing a stale merge', async () => {
    const f = fixture(); await f.service.activate(A); const plan = await f.service.previewGuestImport();
    await f.service.run((library) => library.toggle('likes', 'sample-track-2')); const writes = f.storage.write.mock.calls.length;
    await expect(f.service.applyGuestImport(plan.id)).rejects.toThrow('changed'); expect(f.storage.write).toHaveBeenCalledTimes(writes);
    const fresh = await f.service.previewGuestImport(); await f.service.activate(B);
    await expect(f.service.applyGuestImport(fresh.id)).rejects.toThrow('preview'); expect(f.current().data.guestImportCompleted).toBeUndefined();
  });
  it('keeps account and guest data intact after interrupted copy writes and allows safe retry', async () => {
    const f = fixture(); await f.service.activate(null); await f.service.run((library) => library.toggle('bookmarks', 'sample-track-2'));
    const guest = guestFiles(f.storage); await f.service.activate(A); await f.service.run((library) => library.toggle('likes', 'sample-track-3'));
    const preview = await f.service.previewGuestImport();
    f.storage.write.mockImplementationOnce(async (name) => { f.storage.files.set(name, '{partial'); throw new Error('Interrupted'); });
    await expect(f.service.applyGuestImport(preview.id)).rejects.toThrow('Interrupted'); expect(f.current().data.guestImportCompleted).toBeUndefined(); expect(guestFiles(f.storage)).toEqual(guest);
    const restored = fixture(f.storage); await restored.service.activate(A); expect(restored.current().data).toMatchObject({ likes: ['sample-track-3'], bookmarks: [] });
    const retry = await restored.service.previewGuestImport(); await restored.service.applyGuestImport(retry.id); expect(restored.current().data.bookmarks).toEqual(['sample-track-2']);
  });
  it('refuses overflow or a repeated import without truncating collections and never copies InstaMus private notes', () => {
    const merger = new GuestImportService(), account = emptyLibrary(), guest = { ...emptyLibrary(), instamus: [{ reelUrl: 'https://www.instagram.com/reel/fixture/', query: 'private note', trackId: null }] };
    expect(merger.merge(account, guest).data.instamus).toEqual([]);
    expect(() => merger.merge({ ...account, guestImportCompleted: true }, guest)).toThrow('already');
    expect(() => merger.merge({ ...account, playlists: Array.from({ length: 100 }, (_, id) => ({ id: String(id), name: 'Saved', trackIds: [] })) }, { ...guest, playlists: [{ id: 'guest', name: 'Guest', trackIds: [] }] })).toThrow('No collections were changed');
  });
  it('keeps explicit account Warehouse state when a conflicting guest state is copied', () => {
    const account = { ...emptyLibrary(), warehouse: ['sample-track-1'], warehouseStates: [{ trackId: 'sample-track-1', status: WarehouseStatus.HIDDEN }] };
    const guest = { ...emptyLibrary(), warehouse: ['sample-track-1'], warehouseStates: [{ trackId: 'sample-track-1', status: WarehouseStatus.ACTIVE }] };
    const result = new GuestImportService().merge(account, guest);
    expect(result.data.warehouseStates).toEqual(account.warehouseStates); expect(result.summary.accountWarehouseConflictsKept).toBe(1);
  });
});

seedDemoFixture();
