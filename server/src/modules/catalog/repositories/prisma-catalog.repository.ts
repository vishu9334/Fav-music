import type { Prisma, Track } from '../../../generated/prisma/client.js';
import type { IDatabaseService } from '../../../infrastructure/database/contracts/database.contract.js';
import type { CatalogEntity, CatalogReadQuery, ICatalogRepository } from '../contracts/catalog.contract.js';

export class PrismaCatalogRepository implements ICatalogRepository {
  public constructor(private readonly database: IDatabaseService) {}
  public async page(input: CatalogReadQuery, now: Date): Promise<readonly CatalogEntity[]> {
    const AND: Prisma.TrackWhereInput[] = [
      { publishStatus: 'PUBLISHED', publicStreamingAllowed: true, licenseVerifiedAt: { lte: now }, licenseReference: { not: null }, licenseAttribution: { not: null },
        OR: [{ licenseExpiresAt: null }, { licenseExpiresAt: { gt: now } }] },
    ];
    if (input.lastId) AND.push({ id: { gt: input.lastId } });
    for (const term of (input.query ?? '').split(/\s+/).filter(Boolean)) AND.push({ OR: [
      { title: { contains: term, mode: 'insensitive' } }, { artistName: { contains: term, mode: 'insensitive' } }, { albumName: { contains: term, mode: 'insensitive' } },
    ] });
    if (input.hasVideo !== undefined) AND.push({videoKey:input.hasVideo ? {not:null} : null});
    if (input.mood) AND.push({ moodTags: { has: input.mood } });
    if (input.season) AND.push({ seasonAffinities: { has: input.season as 'SPRING' | 'SUMMER' | 'MONSOON' | 'AUTUMN' | 'WINTER' } });
    if (input.undated) AND.push({ releaseYear: null });
    else if (input.yearFrom !== undefined || input.yearTo !== undefined) AND.push({ releaseYear: { gte: input.yearFrom, lte: input.yearTo } });
    const tracks = await this.database.getClient().track.findMany({ where: { AND }, orderBy: { id: 'asc' }, take: input.first + 1 });
    return tracks.map((track) => this.entity(track));
  }
  public async find(id: string): Promise<CatalogEntity | null> {
    const track = await this.database.getClient().track.findUnique({ where: { id } }); return track ? this.entity(track) : null;
  }
  public async findMany(ids: readonly string[]): Promise<readonly CatalogEntity[]> {
    return (await this.database.getClient().track.findMany({ where: { id: { in: [...ids] } } })).map((track) => this.entity(track));
  }
  private entity(track: Track): CatalogEntity {
    return { id: track.id, title: track.title, artistName: track.artistName, albumName: track.albumName,
      durationSeconds: track.durationSeconds, releaseYear: track.releaseYear, attribution: track.licenseAttribution ?? '',
      hasVideo: !!track.videoKey, moods: track.moodTags, timeAffinities: track.timeAffinities, seasonAffinities: track.seasonAffinities,
      weatherAffinities: track.weatherAffinities, energyScore: track.energyScore, tempoBpm: track.tempoBpm,
      publicStreamingAllowed: track.publicStreamingAllowed,
      audioKey: track.audioKey, videoKey: track.videoKey, artworkKey: track.artworkKey, publishStatus: track.publishStatus,
      licenseReference: track.licenseReference, licenseVerifiedAt: track.licenseVerifiedAt, licenseExpiresAt: track.licenseExpiresAt };
  }
}
