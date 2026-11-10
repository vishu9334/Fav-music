import { ProviderDiscoveryRules } from './provider-discovery.rules.js';
import { createHash } from 'node:crypto';
import type { CatalogSong, CatalogPage, CatalogQuery, CatalogMediaKind, CatalogMediaLease, CatalogResource, CatalogResourceKind, CatalogResourcePage, CatalogCollection } from '@aadat/contracts';
import type { IMusicProviderService, IMusicProviderSong, MusicProviderResource } from '../../../infrastructure/music-provider/contracts/music-provider.contract.js';
import { MusicProviderError } from '../../../infrastructure/music-provider/contracts/music-provider.contract.js';
import type { IProviderIdentityRepository } from '../../../infrastructure/music-provider/contracts/provider-identity.contract.js';
import { DomainError, NotFoundError, ValidationFailedError } from '../../../shared/errors/domain.error.js';
import type { ICatalogService } from '../contracts/catalog.contract.js';
export class ProviderCatalogError extends DomainError {
    readonly statusCode = 503;
    readonly code = 'MUSIC_PROVIDER_UNAVAILABLE';
}
/** Development provider projection. Does not publish records, assert licensing or copy remote media into S3. */
export class ProviderCatalogService implements ICatalogService {
    constructor(private readonly provider: IMusicProviderService, private readonly identities: IProviderIdentityRepository, private readonly now: () => Date = () => new Date(), private readonly discoveryQuery = 'Aadat') { }
    public providerInfo() { return { sourceLabel: 'JioSaavn · development provider', developmentOnly: true, resourceKinds: this.provider.resourceKinds, remotePagination: this.provider.remotePagination, videoSupported: false, recognitionSupported: false }; }
    private async call<T>(action: () => Promise<T>): Promise<T> { try {
        return await action();
    }
    catch (error) {
        if (error instanceof DomainError)
            throw error;
        throw new ProviderCatalogError(error instanceof MusicProviderError ? `${error.code}: ${error.message}` : 'The development music provider is unavailable.');
    } }
    private async song(song: IMusicProviderSong): Promise<CatalogSong> {
        const id = await this.identities.remember({ provider: this.provider.providerId, kind: 'song', externalId: song.id });
        // Only explicit title/album keywords produce derived tags. Missing years and video stay unavailable.
        return { id, title: song.title, artistName: song.artist, shareUrl: song.providerUrl ?? null, albumName: song.album ?? null, durationSeconds: song.durationSeconds, releaseYear: song.releaseYear ?? null,
            attribution: song.copyright ?? `${this.provider.providerId} development catalog. Distribution rights are not verified.`, hasVideo: false, ...ProviderDiscoveryRules.tags(song.title, song.album), discoveryBasis: 'TITLE_ALBUM_KEYWORDS', sourceLabel: 'JioSaavn · development provider', developmentOnly: true };
    }
    private async resource(value: MusicProviderResource): Promise<CatalogResource> { return { id: await this.identities.remember({ provider: this.provider.providerId, kind: value.kind, externalId: value.id }), kind: value.kind, name: value.name, artworkUrl: value.artworkUrl ?? null, releaseYear: value.releaseYear ?? null, sourceLabel: 'JioSaavn · development provider' }; }
    public page(input: CatalogQuery): Promise<CatalogPage> {
        return this.call(async () => {
            const first = input.first ?? 20, query = input.query?.trim() || ProviderDiscoveryRules.query(input.mood, input.season) || this.discoveryQuery;
            if (!Number.isInteger(first) || first < 1 || first > 50 || query.length > 160 || [input.yearFrom, input.yearTo].some(y => y !== undefined && (!Number.isInteger(y) || y < 1 || y > 9999)) || input.yearFrom !== undefined && input.yearTo !== undefined && input.yearFrom > input.yearTo)
                throw new ValidationFailedError('Invalid catalog filters.');
            const scope = createHash('sha256').update(JSON.stringify([query, first, input.mood ?? null, input.season ?? null, input.yearFrom ?? null, input.yearTo ?? null, !!input.undated, input.hasVideo ?? null])).digest('hex');
            let page = 0;
            if (input.after) {
                try {
                    if (input.after.length > 512)
                        throw new Error();
                    const cursor = JSON.parse(Buffer.from(input.after, 'base64url').toString()) as {
                        scope: string;
                        page: number;
                    };
                    if (cursor.scope !== scope || !Number.isInteger(cursor.page) || cursor.page < 1 || cursor.page > 10000)
                        throw new Error();
                    page = cursor.page;
                }
                catch {
                    throw new ValidationFailedError('This cursor belongs to another catalog query.');
                }
            }
            const result = await this.provider.searchSongsPage({ query, page, limit: first }), songs = await Promise.all(result.results.map(song => this.song(song)));
            const normSeason = input.season ? input.season.toUpperCase() : undefined;
            const nodes = songs.filter(song => (!input.hasVideo || song.hasVideo) && (!input.mood || song.moods.includes(input.mood)) && (!normSeason || song.seasonAffinities.includes(normSeason) || song.seasonAffinities.includes(input.season!) || !input.query)
                && (input.undated ? song.releaseYear === null : (input.yearFrom === undefined || song.releaseYear !== null && song.releaseYear >= input.yearFrom) && (input.yearTo === undefined || song.releaseYear !== null && song.releaseYear <= input.yearTo)));
            return { nodes, hasNextPage: result.hasMore, endCursor: result.hasMore ? Buffer.from(JSON.stringify({ scope, page: page + 1 })).toString('base64url') : null };
        });
    }
    public track(id: string): Promise<CatalogSong | null> { return this.call(async () => { const ref = await this.identities.find(id); if (!ref || ref.kind !== 'song' || ref.provider !== this.provider.providerId)
        return null; const song = await this.provider.getSongById(ref.externalId); return song ? this.song(song) : null; }); }
    public media(ids: readonly string[], kind: CatalogMediaKind): Promise<readonly CatalogMediaLease[]> {
        return this.call(async () => {
            if (!ids.length || ids.length > 50 || new Set(ids).size !== ids.length || !['AUDIO', 'ARTWORK', 'VIDEO'].includes(kind))
                throw new ValidationFailedError('Invalid media request.');
            if (kind === 'VIDEO')
                throw new NotFoundError('This provider does not expose verified video streams.');
            const result: CatalogMediaLease[] = [];
            // Bounded concurrency respects the upstream request budget and low-end clients.
            for (let start = 0; start < ids.length; start += 3)
                result.push(...await Promise.all(ids.slice(start, start + 3).map(async (id) => {
                    const ref = await this.identities.find(id);
                    if (!ref || ref.kind !== 'song' || ref.provider !== this.provider.providerId)
                        throw new NotFoundError('Unknown catalog reference.');
                    const song = await this.provider.getSongById(ref.externalId, kind === 'AUDIO'), url = kind === 'AUDIO' ? song?.audioUrl : song?.artworkUrl;
                    if (!url)
                        throw new NotFoundError('The provider has no accessible source for this song.');
                    // The API does not publish expiry. This is an explicit client refresh policy, not a fabricated provider lifetime.
                    return { trackId: id, kind, url, issuedAt: this.now().toISOString(), expiresAt: null, expiresInSeconds: null, refreshAfterSeconds: 120 };
                })));
            return result;
        });
    }
    public resources(kind: CatalogResourceKind, query: string, page = 0, first = 20): Promise<CatalogResourcePage> { return this.call(async () => { const result = await this.provider.searchResources(kind, { query, page, limit: first }); return { nodes: await Promise.all(result.results.map(r => this.resource(r))), page: result.page, total: result.total, hasMore: result.hasMore }; }); }
    public collection(id: string, page = 0, first = 20): Promise<CatalogCollection> { return this.call(async () => { const ref = await this.identities.find(id); if (!ref || ref.kind === 'song' || ref.provider !== this.provider.providerId)
        throw new NotFoundError('Unknown catalog collection.'); const result = await this.provider.getCollection(ref.kind, ref.externalId, page, first); return { resource: await this.resource(result.resource), nodes: await Promise.all(result.songs.results.map(song => this.song(song))), page: result.songs.page, total: result.songs.total, hasMore: result.songs.hasMore }; }); }
}
