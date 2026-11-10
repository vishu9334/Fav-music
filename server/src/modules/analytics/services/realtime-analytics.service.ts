import { ICacheService } from '../../../infrastructure/cache/contracts/cache.contract.js';
import { IPlaybackIngestionEvent } from '../contracts/playback-ingestion.contract.js';
import {
  IEstimatedMetric,
  IRealtimeAnalyticsService,
  ITrendingTrackItem,
} from '../contracts/realtime-analytics.contract.js';

export interface IRealtimeAnalyticsServiceDependencies {
  readonly cacheService: ICacheService;
  readonly dauKeyPrefix?: string;
  readonly trackListenersPrefix?: string;
  readonly trendingPrefix?: string;
}

const DEFAULT_DAU_KEY_PREFIX = 'aadat:analytics:hll:dau:';
const DEFAULT_TRACK_LISTENERS_PREFIX = 'aadat:analytics:hll:track_listeners:';
const DEFAULT_TRENDING_PREFIX = 'aadat:analytics:zset:trending:';

/**
 * Real-Time Ephemeral Analytics Service
 * Backed by Redis HyperLogLog and Sorted Sets.
 * Every returned metric is explicitly tagged as an approximate estimate.
 */
export class RealtimeAnalyticsService implements IRealtimeAnalyticsService {
  private readonly cacheService: ICacheService;
  private readonly dauKeyPrefix: string;
  private readonly trackListenersPrefix: string;
  private readonly trendingPrefix: string;

  private static readonly RECORD_PLAY_LUA = `
    local dauKey = KEYS[1]
    local trackHllKey = KEYS[2]
    local trendingKey = KEYS[3]
    local userId = ARGV[1]
    local trackId = ARGV[2]
    local isQualified = ARGV[3]

    redis.call('PFADD', dauKey, userId)
    redis.call('PFADD', trackHllKey, userId)

    if isQualified == '1' and trendingKey and trendingKey ~= '' then
      redis.call('ZINCRBY', trendingKey, 1, trackId)
    end

    return 1
  `;

  private static readonly PFCOUNT_LUA = `
    return redis.call('PFCOUNT', KEYS[1])
  `;

  private static readonly ZREVRANGE_LUA = `
    local limit = tonumber(ARGV[1]) or 10
    return redis.call('ZREVRANGE', KEYS[1], 0, limit - 1, 'WITHSCORES')
  `;

  public constructor(dependencies: IRealtimeAnalyticsServiceDependencies) {
    this.cacheService = dependencies.cacheService;
    this.dauKeyPrefix = dependencies.dauKeyPrefix ?? DEFAULT_DAU_KEY_PREFIX;
    this.trackListenersPrefix = dependencies.trackListenersPrefix ?? DEFAULT_TRACK_LISTENERS_PREFIX;
    this.trendingPrefix = dependencies.trendingPrefix ?? DEFAULT_TRENDING_PREFIX;
  }

  public async recordPlayEvent(event: IPlaybackIngestionEvent): Promise<void> {
    const date = new Date(event.timestamp);
    const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD
    const hourStr = `${dateStr}-${String(date.getUTCHours()).padStart(2, '0')}`; // YYYY-MM-DD-HH

    const dauKey = `${this.dauKeyPrefix}${dateStr}`;
    const trackHllKey = `${this.trackListenersPrefix}${dateStr}:${event.trackId}`;
    const trendingKey = `${this.trendingPrefix}${hourStr}`;

    const isQualified = !event.wasSkipped && event.durationSec >= 30 ? '1' : '0';

    await this.cacheService.eval(
      RealtimeAnalyticsService.RECORD_PLAY_LUA,
      3,
      dauKey,
      trackHllKey,
      trendingKey,
      event.userId,
      event.trackId,
      isQualified
    );
  }

  public async getEstimatedDau(dateStr: string): Promise<IEstimatedMetric<number>> {
    const dauKey = `${this.dauKeyPrefix}${dateStr}`;
    const raw = await this.cacheService.eval(RealtimeAnalyticsService.PFCOUNT_LUA, 1, dauKey);
    const count = Number(raw) || 0;

    return {
      value: count,
      isEstimate: true,
      algorithm: 'HyperLogLog',
      measuredAt: new Date(),
    };
  }

  public async getEstimatedTrackUniqueListeners(
    dateStr: string,
    trackId: string
  ): Promise<IEstimatedMetric<number>> {
    const trackHllKey = `${this.trackListenersPrefix}${dateStr}:${trackId}`;
    const raw = await this.cacheService.eval(
      RealtimeAnalyticsService.PFCOUNT_LUA,
      1,
      trackHllKey
    );
    const count = Number(raw) || 0;

    return {
      value: count,
      isEstimate: true,
      algorithm: 'HyperLogLog',
      measuredAt: new Date(),
    };
  }

  public async getTrendingTracks(
    timeWindowKey: string,
    limit: number = 10
  ): Promise<ReadonlyArray<ITrendingTrackItem>> {
    const trendingKey = `${this.trendingPrefix}${timeWindowKey}`;
    const raw = (await this.cacheService.eval(
      RealtimeAnalyticsService.ZREVRANGE_LUA,
      1,
      trendingKey,
      limit
    )) as Array<string | number>;

    if (!Array.isArray(raw)) {
      return [];
    }

    const items: ITrendingTrackItem[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      const trackId = String(raw[i]);
      const score = Number(raw[i + 1]) || 0;
      items.push({ trackId, score });
    }

    return items;
  }
}

