import { FastifyInstance } from 'fastify';
import { ICacheService } from '../../infrastructure/cache/contracts/cache.contract.js';
import { IDatabaseService } from '../../infrastructure/database/contracts/database.contract.js';
import { IAuthGuard } from '../../shared/guards/contracts/auth-guard.contract.js';
import { IPlaybackSessionRepository } from './contracts/playback-session.contract.js';
import { RedisPlaybackSessionRepository } from './repositories/redis-playback-session.repository.js';
import { ITrackLookupRepository } from './contracts/track-lookup-repository.contract.js';
import { PrismaTrackLookupRepository } from './repositories/prisma-track-lookup.repository.js';
import { IPlaybackPersistenceRepository } from './contracts/playback-persistence.contract.js';
import { PrismaPlaybackPersistenceRepository } from './repositories/prisma-playback-persistence.repository.js';
import { IPlaybackSessionService } from './contracts/playback-session.contract.js';
import { PlaybackSessionService } from './services/playback-session.service.js';
import { IPlaybackIngestionService } from './contracts/playback-ingestion.contract.js';
import { PlaybackIngestionService } from './services/playback-ingestion.service.js';
import { IRealtimeAnalyticsService } from './contracts/realtime-analytics.contract.js';
import { RealtimeAnalyticsService } from './services/realtime-analytics.service.js';
import { IPlaybackStreamWorker } from './contracts/playback-stream.contract.js';
import { PlaybackStreamWorker } from './workers/playback-stream.worker.js'; // Note: we'll use .js
import { PlaybackAnalyticsController } from './controllers/playback-analytics.controller.js';

export interface IAnalyticsModuleDependencies {
  readonly cacheService: ICacheService;
  readonly databaseService: IDatabaseService;
  readonly authGuard: IAuthGuard;
  readonly sessionRepository?: IPlaybackSessionRepository;
  readonly trackLookupRepository?: ITrackLookupRepository;
  readonly persistenceRepository?: IPlaybackPersistenceRepository;
  readonly sessionService?: IPlaybackSessionService;
  readonly ingestionService?: IPlaybackIngestionService;
  readonly realtimeAnalyticsService?: IRealtimeAnalyticsService;
  readonly streamWorker?: IPlaybackStreamWorker;
  readonly persistentIngestionEnabled?: boolean;
}

/**
 * Analytics Module Composition Root
 * Wires repositories, session service, ingestion service, stream worker, and controller.
 * Adheres strictly to OOP, SOLID, DI, and ESM.
 */
export class AnalyticsModule {
  private readonly dependencies: IAnalyticsModuleDependencies;
  private readonly sessionRepository: IPlaybackSessionRepository;
  private readonly trackLookupRepository: ITrackLookupRepository;
  private readonly persistenceRepository: IPlaybackPersistenceRepository;
  private readonly sessionService: IPlaybackSessionService;
  private readonly ingestionService: IPlaybackIngestionService;
  private readonly realtimeAnalyticsService: IRealtimeAnalyticsService;
  private readonly streamWorker: IPlaybackStreamWorker;
  private readonly controller: PlaybackAnalyticsController;

  public constructor(dependencies: IAnalyticsModuleDependencies) {
    this.dependencies = dependencies;

    this.sessionRepository =
      dependencies.sessionRepository ??
      new RedisPlaybackSessionRepository(dependencies.cacheService);

    this.trackLookupRepository =
      dependencies.trackLookupRepository ??
      new PrismaTrackLookupRepository(dependencies.databaseService);

    this.persistenceRepository =
      dependencies.persistenceRepository ??
      new PrismaPlaybackPersistenceRepository(dependencies.databaseService, {
        persistentIngestionEnabled: dependencies.persistentIngestionEnabled,
      });

    this.ingestionService =
      dependencies.ingestionService ??
      new PlaybackIngestionService({
        cacheService: dependencies.cacheService,
      });

    this.realtimeAnalyticsService =
      dependencies.realtimeAnalyticsService ??
      new RealtimeAnalyticsService({
        cacheService: dependencies.cacheService,
      });

    this.sessionService =
      dependencies.sessionService ??
      new PlaybackSessionService({
        sessionRepository: this.sessionRepository,
        trackLookupRepository: this.trackLookupRepository,
        ingestionService: this.ingestionService,
      });

    this.streamWorker =
      dependencies.streamWorker ??
      new PlaybackStreamWorker({
        cacheService: dependencies.cacheService,
        persistenceRepository: this.persistenceRepository,
        realtimeAnalyticsService: this.realtimeAnalyticsService,
      });

    this.controller = new PlaybackAnalyticsController({
      authGuard: dependencies.authGuard,
      sessionService: this.sessionService,
      ingestionService: this.ingestionService,
      realtimeAnalyticsService: this.realtimeAnalyticsService,
      persistenceRepository: this.persistenceRepository,
      streamWorker: this.streamWorker,
    });
  }

  public registerRoutes(fastify: FastifyInstance): void {
    this.controller.registerRoutes(fastify);
  }

  public getSessionService(): IPlaybackSessionService {
    return this.sessionService;
  }

  public getIngestionService(): IPlaybackIngestionService {
    return this.ingestionService;
  }

  public getRealtimeAnalyticsService(): IRealtimeAnalyticsService {
    return this.realtimeAnalyticsService;
  }

  public getPersistenceRepository(): IPlaybackPersistenceRepository {
    return this.persistenceRepository;
  }

  public getStreamWorker(): IPlaybackStreamWorker {
    return this.streamWorker;
  }

  public getDependencies(): IAnalyticsModuleDependencies {
    return this.dependencies;
  }
}
