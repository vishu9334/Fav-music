import { demoCatalog } from '../catalog/demo-catalog';
import { ShareLinkService } from './share-link.service';
import { CatalogTrackShareSource } from './catalog-track-share.source';
import { catalogClient, catalogRepository } from '../catalog/catalog-runtime';
import { SharedContentLoader } from './shared-content.loader';
export const shareLinks = new ShareLinkService(demoCatalog, undefined, new CatalogTrackShareSource(catalogRepository));

export const sharedContentLoader = new SharedContentLoader(demoCatalog, async (ids, current) => {
  const songs = await catalogRepository.tracks(ids);
  if (!current()) return [];
  await catalogClient.remember(songs);
  return current() ? demoCatalog.tracks(songs.map(song => song.id)) : [];
});
