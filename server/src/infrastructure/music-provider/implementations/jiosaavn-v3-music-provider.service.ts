import { JioSaavnMusicProviderService } from './jiosaavn-music-provider.service.js';
import { MusicProviderError, type IMusicProviderSong, type MusicProviderPage, type MusicProviderSearch, type MusicProviderResource, type MusicResourceKind, type MusicProviderCollection } from '../contracts/music-provider.contract.js';
/** Isolated adapter for the separately approved BohrSidhu v3 deployment.
 * Only returned result windows are paginated locally; no global catalog size is invented.
 */
export class JioSaavnV3MusicProviderService extends JioSaavnMusicProviderService {
    public override readonly resourceKinds: readonly MusicResourceKind[] = ['albums'];
    public override readonly remotePagination = false;
    protected override unwrap(value: Record<string, unknown>): unknown { if (value.status !== true)
        throw new MusicProviderError('INVALID_RESPONSE', 'The v3 provider did not confirm this request.'); return value; }
    private duration(value: unknown): number {
        if (typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 86400)
            return value;
        if (typeof value !== 'string')
            throw new MusicProviderError('INVALID_RESPONSE', 'Song duration is missing.');
        if (/^\d+$/.test(value))
            return this.duration(Number(value));
        const segments = value.split(':');
        if (!/^(?:\d{1,2}:)?\d{1,3}:\d{2}$/.test(value) || segments.slice(1).some(n => Number(n) > 59))
            throw new MusicProviderError('INVALID_RESPONSE', 'Song duration is invalid.');
        return this.duration(segments.reduce((seconds, part) => seconds * 60 + Number(part), 0));
    }
    private image(v: Record<string, unknown>): string | undefined { const images = v.images && typeof v.images === 'object' ? v.images as Record<string, unknown> : {}; return this.url(images['500x500']) ?? this.url(v.image); }
    private parseSong(value: unknown): IMusicProviderSong {
        const v = this.object(value), media = v.media_urls && typeof v.media_urls === 'object' ? v.media_urls as Record<string, unknown> : {};
        return { id: this.id(v.id), title: this.text(v.song), artist: this.text(v.primary_artists ?? v.singers), album: typeof v.album === 'string' && v.album.trim() ? this.text(v.album) : undefined,
            albumId: typeof v.albumid === 'string' ? this.id(v.albumid) : undefined, durationSeconds: this.duration(v.duration), releaseYear: this.year(v.year), copyright: typeof v.copyright_text === 'string' && v.copyright_text.trim() ? this.text(v.copyright_text, 2000) : undefined,
            audioUrl: this.url(media['320_KBPS']) ?? this.url(media['160_KBPS']) ?? this.url(media['96_KBPS']) ?? this.url(v.media_url), artworkUrl: this.image(v), providerUrl: this.url(v.perma_url) };
    }
    private window<T>(items: readonly T[], page: number, limit: number): MusicProviderPage<T> { return { results: items.slice(page * limit, (page + 1) * limit), page, total: null, hasMore: (page + 1) * limit < items.length }; }
    public override async getSongById(songId: string, refresh = false): Promise<IMusicProviderSong | null> {
        const id = this.id(songId);
        let response;
        try {
            response = await this.request('/song', { id }, refresh);
        }
        catch (error) {
            if (error instanceof MusicProviderError && error.code === 'NOT_FOUND')
                return null;
            throw error;
        }
        const song = this.parseSong(response);
        if (song.id !== id)
            throw new MusicProviderError('INVALID_RESPONSE', 'Provider song identity mismatch.');
        return song;
    }
    public override async searchSongsPage(input: MusicProviderSearch): Promise<MusicProviderPage<IMusicProviderSong>> {
        const p = this.paging(input), response = this.object(await this.request('/search', { query: p.query }));
        if (!Array.isArray(response.results) || response.results.length > 100)
            throw new MusicProviderError('INVALID_RESPONSE', 'Invalid v3 song search.');
        const refs = this.window(response.results, p.page, p.limit), results: IMusicProviderSong[] = [];
        // Search lacks duration/year/streams. Hydrate the actual returned IDs; never fill invented metadata.
        for (let start = 0; start < refs.results.length; start += 3)
            results.push(...(await Promise.all(refs.results.slice(start, start + 3).map(v => this.getSongById(this.id(this.object(v).id))))).filter((song): song is IMusicProviderSong => song !== null));
        return { ...refs, results };
    }
    public override async searchResources(kind: MusicResourceKind, input: MusicProviderSearch): Promise<MusicProviderPage<MusicProviderResource>> {
        if (kind !== 'albums')
            throw new MusicProviderError('UNSUPPORTED', `The approved v3 API has no documented ${kind} search endpoint.`);
        const p = this.paging(input), response = this.object(await this.request('/albumsearch', { query: p.query }));
        if (!Array.isArray(response.results) || response.results.length > 100)
            throw new MusicProviderError('INVALID_RESPONSE', 'Invalid v3 album search.');
        const items = response.results.map(item => { const v = this.object(item), info = v.more_info && typeof v.more_info === 'object' ? v.more_info as Record<string, unknown> : {}; return { id: this.id(v.id), kind, name: this.text(v.title), artworkUrl: this.image(v), releaseYear: this.year(info.year), providerUrl: this.url(v.url) }; });
        return this.window(items, p.page, p.limit);
    }
    public override async getCollection(kind: MusicResourceKind, id: string, page = 0, limit = 20): Promise<MusicProviderCollection> {
        if (kind !== 'albums')
            throw new MusicProviderError('UNSUPPORTED', `The approved v3 API has no documented ${kind} lookup endpoint.`);
        this.id(id);
        this.paging({ query: id, page, limit });
        const v = this.object(await this.request('/album', { id }));
        if (String(v.albumid) !== id || !Array.isArray(v.songs) || v.songs.length > 500)
            throw new MusicProviderError('INVALID_RESPONSE', 'Invalid v3 album detail.');
        return { resource: { id, kind, name: this.text(v.title ?? v.name), artworkUrl: this.image(v), releaseYear: this.year(v.year), providerUrl: this.url(v.perma_url) }, songs: this.window(v.songs.map(value => this.parseSong(value)), page, limit) };
    }
}
