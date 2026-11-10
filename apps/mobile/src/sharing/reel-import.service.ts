import type { IPlayableTrack } from '../data/sample-tracks';
import type { InstaMusNote } from '../library/library.contract';
import { CollectionScopeGuard } from '../library/scope-guard';
import { musicText, uniqueTracks } from '../catalog/unique-tracks';
import type { IncomingReelShare } from './incoming-share';

interface ReelLibrary {
  scopeVersion: number; status: string; data: { instamus: readonly InstaMusNote[] };
  saveInstaMus(reel: string, query: string, trackId: string | null): Promise<boolean>;
}
export type ReelImportResult = 'matched' | 'saved' | 'failed' | 'stale';

/** Save first. A caption must contain one exact title AND artist to link automatically. */
export async function importReelShare(share: IncomingReelShare, current: () => ReelLibrary,
  search: (query: string) => Promise<readonly IPlayableTrack[]>): Promise<ReelImportResult> {
  const guard = new CollectionScopeGuard(current);
  if (!guard.valid()) return 'stale';
  const existing = current().data.instamus.find(note => note.reelUrl === share.reelUrl);
  if (existing?.trackId) return 'matched';
  const query = existing?.query || share.metadata || '';
  if ((!existing || existing.query !== query) && !await guard.run(() => current().saveInstaMus(share.reelUrl, query, null))) {
    return guard.valid() ? 'failed' : 'stale';
  }
  if (!guard.valid()) return 'stale';
  if (!query) return 'saved';
  try {
    const tracks = await search(query);
    if (!guard.valid()) return 'stale';
    // A manual edit/removal while search was running takes precedence.
    const note = current().data.instamus.find(note => note.reelUrl === share.reelUrl);
    if (!note || note.query !== query || note.trackId) return note?.trackId ? 'matched' : 'saved';
    const caption = ` ${musicText(query)} `;
    const matches = uniqueTracks(tracks).filter(track => track.catalogSource === 'catalog'
      && musicText(track.title) && musicText(track.artist)
      && caption.includes(` ${musicText(track.title)} `) && caption.includes(` ${musicText(track.artist)} `));
    if (matches.length !== 1) return 'saved';
    const saved = await guard.run(() => current().saveInstaMus(share.reelUrl, query, matches[0]!.id));
    return !guard.valid() ? 'stale' : saved ? 'matched' : 'failed';
  } catch { return guard.valid() ? 'saved' : 'stale'; }
}
