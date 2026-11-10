import { randomUUID } from 'node:crypto';
import { ICacheService } from '../../../infrastructure/cache/contracts/cache.contract.js';
import { IPlaybackPersistenceRepository } from '../contracts/playback-persistence.contract.js';
import { IRealtimeAnalyticsService } from '../contracts/realtime-analytics.contract.js';
import {
  IPlaybackStreamWorker,
  IStreamHealthInfo,
  IWorkerBatchResult,
  IWorkerRecoveryResult,
} from '../contracts/playback-stream.contract.js';
import { IPlaybackIngestionEvent } from '../contracts/playback-ingestion.contract.js';

export interface IPlaybackStreamWorkerDependencies {
  readonly cacheService: ICacheService;
  readonly persistenceRepository: IPlaybackPersistenceRepository;
  readonly realtimeAnalyticsService: IRealtimeAnalyticsService;
  readonly streamKey?: string;
  readonly dlqKey?: string;
  readonly consumerGroupName?: string;
  readonly consumerName?: string;
  readonly maxRetries?: number;
  readonly minIdleRecoveryTimeMs?: number;
  readonly retryTtlSeconds?: number;
}

const DEFAULT_STREAM_KEY = 'aadat:stream:playback-events';
const DEFAULT_DLQ_KEY = 'aadat:stream:playback-dlq';
const DEFAULT_GROUP_NAME = 'aadat:playback:workers';
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_MIN_IDLE_RECOVERY_TIME_MS = 60000; // 60s idle before PEL reclamation
const DEFAULT_RETRY_TTL_SECONDS = 86400; // 24 hours

/**
 * Playback Stream Worker
 * Consumes ingestion events via consumer groups, persists to database,
 * aggregates real-time metrics, recovers pending messages after crashes,
 * and routes persistent poison pills to DLQ.
 */
export class PlaybackStreamWorker implements IPlaybackStreamWorker {
  private readonly cacheService: ICacheService;
  private readonly persistenceRepository: IPlaybackPersistenceRepository;
  private readonly realtimeAnalyticsService: IRealtimeAnalyticsService;
  private readonly streamKey: string;
  private readonly dlqKey: string;
  private readonly consumerGroupName: string;
  private readonly consumerName: string;
  private readonly maxRetries: number;
  private readonly minIdleRecoveryTimeMs: number;
  private readonly retryTtlSeconds: number;

  private static readonly INIT_GROUP_LUA = `
    local ok, err = pcall(redis.call, 'XGROUP', 'CREATE', KEYS[1], ARGV[1], '0', 'MKSTREAM')
    if not ok then
      if string.find(tostring(err), 'BUSYGROUP') then
        return 'EXISTS'
      end
      return {'ERROR', tostring(err)}
    end
    return 'CREATED'
  `;

  private static readonly READ_BATCH_LUA = `
    return redis.call('XREADGROUP', 'GROUP', ARGV[1], ARGV[2], 'COUNT', ARGV[3], 'STREAMS', KEYS[1], '>')
  `;

  private static readonly ACK_MESSAGE_LUA = `
    redis.call('XACK', KEYS[1], ARGV[1], ARGV[2])
    if ARGV[3] and ARGV[3] ~= '' then
      redis.call('DEL', ARGV[3])
    end
    return 1
  `;

  private static readonly ROUTE_DLQ_LUA = `
    redis.call('XADD', KEYS[2], '*', 'originalId', ARGV[2], 'payload', ARGV[3], 'errorReason', ARGV[4], 'retryCount', ARGV[5], 'failedAt', ARGV[6])
    redis.call('XACK', KEYS[1], ARGV[1], ARGV[2])
    if ARGV[7] and ARGV[7] ~= '' then
      redis.call('DEL', ARGV[7])
    end
    return 1
  `;

  private static readonly AUTOCLAIM_LUA = `
    return redis.call('XAUTOCLAIM', KEYS[1], ARGV[1], ARGV[2], ARGV[3], ARGV[4], 'COUNT', ARGV[5])
  `;

  private static readonly INSPECT_STREAM_LUA = `
    local streamLen = redis.call('XLEN', KEYS[1])
    local dlqLen = 0
    pcall(function() dlqLen = redis.call('XLEN', KEYS[2]) end)
    local pendingSummary = redis.call('XPENDING', KEYS[1], ARGV[1])
    return {streamLen, dlqLen, pendingSummary}
  `;

  public constructor(dependencies: IPlaybackStreamWorkerDependencies) {
    this.cacheService = dependencies.cacheService;
    this.persistenceRepository = dependencies.persistenceRepository;
    this.realtimeAnalyticsService = dependencies.realtimeAnalyticsService;
    this.streamKey = dependencies.streamKey ?? DEFAULT_STREAM_KEY;
    this.dlqKey = dependencies.dlqKey ?? DEFAULT_DLQ_KEY;
    this.consumerGroupName = dependencies.consumerGroupName ?? DEFAULT_GROUP_NAME;
    this.consumerName =
      dependencies.consumerName ?? `worker-${process.pid}-${randomUUID().slice(0, 8)}`;
    this.maxRetries = dependencies.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.minIdleRecoveryTimeMs =
      dependencies.minIdleRecoveryTimeMs ?? DEFAULT_MIN_IDLE_RECOVERY_TIME_MS;
    this.retryTtlSeconds = dependencies.retryTtlSeconds ?? DEFAULT_RETRY_TTL_SECONDS;
  }

  public async initializeConsumerGroup(): Promise<void> {
    const res = await this.cacheService.eval(
      PlaybackStreamWorker.INIT_GROUP_LUA,
      1,
      this.streamKey,
      this.consumerGroupName
    );

    if (Array.isArray(res) && res[0] === 'ERROR') {
      throw new Error(`Failed to initialize consumer group: ${res[1]}`);
    }
  }

  public async processNextBatch(batchSize: number = 10): Promise<IWorkerBatchResult> {
    const raw = await this.cacheService.eval(
      PlaybackStreamWorker.READ_BATCH_LUA,
      1,
      this.streamKey,
      this.consumerGroupName,
      this.consumerName,
      batchSize
    );

    const messages = this.parseStreamEntries(raw);
    let processedCount = 0;
    let acknowledgedCount = 0;
    let deadLetterCount = 0;
    const errors: Array<{ streamId: string; error: string }> = [];

    for (const msg of messages) {
      const outcome = await this.processSingleMessage(msg.streamId, msg.payload);
      if (outcome.success) {
        processedCount++;
        acknowledgedCount++;
      } else if (outcome.routedToDlq) {
        deadLetterCount++;
        errors.push({ streamId: msg.streamId, error: outcome.error ?? 'Max retries exceeded' });
      } else {
        errors.push({ streamId: msg.streamId, error: outcome.error ?? 'Processing failed' });
      }
    }

    return {
      processedCount,
      acknowledgedCount,
      deadLetterCount,
      errors,
    };
  }

  public async recoverPendingMessages(batchSize: number = 10): Promise<IWorkerRecoveryResult> {
    const raw = await this.cacheService.eval(
      PlaybackStreamWorker.AUTOCLAIM_LUA,
      1,
      this.streamKey,
      this.consumerGroupName,
      this.consumerName,
      this.minIdleRecoveryTimeMs,
      '0-0',
      batchSize
    );

    let nextCursor = '0-0';
    let claimedEntries: Array<{ streamId: string; payload: string }> = [];

    if (Array.isArray(raw)) {
      if (typeof raw[0] === 'string') {
        nextCursor = raw[0];
      }
      if (Array.isArray(raw[1])) {
        claimedEntries = this.parseEntriesFromList(raw[1]);
      }
    }

    let processedCount = 0;
    let acknowledgedCount = 0;
    let deadLetterCount = 0;

    for (const msg of claimedEntries) {
      const outcome = await this.processSingleMessage(msg.streamId, msg.payload);
      if (outcome.success) {
        processedCount++;
        acknowledgedCount++;
      } else if (outcome.routedToDlq) {
        deadLetterCount++;
      }
    }

    return {
      claimedCount: claimedEntries.length,
      processedCount,
      acknowledgedCount,
      deadLetterCount,
      nextCursor,
    };
  }

  public async inspectStreamHealth(): Promise<IStreamHealthInfo> {
    try {
      const res = (await this.cacheService.eval(
        PlaybackStreamWorker.INSPECT_STREAM_LUA,
        2,
        this.streamKey,
        this.dlqKey,
        this.consumerGroupName
      )) as unknown[];

      const streamLength = Number(res?.[0]) || 0;
      const deadLetterQueueLength = Number(res?.[1]) || 0;
      const pendingSummary = res?.[2];

      let pendingMessagesCount = 0;
      let oldestPendingId: string | undefined;
      let consumerLag = 0;
      let activeConsumersCount = 0;

      if (Array.isArray(pendingSummary)) {
        pendingMessagesCount = Number(pendingSummary[0]) || 0;
        if (typeof pendingSummary[1] === 'string') {
          oldestPendingId = pendingSummary[1];
        }
        if (Array.isArray(pendingSummary[3])) {
          activeConsumersCount = pendingSummary[3].length;
        }
      }

      // Check if pending messages are approaching stream trimming window (> 50,000 pending)
      const retentionWarning = pendingMessagesCount > 50000;

      return {
        streamLength,
        pendingMessagesCount,
        oldestPendingId,
        consumerLag,
        activeConsumersCount,
        deadLetterQueueLength,
        retentionWarning,
      };
    } catch {
      return {
        streamLength: 0,
        pendingMessagesCount: 0,
        consumerLag: 0,
        activeConsumersCount: 0,
        deadLetterQueueLength: 0,
        retentionWarning: false,
      };
    }
  }

  /**
   * Internal message processor with retry tracking and poison pill protection
   */
  private async processSingleMessage(
    streamId: string,
    rawPayload: string
  ): Promise<{ success: boolean; routedToDlq: boolean; error?: string }> {
    const retryKey = `aadat:stream:retry:${streamId}`;

    try {
      const event = JSON.parse(rawPayload) as IPlaybackIngestionEvent;

      // 1. Authoritative PostgreSQL persistence
      await this.persistenceRepository.saveListeningLog(event);

      // 2. Real-time fast Redis metric aggregation
      await this.realtimeAnalyticsService.recordPlayEvent(event);

      // 3. Acknowledge and clear retry tracking
      await this.cacheService.eval(
        PlaybackStreamWorker.ACK_MESSAGE_LUA,
        1,
        this.streamKey,
        this.consumerGroupName,
        streamId,
        retryKey
      );

      return { success: true, routedToDlq: false };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      // Increment delivery attempt counter
      const currentAttempts = await this.incrementRetryCount(retryKey);

      if (currentAttempts > this.maxRetries) {
        // Exceeded retries: Poison pill! Move to dead-letter queue and acknowledge
        await this.cacheService.eval(
          PlaybackStreamWorker.ROUTE_DLQ_LUA,
          2,
          this.streamKey,
          this.dlqKey,
          this.consumerGroupName,
          streamId,
          rawPayload,
          errorMsg,
          currentAttempts,
          new Date().toISOString(),
          retryKey
        );

        return { success: false, routedToDlq: true, error: errorMsg };
      }

      // Allow message to remain pending in PEL for next retry / recovery
      return { success: false, routedToDlq: false, error: errorMsg };
    }
  }

  private async incrementRetryCount(retryKey: string): Promise<number> {
    const lua = `
      local attempts = redis.call('INCR', KEYS[1])
      if attempts == 1 then
        redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
      end
      return attempts
    `;

    try {
      const res = await this.cacheService.eval(lua, 1, retryKey, this.retryTtlSeconds);
      return Number(res) || 1;
    } catch {
      return 1;
    }
  }

  private parseStreamEntries(
    raw: unknown
  ): Array<{ streamId: string; payload: string }> {
    if (!Array.isArray(raw) || raw.length === 0) {
      return [];
    }

    // Standard XREADGROUP format: [ [ streamKey, [ [ id, [ fields ] ], ... ] ] ]
    const firstStream = raw[0];
    if (Array.isArray(firstStream) && firstStream.length >= 2 && Array.isArray(firstStream[1])) {
      return this.parseEntriesFromList(firstStream[1]);
    }

    // Direct entry list fallback
    return this.parseEntriesFromList(raw);
  }

  private parseEntriesFromList(
    list: unknown[]
  ): Array<{ streamId: string; payload: string }> {
    const entries: Array<{ streamId: string; payload: string }> = [];

    for (const item of list) {
      if (Array.isArray(item) && item.length >= 2) {
        const streamId = String(item[0]);
        const fieldList = item[1];
        if (Array.isArray(fieldList)) {
          let payload = '';
          for (let i = 0; i < fieldList.length; i += 2) {
            if (String(fieldList[i]) === 'payload') {
              payload = String(fieldList[i + 1]);
              break;
            }
          }
          if (payload) {
            entries.push({ streamId, payload });
          }
        }
      }
    }

    return entries;
  }
}

