import { IDatabaseService } from '../../../infrastructure/database/contracts/database.contract.js';
import {
  ITrackMediaEntity,
  ITrackMediaRepository,
} from '../contracts/track-media-repository.contract.js';

/**
 * Prisma Track Media Repository
 * Database queries only, strict repository boundaries.
 */
export class PrismaTrackMediaRepository implements ITrackMediaRepository {
  private readonly databaseService: IDatabaseService;

  public constructor(databaseService: IDatabaseService) {
    this.databaseService = databaseService;
  }

  public async findById(id: string): Promise<ITrackMediaEntity | null> {
    const track = await this.databaseService.getClient().track.findFirst({
      where: { id, publishStatus: 'PUBLISHED', publicStreamingAllowed: true, licenseVerifiedAt: { lte: new Date() }, licenseReference: { not: null },
        OR: [{ licenseExpiresAt: null }, { licenseExpiresAt: { gt: new Date() } }] },
    });
    if (!track || !track.licenseReference?.trim() || !track.licenseAttribution?.trim()) {
      return null;
    }
    return {
      id: track.id,
      title: track.title,
      artistName: track.artistName,
      audioKey: track.audioKey,
      videoKey: track.videoKey,
      artworkKey: track.artworkKey,
      licenseExpiresAt: track.licenseExpiresAt,
    };
  }

  public async findByAudioKey(audioKey: string): Promise<ITrackMediaEntity | null> {
    const track = await this.databaseService.getClient().track.findFirst({
      where: { audioKey, publishStatus: 'PUBLISHED', publicStreamingAllowed: true, licenseVerifiedAt: { lte: new Date() }, licenseReference: { not: null },
        OR: [{ licenseExpiresAt: null }, { licenseExpiresAt: { gt: new Date() } }] },
    });
    if (!track || !track.licenseReference?.trim() || !track.licenseAttribution?.trim()) {
      return null;
    }
    return {
      id: track.id,
      title: track.title,
      artistName: track.artistName,
      audioKey: track.audioKey,
      videoKey: track.videoKey,
      artworkKey: track.artworkKey,
      licenseExpiresAt: track.licenseExpiresAt,
    };
  }
}

