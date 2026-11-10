import { IPlaybackIngestionEvent } from './playback-ingestion.contract.js';

export interface IPersistedListeningLog {
  readonly id: string;
  readonly eventId: string | null;
  readonly userId: string;
  readonly trackId: string;
  readonly playedAt: Date;
  readonly durationSec: number;
  readonly wasSkipped: boolean;
  readonly completed: boolean;
  readonly playbackContext: string | null;
}

export interface IExactTrackDailyMetric {
  readonly id: string;
  readonly date: Date;
  readonly trackId: string;
  readonly playCount: number;
  readonly uniqueListeners: number;
  readonly totalListenSeconds: bigint;
  readonly skipCount: number;
  readonly completionCount: number;
}

export interface IExactDailyPlatformMetric {
  readonly id: string;
  readonly date: Date;
  readonly dauExact: number;
  readonly totalPlays: number;
  readonly totalListenSeconds: bigint;
  readonly uniqueTracksPlayed: number;
  readonly newRegistrations: number;
}

export interface IPersistenceResult {
  readonly persisted: boolean;
  readonly id?: string;
  readonly deduplicated: boolean;
  readonly migrationPending?: boolean;
}

/**
 * Authoritative Durable PostgreSQL Analytics Repository Contract
 */
export interface IPlaybackPersistenceRepository {
  /**
   * Idempotently persists listening log event using eventId.
   * If migration is not yet applied, respects safety guardrails.
   */
  saveListeningLog(event: IPlaybackIngestionEvent): Promise<IPersistenceResult>;

  /**
   * Retrieves exact daily metrics computed from PostgreSQL ledger.
   */
  getExactTrackDailyMetric(date: Date, trackId: string): Promise<IExactTrackDailyMetric | null>;

  getExactDailyPlatformMetric(date: Date): Promise<IExactDailyPlatformMetric | null>;

  /**
   * Safety guardrail check: whether eventId column and unique index are live in PostgreSQL.
   */
  isPersistentIngestionReady(): Promise<boolean>;
}

