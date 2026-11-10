import { IPlaybackIngestionEvent } from './playback-ingestion.contract.js';

export interface IEstimatedMetric<T> {
  readonly value: T;
  readonly isEstimate: true;
  readonly algorithm: 'HyperLogLog' | 'RollingSortedSet';
  readonly measuredAt: Date;
}

export interface ITrendingTrackItem {
  readonly trackId: string;
  readonly score: number;
}

/**
 * Real-Time Ephemeral Analytics Service Contract
 * All metrics returned by this service are explicitly typed as estimated approximations.
 */
export interface IRealtimeAnalyticsService {
  /**
   * Records a playback event into HyperLogLog and SortedSet structures.
   */
  recordPlayEvent(event: IPlaybackIngestionEvent): Promise<void>;

  /**
   * Returns estimated DAU via Redis HyperLogLog (PFCOUNT).
   */
  getEstimatedDau(dateStr: string): Promise<IEstimatedMetric<number>>;

  /**
   * Returns estimated unique listeners for a track on a given date via HyperLogLog.
   */
  getEstimatedTrackUniqueListeners(
    dateStr: string,
    trackId: string
  ): Promise<IEstimatedMetric<number>>;

  /**
   * Returns top trending tracks for a given time window (e.g. hourly or daily).
   */
  getTrendingTracks(
    timeWindowKey: string,
    limit?: number
  ): Promise<ReadonlyArray<ITrendingTrackItem>>;
}

