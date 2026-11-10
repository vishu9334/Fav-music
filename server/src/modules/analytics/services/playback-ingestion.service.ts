import { ICacheService } from '../../../infrastructure/cache/contracts/cache.contract.js';
import {
  IIngestionResult,
  IPlaybackIngestionEvent,
  IPlaybackIngestionService,
} from '../contracts/playback-ingestion.contract.js';
import {
  PlaybackIngestionError,
} from '../errors/analytics.errors.js';
import { ValidationFailedError } from '../../../shared/errors/domain.error.js';

export interface IPlaybackIngestionServiceDependencies {
  readonly cacheService: ICacheService;
  readonly streamKey?: string;
  readonly dedupKeyPrefix?: string;
  readonly dedupTtlSeconds?: number;
  readonly maxStreamLength?: number;
}

const DEFAULT_STREAM_KEY = 'aadat:stream:playback-events';
const DEFAULT_DEDUP_PREFIX = 'aadat:event:dedup:';
const DEFAULT_DEDUP_TTL_SECONDS = 604800; // 7 days
const DEFAULT_MAX_STREAM_LENGTH = 200000;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Playback Ingestion Service
 * Guarantees zero event loss between deduplication and Redis stream insertion
 * using an atomic Redis Lua script with pcall rollback semantics.
 */
export class PlaybackIngestionService implements IPlaybackIngestionService {
  private readonly cacheService: ICacheService;
  private readonly streamKey: string;
  private readonly dedupKeyPrefix: string;
  private readonly dedupTtlSeconds: number;
  private readonly maxStreamLength: number;

  /**
   * Atomic Dual-Write Lua Script:
   * Prevents window of vulnerability between checking deduplication and stream enqueue.
   */
  private static readonly DEDUP_AND_ENQUEUE_LUA = `
    local dedupKey = KEYS[1]
    local streamKey = KEYS[2]
    local dedupTtl = tonumber(ARGV[1])
    local maxLen = tonumber(ARGV[2])
    local payloadJson = ARGV[3]
    local enqueuedAt = ARGV[4]

    -- 1. Check if eventId was already accepted
    local existingStreamId = redis.call('GET', dedupKey)
    if existingStreamId then
      return {'DUPLICATE', existingStreamId}
    end

    -- 2. Attempt atomic stream insertion with pcall error guard
    local ok, streamIdOrErr = pcall(redis.call, 'XADD', streamKey, 'MAXLEN', '~', maxLen, '*', 'payload', payloadJson, 'enqueuedAt', enqueuedAt)

    if not ok then
      -- Stream enqueue failed (e.g. memory exhaustion or syntax error)
      -- Crucial: do NOT register dedup marker!
      return {'ERROR', tostring(streamIdOrErr)}
    end

    -- 3. Enqueue succeeded: record dedup key atomically
    redis.call('SET', dedupKey, streamIdOrErr, 'EX', dedupTtl)

    return {'ENQUEUED', streamIdOrErr}
  `;

  public constructor(dependencies: IPlaybackIngestionServiceDependencies) {
    this.cacheService = dependencies.cacheService;
    this.streamKey = dependencies.streamKey ?? DEFAULT_STREAM_KEY;
    this.dedupKeyPrefix = dependencies.dedupKeyPrefix ?? DEFAULT_DEDUP_PREFIX;
    this.dedupTtlSeconds = dependencies.dedupTtlSeconds ?? DEFAULT_DEDUP_TTL_SECONDS;
    this.maxStreamLength = dependencies.maxStreamLength ?? DEFAULT_MAX_STREAM_LENGTH;
  }

  public async ingestEvent(event: IPlaybackIngestionEvent): Promise<IIngestionResult> {
    if (!event.eventId || !UUID_REGEX.test(event.eventId)) {
      throw new ValidationFailedError(`Invalid eventId: must be a valid UUIDv4.`);
    }

    if (!event.userId || !event.trackId) {
      throw new ValidationFailedError('Playback event requires userId and trackId.');
    }

    if (event.durationSec < 0) {
      throw new ValidationFailedError('durationSec cannot be negative.');
    }

    const dedupKey = `${this.dedupKeyPrefix}${event.eventId}`;
    const enqueuedAt = new Date().toISOString();
    const serializedPayload = JSON.stringify(event);

    const rawResult = await this.cacheService.eval(
      PlaybackIngestionService.DEDUP_AND_ENQUEUE_LUA,
      2,
      dedupKey,
      this.streamKey,
      this.dedupTtlSeconds,
      this.maxStreamLength,
      serializedPayload,
      enqueuedAt
    );

    const result = rawResult as [string, string];
    const status = result[0];
    const payload = result[1];

    if (status === 'DUPLICATE') {
      return {
        status: 'DUPLICATE',
        eventId: event.eventId,
        streamId: payload,
        deduplicated: true,
        message: 'Event already ingested and deduplicated.',
      };
    }

    if (status === 'ERROR') {
      throw new PlaybackIngestionError(
        `Failed to enqueue playback event into Redis stream: ${payload}`
      );
    }

    if (status === 'ENQUEUED') {
      return {
        status: 'ACCEPTED',
        eventId: event.eventId,
        streamId: payload,
        deduplicated: false,
      };
    }

    throw new PlaybackIngestionError(`Unexpected Lua response: ${status}`);
  }

  public async isEventDeduplicated(eventId: string): Promise<boolean> {
    const dedupKey = `${this.dedupKeyPrefix}${eventId}`;
    return await this.cacheService.exists(dedupKey);
  }
}

