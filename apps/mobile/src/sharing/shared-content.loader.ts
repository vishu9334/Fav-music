import type { IPlayableTrack } from '../data/sample-tracks';
import type { DemoCatalog } from '../catalog/demo-catalog';
import { isCatalogId } from '../catalog/catalog-api';
import type { SharedContent } from './share-link.service';
export interface SharedReviewData { readonly ids: readonly string[]; readonly tracks: readonly IPlayableTrack[]; readonly unavailable: number }

/** Resolve only references, never URLs supplied by a sender; no playback/save side effects. */
export class SharedContentLoader {
  public constructor(private readonly registry: DemoCatalog,
    private readonly lookup: (ids: readonly string[], current: () => boolean) => Promise<readonly IPlayableTrack[]>) {}
  public async load(content: SharedContent, current: () => boolean = () => true): Promise<SharedReviewData | null> {
    const ids = content.type === 'track' ? [content.id] : [...content.ids];
    const remoteIds = ids.filter(isCatalogId), found = new Map<string, IPlayableTrack>();
    for (const id of ids.filter(id => !isCatalogId(id))) { const track = this.registry.get(id); if (track) found.set(id, track); }
    for (let start = 0; start < remoteIds.length; start += 50) {
      if (!current()) return null;
      const batch = remoteIds.slice(start, start + 50), tracks = await this.lookup(batch, current);
      if (!current()) return null;
      for (const track of tracks) {
        if (!batch.includes(track.id) || found.has(track.id)) throw new Error('Shared song identity could not be verified.');
        found.set(track.id, track);
      }
    }
    if (!current()) return null;
    const tracks = ids.flatMap(id => found.has(id) ? [found.get(id)!] : []);
    return { ids: ids.filter(id => isCatalogId(id) || found.has(id)), tracks, unavailable: ids.length - tracks.length };
  }
}
