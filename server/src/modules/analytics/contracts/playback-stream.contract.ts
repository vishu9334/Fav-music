import { IPlaybackIngestionEvent } from './playback-ingestion.contract.js';

export interface IStreamMessage {
  readonly streamId: string;
  readonly event: IPlaybackIngestionEvent;
  readonly enqueuedAt: string;
  readonly deliveryCount?: number;
}

export interface IWorkerBatchResult {
  readonly processedCount: number;
  readonly acknowledgedCount: number;
  readonly deadLetterCount: number;
  readonly errors: ReadonlyArray<{ streamId: string; error: string }>;
}

export interface IWorkerRecoveryResult {
  readonly claimedCount: number;
  readonly processedCount: number;
  readonly acknowledgedCount: number;
  readonly deadLetterCount: number;
  readonly nextCursor: string;
}

export interface IStreamHealthInfo {
  readonly streamLength: number;
  readonly pendingMessagesCount: number;
  readonly oldestPendingId?: string;
  readonly consumerLag: number;
  readonly activeConsumersCount: number;
  readonly deadLetterQueueLength: number;
  readonly retentionWarning: boolean;
}

/**
 * Contract for Stream-based Worker Operations
 */
export interface IPlaybackStreamWorker {
  initializeConsumerGroup(): Promise<void>;
  processNextBatch(batchSize?: number): Promise<IWorkerBatchResult>;
  recoverPendingMessages(batchSize?: number): Promise<IWorkerRecoveryResult>;
  inspectStreamHealth(): Promise<IStreamHealthInfo>;
}

