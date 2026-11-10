import { create } from 'zustand';
import { WarehouseStatus } from '@aadat/contracts';
import { demoCatalog } from '../catalog/demo-catalog';
import { CollectionKind, emptyLibrary, ILibraryRepository, LocalLibrary, LibrarySyncState } from '../library/library.contract';
import { LibraryService } from '../library/library.service';
import { AccountLibraryService, accountLibraryRepositories, LibraryRepositoryFactory } from '../library/account-library.service';
import { GuestImportPlan } from '../library/guest-import.service';
import { isCatalogId } from '../catalog/catalog-api';

export interface LibraryState {
  sync: LibrarySyncState;
  synchronize: (resolution?: 'local'|'remote') => Promise<void>;
  recordPlay: (id:string,playedAt:number) => Promise<void>;
  saveHistory: (entries:readonly {trackId:string;playedAt:number}[])=>Promise<void>;
  scope: string | null;
  scopeVersion: number;
  activateAccount: (userId: string | null) => Promise<void>;
  previewGuestImport: () => Promise<GuestImportPlan | null>;
  applyGuestImport: (id: string) => Promise<boolean>;
  data: LocalLibrary;
  status: 'locked' | 'loading' | 'ready' | 'error';
  error: string | null;
  initialize: () => Promise<void>;
  toggle: (kind: CollectionKind, id: string) => Promise<void>;
  createPlaylist: (name: string, trackIds?: readonly string[]) => Promise<string | null>;
  renamePlaylist: (id: string, name: string) => Promise<boolean>;
  setWarehouseStatus: (id: string, status: WarehouseStatus) => Promise<void>;
  saveInstaMus: (reelUrl: string, query: string, trackId: string | null) => Promise<boolean>;
  removeInstaMus: (reelUrl: string) => Promise<void>;
  setPlaylistTrack: (playlist: string, track: string, included: boolean) => Promise<void>;
  deletePlaylist: (id: string) => Promise<void>;
  dismissError: () => void;
}
export function createLibraryStore(repository?: ILibraryRepository, repositories = accountLibraryRepositories(), authenticatedOnly = false) {
  const factory: LibraryRepositoryFactory = repository ? (userId) => { if (userId !== null) throw new Error('This repository supports guest collections only.'); return repository; } : repositories;
  return create<LibraryState>((set, get) => {
    // Optimistic presentation only. Account journals remain the durable source of truth.
    let durableData = emptyLibrary();
    const pendingLikes = new Map<string, { liked: boolean }>();
    const presentedData = (): LocalLibrary => {
      if (!pendingLikes.size) return durableData;
      const likes = new Set(durableData.likes);
      for (const [id, intent] of pendingLikes) { if (intent.liked) likes.add(id); else likes.delete(id); }
      return { ...durableData, likes: [...likes] };
    };
    const service = new AccountLibraryService(factory, (snapshot) => {
      if (get().scope !== snapshot.scope || snapshot.status !== 'ready') pendingLikes.clear();
      durableData = snapshot.data;
      set({ ...snapshot, data: presentedData(),
      scopeVersion: get().scope === snapshot.scope ? get().scopeVersion : get().scopeVersion + 1,
      ...(get().scope !== snapshot.scope ? {sync:{status:'pending' as const,message:'Opening this account’s local copy…',revision:0}} : {}) });
    }, demoCatalog, authenticatedOnly);
    let initialization: Promise<void> | null = null;
    const initialize = (): Promise<void> => {
      if (get().status === 'ready') return Promise.resolve();
      if (!initialization) initialization = service.activate(get().scope).finally(() => { initialization = null; });
      return initialization;
    };
    const failed = (error: unknown) => set({ error: error instanceof Error ? error.message : 'Your library could not be saved. Please retry.' });
    const action = <T,>(operation: (library: LibraryService) => Promise<T>): Promise<T> => {
      void initialize().catch(() => {}); return service.run(operation);
    };
    const attempt = async <T,>(operation: () => Promise<T>, fallback: T): Promise<T> => {
      const version = get().scopeVersion;
      try { return await operation(); } catch (error) { if (version === get().scopeVersion) failed(error); return fallback; }
    };
    const run = (operation: (library: LibraryService) => Promise<void>): Promise<void> => attempt(() => action(operation), undefined);
    const toggleLike = (id: string): Promise<void> => {
      if (!demoCatalog.has(id) && !isCatalogId(id)) { failed(new Error('This track is unavailable.')); return Promise.resolve(); }
      // Hydration must finish before deriving an intent from saved data.
      if (get().status !== 'ready') return run(library => library.setLiked(id, !library.getSnapshot().likes.includes(id)));
      const version = get().scopeVersion, intent = { liked: !get().data.likes.includes(id) };
      pendingLikes.set(id, intent);
      // Capture the account generation before notifying synchronous store subscribers.
      const saving = service.run(library => library.setLiked(id, intent.liked));
      set({ data: presentedData(), error: null });
      return saving.catch(error => {
        if (version === get().scopeVersion && pendingLikes.get(id) === intent) failed(error);
      }).finally(() => {
        if (version !== get().scopeVersion || pendingLikes.get(id) !== intent) return;
        pendingLikes.delete(id);
        set({ data: presentedData() });
      });
    };
    return {
      sync:{status:'blocked',message:'Sign in to access your account collections.',revision:0},
      synchronize: async (resolution) => {
        if(get().scope===null || get().status!=='ready')return;
        const version=get().scopeVersion;
        try{ await action(async (library) => {await library.synchronize(resolution); if(get().scopeVersion===version)set({sync:library.syncStatus()});}); }catch(error){if(get().scopeVersion===version)failed(error);}
      },
      saveHistory: async (entries)=>{const version=get().scopeVersion;try{await action(library=>library.saveHistory(entries));}catch(error){if(version===get().scopeVersion)failed(error);throw error;}},
      recordPlay: (id,playedAt) => run((library)=>library.recordPlay(id,playedAt)),
      scope: null, scopeVersion: 0, data: emptyLibrary(), status: 'loading', error: null,
      activateAccount: async (userId) => { try { await service.activate(userId); } catch (error) { if(get().scope===userId)failed(error); } },
      previewGuestImport: () => attempt<GuestImportPlan | null>(() => service.previewGuestImport(), null),
      applyGuestImport: (id) => attempt(async () => { await service.applyGuestImport(id); return true; }, false),
      initialize: async () => { const version=get().scopeVersion;try { await initialize(); }
        catch (error) { if(version===get().scopeVersion){set({ status: 'error' }); failed(error);} } },
      toggle: (kind, id) => kind === 'likes' ? toggleLike(id) : run((library) => library.toggle(kind, id)),
      createPlaylist: (name, trackIds) => attempt<string | null>(() => action((library) => library.createPlaylist(name, trackIds)), null),
      renamePlaylist: (id, name) => attempt(async () => { await action((library) => library.renamePlaylist(id, name)); return true; }, false),
      setWarehouseStatus: (id, status) => run((library) => library.setWarehouseStatus(id, status)),
      saveInstaMus: (reel, query, id) => attempt(async () => { await action((library) => library.saveInstaMus(reel, query, id)); return true; }, false),
      removeInstaMus: (reel) => run((library) => library.removeInstaMus(reel)),
      setPlaylistTrack: (playlist, track, included) => run((library) => library.setPlaylistTrack(playlist, track, included)),
      deletePlaylist: (id) => run((library) => library.deletePlaylist(id)),
      dismissError: () => set({ error: null }),
    };
  });
}
export const useLibraryStore = createLibraryStore(undefined, accountLibraryRepositories(undefined, true), true);
