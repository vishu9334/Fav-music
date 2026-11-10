import { randomUUID } from 'node:crypto';
import {
  IFinishPlaybackSessionRequest,
  IHeartbeatPlaybackRequest,
  IHeartbeatPlaybackResponse,
  IPlaybackSession,
  IPlaybackSessionRepository,
  IPlaybackSessionResult,
  IPlaybackSessionService,
  IStartPlaybackSessionRequest,
  IStartPlaybackSessionResponse,
} from '../contracts/playback-session.contract.js';
import { ITrackLookupRepository } from '../contracts/track-lookup-repository.contract.js';
import {
  IPlaybackIngestionEvent,
  IPlaybackIngestionService,
} from '../contracts/playback-ingestion.contract.js';
import {
  SessionNotFoundError,
  TrackNotPlayableError,
  UnauthorizedSessionAccessError,
} from '../errors/analytics.errors.js';
import { ValidationFailedError } from '../../../shared/errors/domain.error.js';

export interface IPlaybackSessionServiceDependencies {
  readonly sessionRepository: IPlaybackSessionRepository;
  readonly trackLookupRepository: ITrackLookupRepository;
  readonly ingestionService: IPlaybackIngestionService;
  readonly sessionTtlSeconds?: number;
  readonly jitterToleranceSec?: number;
  readonly maxIdleTimeoutSec?: number;
  readonly timeProvider?: () => number;
}

const DEFAULT_SESSION_TTL_SECONDS = 7200; // 2 hours
const DEFAULT_JITTER_TOLERANCE_SEC = 2.0; // 2 seconds network latency tolerance
const DEFAULT_MAX_IDLE_TIMEOUT_SEC = 120.0; // 2 minutes max idle before clamping
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Playback Session Lifecycle Service
 * Authoritative server-side progression validation, heartbeat tracking,
 * and anti-abuse playback qualification.
 */
export class PlaybackSessionService implements IPlaybackSessionService {
  private readonly sessionRepository: IPlaybackSessionRepository;
  private readonly trackLookupRepository: ITrackLookupRepository;
  private readonly ingestionService: IPlaybackIngestionService;
  private readonly sessionTtlSeconds: number;
  private readonly jitterToleranceSec: number;
  private readonly maxIdleTimeoutSec: number;
  private readonly now: () => number;

  public constructor(dependencies: IPlaybackSessionServiceDependencies) {
    this.sessionRepository = dependencies.sessionRepository;
    this.trackLookupRepository = dependencies.trackLookupRepository;
    this.ingestionService = dependencies.ingestionService;
    this.sessionTtlSeconds = dependencies.sessionTtlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
    this.jitterToleranceSec = dependencies.jitterToleranceSec ?? DEFAULT_JITTER_TOLERANCE_SEC;
    this.maxIdleTimeoutSec = dependencies.maxIdleTimeoutSec ?? DEFAULT_MAX_IDLE_TIMEOUT_SEC;
    this.now = dependencies.timeProvider ?? (() => Date.now());
  }

  public async startSession(
    request: IStartPlaybackSessionRequest
  ): Promise<IStartPlaybackSessionResponse> {
    if (!request.userId || !request.trackId) {
      throw new ValidationFailedError('Both userId and trackId are required to start a playback session.');
    }

    // 1. Authoritative track lookup
    const track = await this.trackLookupRepository.findById(request.trackId);
    if (!track) {
      throw new TrackNotPlayableError(`Track ${request.trackId} not found in catalog.`);
    }

    if (track.publishStatus !== 'PUBLISHED') {
      throw new TrackNotPlayableError(`Track ${request.trackId} is not in PUBLISHED status.`);
    }

    if (track.durationSeconds <= 0) {
      throw new TrackNotPlayableError(`Track ${request.trackId} has invalid duration (${track.durationSeconds}s).`);
    }

    const sessionId = randomUUID();
    const serverNow = this.now();
    const initialPos = Math.min(
      Math.max(0, request.initialPositionSec ?? 0),
      track.durationSeconds
    );

    const session: IPlaybackSession = {
      sessionId,
      userId: request.userId,
      trackId: track.id,
      durationSeconds: track.durationSeconds,
      playbackContext: request.playbackContext,
      lastPositionSec: initialPos,
      accumulatedListenSec: 0,
      state: 'PLAYING',
      playbackSpeed: 1.0,
      startedAt: serverNow,
      lastHeartbeatAt: serverNow,
      heartbeatCount: 0,
    };

    await this.sessionRepository.createSession(session, this.sessionTtlSeconds);

    return {
      sessionId,
      trackId: track.id,
      durationSeconds: track.durationSeconds,
      startedAt: serverNow,
    };
  }

  public async heartbeat(
    request: IHeartbeatPlaybackRequest
  ): Promise<IHeartbeatPlaybackResponse> {
    if (!request.sessionId || !request.userId) {
      throw new ValidationFailedError('sessionId and userId are required for heartbeat.');
    }

    const serverNow = this.now();
    const speed = request.playbackSpeed ?? 1.0;

    const updatedSession = await this.sessionRepository.updateSessionHeartbeat(
      request.sessionId,
      request.userId,
      {
        positionSec: request.positionSec,
        state: request.state,
        playbackSpeed: speed,
        serverNowMs: serverNow,
        jitterToleranceSec: this.jitterToleranceSec,
        maxIdleTimeoutSec: this.maxIdleTimeoutSec,
      },
      this.sessionTtlSeconds
    );

    const duration = updatedSession.durationSeconds;
    const accumulated = updatedSession.accumulatedListenSec;

    // Qualification definitions:
    // Qualified Play: >= 30s (or 100% of duration if duration < 30s)
    const isQualifiedPlay =
      duration < 30 ? accumulated >= duration : accumulated >= 30;

    // Completion: Reached >= 90% of track length
    const isCompleted = accumulated >= Math.floor(duration * 0.9);

    return {
      sessionId: updatedSession.sessionId,
      accumulatedListenSec: accumulated,
      lastPositionSec: updatedSession.lastPositionSec,
      state: updatedSession.state,
      isQualifiedPlay,
      isCompleted,
      serverTimestamp: serverNow,
    };
  }

  public async finishSession(
    request: IFinishPlaybackSessionRequest
  ): Promise<IPlaybackSessionResult> {
    if (!request.sessionId || !request.userId || !request.eventId) {
      throw new ValidationFailedError('sessionId, userId, and eventId are required to finish playback.');
    }

    if (!UUID_REGEX.test(request.eventId)) {
      throw new ValidationFailedError('eventId must be a valid UUIDv4 for idempotent ingestion.');
    }

    // 1. Fetch current session
    const session = await this.sessionRepository.getSession(request.sessionId);
    if (!session) {
      throw new SessionNotFoundError(`Playback session ${request.sessionId} not found or expired.`);
    }

    if (session.userId !== request.userId) {
      throw new UnauthorizedSessionAccessError(
        `User ${request.userId} is not authorized to finalize session ${request.sessionId}.`
      );
    }

    // 2. Perform final reconciliation heartbeat if positionSec is provided
    let finalSession = session;
    if (typeof request.positionSec === 'number') {
      finalSession = await this.sessionRepository.updateSessionHeartbeat(
        request.sessionId,
        request.userId,
        {
          positionSec: request.positionSec,
          state: 'PAUSED', // Transition to finished/paused
          playbackSpeed: session.playbackSpeed,
          serverNowMs: this.now(),
          jitterToleranceSec: this.jitterToleranceSec,
          maxIdleTimeoutSec: this.maxIdleTimeoutSec,
        },
        this.sessionTtlSeconds
      );
    }

    const duration = finalSession.durationSeconds;
    const accumulated = finalSession.accumulatedListenSec;

    const isQualifiedPlay =
      duration < 30 ? accumulated >= duration : accumulated >= 30;
    const isCompleted = accumulated >= Math.floor(duration * 0.9);
    const wasSkipped = request.reason === 'SKIPPED' || !isQualifiedPlay;

    // 3. Construct authoritative ingestion event
    const ingestionEvent: IPlaybackIngestionEvent = {
      eventId: request.eventId,
      sessionId: finalSession.sessionId,
      userId: finalSession.userId,
      trackId: finalSession.trackId,
      durationSec: Math.round(accumulated),
      trackDurationSec: duration,
      wasSkipped,
      completed: isCompleted,
      playbackContext: finalSession.playbackContext,
      timestamp: this.now(),
    };

    // 4. Ingest event into zero-loss stream pipeline
    await this.ingestionService.ingestEvent(ingestionEvent);

    // 5. Clean up ephemeral session from Redis
    await this.sessionRepository.deleteSession(finalSession.sessionId);

    return {
      sessionId: finalSession.sessionId,
      eventId: request.eventId,
      userId: finalSession.userId,
      trackId: finalSession.trackId,
      durationSeconds: duration,
      playbackContext: finalSession.playbackContext,
      accumulatedListenSec: accumulated,
      isQualifiedPlay,
      isCompleted,
      wasSkipped,
      reason: request.reason,
      completedAt: this.now(),
    };
  }
}

