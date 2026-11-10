import { WarehouseStatus } from '@aadat/contracts';

export const COLLECTIONS = ['likes', 'favourites', 'bookmarks', 'warehouse'] as const;
export type CollectionKind = typeof COLLECTIONS[number];
export interface LocalPlaylist { readonly id: string; readonly name: string; readonly trackIds: readonly string[] }
export interface WarehouseTrackState { readonly trackId: string; readonly status: WarehouseStatus }
export interface InstaMusNote { readonly reelUrl: string; readonly query: string; readonly trackId: string | null }
export interface LocalLibrary {
  readonly guestImportCompleted?: true;
  readonly history?: readonly { readonly trackId: string; readonly playedAt: number }[];
  readonly version: 2;
  readonly likes: readonly string[];
  readonly favourites: readonly string[];
  readonly bookmarks: readonly string[];
  readonly warehouse: readonly string[];
  readonly playlists: readonly LocalPlaylist[];
  readonly warehouseStates: readonly WarehouseTrackState[];
  readonly instamus: readonly InstaMusNote[];
}
export interface ILibraryRepository { load(): Promise<unknown | null>; save(data: LocalLibrary): Promise<void>; synchronize?(resolution?: 'local' | 'remote'): Promise<LocalLibrary>; syncStatus?(): LibrarySyncState }
export interface IDocumentStorage { read(name: string): Promise<string | null>; write(name: string, value: string): Promise<void> }
export function emptyLibrary(): LocalLibrary { return { version: 2, likes: [], favourites: [], bookmarks: [], warehouse: [], playlists: [], warehouseStates: [], instamus: [] }; }

export interface LibrarySyncState {
 readonly status: 'blocked' | 'pending' | 'syncing' | 'synced' | 'offline' | 'conflict';
 readonly message: string;
 readonly revision: number;
}
