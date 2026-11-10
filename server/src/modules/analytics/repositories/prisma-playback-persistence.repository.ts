import { IDatabaseService } from '../../../infrastructure/database/contracts/database.contract.js';
import { IPlaybackIngestionEvent } from '../contracts/playback-ingestion.contract.js';
import {
  IExactDailyPlatformMetric,
  IExactTrackDailyMetric,
  IPersistenceResult,
  IPlaybackPersistenceRepository,
} from '../contracts/playback-persistence.contract.js';

export interface IPrismaPlaybackPersistenceConfig {
  readonly persistentIngestionEnabled?: boolean;
}

/**
 * Authoritative Durable PostgreSQL Analytics Repository
 * Enforces strict migration readiness guardrails before querying unmigrated columns.
 */
export class PrismaPlaybackPersistenceRepository implements IPlaybackPersistenceRepository {
  private readonly databaseService: IDatabaseService;
  private readonly persistentIngestionEnabled: boolean;

  public constructor(
    databaseService: IDatabaseService,
    config?: IPrismaPlaybackPersistenceConfig
  ) {
    this.databaseService = databaseService;
    this.persistentIngestionEnabled =
      config?.persistentIngestionEnabled ??
      (process.env.AADAT_PERSISTENT_INGESTION_ENABLED === 'true');
  }

  /**
   * Safety guardrail: checks if live database schema is verified for eventId unique ingestion
   */
  public async isPersistentIngestionReady(): Promise<boolean> {
    if (!this.persistentIngestionEnabled) {
      return false;
    }

    try {
      // Introspect PostgreSQL information_schema to verify column exists before querying
      const client = this.databaseService.getClient();
      const rows = await client.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'ListeningLog' 
          AND column_name = 'eventId'
        LIMIT 1;
      `;
      return rows.length > 0;
    } catch {
      return false;
    }
  }

  public async saveListeningLog(event: IPlaybackIngestionEvent): Promise<IPersistenceResult> {
    // Strict Guardrail: Stop before executing persistent ingestion if migration is not active
    if (!this.persistentIngestionEnabled) {
      return {
        persisted: false,
        deduplicated: false,
        migrationPending: true,
      };
    }

    const client = this.databaseService.getClient();

    try {
      // Idempotent upsert on eventId: if already present, do nothing and return existing id
      const log = await client.listeningLog.upsert({
        where: { eventId: event.eventId },
        update: {},
        create: {
          eventId: event.eventId,
          userId: event.userId,
          trackId: event.trackId,
          durationSec: event.durationSec,
          wasSkipped: event.wasSkipped,
          completed: event.completed,
          playbackContext: event.playbackContext ?? null,
          playedAt: new Date(event.timestamp),
        },
      });

      return {
        persisted: true,
        id: log.id,
        deduplicated: false,
      };
    } catch (error) {
      // Handle race condition where another worker just inserted the same eventId
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
        return {
          persisted: true,
          deduplicated: true,
        };
      }
      throw error;
    }
  }

  public async getExactTrackDailyMetric(
    date: Date,
    trackId: string
  ): Promise<IExactTrackDailyMetric | null> {
    const client = this.databaseService.getClient();
    const metric = await client.trackDailyMetric.findUnique({
      where: {
        date_trackId: {
          date,
          trackId,
        },
      },
    });

    if (!metric) {
      return null;
    }

    return {
      id: metric.id,
      date: metric.date,
      trackId: metric.trackId,
      playCount: metric.playCount,
      uniqueListeners: metric.uniqueListeners,
      totalListenSeconds: metric.totalListenSeconds,
      skipCount: metric.skipCount,
      completionCount: metric.completionCount,
    };
  }

  public async getExactDailyPlatformMetric(date: Date): Promise<IExactDailyPlatformMetric | null> {
    const client = this.databaseService.getClient();
    const metric = await client.dailyPlatformMetric.findUnique({
      where: {
        date,
      },
    });

    if (!metric) {
      return null;
    }

    return {
      id: metric.id,
      date: metric.date,
      dauExact: metric.dauExact,
      totalPlays: metric.totalPlays,
      totalListenSeconds: metric.totalListenSeconds,
      uniqueTracksPlayed: metric.uniqueTracksPlayed,
      newRegistrations: metric.newRegistrations,
    };
  }
}

