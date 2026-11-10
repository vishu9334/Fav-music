export const SONG_NOT_FOUND = 'Sorry, this song was not found.';
/** An empty cache, pending/failed request or unfinished page is not a negative match. */
export function noSongMatchMessage(query: string, loadedQuery: string, status: string, resultCount: number, hasMore: boolean): string | null {
  return query.trim() && query.trim() === loadedQuery.trim() && status === 'ready' && resultCount === 0 && !hasMore ? SONG_NOT_FOUND : null;
}
