import { MusicProviderError, type IMusicProviderService, type IMusicProviderSong, type MusicProviderPage, type MusicProviderSearch, type MusicProviderResource, type MusicResourceKind, type MusicProviderCollection } from '../contracts/music-provider.contract.js';
export interface IJioSaavnConfig {
    readonly apiBaseUrl: string;
    readonly timeoutMs?: number;
    readonly maxRetries?: number;
}
type ObjectValue = Record<string, unknown>;
/** Public REST adapter for the linked Sumit Kolhe API contract. Deployment compatibility still requires a live probe. */
export class JioSaavnMusicProviderService implements IMusicProviderService {
    public readonly providerId = 'jiosaavn';
    public readonly resourceKinds: readonly MusicResourceKind[] = ['albums', 'artists', 'playlists'];
    public readonly remotePagination: boolean = true;
    private readonly config: IJioSaavnConfig;
    private readonly pending = new Map<string, Promise<unknown>>();
    private readonly cache = new Map<string, {
        until: number;
        value: unknown;
    }>();
    private deniedUntil = 0;
    private requestSerial = 0;
    private readonly latestRequests = new Map<string, number>();
    constructor(config: IJioSaavnConfig, private readonly transport: typeof fetch = fetch, private readonly now: () => number = Date.now, private readonly delay: (ms: number) => Promise<void> = (ms) => new Promise(resolve => setTimeout(resolve, ms))) {
        try {
            const url = new URL(config.apiBaseUrl);
            if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port && url.port !== '443' || !url.hostname.includes('.'))
                throw new Error();
        }
        catch {
            throw new MusicProviderError('INVALID_REQUEST', 'JioSaavn requires a configured HTTPS API base URL.');
        }
        this.config = { ...config, apiBaseUrl: config.apiBaseUrl.replace(/\/$/, '') };
    }
    public getConfig(): IJioSaavnConfig { return { ...this.config }; }
    protected object(value: unknown): ObjectValue { if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new MusicProviderError('INVALID_RESPONSE', 'The provider returned invalid metadata.'); return value as ObjectValue; }
    protected id(value: unknown): string { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value))
        throw new MusicProviderError('INVALID_REQUEST', 'Invalid provider reference.'); return value; }
    protected text(value: unknown, max = 200): string {
        if (typeof value !== 'string' || !value.trim() || value.length > max)
            throw new MusicProviderError('INVALID_RESPONSE', 'Required provider metadata is missing.');
        return value.replace(/&(amp|quot|apos|lt|gt);|&#(\d{1,7});|&#x([0-9a-f]{1,6});/gi, (match, named: string, decimal: string, hex: string) => {
            if (named)
                return ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' } as Record<string, string>)[named.toLowerCase()] ?? match;
            const point = decimal ? Number(decimal) : parseInt(hex, 16);
            return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : match;
        }).trim();
    }
    protected year(value: unknown): number | undefined { if (value === null || value === undefined || value === '')
        return undefined; const year = typeof value === 'string' && /^\d{4}$/.test(value) ? Number(value) : value; if (typeof year !== 'number' || !Number.isInteger(year) || year < 1 || year > 9999)
        throw new MusicProviderError('INVALID_RESPONSE', 'The provider returned an invalid release year.'); return year; }
    protected url(value: unknown): string | undefined {
        if (typeof value !== 'string' || !value || /[\s\\\u0000-\u001f\u007f<>"`]/.test(value) || /%(?![0-9a-f]{2})/i.test(value))
            return undefined;
        try {
            const u = new URL(value);
            if (value.length > 8192 || u.protocol !== 'https:' || u.username || u.password || u.port && u.port !== '443' || !u.hostname.includes('.') || /^(?:localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(u.hostname))
                return undefined;
            // Validate the URI, then retain the provider bytes; never rebuild opaque/signed URLs.
            return value;
        }
        catch {
            return undefined;
        }
    }
    private links(value: unknown): string | undefined {
        if (!Array.isArray(value) || value.length > 20)
            return undefined;
        const links = value.flatMap(item => { if (!item || typeof item !== 'object')
            return []; const v = item as ObjectValue, url = this.url(v.url ?? v.link); const quality = typeof v.quality === 'string' ? Number.parseInt(v.quality, 10) : 0; return url ? [{ url, quality: Number.isFinite(quality) ? quality : 0 }] : []; });
        return links.sort((a, b) => b.quality - a.quality)[0]?.url;
    }
    private song(value: unknown): IMusicProviderSong {
        const v = this.object(value), album = v.album === null || v.album === undefined ? {} : this.object(v.album), artists = v.artists ? this.object(v.artists) : {};
        const primary = Array.isArray(artists.primary) ? artists.primary : [];
        const artist = primary.length ? primary.map(a => this.text(this.object(a).name)).join(', ') : this.text(v.primaryArtists);
        const duration = typeof v.duration === 'string' && /^\d+$/.test(v.duration) ? Number(v.duration) : v.duration;
        if (typeof duration !== 'number' || !Number.isInteger(duration) || duration <= 0 || duration > 86400)
            throw new MusicProviderError('INVALID_RESPONSE', 'The provider has no usable song duration.');
        return { id: this.id(v.id), title: this.text(v.name), artist, album: album.name ? this.text(album.name) : undefined, albumId: album.id ? this.id(String(album.id)) : undefined,
            artistIds: primary.flatMap(a => { const id = this.object(a).id; return typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id) ? [id] : []; }), durationSeconds: duration, releaseYear: this.year(v.year), copyright: typeof v.copyright === 'string' && v.copyright.trim() ? this.text(v.copyright, 2000) : undefined,
            audioUrl: this.links(v.downloadUrl), artworkUrl: this.links(v.image), providerUrl: this.url(v.url) };
    }
    private resource(kind: MusicResourceKind, value: unknown): MusicProviderResource { const v = this.object(value); return { id: this.id(String(v.id)), kind, name: this.text(v.name), artworkUrl: this.links(v.image), releaseYear: this.year(v.year), providerUrl: this.url(v.url) }; }
    protected paging(input: MusicProviderSearch): {
        query: string;
        page: number;
        limit: number;
    } { const query = input.query.normalize('NFKC').trim(), page = input.page ?? 0, limit = input.limit ?? 20; if (!query || query.length > 160 || !Number.isInteger(page) || page < 0 || page > 10000 || !Number.isInteger(limit) || limit < 1 || limit > 50)
        throw new MusicProviderError('INVALID_REQUEST', 'Choose a search phrase, page and page size between 1 and 50.'); return { query, page, limit }; }
    protected request(path: string, parameters: Record<string, string | number>, fresh = false): Promise<unknown> {
        if (this.deniedUntil > this.now())
            return Promise.reject(new MusicProviderError('ACCESS_DENIED', 'The configured music provider denied access. Ask its owner to restore API access.', 403));
        const url = new URL(this.config.apiBaseUrl + path);
        for (const [k, v] of Object.entries(parameters))
            url.searchParams.set(k, String(v));
        const key = url.toString(), cached = this.cache.get(key);
        // An ordinary read may join a renewal; a renewal must never join an ordinary read.
        const refreshing = this.pending.get(`refresh:${key}`);
        if (!fresh && refreshing) return refreshing;
        if (!fresh && cached && cached.until > this.now())
            return Promise.resolve(cached.value);
        const pendingKey = `${fresh ? 'refresh' : 'metadata'}:${key}`;
        const pending = this.pending.get(pendingKey);
        if (pending)
            return pending;
        if (this.pending.size >= 4)
            return Promise.reject(new MusicProviderError('UNAVAILABLE', 'Music requests are busy. Please retry.'));
        const revision = ++this.requestSerial;
        this.latestRequests.delete(key);
        this.latestRequests.set(key, revision);
        while (this.latestRequests.size > 100) this.latestRequests.delete(this.latestRequests.keys().next().value!);
        const action = this.fetchData(key, fresh).then(value => {
            // A delayed ordinary response cannot replace a newer forced source renewal.
            if (this.latestRequests.get(key) === revision) {
                this.cache.delete(key);
                this.cache.set(key, { until: this.now() + 60000, value });
                while (this.cache.size > 50) this.cache.delete(this.cache.keys().next().value!);
            }
            return value;
        }).finally(() => this.pending.delete(pendingKey));
        this.pending.set(pendingKey, action);
        return action;
    }
    private async fetchData(url: string, revalidate: boolean): Promise<unknown> {
        const retries = Math.min(2, Math.max(0, this.config.maxRetries ?? 1));
        for (let attempt = 0; attempt <= retries; attempt++) {
            const abort = new AbortController(), timer = setTimeout(() => abort.abort(), Math.min(15000, Math.max(1000, this.config.timeoutMs ?? 8000)));
            try {
                const response = await this.transport(url, { method: 'GET', headers: { Accept: 'application/json', ...(revalidate ? { 'Cache-Control': 'no-cache' } : {}) }, redirect: 'error', signal: abort.signal });
                if (response.status === 401 || response.status === 403) {
                    this.deniedUntil = this.now() + 60000;
                    await response.body?.cancel();
                    throw new MusicProviderError('ACCESS_DENIED', 'The configured music provider denied access. No empty catalog or successful playback is assumed.', response.status);
                }
                if (response.status === 404) {
                    await response.body?.cancel();
                    throw new MusicProviderError('NOT_FOUND', 'This provider resource is unavailable.', 404);
                }
                if (response.status === 429 || response.status >= 500) {
                    const retryAfter = response.headers.get('retry-after'), wait = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : 250 * (attempt + 1);
                    await response.body?.cancel();
                    if (attempt < retries && wait <= 2000) {
                        await this.delay(wait);
                        continue;
                    }
                    throw new MusicProviderError(response.status === 429 ? 'RATE_LIMITED' : 'UNAVAILABLE', 'The music provider is temporarily unavailable.', response.status);
                }
                if (!response.ok) {
                    await response.body?.cancel();
                    throw new MusicProviderError('UNAVAILABLE', 'The provider request failed.', response.status);
                }
                const type = response.headers.get('content-type') ?? '';
                if (!type.includes('application/json')) {
                    await response.body?.cancel();
                    throw new MusicProviderError('INVALID_RESPONSE', 'The provider returned a non-JSON response.');
                }
                const reader = response.body?.getReader();
                if (!reader)
                    throw new MusicProviderError('INVALID_RESPONSE', 'The provider returned no metadata.');
                let size = 0;
                const chunks: Uint8Array[] = [];
                while (true) {
                    const { value, done } = await reader.read();
                    if (done)
                        break;
                    size += value.byteLength;
                    if (size > 2 * 1024 * 1024) {
                        await reader.cancel();
                        throw new MusicProviderError('INVALID_RESPONSE', 'Provider metadata exceeded the response limit.');
                    }
                    chunks.push(value);
                }
                const bytes = new Uint8Array(size);
                let offset = 0;
                for (const chunk of chunks) {
                    bytes.set(chunk, offset);
                    offset += chunk.byteLength;
                }
                const envelope = this.object(JSON.parse(new TextDecoder().decode(bytes)) as unknown);
                return this.unwrap(envelope);
            }
            catch (error) {
                if (error instanceof SyntaxError)
                    throw new MusicProviderError('INVALID_RESPONSE', 'Provider JSON could not be read.');
                if (error instanceof MusicProviderError)
                    throw error;
                if (attempt === retries)
                    throw new MusicProviderError('UNAVAILABLE', 'Could not reach the configured music provider.');
                await this.delay(250 * (attempt + 1));
            }
            finally {
                clearTimeout(timer);
            }
        }
        throw new MusicProviderError('UNAVAILABLE', 'Music provider unavailable.');
    }
    protected unwrap(envelope: Record<string, unknown>): unknown { if (envelope.success === false || !('data' in envelope))
        throw new MusicProviderError('INVALID_RESPONSE', 'The provider did not return a successful metadata response.'); return envelope.data; }
    public async searchSongs(query: string, limit = 10): Promise<readonly IMusicProviderSong[]> { if (!query.trim())
        return []; return (await this.searchSongsPage({ query, limit })).results; }
    // The compatible deployment's search/playlist pages are one-based. Public app cursors remain zero-based.
    public async searchSongsPage(input: MusicProviderSearch): Promise<MusicProviderPage<IMusicProviderSong>> { const p = this.paging(input), v = this.object(await this.request('/search/songs', { ...p, page: p.page + 1 })); return this.page(v, p.page, p.limit, item => this.song(item)); }
    public async searchResources(kind: MusicResourceKind, input: MusicProviderSearch): Promise<MusicProviderPage<MusicProviderResource>> { if (!['albums', 'artists', 'playlists'].includes(kind))
        throw new MusicProviderError('INVALID_REQUEST', 'Unsupported resource kind.'); const p = this.paging(input), v = this.object(await this.request('/search/' + kind, { ...p, page: p.page + 1 })); return this.page(v, p.page, p.limit, item => this.resource(kind, item)); }
    private page<T>(value: ObjectValue, page: number, limit: number, map: (v: unknown) => T): MusicProviderPage<T> {
        if (!Array.isArray(value.results) || value.results.length > Math.max(limit, 100) || !Number.isSafeInteger(value.total) || (value.total as number) < 0)
            throw new MusicProviderError('INVALID_RESPONSE', 'Invalid provider pagination.');
        // `start` is one-based (1, 11, ...); using it as an offset loses the last item at a page boundary.
        return { results: value.results.map(map), page, total: value.total as number, hasMore: value.results.length > 0 && page * limit + value.results.length < Number(value.total) };
    }
    public async getSongById(songId: string, refresh = false): Promise<IMusicProviderSong | null> {
        const id = this.id(songId);
        let data;
        try {
            data = await this.request('/songs', { ids: id }, refresh);
        }
        catch (error) {
            if (error instanceof MusicProviderError && error.code === 'NOT_FOUND')
                return null;
            throw error;
        }
        if (!Array.isArray(data) || data.length > 1)
            throw new MusicProviderError('INVALID_RESPONSE', 'Invalid song lookup response.');
        if (!data.length)
            return null;
        const song = this.song(data[0]);
        if (song.id !== id)
            throw new MusicProviderError('INVALID_RESPONSE', 'Provider song identity mismatch.');
        return song;
    }
    public async getCollection(kind: MusicResourceKind, id: string, page = 0, limit = 20): Promise<MusicProviderCollection> {
        this.id(id);
        this.paging({ query: id, page, limit });
        if (kind === 'artists') {
            const value = this.object(await this.request('/artists/' + encodeURIComponent(id), {}));
            if (String(value.id) !== id) throw new MusicProviderError('INVALID_RESPONSE', 'Provider collection identity mismatch.');
            // Artist songs use zero-based pages of exactly ten; this endpoint has no limit parameter.
            const offset = page * limit, end = offset + limit, songs: IMusicProviderSong[] = [];
            let total: number | null = null;
            for (let upstreamPage = Math.floor(offset / 10); upstreamPage < Math.ceil(end / 10); upstreamPage++) {
                const data = this.object(await this.request('/artists/' + encodeURIComponent(id) + '/songs', { page: upstreamPage, sortBy: 'popularity', sortOrder: 'desc' }));
                if (!Array.isArray(data.songs) || data.songs.length > 10 || !Number.isSafeInteger(data.total) || Number(data.total) < 0)
                    throw new MusicProviderError('INVALID_RESPONSE', 'Invalid artist song pagination.');
                total = Number(data.total);
                const from = Math.max(0, offset - upstreamPage * 10), to = Math.min(10, end - upstreamPage * 10);
                songs.push(...data.songs.slice(from, to).map(v => this.song(v)));
                if (data.songs.length < 10 || (upstreamPage + 1) * 10 >= total) break;
            }
            return { resource: this.resource(kind, value), songs: { results: songs, page, total, hasMore: songs.length > 0 && total !== null && offset + songs.length < total } };
        }
        if (kind !== 'albums' && kind !== 'playlists')
            throw new MusicProviderError('INVALID_REQUEST', 'Unsupported collection kind.');
        if (kind === 'albums' && page > 0)
            throw new MusicProviderError('UNSUPPORTED', 'The documented album endpoint has no pagination.');
        const value = this.object(await this.request('/' + kind, kind === 'playlists' ? { id, page: page + 1, limit } : { id }));
        if (String(value.id) !== id) throw new MusicProviderError('INVALID_RESPONSE', 'Provider collection identity mismatch.');
        if (!Array.isArray(value.songs) || value.songs.length > 500)
            throw new MusicProviderError('INVALID_RESPONSE', 'Invalid provider collection.');
        // Playlist songCount is the returned page length on the verified deployment, not its total.
        if (kind === 'playlists' && value.songs.length > limit) throw new MusicProviderError('INVALID_RESPONSE', 'Invalid playlist pagination.');
        const total = kind === 'albums' && Number.isSafeInteger(value.songCount) ? Number(value.songCount) : null;
        return { resource: this.resource(kind, value), songs: { results: value.songs.map(v => this.song(v)), page, total, hasMore: kind === 'playlists' && value.songs.length === limit } };
    }
}
