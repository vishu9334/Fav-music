import type { CatalogMediaKind, CatalogMediaLease, CatalogPage, CatalogQuery, CatalogSong } from '@aadat/contracts';
export interface ICatalogRepository {
  page(query: CatalogQuery, signal?: AbortSignal): Promise<CatalogPage>;
  media(ids: readonly string[], kind: CatalogMediaKind): Promise<readonly CatalogMediaLease[]>;
  tracks(ids: readonly string[]): Promise<readonly CatalogSong[]>;
}
export interface CatalogTrackPage { readonly id: string; readonly title: string; readonly artistName: string; readonly shareUrl: string | null }
export const isCatalogId = (id: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export function secureCatalogUrl(uri: string): string {
  if (uri.length > 8192 || /[\s\\\u0000-\u001f\u007f<>"`]/.test(uri)
    || !/^https:\/\/(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}(?::443)?\/[^\s]*$/.test(uri)) throw new Error('A secure catalog endpoint or media URL is required.');
  return uri;
}
export function validateSong(value: unknown): CatalogSong {
  if (!value || typeof value !== 'object') throw new Error('Invalid catalog metadata.');
  const data = value as Record<string, unknown>;
  const text = (key: string, max: number) => typeof data[key] === 'string' && !!(data[key] as string).trim() && (data[key] as string).length <= max;
  if (!text('id', 36) || !isCatalogId(data.id as string) || !text('title', 200) || !text('artistName', 200) || !text('attribution', 2000)
    || !(data.albumName === null || (typeof data.albumName === 'string' && data.albumName.length <= 200))
    || typeof data.durationSeconds !== 'number' || !Number.isInteger(data.durationSeconds) || data.durationSeconds < 1 || data.durationSeconds > 86400
    || !(data.releaseYear === null || (typeof data.releaseYear === 'number' && Number.isInteger(data.releaseYear) && data.releaseYear >= 1 && data.releaseYear <= 9999))
    || typeof data.hasVideo !== 'boolean' || ['moods', 'timeAffinities', 'seasonAffinities'].some((key) => !Array.isArray(data[key]) || (data[key] as unknown[]).length > 20 || !(data[key] as unknown[]).every((item) => typeof item === 'string' && item.length <= 40))) throw new Error('Invalid catalog metadata.');
  return { id: data.id as string, title: data.title as string, artistName: data.artistName as string, albumName: data.albumName as string | null,
    attribution: data.attribution as string, durationSeconds: data.durationSeconds, releaseYear: data.releaseYear as number | null,
    ...(data.discoveryBasis==='TITLE_ALBUM_KEYWORDS'?{discoveryBasis:'TITLE_ALBUM_KEYWORDS' as const}:{}),...(typeof data.sourceLabel==='string'&&data.sourceLabel.length<=200?{sourceLabel:data.sourceLabel}:{}),...(typeof data.developmentOnly==='boolean'?{developmentOnly:data.developmentOnly}:{}),
    hasVideo: data.hasVideo, moods: data.moods as string[], timeAffinities: data.timeAffinities as string[], seasonAffinities: data.seasonAffinities as string[] };
}
