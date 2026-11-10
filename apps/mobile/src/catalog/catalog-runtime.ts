import { demoCatalog } from './demo-catalog';
import { GraphQLCatalogRepository } from './graphql-catalog.repository';
import { CatalogMetadataCache } from './catalog-cache';
import { CatalogClientService } from './catalog-client.service';
import { MediaLeaseService } from './media-lease.service';
import type { IPlayableTrack } from '../data/sample-tracks';

export const catalogEnabled = () => process.env.EXPO_PUBLIC_CATALOG_ENABLED === 'true';
export const catalogRepository = new GraphQLCatalogRepository(() => {
  if (!catalogEnabled()) throw new Error('The music catalog is not configured.');
  return process.env.EXPO_PUBLIC_GRAPHQL_ENDPOINT ?? '';
});
export const catalogClient = new CatalogClientService(catalogRepository, demoCatalog, new CatalogMetadataCache());
export const mediaLeases = new MediaLeaseService(catalogRepository);
export async function resolveCatalogTracks(tracks: readonly IPlayableTrack[], force = false): Promise<readonly IPlayableTrack[]> {
  const ids = tracks.filter((track) => track.catalogSource === 'catalog').map((track) => track.id);
  if (!ids.length) {
    if (tracks.some((track) => track.catalogSource === 'local')) return Promise.all(tracks.map(async (track) => track.catalogSource === 'local' ? (await import('./offline-samples')).resolveOfflineTrack(track) : track));
    return tracks;
  }
  const audio = await mediaLeases.resolve(ids, 'AUDIO', force);
  let artwork: ReadonlyMap<string, string> = new Map();
  try { artwork = await mediaLeases.resolve(ids, 'ARTWORK', force); } catch { /* A missing thumbnail must not block authorized audio. */ }
  return Promise.all(tracks.map(async (track) => track.catalogSource === 'catalog' ? { ...track, url: audio.get(track.id)!, artwork: artwork.get(track.id) ?? '' }
    : track.catalogSource === 'local' ? (await import('./offline-samples')).resolveOfflineTrack(track) : track));
}
