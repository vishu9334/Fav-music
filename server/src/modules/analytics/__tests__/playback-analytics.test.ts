import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { ICacheService } from '../../../infrastructure/cache/contracts/cache.contract.js';
import { IDatabaseService } from '../../../infrastructure/database/contracts/database.contract.js';
import { IAuthGuard } from '../../../shared/guards/contracts/auth-guard.contract.js';
import {
  ITrackLookupEntity,
  ITrackLookupRepository,
} from '../contracts/track-lookup-repository.contract.js';
import { IPlaybackSessionRepository } from '../contracts/playback-session.contract.js';
import { RedisPlaybackSessionRepository } from '../repositories/redis-playback-session.repository.js';
import { PlaybackSessionService } from '../services/playback-session.service.js';
import { PlaybackIngestionService } from '../services/playback-ingestion.service.js';
import { RealtimeAnalyticsService } from '../services/realtime-analytics.service.js';
import { PlaybackStreamWorker } from '../workers/playback-stream.worker.js';
import { PrismaPlaybackPersistenceRepository } from '../repositories/prisma-playback-persistence.repository.js';
import { PlaybackAnalyticsController } from '../controllers/playback-analytics.controller.js';
import {
  SessionNotFoundError,
  TrackNotPlayableError,
  UnauthorizedSessionAccessError,
  PlaybackIngestionError,
} from '../errors/analytics.errors.js';
import { ValidationFailedError } from '../../../shared/errors/domain.error.js';
import { ErrorHandlerMiddleware } from '../../../shared/middleware/error-handler.middleware.js';

describe('Gate 4B Batch 4 — Playback Analytics Foundation', () => {
  // Shared mock in-memory cache
  let cacheStore: Map<string, string>;
  let mockCacheService: ICacheService;

  // Track repository mock
  let tracksDb: Map<string, ITrackLookupEntity>;
  let mockTrackRepository: ITrackLookupRepository;

  // Auth mock
  let mockAuthGuard: IAuthGuard;

  // Stream state for worker simulation
  let streamQueue: Array<{ streamId: string; payload: string; enqueuedAt: string }>;
  let streamPel: Map<string, { consumer: string; idleMs: number; payload: string }>;
  let dlqQueue: Array<{ originalId: string; payload: string; errorReason: string; retryCount: number }>;
  let retryCounters: Map<string, number>;

  // Components under test
  let sessionRepo: IPlaybackSessionRepository;
  let sessionService: PlaybackSessionService;
  let ingestionService: PlaybackIngestionService;
  let realtimeAnalytics: RealtimeAnalyticsService;
  let persistenceRepo: PrismaPlaybackPersistenceRepository;
  let streamWorker: PlaybackStreamWorker;

  // Mock currentTime
  let simulatedTimeMs: number;

  beforeEach(() => {
    cacheStore = new Map();
    tracksDb = new Map();
    streamQueue = [];
    streamPel = new Map();
    dlqQueue = [];
    retryCounters = new Map();
    simulatedTimeMs = 1700000000000;

    // Seed test tracks
    tracksDb.set('track-standard', {
      id: 'track-standard',
      title: 'Aadat Classic',
      artistName: 'Jal The Band',
      durationSeconds: 240, // 4 mins
      publishStatus: 'PUBLISHED',
    });

    tracksDb.set('track-short', {
      id: 'track-short',
      title: 'Aadat Interlude',
      artistName: 'Jal The Band',
      durationSeconds: 20, // 20s short track
      publishStatus: 'PUBLISHED',
    });

    tracksDb.set('track-draft', {
      id: 'track-draft',
      title: 'Unreleased Track',
      artistName: 'Artist X',
      durationSeconds: 180,
      publishStatus: 'DRAFT',
    });

    mockTrackRepository = {
      findById: vi.fn().mockImplementation(async (id: string) => tracksDb.get(id) ?? null),
    };

    mockAuthGuard = {
      validateToken: vi.fn().mockResolvedValue({
        userId: 'user-alice-123',
        email: 'alice@example.com',
        role: 'USER',
      }),
    };

    // Realistic Redis mock implementing Lua script simulation
    mockCacheService = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      isConnected: vi.fn().mockReturnValue(true),
      get: vi.fn().mockImplementation(async (k: string) => cacheStore.get(k) ?? null),
      set: vi.fn().mockImplementation(async (k: string, v: string) => {
        cacheStore.set(k, v);
      }),
      delete: vi.fn().mockImplementation(async (k: string) => {
        cacheStore.delete(k);
      }),
      exists: vi.fn().mockImplementation(async (k: string) => cacheStore.has(k)),
      ping: vi.fn().mockResolvedValue('PONG'),
      eval: vi.fn().mockImplementation(async (script: string, _numKeys: number, ...args: (string | number)[]) => {
        // 1. UPDATE_HEARTBEAT_LUA
        if (script.includes('lastPositionSec') && script.includes('accumulatedListenSec')) {
          const key = String(args[0]);
          const expectedUser = String(args[1]);
          const clientPos = Number(args[2]) || 0;
          const newState = String(args[3]);
          let clientSpeed = Number(args[4]) || 1.0;
          const serverNowMs = Number(args[5]);
          const jitterTolSec = Number(args[7]) || 2.0;
          const maxIdleSec = Number(args[8]) || 120.0;

          const raw = cacheStore.get(key);
          if (!raw) return ['NOT_FOUND'];

          const session = JSON.parse(raw);
          if (session.userId !== expectedUser) return ['FORBIDDEN'];

          if (clientSpeed < 0.5 || clientSpeed > 2.0) {
            clientSpeed = 1.0;
          }

          const lastHeartbeatAt = session.lastHeartbeatAt || serverNowMs;
          let deltaWallSec = (serverNowMs - lastHeartbeatAt) / 1000.0;
          if (deltaWallSec < 0) deltaWallSec = 0;
          if (deltaWallSec > maxIdleSec) deltaWallSec = maxIdleSec;

          const lastPos = session.lastPositionSec || 0;
          const currentAccum = session.accumulatedListenSec || 0;
          const trackDuration = session.durationSeconds || 0;
          const prevState = session.state || 'PLAYING';

          let deltaCredit = 0;
          if (prevState === 'PLAYING') {
            const deltaPos = clientPos - lastPos;
            const maxAllowed = deltaWallSec * clientSpeed + jitterTolSec;

            if (deltaPos >= 0 && deltaPos <= maxAllowed) {
              deltaCredit = deltaPos;
            } else if (deltaPos > maxAllowed) {
              const wallCredit = deltaWallSec * clientSpeed;
              deltaCredit = wallCredit < deltaPos ? wallCredit : deltaPos;
            } else {
              deltaCredit = 0; // Rewind
            }
          } else {
            deltaCredit = 0; // Paused or buffering
          }

          const newAccum = Math.min(currentAccum + deltaCredit, trackDuration);
          const clampedPos = Math.min(Math.max(0, clientPos), trackDuration);

          session.lastPositionSec = clampedPos;
          session.accumulatedListenSec = newAccum;
          session.state = newState;
          session.playbackSpeed = clientSpeed;
          session.lastHeartbeatAt = serverNowMs;
          session.heartbeatCount = (session.heartbeatCount || 0) + 1;

          const updatedJson = JSON.stringify(session);
          cacheStore.set(key, updatedJson);
          return ['UPDATED', updatedJson];
        }

        // 2. DEDUP_AND_ENQUEUE_LUA
        if (script.includes('dedupKey') && script.includes('XADD')) {
          const dedupKey = String(args[0]);
          const payloadJson = String(args[4]);
          const enqueuedAt = String(args[5]);

          if (cacheStore.has(dedupKey)) {
            return ['DUPLICATE', cacheStore.get(dedupKey)];
          }

          const streamId = `${Date.now()}-${streamQueue.length}`;
          streamQueue.push({ streamId, payload: payloadJson, enqueuedAt });
          cacheStore.set(dedupKey, streamId);
          return ['ENQUEUED', streamId];
        }

        // 3. READ_BATCH_LUA
        if (script.includes('XREADGROUP')) {
          const batchSize = Number(args[3]) || 10;
          const pulled = streamQueue.splice(0, batchSize);
          for (const msg of pulled) {
            streamPel.set(msg.streamId, {
              consumer: String(args[2]),
              idleMs: 0,
              payload: msg.payload,
            });
          }
          return [
            [
              'aadat:stream:playback-events',
              pulled.map((m) => [m.streamId, ['payload', m.payload, 'enqueuedAt', m.enqueuedAt]]),
            ],
          ];
        }

        // 4. ACK_MESSAGE_LUA
        if (script.includes('XACK') && !script.includes('XADD')) {
          const streamId = String(args[2]);
          streamPel.delete(streamId);
          retryCounters.delete(streamId);
          return 1;
        }

        // 5. ROUTE_DLQ_LUA
        if (script.includes('XADD') && script.includes('errorReason')) {
          const streamId = String(args[3]);
          const payload = String(args[4]);
          const errorReason = String(args[5]);
          const retryCount = Number(args[6]);
          dlqQueue.push({ originalId: streamId, payload, errorReason, retryCount });
          streamPel.delete(streamId);
          retryCounters.delete(streamId);
          return 1;
        }

        // 6. AUTOCLAIM_LUA
        if (script.includes('XAUTOCLAIM')) {
          const minIdle = Number(args[3]) || 60000;
          const batchSize = Number(args[5]) || 10;
          const claimed: Array<[string, string[]]> = [];
          for (const [sId, item] of streamPel.entries()) {
            if (item.idleMs >= minIdle && claimed.length < batchSize) {
              claimed.push([sId, ['payload', item.payload]]);
            }
          }
          return ['0-0', claimed, []];
        }

        // 7. Retry counter increment
        if (script.includes('INCR') && script.includes('EXPIRE')) {
          const retryKey = String(args[0]);
          const count = (retryCounters.get(retryKey) || 0) + 1;
          retryCounters.set(retryKey, count);
          return count;
        }

        // 8. INSPECT_STREAM_LUA
        if (script.includes('XLEN') && script.includes('XPENDING')) {
          return [
            streamQueue.length + streamPel.size,
            dlqQueue.length,
            [streamPel.size, '1700000000000-0', '1700000000000-1', [['worker-1', streamPel.size]]],
          ];
        }

        // 9. Real-time HLL PFADD & ZINCRBY
        if (script.includes('PFADD')) {
          const dauKey = String(args[0]);
          const trackHllKey = String(args[1]);
          const trendingKey = String(args[2]);
          const userId = String(args[3]);
          const trackId = String(args[4]);
          const isQualified = String(args[5]);

          // Simple in-memory HLL approximation: store comma-separated set of IDs
          const dauSet = new Set((cacheStore.get(dauKey) || '').split(',').filter(Boolean));
          dauSet.add(userId);
          cacheStore.set(dauKey, Array.from(dauSet).join(','));

          const trackSet = new Set((cacheStore.get(trackHllKey) || '').split(',').filter(Boolean));
          trackSet.add(userId);
          cacheStore.set(trackHllKey, Array.from(trackSet).join(','));

          if (isQualified === '1' && trendingKey) {
            const zMap = JSON.parse(cacheStore.get(trendingKey) || '{}');
            zMap[trackId] = (zMap[trackId] || 0) + 1;
            cacheStore.set(trendingKey, JSON.stringify(zMap));
          }
          return 1;
        }

        // 10. PFCOUNT
        if (script.includes('PFCOUNT')) {
          const key = String(args[0]);
          const raw = cacheStore.get(key) || '';
          const count = raw.split(',').filter(Boolean).length;
          return count;
        }

        // 11. ZREVRANGE
        if (script.includes('ZREVRANGE')) {
          const key = String(args[0]);
          const zMap = JSON.parse(cacheStore.get(key) || '{}');
          const entries = Object.entries(zMap).sort((a: any, b: any) => b[1] - a[1]);
          const result: Array<string | number> = [];
          for (const [tId, score] of entries) {
            result.push(tId, score as number);
          }
          return result;
        }

        return null;
      }),
    };

    sessionRepo = new RedisPlaybackSessionRepository(mockCacheService);

    ingestionService = new PlaybackIngestionService({
      cacheService: mockCacheService,
    });

    realtimeAnalytics = new RealtimeAnalyticsService({
      cacheService: mockCacheService,
    });

    // Mock Database Service for persistence repository
    const mockDbService: IDatabaseService = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      isConnected: vi.fn().mockReturnValue(true),
      ping: vi.fn().mockResolvedValue(1),
      getClient: vi.fn().mockReturnValue({
        $queryRaw: vi.fn().mockResolvedValue([{ column_name: 'eventId' }]),
        listeningLog: {
          upsert: vi.fn().mockImplementation(async ({ create }: any) => ({
            id: 'log-uuid-1',
            ...create,
          })),
        },
        trackDailyMetric: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'tdm-1',
            date: new Date('2026-11-05'),
            trackId: 'track-standard',
            playCount: 42,
            uniqueListeners: 35,
            totalListenSeconds: BigInt(8400),
            skipCount: 5,
            completionCount: 30,
          }),
        },
        dailyPlatformMetric: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'dpm-1',
            date: new Date('2026-11-05'),
            dauExact: 120,
            totalPlays: 450,
            totalListenSeconds: BigInt(90000),
            uniqueTracksPlayed: 85,
            newRegistrations: 12,
          }),
        },
      }),
    };

    persistenceRepo = new PrismaPlaybackPersistenceRepository(mockDbService, {
      persistentIngestionEnabled: true,
    });

    sessionService = new PlaybackSessionService({
      sessionRepository: sessionRepo,
      trackLookupRepository: mockTrackRepository,
      ingestionService,
      timeProvider: () => simulatedTimeMs,
    });

    streamWorker = new PlaybackStreamWorker({
      cacheService: mockCacheService,
      persistenceRepository: persistenceRepo,
      realtimeAnalyticsService: realtimeAnalytics,
      consumerName: 'test-worker-1',
      maxRetries: 3,
    });
  });

  describe('1. Session Lifecycle & Authoritative Progression Validation', () => {
    it('creates an authenticated session with zero initial accumulated listening time', async () => {
      const session = await sessionService.startSession({
        userId: 'user-alice-123',
        trackId: 'track-standard',
        playbackContext: 'DISCOVERY',
      });

      expect(session.sessionId).toBeDefined();
      expect(session.trackId).toBe('track-standard');
      expect(session.durationSeconds).toBe(240);
      expect(session.startedAt).toBe(simulatedTimeMs);

      const inCache = await sessionRepo.getSession(session.sessionId);
      expect(inCache).not.toBeNull();
      expect(inCache?.accumulatedListenSec).toBe(0);
      expect(inCache?.state).toBe('PLAYING');
      expect(inCache?.lastPositionSec).toBe(0);
    });

    it('rejects session creation for non-existent track', async () => {
      await expect(
        sessionService.startSession({
          userId: 'user-alice-123',
          trackId: 'track-does-not-exist',
        })
      ).rejects.toThrow(TrackNotPlayableError);
    });

    it('rejects session creation for unreleased/DRAFT track', async () => {
      await expect(
        sessionService.startSession({
          userId: 'user-alice-123',
          trackId: 'track-draft',
        })
      ).rejects.toThrow(TrackNotPlayableError);
    });

    it('validates normal playback progression and increments accumulated seconds', async () => {
      const { sessionId } = await sessionService.startSession({
        userId: 'user-alice-123',
        trackId: 'track-standard',
      });

      // Advance server time by 10s
      simulatedTimeMs += 10000;

      // Client reports 10s position
      const hb = await sessionService.heartbeat({
        sessionId,
        userId: 'user-alice-123',
        positionSec: 10,
        state: 'PLAYING',
      });

      expect(hb.accumulatedListenSec).toBe(10);
      expect(hb.lastPositionSec).toBe(10);
      expect(hb.isQualifiedPlay).toBe(false); // < 30s
      expect(hb.isCompleted).toBe(false);
    });

    it('anti-abuse: restricts forward scrub/teleportation from accumulating unearned listening time', async () => {
      const { sessionId } = await sessionService.startSession({
        userId: 'user-alice-123',
        trackId: 'track-standard',
      });

      // User starts, then 5 seconds later client claims to be at position 180s (scrub forward)
      simulatedTimeMs += 5000;

      const hb = await sessionService.heartbeat({
        sessionId,
        userId: 'user-alice-123',
        positionSec: 180, // Scrubbed forward!
        state: 'PLAYING',
        playbackSpeed: 1.0,
      });

      // Position is updated to 180s, but accumulated listen time is clamped to wall clock (5s)!
      expect(hb.lastPositionSec).toBe(180);
      expect(hb.accumulatedListenSec).toBe(5); // Only 5s credited, not 180s!
      expect(hb.isQualifiedPlay).toBe(false);
    });

    it('anti-abuse: backward seek (rewind) updates position without subtracting or multiplying credit', async () => {
      const { sessionId } = await sessionService.startSession({
        userId: 'user-alice-123',
        trackId: 'track-standard',
      });

      // Legitimate playback up to 25s
      simulatedTimeMs += 25000;
      await sessionService.heartbeat({
        sessionId,
        userId: 'user-alice-123',
        positionSec: 25,
        state: 'PLAYING',
      });

      // User rewinds to 5s
      simulatedTimeMs += 2000;
      const rewindHb = await sessionService.heartbeat({
        sessionId,
        userId: 'user-alice-123',
        positionSec: 5,
        state: 'PLAYING',
      });

      expect(rewindHb.lastPositionSec).toBe(5);
      expect(rewindHb.accumulatedListenSec).toBe(25); // Kept previous 25s, no double credit or negative
    });

    it('pausing or buffering halts accumulated listening credit', async () => {
      const { sessionId } = await sessionService.startSession({
        userId: 'user-alice-123',
        trackId: 'track-standard',
      });

      simulatedTimeMs += 10000;
      await sessionService.heartbeat({
        sessionId,
        userId: 'user-alice-123',
        positionSec: 10,
        state: 'PAUSED', // Pauses playback
      });

      // 30 seconds pass while paused
      simulatedTimeMs += 30000;
      const pausedHb = await sessionService.heartbeat({
        sessionId,
        userId: 'user-alice-123',
        positionSec: 10,
        state: 'PAUSED',
      });

      expect(pausedHb.accumulatedListenSec).toBe(10); // Still 10s! Zero credit while paused.
    });

    it('playback speed scaling correctly credits progression within 0.5x to 2.0x envelope', async () => {
      const { sessionId } = await sessionService.startSession({
        userId: 'user-alice-123',
        trackId: 'track-standard',
      });

      // 10s elapsed at 1.5x speed -> 15s position advancement
      simulatedTimeMs += 10000;
      const hb = await sessionService.heartbeat({
        sessionId,
        userId: 'user-alice-123',
        positionSec: 15,
        state: 'PLAYING',
        playbackSpeed: 1.5,
      });

      expect(hb.accumulatedListenSec).toBe(15);
      expect(hb.lastPositionSec).toBe(15);
    });

    it('rejects cross-user session tampering', async () => {
      const { sessionId } = await sessionService.startSession({
        userId: 'user-alice-123',
        trackId: 'track-standard',
      });

      simulatedTimeMs += 5000;
      await expect(
        sessionService.heartbeat({
          sessionId,
          userId: 'attacker-bob-999', // Different user
          positionSec: 5,
          state: 'PLAYING',
        })
      ).rejects.toThrow(UnauthorizedSessionAccessError);
    });

    it('rejects heartbeat for expired or non-existent session', async () => {
      await expect(
        sessionService.heartbeat({
          sessionId: randomUUID(),
          userId: 'user-alice-123',
          positionSec: 10,
          state: 'PLAYING',
        })
      ).rejects.toThrow(SessionNotFoundError);
    });
  });

  describe('2. Playback Qualification Standards', () => {
    it('classifies playback < 30s as a skip (not a qualified play)', async () => {
      const { sessionId } = await sessionService.startSession({
        userId: 'user-alice-123',
        trackId: 'track-standard',
      });

      simulatedTimeMs += 15000;
      await sessionService.heartbeat({
        sessionId,
        userId: 'user-alice-123',
        positionSec: 15,
        state: 'PLAYING',
      });

      const finishResult = await sessionService.finishSession({
        sessionId,
        userId: 'user-alice-123',
        eventId: randomUUID(),
        reason: 'USER_STOPPED',
      });

      expect(finishResult.accumulatedListenSec).toBe(15);
      expect(finishResult.isQualifiedPlay).toBe(false);
      expect(finishResult.wasSkipped).toBe(true);
      expect(finishResult.isCompleted).toBe(false);
    });

    it('classifies playback >= 30s as a qualified play', async () => {
      const { sessionId } = await sessionService.startSession({
        userId: 'user-alice-123',
        trackId: 'track-standard',
      });

      // User listens for 35 seconds
      simulatedTimeMs += 35000;
      await sessionService.heartbeat({
        sessionId,
        userId: 'user-alice-123',
        positionSec: 35,
        state: 'PLAYING',
      });

      const finishResult = await sessionService.finishSession({
        sessionId,
        userId: 'user-alice-123',
        eventId: randomUUID(),
        reason: 'USER_STOPPED',
      });

      expect(finishResult.accumulatedListenSec).toBe(35);
      expect(finishResult.isQualifiedPlay).toBe(true);
      expect(finishResult.wasSkipped).toBe(false);
      expect(finishResult.isCompleted).toBe(false);
    });

    it('classifies short track (< 30s) as qualified play only when 100% completed', async () => {
      const { sessionId } = await sessionService.startSession({
        userId: 'user-alice-123',
        trackId: 'track-short', // 20 seconds duration
      });

      // Listen for 15s (less than 20s full track)
      simulatedTimeMs += 15000;
      await sessionService.heartbeat({
        sessionId,
        userId: 'user-alice-123',
        positionSec: 15,
        state: 'PLAYING',
      });

      // Partial finish
      const partialFinish = await sessionService.finishSession({
        sessionId,
        userId: 'user-alice-123',
        eventId: randomUUID(),
        reason: 'USER_STOPPED',
      });

      expect(partialFinish.isQualifiedPlay).toBe(false); // Did not finish 100% of short track

      // Start new session and listen to 100% (20s)
      const { sessionId: session2 } = await sessionService.startSession({
        userId: 'user-alice-123',
        trackId: 'track-short',
      });

      simulatedTimeMs += 20000;
      await sessionService.heartbeat({
        sessionId: session2,
        userId: 'user-alice-123',
        positionSec: 20,
        state: 'PLAYING',
      });

      const fullFinish = await sessionService.finishSession({
        sessionId: session2,
        userId: 'user-alice-123',
        eventId: randomUUID(),
        reason: 'COMPLETED',
      });

      expect(fullFinish.isQualifiedPlay).toBe(true);
      expect(fullFinish.isCompleted).toBe(true);
    });

    it('classifies playback reaching >= 90% duration as completed', async () => {
      const { sessionId } = await sessionService.startSession({
        userId: 'user-alice-123',
        trackId: 'track-standard', // 240 seconds
      });

      // 90% of 240s is 216s. Send periodic heartbeats (75s, 150s, 220s)
      simulatedTimeMs += 75000;
      await sessionService.heartbeat({
        sessionId,
        userId: 'user-alice-123',
        positionSec: 75,
        state: 'PLAYING',
      });

      simulatedTimeMs += 75000;
      await sessionService.heartbeat({
        sessionId,
        userId: 'user-alice-123',
        positionSec: 150,
        state: 'PLAYING',
      });

      simulatedTimeMs += 70000;
      await sessionService.heartbeat({
        sessionId,
        userId: 'user-alice-123',
        positionSec: 220,
        state: 'PLAYING',
      });

      const finishResult = await sessionService.finishSession({
        sessionId,
        userId: 'user-alice-123',
        eventId: randomUUID(),
        reason: 'COMPLETED',
      });

      expect(finishResult.isQualifiedPlay).toBe(true);
      expect(finishResult.isCompleted).toBe(true);
    });

    it('cleans up session from Redis upon completion', async () => {
      const { sessionId } = await sessionService.startSession({
        userId: 'user-alice-123',
        trackId: 'track-standard',
      });

      simulatedTimeMs += 35000;
      await sessionService.finishSession({
        sessionId,
        userId: 'user-alice-123',
        eventId: randomUUID(),
        reason: 'COMPLETED',
      });

      const sessionAfterFinish = await sessionRepo.getSession(sessionId);
      expect(sessionAfterFinish).toBeNull();
    });
  });

  describe('3. Idempotent Ingestion & Atomic Deduplication', () => {
    it('accepts and enqueues event on first presentation', async () => {
      const eventId = randomUUID();
      const result = await ingestionService.ingestEvent({
        eventId,
        userId: 'user-alice-123',
        trackId: 'track-standard',
        durationSec: 45,
        trackDurationSec: 240,
        wasSkipped: false,
        completed: false,
        timestamp: simulatedTimeMs,
      });

      expect(result.status).toBe('ACCEPTED');
      expect(result.deduplicated).toBe(false);
      expect(result.streamId).toBeDefined();
      expect(streamQueue.length).toBe(1);
    });

    it('deduplicates identical eventId and prevents double-enqueue into stream', async () => {
      const eventId = randomUUID();
      const event = {
        eventId,
        userId: 'user-alice-123',
        trackId: 'track-standard',
        durationSec: 45,
        trackDurationSec: 240,
        wasSkipped: false,
        completed: false,
        timestamp: simulatedTimeMs,
      };

      const res1 = await ingestionService.ingestEvent(event);
      expect(res1.status).toBe('ACCEPTED');
      expect(streamQueue.length).toBe(1);

      // Replay / duplicate submission
      const res2 = await ingestionService.ingestEvent(event);
      expect(res2.status).toBe('DUPLICATE');
      expect(res2.deduplicated).toBe(true);
      expect(streamQueue.length).toBe(1); // Still exactly 1, no duplicate stream entry!
    });

    it('rejects event with invalid eventId format', async () => {
      await expect(
        ingestionService.ingestEvent({
          eventId: 'not-a-uuid',
          userId: 'user-alice-123',
          trackId: 'track-standard',
          durationSec: 45,
          trackDurationSec: 240,
          wasSkipped: false,
          completed: false,
          timestamp: simulatedTimeMs,
        })
      ).rejects.toThrow(ValidationFailedError);
    });

    it('does not register dedup marker if stream enqueue returns operational error', async () => {
      // Temporarily mock eval to simulate Redis stream failure
      vi.spyOn(mockCacheService, 'eval').mockResolvedValueOnce(['ERROR', 'ERR OOM command not allowed']);

      const eventId = randomUUID();
      await expect(
        ingestionService.ingestEvent({
          eventId,
          userId: 'user-alice-123',
          trackId: 'track-standard',
          durationSec: 45,
          trackDurationSec: 240,
          wasSkipped: false,
          completed: false,
          timestamp: simulatedTimeMs,
        })
      ).rejects.toThrow(PlaybackIngestionError);

      // Verify dedup marker was NOT created
      const isDeduped = await ingestionService.isEventDeduplicated(eventId);
      expect(isDeduped).toBe(false);
    });
  });

  describe('4. Stream Consumer Worker & Poison Pill / DLQ Protection', () => {
    it('initializes consumer group idempotently', async () => {
      await expect(streamWorker.initializeConsumerGroup()).resolves.not.toThrow();
    });

    it('processes batch of stream messages and acknowledges them', async () => {
      // Ingest 2 events
      await ingestionService.ingestEvent({
        eventId: randomUUID(),
        userId: 'user-alice-123',
        trackId: 'track-standard',
        durationSec: 60,
        trackDurationSec: 240,
        wasSkipped: false,
        completed: false,
        timestamp: simulatedTimeMs,
      });

      await ingestionService.ingestEvent({
        eventId: randomUUID(),
        userId: 'user-bob-456',
        trackId: 'track-standard',
        durationSec: 120,
        trackDurationSec: 240,
        wasSkipped: false,
        completed: false,
        timestamp: simulatedTimeMs,
      });

      expect(streamQueue.length).toBe(2);

      const batchResult = await streamWorker.processNextBatch(10);
      expect(batchResult.processedCount).toBe(2);
      expect(batchResult.acknowledgedCount).toBe(2);
      expect(batchResult.deadLetterCount).toBe(0);
      expect(streamPel.size).toBe(0); // Messages acknowledged and removed from PEL
    });

    it('routes poison pills to dead-letter queue (DLQ) after exceeding max retries', async () => {
      // Queue a malformed message that throws on JSON.parse or unhandled error
      const badStreamId = 'poison-stream-1';
      streamQueue.push({
        streamId: badStreamId,
        payload: '{ bad-json-payload',
        enqueuedAt: new Date().toISOString(),
      });

      // Process attempt 1 (fails, stays in PEL)
      const res1 = await streamWorker.processNextBatch(1);
      expect(res1.processedCount).toBe(0);
      expect(res1.deadLetterCount).toBe(0);
      expect(streamPel.has(badStreamId)).toBe(true);

      // Simulate recovery retry 2
      const pelItem = streamPel.get(badStreamId)!;
      pelItem.idleMs = 70000; // > 60s idle
      const res2 = await streamWorker.recoverPendingMessages(1);
      expect(res2.deadLetterCount).toBe(0);

      // Simulate recovery retry 3
      pelItem.idleMs = 70000;
      const res3 = await streamWorker.recoverPendingMessages(1);
      expect(res3.deadLetterCount).toBe(0);

      // Simulate recovery retry 4 (maxRetries is 3 -> this attempt routes to DLQ)
      pelItem.idleMs = 70000;
      const res4 = await streamWorker.recoverPendingMessages(1);
      expect(res4.deadLetterCount).toBe(1);

      // Verify message was moved to DLQ and removed from PEL
      expect(streamPel.has(badStreamId)).toBe(false);
      expect(dlqQueue.length).toBe(1);
      expect(dlqQueue[0]?.originalId).toBe(badStreamId);
      expect(dlqQueue[0]?.retryCount).toBeGreaterThanOrEqual(4);
    });

    it('inspects stream health and reports pending messages count', async () => {
      const health = await streamWorker.inspectStreamHealth();
      expect(health.streamLength).toBeGreaterThanOrEqual(0);
      expect(health.deadLetterQueueLength).toBeDefined();
      expect(health.retentionWarning).toBe(false);
    });
  });

  describe('5. Separation of Real-Time Estimates from Exact Metrics', () => {
    it('returns HyperLogLog real-time DAU and unique listeners with explicit estimate tags', async () => {
      // Ingest events for Alice and Bob
      await ingestionService.ingestEvent({
        eventId: randomUUID(),
        userId: 'user-alice-123',
        trackId: 'track-standard',
        durationSec: 60,
        trackDurationSec: 240,
        wasSkipped: false,
        completed: false,
        timestamp: simulatedTimeMs,
      });

      await ingestionService.ingestEvent({
        eventId: randomUUID(),
        userId: 'user-bob-456',
        trackId: 'track-standard',
        durationSec: 60,
        trackDurationSec: 240,
        wasSkipped: false,
        completed: false,
        timestamp: simulatedTimeMs,
      });

      // Process batch
      await streamWorker.processNextBatch(10);

      const dateStr = new Date(simulatedTimeMs).toISOString().slice(0, 10);
      const estDau = await realtimeAnalytics.getEstimatedDau(dateStr);

      expect(estDau.isEstimate).toBe(true);
      expect(estDau.algorithm).toBe('HyperLogLog');
      expect(estDau.value).toBe(2);

      const trackListeners = await realtimeAnalytics.getEstimatedTrackUniqueListeners(
        dateStr,
        'track-standard'
      );
      expect(trackListeners.isEstimate).toBe(true);
      expect(trackListeners.value).toBe(2);
    });

    it('returns trending tracks from sorted set', async () => {
      const date = new Date(simulatedTimeMs);
      const dateStr = date.toISOString().slice(0, 10);
      const hourStr = `${dateStr}-${String(date.getUTCHours()).padStart(2, '0')}`;

      // Ingest 2 qualified plays for track-standard
      await ingestionService.ingestEvent({
        eventId: randomUUID(),
        userId: 'user-alice-123',
        trackId: 'track-standard',
        durationSec: 60, // qualified
        trackDurationSec: 240,
        wasSkipped: false,
        completed: false,
        timestamp: simulatedTimeMs,
      });

      await streamWorker.processNextBatch(10);

      const trending = await realtimeAnalytics.getTrendingTracks(hourStr, 5);
      expect(trending.length).toBeGreaterThanOrEqual(1);
      expect(trending[0]?.trackId).toBe('track-standard');
      expect(trending[0]?.score).toBe(1);
    });

    it('persists exact PostgreSQL metrics when persistent ingestion is enabled', async () => {
      const eventId = randomUUID();
      const res = await persistenceRepo.saveListeningLog({
        eventId,
        userId: 'user-alice-123',
        trackId: 'track-standard',
        durationSec: 45,
        trackDurationSec: 240,
        wasSkipped: false,
        completed: false,
        timestamp: simulatedTimeMs,
      });

      expect(res.persisted).toBe(true);
      expect(res.id).toBeDefined();

      const exactTrack = await persistenceRepo.getExactTrackDailyMetric(
        new Date('2026-11-05'),
        'track-standard'
      );
      expect(exactTrack).not.toBeNull();
      expect(exactTrack?.playCount).toBe(42);

      const exactPlatform = await persistenceRepo.getExactDailyPlatformMetric(
        new Date('2026-11-05')
      );
      expect(exactPlatform).not.toBeNull();
      expect(exactPlatform?.dauExact).toBe(120);
    });

    it('migration guardrail: halts database writes gracefully if persistent ingestion is disabled', async () => {
      const guardedRepo = new PrismaPlaybackPersistenceRepository(
        {} as IDatabaseService,
        { persistentIngestionEnabled: false }
      );

      const ready = await guardedRepo.isPersistentIngestionReady();
      expect(ready).toBe(false);

      const res = await guardedRepo.saveListeningLog({
        eventId: randomUUID(),
        userId: 'user-alice-123',
        trackId: 'track-standard',
        durationSec: 45,
        trackDurationSec: 240,
        wasSkipped: false,
        completed: false,
        timestamp: simulatedTimeMs,
      });

      expect(res.persisted).toBe(false);
      expect(res.migrationPending).toBe(true);
    });
  });

  describe('6. Fastify HTTP Endpoints Integration', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
      app = Fastify();
      app.setErrorHandler(ErrorHandlerMiddleware.handle);

      const controller = new PlaybackAnalyticsController({
        authGuard: mockAuthGuard,
        sessionService,
        ingestionService,
        realtimeAnalyticsService: realtimeAnalytics,
        persistenceRepository: persistenceRepo,
        streamWorker,
      });

      controller.registerRoutes(app);
      await app.ready();
    });

    it('POST /api/v1/playback/sessions/start returns 201 with session info', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/playback/sessions/start',
        headers: { authorization: 'Bearer token-alice' },
        payload: {
          trackId: 'track-standard',
          playbackContext: 'DISCOVERY',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.sessionId).toBeDefined();
      expect(body.durationSeconds).toBe(240);
    });

    it('POST /api/v1/playback/sessions/:sessionId/heartbeat returns 200 with progression', async () => {
      const startRes = await app.inject({
        method: 'POST',
        url: '/api/v1/playback/sessions/start',
        headers: { authorization: 'Bearer token-alice' },
        payload: { trackId: 'track-standard' },
      });
      const { sessionId } = JSON.parse(startRes.body);

      simulatedTimeMs += 10000;

      const hbRes = await app.inject({
        method: 'POST',
        url: `/api/v1/playback/sessions/${sessionId}/heartbeat`,
        headers: { authorization: 'Bearer token-alice' },
        payload: {
          positionSec: 10,
          state: 'PLAYING',
          playbackSpeed: 1.0,
        },
      });

      expect(hbRes.statusCode).toBe(200);
      const hbBody = JSON.parse(hbRes.body);
      expect(hbBody.accumulatedListenSec).toBe(10);
      expect(hbBody.state).toBe('PLAYING');
    });

    it('POST /api/v1/playback/sessions/:sessionId/finish returns 200 with qualification', async () => {
      const startRes = await app.inject({
        method: 'POST',
        url: '/api/v1/playback/sessions/start',
        headers: { authorization: 'Bearer token-alice' },
        payload: { trackId: 'track-standard' },
      });
      const { sessionId } = JSON.parse(startRes.body);

      simulatedTimeMs += 35000;
      await app.inject({
        method: 'POST',
        url: `/api/v1/playback/sessions/${sessionId}/heartbeat`,
        headers: { authorization: 'Bearer token-alice' },
        payload: { positionSec: 35, state: 'PLAYING' },
      });

      const finishRes = await app.inject({
        method: 'POST',
        url: `/api/v1/playback/sessions/${sessionId}/finish`,
        headers: { authorization: 'Bearer token-alice' },
        payload: {
          eventId: randomUUID(),
          reason: 'COMPLETED',
        },
      });

      expect(finishRes.statusCode).toBe(200);
      const finishBody = JSON.parse(finishRes.body);
      expect(finishBody.isQualifiedPlay).toBe(true);
      expect(finishBody.wasSkipped).toBe(false);
    });

    it('POST /api/v1/playback/events/ingest accepts valid event with 202 and duplicate with 200', async () => {
      const eventId = randomUUID();
      const payload = {
        eventId,
        trackId: 'track-standard',
        durationSec: 40,
        trackDurationSec: 240,
        wasSkipped: false,
        completed: false,
      };

      const res1 = await app.inject({
        method: 'POST',
        url: '/api/v1/playback/events/ingest',
        headers: { authorization: 'Bearer token-alice' },
        payload,
      });

      expect(res1.statusCode).toBe(202);
      expect(JSON.parse(res1.body).status).toBe('ACCEPTED');

      // Duplicate submission
      const res2 = await app.inject({
        method: 'POST',
        url: '/api/v1/playback/events/ingest',
        headers: { authorization: 'Bearer token-alice' },
        payload,
      });

      expect(res2.statusCode).toBe(200);
      expect(JSON.parse(res2.body).status).toBe('DUPLICATE');
    });

    it('GET /api/v1/playback/analytics/realtime/dau returns estimated DAU', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/playback/analytics/realtime/dau',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.isEstimate).toBe(true);
      expect(body.algorithm).toBe('HyperLogLog');
    });

    it('GET /api/v1/playback/analytics/exact/daily returns authoritative exact metric', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/playback/analytics/exact/daily?date=2026-11-05&trackId=track-standard',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.isEstimate).toBe(false);
      expect(body.metric.playCount).toBe(42);
    });
  });
});
