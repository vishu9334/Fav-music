export interface IMusicProviderSong {
    readonly id: string;
    readonly title: string;
    readonly artist: string;
    readonly album?: string;
    readonly albumId?: string;
    readonly artistIds?: readonly string[];
    readonly durationSeconds: number;
    readonly releaseYear?: number;
    readonly copyright?: string;
    readonly audioUrl?: string;
    readonly artworkUrl?: string;
    readonly providerUrl?: string;
}
export interface MusicProviderPage<T> {
    readonly results: readonly T[];
    readonly page: number;
    readonly total: number | null;
    readonly hasMore: boolean;
}
export interface MusicProviderSearch {
    readonly query: string;
    readonly page?: number;
    readonly limit?: number;
}
export type MusicResourceKind = 'albums' | 'artists' | 'playlists';
export interface MusicProviderResource {
    readonly id: string;
    readonly kind: MusicResourceKind;
    readonly name: string;
    readonly artworkUrl?: string;
    readonly releaseYear?: number;
    readonly providerUrl?: string;
}
export interface MusicProviderCollection {
    readonly resource: MusicProviderResource;
    readonly songs: MusicProviderPage<IMusicProviderSong>;
}
/** Provider-native references are confined to this boundary. No extraction, DRM decryption, bulk export or S3 copy. */
export interface IMusicProviderService {
    readonly providerId: string;
    readonly resourceKinds: readonly MusicResourceKind[];
    readonly remotePagination: boolean;
    searchSongs(query: string, limit?: number): Promise<readonly IMusicProviderSong[]>;
    searchSongsPage(input: MusicProviderSearch): Promise<MusicProviderPage<IMusicProviderSong>>;
    searchResources(kind: MusicResourceKind, input: MusicProviderSearch): Promise<MusicProviderPage<MusicProviderResource>>;
    getSongById(songId: string, refresh?: boolean): Promise<IMusicProviderSong | null>;
    getCollection(kind: MusicResourceKind, id: string, page?: number, limit?: number): Promise<MusicProviderCollection>;
}
export type MusicProviderErrorCode = 'ACCESS_DENIED' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'INVALID_RESPONSE' | 'INVALID_REQUEST' | 'NOT_FOUND' | 'UNSUPPORTED';
export class MusicProviderError extends Error {
    constructor(public readonly code: MusicProviderErrorCode, message: string, public readonly status?: number) { super(message); this.name = 'MusicProviderError'; }
}
