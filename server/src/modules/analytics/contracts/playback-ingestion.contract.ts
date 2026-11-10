/**
 * Authoritative Event Payload for Playback Ingestion
 */
export interface IPlaybackIngestionEvent {
  readonly eventId: string; // Idempotency UUIDv4
  readonly sessionId?: string;
  readonly userId: string;
  readonly trackId: string;
  readonly durationSec: number; // Server-validated genuine accumulated listening time
  readonly trackDurationSec: number; // Authoritative track length from database
  readonly wasSkipped: boolean;
  readonly completed: boolean;
  readonly playbackContext?: string;
  readonly timestamp: number; // Epoch ms of completion or ingestion
}

export type IngestionStatus = 'ACCEPTED' | 'DUPLICATE' | 'REJECTED';

export interface IIngestionResult {
  readonly status: IngestionStatus;
  readonly eventId: string;
  readonly streamId?: string;
  readonly deduplicated: boolean;
  readonly message?: string;
}

/**
 * Service Contract for Ingesting Playback Events
 * Ensures atomic deduplication and zero-loss stream insertion.
 */
export interface IPlaybackIngestionService {
  ingestEvent(event: IPlaybackIngestionEvent): Promise<IIngestionResult>;
  isEventDeduplicated(eventId: string): Promise<boolean>;
}

