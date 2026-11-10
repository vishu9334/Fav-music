import type { AccountLibraryCommit, AccountLibraryData, AccountLibraryReceipt, AccountLibrarySnapshot } from '@aadat/contracts';
export interface IAccountLibraryRepository {
  read(userId: string): Promise<AccountLibrarySnapshot>;
  commit(userId: string, command: AccountLibraryCommit, hash: string): Promise<AccountLibraryReceipt>;
  existingTrackIds(ids: readonly string[]): Promise<readonly string[]>;
}
export const emptyAccountLibrary = (): AccountLibraryData => ({version:2, likes:[], favourites:[], bookmarks:[], warehouse:[], playlists:[], warehouseStates:[], instamus:[], history:[]});
