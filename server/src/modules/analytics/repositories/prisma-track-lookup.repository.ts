import { IDatabaseService } from '../../../infrastructure/database/contracts/database.contract.js';
import {
  ITrackLookupEntity,
  ITrackLookupRepository,
} from '../contracts/track-lookup-repository.contract.js';

export class PrismaTrackLookupRepository implements ITrackLookupRepository {
  private readonly databaseService: IDatabaseService;

  public constructor(databaseService: IDatabaseService) {
    this.databaseService = databaseService;
  }

  public async findById(id: string): Promise<ITrackLookupEntity | null> {
    const track = await this.databaseService.getClient().track.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        artistName: true,
        durationSeconds: true,
        publishStatus: true,
      },
    });

    if (!track) {
      return null;
    }

    return {
      id: track.id,
      title: track.title,
      artistName: track.artistName,
      durationSeconds: track.durationSeconds,
      publishStatus: track.publishStatus,
    };
  }
}

