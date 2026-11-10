import type { CatalogTrackPage } from '../catalog/catalog-api';
import type { ITrackShareSource, TrackShareMetadata } from './share-link.service';

/** Fresh authenticated metadata confirms identity and availability before the share sheet. */
export class CatalogTrackShareSource implements ITrackShareSource {
  public constructor(private readonly repository: { trackPage(id: string): Promise<CatalogTrackPage | null> }) {}
  public async resolve(id: string): Promise<TrackShareMetadata | null> {
    const track = await this.repository.trackPage(id);
    if (!track) return null;
    return { id: track.id, title: track.title, artist: track.artistName, shareUrl: track.shareUrl };
  }
}
