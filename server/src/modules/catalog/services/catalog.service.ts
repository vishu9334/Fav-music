import { createHash } from 'node:crypto';
import { CATALOG_MOODS, CatalogMediaKind, CatalogMediaLease, CatalogPage, CatalogQuery } from '@aadat/contracts';
import { IS3StorageService } from '../../../infrastructure/storage/contracts/storage.contract.js';
import { DomainError, NotFoundError, ValidationFailedError } from '../../../shared/errors/domain.error.js';
import { CatalogEntity, ICatalogRepository, ICatalogService } from '../contracts/catalog.contract.js';

export class CatalogUnavailableError extends DomainError {
  public readonly statusCode = 503; public readonly code = 'CATALOG_UNAVAILABLE';
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class CatalogService implements ICatalogService {
  public constructor(private readonly repository: ICatalogRepository, private readonly storage: IS3StorageService,
    private readonly enabled = false, private readonly now: () => Date = () => new Date()) {}
  private available(): void { if (!this.enabled) throw new CatalogUnavailableError('The licensed catalog is not enabled. Please retry later.'); }
  private eligible(track: CatalogEntity | null, now: Date): track is CatalogEntity {
    return !!track && track.publishStatus === 'PUBLISHED' && track.publicStreamingAllowed && !!track.licenseReference?.trim() && !!track.attribution.trim()
      && !!track.licenseVerifiedAt && track.licenseVerifiedAt <= now && (!track.licenseExpiresAt || track.licenseExpiresAt > now)
      && !!track.title.trim() && track.title.length <= 200 && !!track.artistName.trim() && track.artistName.length <= 200
      && (track.albumName === null || track.albumName.length <= 200) && track.attribution.length <= 2000
      && Number.isInteger(track.durationSeconds) && track.durationSeconds > 0 && track.durationSeconds <= 86400
      && (track.releaseYear === null || (Number.isInteger(track.releaseYear) && track.releaseYear >= 1 && track.releaseYear <= 9999));
  }
  public async page(input: CatalogQuery): Promise<CatalogPage> {
    this.available();
    const query = (input.query ?? '').normalize('NFKC').trim().replace(/\s+/g, ' '), first = input.first ?? 20;
    if (query.length > 160 || query.split(' ').length > 8 || !Number.isInteger(first) || first < 1 || first > 50
      || (input.mood && !(CATALOG_MOODS as readonly string[]).includes(input.mood))
      || (input.season && !['SPRING', 'SUMMER', 'MONSOON', 'AUTUMN', 'WINTER'].includes(input.season))
      || [input.yearFrom, input.yearTo].some((year) => year !== undefined && (!Number.isInteger(year) || year < 1 || year > 9999))
      || (input.yearFrom !== undefined && input.yearTo !== undefined && input.yearFrom > input.yearTo)
      || (input.undated && (input.yearFrom !== undefined || input.yearTo !== undefined))) throw new ValidationFailedError('Invalid catalog filters or page size.');
    const scope = createHash('sha256').update(JSON.stringify([query, input.mood ?? '', input.season ?? '', input.yearFrom ?? null, input.yearTo ?? null, !!input.undated, input.hasVideo ?? null])).digest('hex');
    let lastId: string | undefined;
    if (input.after) {
      try {
        if (input.after.length > 512 || !/^[A-Za-z0-9_-]+$/.test(input.after)) throw new Error();
        const cursor: unknown = JSON.parse(Buffer.from(input.after, 'base64url').toString('utf8'));
        if (!cursor || typeof cursor !== 'object') throw new Error();
        const value = cursor as Record<string, unknown>;
        if (value.v !== 1 || value.scope !== scope || typeof value.last !== 'string' || !UUID.test(value.last)) throw new Error();
        lastId = value.last;
      } catch { throw new ValidationFailedError('Invalid cursor for these catalog filters.'); }
    }
    try {
      const now = this.now(), rows = await this.repository.page({ ...input, query, first, lastId }, now);
      const page = rows.slice(0, first), end = page.at(-1)?.id;
      return { nodes: page.filter((track) => this.eligible(track, now)).map((track) => ({ id: track.id, title: track.title, artistName: track.artistName,
        albumName: track.albumName, durationSeconds: track.durationSeconds, releaseYear: track.releaseYear, attribution: track.attribution,
        hasVideo: track.hasVideo, moods: track.moods, timeAffinities: track.timeAffinities, seasonAffinities: track.seasonAffinities })),
        hasNextPage: rows.length > first, endCursor: end ? Buffer.from(JSON.stringify({ v: 1, scope, last: end })).toString('base64url') : null };
    } catch { throw new CatalogUnavailableError('Catalog metadata is unavailable. Please retry later.'); }
  }
  public async track(id: string): Promise<CatalogEntity | null> {
    this.available(); if (!UUID.test(id)) return null;
    try { const track = await this.repository.find(id); return this.eligible(track, this.now()) ? track : null; }
    catch { throw new CatalogUnavailableError('Catalog metadata is unavailable. Please retry.'); }
  }
  public async media(ids: readonly string[], kind: CatalogMediaKind): Promise<readonly CatalogMediaLease[]> {
    this.available();
    if (!['AUDIO', 'VIDEO', 'ARTWORK'].includes(kind) || !ids.length || ids.length > 50 || ids.some((id) => !UUID.test(id))) throw new ValidationFailedError('Invalid catalog media request.');
    const result: CatalogMediaLease[] = [], unique = [...new Set(ids)];
    let tracks: readonly CatalogEntity[];
    try { tracks = await this.repository.findMany(unique); } catch { throw new CatalogUnavailableError('Catalog metadata is unavailable.'); }
    const byId = new Map(tracks.map((track) => [track.id, track]));
    // At most four concurrent lookups/signatures, independent of GraphQL aliases.
    for (let start = 0; start < unique.length; start += 4) {
      result.push(...await Promise.all(unique.slice(start, start + 4).map(async (id) => {
        const track = byId.get(id) ?? null; if (!this.eligible(track, this.now())) throw new NotFoundError('This published, licensed track is unavailable.');
        const key = kind === 'AUDIO' ? track.audioKey : kind === 'VIDEO' ? track.videoKey : track.artworkKey;
        const prefix = kind === 'AUDIO' ? 'tracks/audio/' : kind === 'VIDEO' ? 'tracks/video/' : 'tracks/art/';
        if (!key || !key.startsWith(prefix) || key.includes('..') || /[\\\u0000-\u001f]/.test(key) || key.includes('://')) throw new NotFoundError('The requested media is unavailable.');
        const issued = this.now(), expiresInSeconds = Math.min(300, track.licenseExpiresAt ? Math.floor((track.licenseExpiresAt.getTime() - issued.getTime()) / 1000) : 300);
        if (expiresInSeconds < 1) throw new NotFoundError('The media license has expired.');
        let url: string;
        try { url = await this.storage.getPresignedDownloadUrl(key, expiresInSeconds); const parsed = new URL(url);
          if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error(); }
        catch { throw new CatalogUnavailableError('Secure media signing is unavailable.'); }
        return { trackId: id, kind, url, issuedAt: issued.toISOString(), expiresAt: new Date(issued.getTime() + expiresInSeconds * 1000).toISOString(), expiresInSeconds };
      })));
    }
    return result;
  }
}
