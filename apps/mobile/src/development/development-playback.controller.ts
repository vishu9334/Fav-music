import type { CatalogSong, PlaybackState } from '@aadat/contracts';
import { DevelopmentCatalogClient } from './development-catalog.client';
import { CatalogClientService } from '../catalog/catalog-client.service';
import { CatalogMetadataCache } from '../catalog/catalog-cache';
import { DemoCatalog } from '../catalog/demo-catalog';
import { MediaLeaseService } from '../catalog/media-lease.service';
import type { IDocumentStorage } from '../library/library.contract';
import type { IPlayableTrack } from '../data/sample-tracks';
import { AudioPlaybackService } from '../services/playback/AudioPlaybackService';
import { resolveCatalogTracks } from '../catalog/catalog-runtime';

class DiagnosticMetadataMemory implements IDocumentStorage {
  private readonly files = new Map<string, string>();
  public async read(name: string): Promise<string | null> { return this.files.get(name) ?? null; }
  public async write(name: string, text: string): Promise<void> { this.files.set(name, text); }
}
export interface DiagnosticState {
  readonly unlocked: boolean; readonly busy: boolean; readonly message: string;
  readonly songs: readonly CatalogSong[]; readonly tracks: readonly IPlayableTrack[];
  readonly active: number; readonly position: number; readonly duration: number; readonly buffered: number;
  readonly playback: PlaybackState | null; readonly cursor: string | null;
}
/** Reuses audio authority without mounting account journals/history or the normal authenticated store. */
export class DevelopmentPlaybackController {
  private readonly registry = new DemoCatalog();
  private readonly catalog: CatalogClientService;
  private readonly leases: MediaLeaseService;
  private state: DiagnosticState = { unlocked: false, busy: false, message: 'Private read-only developer access required. No account is signed in.', songs: [], tracks: [], active: 0, position: 0, duration: 0, buffered: 0, playback: null, cursor: null };
  private readonly listeners = new Set<() => void>();
  private readonly cleanup: (() => void)[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private epoch = 0; private searchEpoch = 0;
  public constructor(private readonly client = new DevelopmentCatalogClient(), private readonly player = AudioPlaybackService.getInstance()) {
    this.catalog = new CatalogClientService(client.repository, this.registry, new CatalogMetadataCache(new DiagnosticMetadataMemory()));
    this.leases = new MediaLeaseService(client.repository);
  }
  public readonly snapshot = (): DiagnosticState => this.state;
  public readonly subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<DiagnosticState>): void { this.state = { ...this.state, ...patch }; this.listeners.forEach(fn => fn()); }
  public async unlock(key: string): Promise<void> {
    if (this.state.unlocked || this.state.tracks.length) await this.lock();
    const epoch = ++this.epoch;
    this.update({ busy: true, message: 'Verifying read-only access…' });
    try {
      await this.client.unlock(key); if (epoch !== this.epoch) return;
      this.player.configureSourceResolver(this.sources);
      if (!this.cleanup.length) {
        this.cleanup.push(this.player.onStateChange(playback => this.update({ playback })), this.player.onTrackChange(active => this.update({ active })),
          this.player.onProgress(progress => this.update(progress)), this.player.onError(() => this.update({ message: 'Playback failed. Retry the source or re-enter an unexpired key.' })));
      }
      await this.player.initialize(); if (epoch !== this.epoch) return;
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => { void this.lock(); }, Math.max(1, this.client.deadline() - Date.now()));
      this.update({ unlocked: true, message: 'Real development provider · no personal collections or production licence verified.' });
    } catch { if (epoch === this.epoch) { this.client.clear(); this.update({ unlocked: false, message: 'Access could not be verified. Check the private key, server and network.' }); } }
    finally { if (epoch === this.epoch) this.update({ busy: false }); }
  }
  private readonly sources = async (tracks: readonly IPlayableTrack[], force = false): Promise<readonly IPlayableTrack[]> => {
    if (!this.state.unlocked || Date.now() >= this.client.deadline()) throw new Error('Read-only development access expired.');
    const epoch = this.epoch, ids = tracks.map(t => t.id), audio = await this.leases.resolve(ids, 'AUDIO', force);
    let artwork: ReadonlyMap<string, string> = new Map(); try { artwork = await this.leases.resolve(ids, 'ARTWORK', force); } catch { /* Artwork does not block audio. */ }
    if (epoch !== this.epoch || !this.state.unlocked || Date.now() >= this.client.deadline()) throw new Error('Development access changed.');
    return tracks.map(t => ({ ...t, url: audio.get(t.id)!, artwork: artwork.get(t.id) ?? '' }));
  };
  public async search(query: string, more = false): Promise<void> {
    if (!this.state.unlocked) return;
    const epoch = this.epoch, request = ++this.searchEpoch;
    this.update({ busy: true, message: 'Searching the actual provider…' });
    try {
      const page = await this.catalog.page({ query, first: 10, ...(more && this.state.cursor ? { after: this.state.cursor } : {}) }, !more);
      if (epoch !== this.epoch || request !== this.searchEpoch) return;
      const songs = [...new Map([...(more ? this.state.songs : []), ...page.nodes].map(s => [s.id, s])).values()].slice(-100);
      this.update({ songs, cursor: page.endCursor, message: songs.length ? 'Actual provider results. Source availability is checked when playing.' : 'No matching songs returned.' });
    } catch { if (epoch === this.epoch && request === this.searchEpoch) {
      if (this.client.deadline() <= Date.now()) await this.lock();
      else this.update({ message: 'Catalog request failed. Retry or re-enter the developer key.' });
    } }
    finally { if (epoch === this.epoch && request === this.searchEpoch) this.update({ busy: false }); }
  }
  public async play(id: string): Promise<void> {
    if (!this.state.unlocked || this.state.busy) return;
    const epoch = this.epoch, tracks = this.registry.tracks(this.state.songs.map(s => s.id)), index = tracks.findIndex(t => t.id === id);
    if (index < 0) return;
    this.update({ busy: true, tracks, active: index, message: 'Loading the real audio source…' });
    try {
      const loading = this.player.loadQueue(tracks, index), command = this.player.commandGeneration();
      await loading; if (epoch !== this.epoch || command !== this.player.commandGeneration()) return;
      await this.player.play(); if (epoch === this.epoch) this.update({ message: 'Native playback requested; audible output requires device confirmation.' });
    }
    catch { if (epoch === this.epoch) {
      if (this.client.deadline() <= Date.now()) await this.lock();
      else this.update({ message: 'The audio source could not play. Retry when access and connectivity are available.' });
    } }
    finally { if (epoch === this.epoch) this.update({ busy: false }); }
  }
  /** Artwork-only presentation reads; never changes the native queue or account storage. */
  public async artwork(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (!this.state.unlocked || Date.now() >= this.client.deadline()) return new Map();
    const epoch = this.epoch, urls = await this.leases.resolve(ids, 'ARTWORK');
    return epoch === this.epoch && this.state.unlocked && Date.now() < this.client.deadline() ? urls : new Map();
  }
  public checkExpiry(): void { if (this.state.unlocked && Date.now() >= this.client.deadline()) void this.lock(); }
  public toggle(): void { if (this.state.unlocked) void this.player.togglePlayPause(); }
  public select(index: number): Promise<void> { if (this.state.unlocked && Number.isInteger(index) && index >= 0 && index < this.state.tracks.length) return this.player.skipToIndex(index); return Promise.resolve(); }
  public previous(): void { if (this.state.unlocked) void this.player.skipToPrevious(); }
  public next(): void { if (this.state.unlocked) void this.player.skipToNext(); }
  public seek(seconds: number): void { if (this.state.unlocked) void this.player.seekTo(seconds); }
  public stop(): void { if (this.state.unlocked) void this.player.stop(); }
  public retry(): void { if (this.state.unlocked) void this.player.play(); }
  public async lock(): Promise<void> {
    this.epoch++; this.searchEpoch++; this.client.clear(); if (this.timer) clearTimeout(this.timer);
    this.update({ unlocked: false, busy: false, songs: [], tracks: [], cursor: null, active: 0, position: 0, duration: 0, buffered: 0, message: 'Development access closed or expired. Enter a new key to continue.' });
    try { await this.player.loadQueue([]); } catch { this.update({ message: 'Access closed; the native player reported a cleanup error.' }); }
  }
  public async dispose(): Promise<void> { await this.lock(); this.cleanup.splice(0).forEach(fn => fn()); this.player.configureSourceResolver(resolveCatalogTracks); this.listeners.clear(); }
}
