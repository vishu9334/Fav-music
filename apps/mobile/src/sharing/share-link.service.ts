import { DemoCatalog } from '../catalog/demo-catalog';
import { LocalPlaylist } from '../library/library.contract';
import { normalizeReelUrl } from '../discovery/instagram-link';
import { isCatalogId } from '../catalog/catalog-api';
import { publicTrackPageUrl } from './track-page-url';
import { SONG_NOT_FOUND } from './track-availability';

const CATALOG = 'aadat-demo-v1';
export type SharedContent = { readonly v: 1; readonly catalog: typeof CATALOG | 'aadat-catalog-v1' } & (
  { readonly type: 'track'; readonly id: string } |
  { readonly type: 'playlist'; readonly name: string; readonly ids: readonly string[] }
);
export interface TrackShareMetadata { readonly id: string; readonly title: string; readonly artist: string; readonly shareUrl?: string | null }
export interface ITrackShareSource { resolve(id: string): Promise<TrackShareMetadata | null> }
export interface IShareGateway { share(title: string, message: string): Promise<void> }
export class NativeShareGateway implements IShareGateway {
  public async share(title: string, message: string): Promise<void> {
    const { Share } = await import('react-native');
    await Share.share({ title, message }); // A dismissed native sheet is a normal result.
  }
}

/** Only catalog references cross devices; no audio URLs, local IDs, credentials or downloads. */
export class ShareLinkService {
  private pending: { key: string; promise: Promise<void> } | null = null;
  public constructor(private readonly catalog: DemoCatalog, private readonly gateway: IShareGateway = new NativeShareGateway(), private readonly source?: ITrackShareSource) {}
  public parse(payload: unknown): SharedContent {
    if (typeof payload !== 'string' || payload.length > 6000) throw new Error('This Fav Music link is invalid or too large.');
    let value: unknown;
    try { value = JSON.parse(payload); } catch { throw new Error('This Fav Music link could not be read.'); }
    if (!value || typeof value !== 'object') throw new Error('This Fav Music link could not be read.');
    const data = value as Record<string, unknown>;
    if (data.v !== 1 || (data.catalog !== CATALOG && data.catalog !== 'aadat-catalog-v1')) throw new Error('This catalog or link version is not supported yet.');
    const catalog = data.catalog;
    const validId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id);
    if (data.type === 'track' && validId(data.id) && (catalog !== 'aadat-catalog-v1' || isCatalogId(data.id))) return { v: 1, catalog, type: 'track', id: data.id };
    if (data.type === 'playlist' && typeof data.name === 'string' && !!data.name.trim() && data.name.length <= 60
      && !/[\u0000-\u001f\u007f]/.test(data.name) && Array.isArray(data.ids) && data.ids.length > 0
      && data.ids.length <= 100 && data.ids.every(validId)) {
      return { v: 1, catalog, type: 'playlist', name: data.name.trim(), ids: [...new Set(data.ids)] };
    }
    throw new Error('This Fav Music link contains unsupported content.');
  }
  private encode(content: SharedContent): string {
    const payload = JSON.stringify(content); this.parse(payload);
    return `aadatmusic:///shared?payload=${encodeURIComponent(payload)}`;
  }
  public trackLink(id: string): string {
    if (!isCatalogId(id) && !this.catalog.has(id)) throw new Error('This track is unavailable.');
    return this.encode({ v: 1, catalog: isCatalogId(id) ? 'aadat-catalog-v1' : CATALOG, type: 'track', id });
  }
  public playlistLink(playlist: LocalPlaylist): string {
    return this.encode({ v: 1, catalog: playlist.trackIds.some(isCatalogId) ? 'aadat-catalog-v1' : CATALOG, type: 'playlist', name: playlist.name, ids: [...playlist.trackIds] });
  }
  public reelLink(reelUrl: string): string { return `aadatmusic:///instamus?reel=${encodeURIComponent(normalizeReelUrl(reelUrl))}`; }
  private send(key: string, prepare: () => Promise<{ title: string; message: string }>, current: () => boolean = () => true): Promise<void> {
    if (this.pending) return this.pending.key === key ? this.pending.promise : Promise.reject(new Error('Another share sheet is already opening. Finish it before sharing another item.'));
    const promise = Promise.resolve().then(() => current() ? prepare() : null).then(content => {
      if (content && current()) return this.gateway.share(content.title, content.message);
      return undefined;
    })
      .finally(() => { if (this.pending?.promise === promise) this.pending = null; });
    this.pending = { key, promise };
    return promise;
  }
  public shareTrack(id: string, current: () => boolean = () => true): Promise<void> {
    return this.send(`track:${id}`, async () => {
      if (!isCatalogId(id)) throw new Error('Only available catalog songs can be shared.');
      const track = this.source ? await this.source.resolve(id) : this.catalog.get(id) as TrackShareMetadata | undefined;
      if (!track || track.id !== id) throw new Error(SONG_NOT_FOUND);
      const clean = (value: unknown): string => {
        if (typeof value !== 'string' || !value.trim() || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('Song details are unavailable. Please reload the song and retry.');
        return value.trim();
      };
      const title = clean(track.title), artist = clean(track.artist), page = publicTrackPageUrl(track.shareUrl);
      return { title: `${title} — ${artist}`, message: `${title} — ${artist}\n${page}\n\nOpen in Fav Music (app required):\n${this.trackLink(id)}` };
    }, current);
  }
  public sharePlaylist(playlist: LocalPlaylist): Promise<void> {
    const link = this.playlistLink(playlist);
    return this.send(`playlist:${link}`, async () => ({ title: playlist.name, message: `${playlist.name}\nFav Music playlist · App required\n${link}` }));
  }
  public shareReel(reelUrl: string): Promise<void> {
    const link = this.reelLink(reelUrl);
    return this.send(`reel:${link}`, async () => ({ title: 'InstaMus discovery', message: `Discover this reel manually in Fav Music · App required\n${link}` }));
  }
}
