import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { IAuthGuard } from '../../../shared/guards/contracts/auth-guard.contract.js';
import {
  IPlaybackSessionService,
  PlaybackClientState,
  PlaybackFinishReason,
} from '../contracts/playback-session.contract.js';
import { IPlaybackIngestionService } from '../contracts/playback-ingestion.contract.js';
import { IRealtimeAnalyticsService } from '../contracts/realtime-analytics.contract.js';
import { IPlaybackStreamWorker } from '../contracts/playback-stream.contract.js';
import { IPlaybackPersistenceRepository } from '../contracts/playback-persistence.contract.js';

export interface IPlaybackAnalyticsControllerDependencies {
  readonly authGuard: IAuthGuard;
  readonly sessionService: IPlaybackSessionService;
  readonly ingestionService: IPlaybackIngestionService;
  readonly realtimeAnalyticsService: IRealtimeAnalyticsService;
  readonly persistenceRepository?: IPlaybackPersistenceRepository;
  readonly streamWorker?: IPlaybackStreamWorker;
}

interface IStartSessionBody {
  readonly trackId: string;
  readonly playbackContext?: string;
  readonly initialPositionSec?: number;
}

interface IHeartbeatBody {
  readonly positionSec: number;
  readonly state: PlaybackClientState;
  readonly playbackSpeed?: number;
  readonly clientTimestamp?: number;
}

interface IFinishSessionBody {
  readonly eventId: string;
  readonly positionSec?: number;
  readonly reason: PlaybackFinishReason;
}

interface IIngestEventBody {
  readonly eventId: string;
  readonly trackId: string;
  readonly durationSec: number;
  readonly trackDurationSec: number;
  readonly wasSkipped: boolean;
  readonly completed: boolean;
  readonly playbackContext?: string;
  readonly timestamp?: number;
}

/**
 * Playback Analytics Controller
 * Handles session lifecycle endpoints, ingestion, and real-time metrics.
 */
export class PlaybackAnalyticsController {
  private readonly authGuard: IAuthGuard;
  private readonly sessionService: IPlaybackSessionService;
  private readonly ingestionService: IPlaybackIngestionService;
  private readonly realtimeAnalyticsService: IRealtimeAnalyticsService;
  private readonly persistenceRepository?: IPlaybackPersistenceRepository;
  private readonly streamWorker?: IPlaybackStreamWorker;

  public constructor(dependencies: IPlaybackAnalyticsControllerDependencies) {
    this.authGuard = dependencies.authGuard;
    this.sessionService = dependencies.sessionService;
    this.ingestionService = dependencies.ingestionService;
    this.realtimeAnalyticsService = dependencies.realtimeAnalyticsService;
    this.persistenceRepository = dependencies.persistenceRepository;
    this.streamWorker = dependencies.streamWorker;
  }

  public registerRoutes(fastify: FastifyInstance): void {
    // 1. Start Playback Session
    fastify.post(
      '/api/v1/playback/sessions/start',
      async (request: FastifyRequest<{ Body: IStartSessionBody }>, reply: FastifyReply) => {
        const user = await this.authGuard.validateToken(request.headers.authorization);
        const result = await this.sessionService.startSession({
          userId: user.userId,
          trackId: request.body.trackId,
          playbackContext: request.body.playbackContext,
          initialPositionSec: request.body.initialPositionSec,
        });
        reply.status(201).send(result);
      }
    );

    // 2. Heartbeat Session
    fastify.post(
      '/api/v1/playback/sessions/:sessionId/heartbeat',
      async (
        request: FastifyRequest<{ Params: { sessionId: string }; Body: IHeartbeatBody }>,
        reply: FastifyReply
      ) => {
        const user = await this.authGuard.validateToken(request.headers.authorization);
        const result = await this.sessionService.heartbeat({
          sessionId: request.params.sessionId,
          userId: user.userId,
          positionSec: request.body.positionSec,
          state: request.body.state,
          playbackSpeed: request.body.playbackSpeed,
          clientTimestamp: request.body.clientTimestamp,
        });
        reply.status(200).send(result);
      }
    );

    // 3. Finish Session
    fastify.post(
      '/api/v1/playback/sessions/:sessionId/finish',
      async (
        request: FastifyRequest<{ Params: { sessionId: string }; Body: IFinishSessionBody }>,
        reply: FastifyReply
      ) => {
        const user = await this.authGuard.validateToken(request.headers.authorization);
        const result = await this.sessionService.finishSession({
          sessionId: request.params.sessionId,
          userId: user.userId,
          eventId: request.body.eventId,
          positionSec: request.body.positionSec,
          reason: request.body.reason,
        });
        reply.status(200).send(result);
      }
    );

    // 4. Direct Idempotent Event Ingestion (e.g. offline sync)
    fastify.post(
      '/api/v1/playback/events/ingest',
      async (request: FastifyRequest<{ Body: IIngestEventBody }>, reply: FastifyReply) => {
        const user = await this.authGuard.validateToken(request.headers.authorization);
        const result = await this.ingestionService.ingestEvent({
          eventId: request.body.eventId,
          userId: user.userId,
          trackId: request.body.trackId,
          durationSec: request.body.durationSec,
          trackDurationSec: request.body.trackDurationSec,
          wasSkipped: request.body.wasSkipped,
          completed: request.body.completed,
          playbackContext: request.body.playbackContext,
          timestamp: request.body.timestamp ?? Date.now(),
        });

        if (result.status === 'DUPLICATE') {
          reply.status(200).send(result);
        } else {
          reply.status(202).send(result);
        }
      }
    );

    // 5. Real-Time Trending Tracks
    fastify.get(
      '/api/v1/playback/analytics/realtime/trending',
      async (
        request: FastifyRequest<{
          Querystring: { timeWindow?: string; limit?: string };
        }>,
        reply: FastifyReply
      ) => {
        const now = new Date();
        const defaultWindow = `${now.toISOString().slice(0, 10)}-${String(now.getUTCHours()).padStart(2, '0')}`;
        const timeWindow = request.query.timeWindow ?? defaultWindow;
        const limit = request.query.limit ? parseInt(request.query.limit, 10) : 10;

        const trending = await this.realtimeAnalyticsService.getTrendingTracks(timeWindow, limit);
        reply.status(200).send({
          timeWindow,
          isEstimate: true,
          algorithm: 'RollingSortedSet',
          items: trending,
        });
      }
    );

    // 6. Real-Time Estimated DAU
    fastify.get(
      '/api/v1/playback/analytics/realtime/dau',
      async (
        request: FastifyRequest<{ Querystring: { date?: string } }>,
        reply: FastifyReply
      ) => {
        const todayStr = new Date().toISOString().slice(0, 10);
        const dateStr = request.query.date ?? todayStr;

        const metric = await this.realtimeAnalyticsService.getEstimatedDau(dateStr);
        reply.status(200).send(metric);
      }
    );

    // 7. Stream Health & Retention Inspection (Internal / Diagnostics)
    fastify.get(
      '/api/v1/playback/analytics/stream/health',
      async (_request: FastifyRequest, reply: FastifyReply) => {
        if (!this.streamWorker) {
          reply.status(501).send({ error: 'Stream worker not configured.' });
          return;
        }
        const health = await this.streamWorker.inspectStreamHealth();
        reply.status(200).send(health);
      }
    );

    // 8. Exact Authoritative Daily Metrics
    fastify.get(
      '/api/v1/playback/analytics/exact/daily',
      async (
        request: FastifyRequest<{ Querystring: { date?: string; trackId?: string } }>,
        reply: FastifyReply
      ) => {
        if (!this.persistenceRepository) {
          reply.status(501).send({ error: 'Persistence repository not configured.' });
          return;
        }

        const dateStr = request.query.date ?? new Date().toISOString().slice(0, 10);
        const queryDate = new Date(dateStr);

        if (request.query.trackId) {
          const trackMetric = await this.persistenceRepository.getExactTrackDailyMetric(
            queryDate,
            request.query.trackId
          );
          reply.status(200).send({
            date: dateStr,
            trackId: request.query.trackId,
            metric: trackMetric
              ? {
                  ...trackMetric,
                  totalListenSeconds: trackMetric.totalListenSeconds.toString(),
                }
              : null,
            isEstimate: false,
          });
          return;
        }

        const platformMetric = await this.persistenceRepository.getExactDailyPlatformMetric(
          queryDate
        );
        reply.status(200).send({
          date: dateStr,
          metric: platformMetric
            ? {
                ...platformMetric,
                totalListenSeconds: platformMetric.totalListenSeconds.toString(),
              }
            : null,
          isEstimate: false,
        });
      }
    );
  }
}
