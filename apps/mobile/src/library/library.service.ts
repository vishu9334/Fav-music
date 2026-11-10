import { DemoCatalog } from '../catalog/demo-catalog';
import { WarehouseStatus } from '@aadat/contracts';
import { normalizeReelUrl } from '../discovery/instagram-link';
import { COLLECTIONS, CollectionKind, emptyLibrary, ILibraryRepository, InstaMusNote, LocalLibrary, LocalPlaylist, WarehouseTrackState } from './library.contract';
import { warehouseIds, warehouseStatus } from './warehouse';
import { isCatalogId } from '../catalog/catalog-api';
import { GuestImportService } from './guest-import.service';
import { normalizeHistory, sameHistory } from '../discovery/history-normalization';

export class LibraryService {
  private data = emptyLibrary();
  private initialized = false;
  private hydration: Promise<void> | null = null;
  private pending: Promise<void> = Promise.resolve();
  public constructor(private readonly repository: ILibraryRepository, private readonly catalog: DemoCatalog,
    private readonly onChange: (data: LocalLibrary) => void,
    private readonly makeId: () => string = () => `playlist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`) {}

  public initialize(): Promise<void> {
    if (this.initialized) return Promise.resolve();
    if (this.hydration) return this.hydration;
    this.hydration = (async () => {
      const saved = await this.repository.load();
      this.data = saved === null ? emptyLibrary() : this.validate(saved);
      this.initialized = true; this.onChange(this.data);
    })().finally(() => { this.hydration = null; });
    return this.hydration;
  }
  public syncStatus() { return this.repository.syncStatus?.() ?? {status:'blocked' as const,message:'This collection is stored on this device.',revision:0}; }
  public synchronize(resolution?: 'local'|'remote'): Promise<void> {
    const result = this.pending.then(async () => {
      await this.initialize();
      if (!this.repository.synchronize) return;
      const next = await this.repository.synchronize(resolution);
      this.data = this.validate(next); this.onChange(this.data);
    });
    this.pending = result.catch(() => {}); return result;
  }
  public saveHistory(entries: readonly {trackId:string;playedAt:number}[]):Promise<void> {
    return this.mutate(data=>{
      const valid = entries.filter(entry => entry && typeof entry === 'object' && (this.catalog.has(entry.trackId) || isCatalogId(entry.trackId)));
      const history=normalizeHistory([...valid,...(data.history??[])]);
      return sameHistory(history,data.history??[])?data:{...data,history};
    });
  }
  public recordPlay(trackId: string, playedAt: number): Promise<void> {
    if ((!this.catalog.has(trackId) && !isCatalogId(trackId)) || !Number.isSafeInteger(playedAt) || playedAt<0) return Promise.resolve();
    return this.saveHistory([{trackId,playedAt}]);
  }
  public getSnapshot(): LocalLibrary { return this.data; }
  public importGuest(guest: LocalLibrary, expectedAccount: string): Promise<void> {
    return this.mutate((data) => {
      if (JSON.stringify(data) !== expectedAccount) throw new Error('Account collections changed. Review a fresh copy preview.');
      return new GuestImportService().merge(data, guest).data;
    });
  }
  private ids(value: unknown): string[] {
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && (this.catalog.has(id) || isCatalogId(id))))] : [];
  }
  private validate(value: unknown): LocalLibrary {
    if (!value || typeof value !== 'object' || ![1, 2].includes((value as { version?: unknown }).version as number)) {
      throw new Error('This saved library format is unsupported. Your files have been preserved.');
    }
    const source = value as Record<string, unknown>;
    const lists: LocalPlaylist[] = [];
    if (Array.isArray(source.playlists)) for (const item of source.playlists.slice(0, 100)) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id || item.id.length > 160
        || typeof item.name !== 'string' || !item.name.trim() || lists.some((p) => p.id === item.id)) continue;
      lists.push({ id: item.id, name: item.name.trim().slice(0, 60), trackIds: this.ids(item.trackIds) });
    }
    const states: WarehouseTrackState[] = [];
    if (Array.isArray(source.warehouseStates)) for (const item of source.warehouseStates) {
      if (item && typeof item === 'object' && typeof item.trackId === 'string' && (this.catalog.has(item.trackId) || isCatalogId(item.trackId))
        && Object.values(WarehouseStatus).includes(item.status) && !states.some((s) => s.trackId === item.trackId)) {
        states.push({ trackId: item.trackId, status: item.status });
      }
    }
    const notes: InstaMusNote[] = [];
    if (Array.isArray(source.instamus)) for (const item of source.instamus.slice(0, 100)) {
      if (!item || typeof item !== 'object' || typeof item.reelUrl !== 'string' || typeof item.query !== 'string') continue;
      try {
        const reelUrl = normalizeReelUrl(item.reelUrl);
        if (!notes.some((note) => note.reelUrl === reelUrl)) notes.push({ reelUrl, query: item.query.trim().slice(0, 160),
          trackId: typeof item.trackId === 'string' && (this.catalog.has(item.trackId) || isCatalogId(item.trackId)) ? item.trackId : null });
      } catch { /* Discard malformed metadata; never open or fetch a saved URL. */ }
    }
    if (source.guestImportCompleted !== undefined && source.guestImportCompleted !== true) throw new Error('Saved import receipt is invalid. Your files were preserved.');
    const history = normalizeHistory(Array.isArray(source.history) ? source.history.filter(h=>h&&typeof h==='object'&&(this.catalog.has(h.trackId)||isCatalogId(h.trackId))) : []);
    return { version: 2, ...(source.history !== undefined ? {history} : {}), ...(source.guestImportCompleted ? { guestImportCompleted: true as const } : {}), likes: this.ids(source.likes), favourites: this.ids(source.favourites),
      bookmarks: this.ids(source.bookmarks), warehouse: [...new Set([...this.ids(source.warehouse), ...states.map((s) => s.trackId)])],
      playlists: lists, warehouseStates: states, instamus: notes };
  }
  private mutate(change: (current: LocalLibrary) => LocalLibrary): Promise<void> {
    const result = this.pending.then(async () => {
      await this.initialize();
      const next = change(this.data);
      if (next === this.data) return;
      await this.repository.save(next); // Publish only durable changes; failed saves do not claim success.
      this.data = next; this.onChange(next);
    });
    this.pending = result.catch(() => {});
    return result;
  }
  public toggle(kind: CollectionKind, trackId: string): Promise<void> {
    return this.mutate((data) => {
      if (!COLLECTIONS.includes(kind) || (!this.catalog.has(trackId) && !(isCatalogId(trackId) && data[kind].includes(trackId)))) throw new Error('This track is unavailable.');
      if (kind === 'warehouse') return this.withWarehouseStatus(data, trackId,
        warehouseIds(data).includes(trackId) ? WarehouseStatus.ARCHIVED : WarehouseStatus.ACTIVE);
      const ids = data[kind];
      return { ...data, [kind]: ids.includes(trackId) ? ids.filter((id) => id !== trackId) : [...ids, trackId] };
    });
  }
  /** Explicit intent makes rapid retries idempotent, even after a prior save failed. */
  public setLiked(trackId: string, liked: boolean): Promise<void> {
    return this.mutate((data) => {
      if (!this.catalog.has(trackId) && !isCatalogId(trackId)) throw new Error('This track is unavailable.');
      if (data.likes.includes(trackId) === liked) return data;
      return { ...data, likes: liked ? [...new Set([...data.likes, trackId])] : data.likes.filter(id => id !== trackId) };
    });
  }
  public async createPlaylist(name: string, trackIds: readonly string[] = []): Promise<string> {
    const clean = name.trim().replace(/\s+/g, ' ');
    const selectedIds = [...new Set(trackIds)];
    if (!clean || clean.length > 60) throw new Error('Use a playlist name between 1 and 60 characters.');
    if (selectedIds.some((id) => !this.catalog.has(id) && !isCatalogId(id))) throw new Error('This track reference is unavailable.');
    let id = '';
    await this.mutate((data) => {
      if (data.playlists.length >= 100) throw new Error('You can save up to 100 playlists.');
      id = this.makeId();
      if (data.playlists.some((p) => p.id === id)) throw new Error('Please try creating this playlist again.');
      return { ...data, playlists: [...data.playlists, { id, name: clean, trackIds: selectedIds }] };
    });
    return id;
  }
  public setPlaylistTrack(playlistId: string, trackId: string, included: boolean): Promise<void> {
    return this.mutate((data) => {
      if (!this.catalog.has(trackId) && (included || !isCatalogId(trackId))) throw new Error('This track is unavailable.');
      const playlist = data.playlists.find((p) => p.id === playlistId);
      if (!playlist) throw new Error('This playlist no longer exists.');
      if (playlist.trackIds.includes(trackId) === included) return data;
      const trackIds = included ? [...playlist.trackIds, trackId] : playlist.trackIds.filter((id) => id !== trackId);
      return { ...data, playlists: data.playlists.map((p) => p.id === playlistId ? { ...p, trackIds } : p) };
    });
  }
  public deletePlaylist(id: string): Promise<void> {
    return this.mutate((data) => ({ ...data, playlists: data.playlists.filter((p) => p.id !== id) }));
  }
  public renamePlaylist(id: string, name: string): Promise<void> {
    return this.mutate((data) => {
      const clean = name.trim().replace(/\s+/g, ' ');
      if (!clean || clean.length > 60) throw new Error('Use a playlist name between 1 and 60 characters.');
      if (!data.playlists.some((p) => p.id === id)) throw new Error('This playlist no longer exists.');
      return { ...data, playlists: data.playlists.map((p) => p.id === id ? { ...p, name: clean } : p) };
    });
  }
  private withWarehouseStatus(data: LocalLibrary, trackId: string, status: WarehouseStatus): LocalLibrary {
    return { ...data, warehouse: [...new Set([...data.warehouse, trackId])],
      warehouseStates: [...data.warehouseStates.filter((s) => s.trackId !== trackId), { trackId, status }] };
  }
  public setWarehouseStatus(trackId: string, status: WarehouseStatus): Promise<void> {
    return this.mutate((data) => {
      if ((!this.catalog.has(trackId) && !(isCatalogId(trackId) && data.warehouse.includes(trackId))) || !Object.values(WarehouseStatus).includes(status)) throw new Error('This Warehouse change is unavailable.');
      if (data.warehouse.includes(trackId) && warehouseStatus(data, trackId) === status) return data;
      return this.withWarehouseStatus(data, trackId, status);
    });
  }
  public saveInstaMus(reel: string, query: string, trackId: string | null): Promise<void> {
    return this.mutate((data) => {
      const reelUrl = normalizeReelUrl(reel);
      if (trackId !== null && !this.catalog.has(trackId)) throw new Error('This track is unavailable.');
      if (query.trim().length > 160) throw new Error('Use up to 160 characters for discovery notes.');
      if (!data.instamus.some((note) => note.reelUrl === reelUrl) && data.instamus.length >= 100) throw new Error('You can save up to 100 reel links. Remove one before adding another.');
      const existing = data.instamus.find((note) => note.reelUrl === reelUrl);
      return { ...data, instamus: [{ reelUrl, query: query.trim(), trackId: trackId ?? existing?.trackId ?? null },
        ...data.instamus.filter((note) => note.reelUrl !== reelUrl)],
        bookmarks: trackId ? [...new Set([...data.bookmarks, trackId])] : data.bookmarks };
    });
  }
  public removeInstaMus(reelUrl: string): Promise<void> {
    return this.mutate((data) => ({ ...data, instamus: data.instamus.filter((note) => note.reelUrl !== reelUrl) }));
  }
}
