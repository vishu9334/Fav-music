export const CATALOG_MOODS = ['Calm', 'Focus', 'Happy', 'Energy', 'Reflective'] as const;
export type CatalogMood = typeof CATALOG_MOODS[number];
export type CatalogMediaKind = 'AUDIO' | 'VIDEO' | 'ARTWORK';
export interface CatalogQuery {
  readonly query?: string; readonly first?: number; readonly after?: string;
  readonly mood?: string; readonly season?: string; readonly yearFrom?: number; readonly yearTo?: number; readonly undated?: boolean; readonly hasVideo?: boolean;
}
export interface CatalogSong {
  readonly id: string; readonly title: string; readonly artistName: string; readonly albumName: string | null;
  readonly durationSeconds: number; readonly releaseYear: number | null; readonly attribution: string;
  readonly discoveryBasis?:'TITLE_ALBUM_KEYWORDS'; readonly sourceLabel?:string; readonly developmentOnly?:boolean;
  /** Stable public song page; never a playback lease or signed media URL. */
  readonly shareUrl?: string | null;
  readonly hasVideo: boolean; readonly moods: readonly string[]; readonly timeAffinities: readonly string[];
  readonly seasonAffinities: readonly string[];
  readonly weatherAffinities?: readonly string[];
}
export interface CatalogPage { readonly nodes: readonly CatalogSong[]; readonly endCursor: string | null; readonly hasNextPage: boolean }
export interface CatalogMediaLease {
  readonly trackId: string; readonly kind: CatalogMediaKind; readonly url: string;
  readonly issuedAt: string; readonly expiresAt: string | null; readonly expiresInSeconds: number | null; readonly refreshAfterSeconds?:number;
}

export type CatalogResourceKind='albums'|'artists'|'playlists';
export interface CatalogResource{readonly id:string;readonly kind:CatalogResourceKind;readonly name:string;readonly artworkUrl:string|null;readonly releaseYear:number|null;readonly sourceLabel:string}
export interface CatalogResourcePage{readonly nodes:readonly CatalogResource[];readonly page:number;readonly total:number|null;readonly hasMore:boolean}
export interface CatalogCollection{readonly resource:CatalogResource;readonly nodes:readonly CatalogSong[];readonly page:number;readonly total:number|null;readonly hasMore:boolean}

export interface CatalogProviderInfo{readonly sourceLabel:string;readonly developmentOnly:boolean;readonly resourceKinds:readonly CatalogResourceKind[];readonly remotePagination:boolean;readonly videoSupported:boolean;readonly recognitionSupported:boolean}
