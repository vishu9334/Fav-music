export type PlaybackClientState = 'PLAYING' | 'PAUSED' | 'BUFFERING';

export type PlaybackFinishReason = 'COMPLETED' | 'SKIPPED' | 'USER_STOPPED' | 'ERROR';

/**
 * Ephemeral Session State maintained in Redis
 */
export interface IPlaybackSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly trackId: string;
  readonly durationSeconds: number; // Authoritative duration from DB metadata
  readonly playbackContext?: string; // 'DISCOVERY', 'ROOM', 'WAREHOUSE', etc.
  lastPositionSec: number;
  accumulatedListenSec: number; // Server-validated genuine listening duration
  state: PlaybackClientState;
  playbackSpeed: number; // Bounded between 0.5 and 2.0
  startedAt: number; // Server epoch ms
  lastHeartbeatAt: number; // Server epoch ms
  heartbeatCount: number;
}

export interface IStartPlaybackSessionRequest {
  readonly userId: string;
  readonly trackId: string;
  readonly playbackContext?: string;
  readonly initialPositionSec?: number;
}

export interface IStartPlaybackSessionResponse {
  readonly sessionId: string;
  readonly trackId: string;
  readonly durationSeconds: number;
  readonly startedAt: number;
}

export interface IHeartbeatPlaybackRequest {
  readonly sessionId: string;
  readonly userId: string;
  readonly positionSec: number;
  readonly state: PlaybackClientState;
  readonly playbackSpeed?: number;
  readonly clientTimestamp?: number;
}

export interface IHeartbeatPlaybackResponse {
  readonly sessionId: string;
  readonly accumulatedListenSec: number;
  readonly lastPositionSec: number;
  readonly state: PlaybackClientState;
  readonly isQualifiedPlay: boolean;
  readonly isCompleted: boolean;
  readonly serverTimestamp: number;
}

export interface IFinishPlaybackSessionRequest {
  readonly sessionId: string;
  readonly userId: string;
  readonly eventId: string; // UUIDv4 for idempotent ingestion
  readonly positionSec?: number;
  readonly reason: PlaybackFinishReason;
}

export interface IPlaybackSessionResult {
  readonly sessionId: string;
  readonly eventId: string;
  readonly userId: string;
  readonly trackId: string;
  readonly durationSeconds: number;
  readonly playbackContext?: string;
  readonly accumulatedListenSec: number;
  readonly isQualifiedPlay: boolean;
  readonly isCompleted: boolean;
  readonly wasSkipped: boolean;
  readonly reason: PlaybackFinishReason;
  readonly completedAt: number;
}

/**
 * Contract for Redis-backed Session Lifecycle
 */
export interface IPlaybackSessionRepository {
  createSession(session: IPlaybackSession, ttlSeconds: number): Promise<void>;
  getSession(sessionId: string): Promise<IPlaybackSession | null>;
  updateSessionHeartbeat(
    sessionId: string,
    userId: string,
    update: {
      positionSec: number;
      state: PlaybackClientState;
      playbackSpeed: number;
      serverNowMs: number;
      jitterToleranceSec: number;
      maxIdleTimeoutSec: number;
    },
    ttlSeconds: number
  ): Promise<IPlaybackSession>;
  deleteSession(sessionId: string): Promise<void>;
}

/**
 * Playback Session Management Service Contract
 */
export interface IPlaybackSessionService {
  startSession(request: IStartPlaybackSessionRequest): Promise<IStartPlaybackSessionResponse>;
  heartbeat(request: IHeartbeatPlaybackRequest): Promise<IHeartbeatPlaybackResponse>;
  finishSession(request: IFinishPlaybackSessionRequest): Promise<IPlaybackSessionResult>;
}

