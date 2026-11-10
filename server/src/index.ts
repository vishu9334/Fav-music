import { DevelopmentCatalogModule } from './modules/development-catalog/development-catalog.module.js';
import { ProfileService } from './modules/auth/services/profile.service.js';
import { AccountLibraryService } from './modules/account-library/account-library.service.js';
import { AccountLibraryController } from './modules/account-library/account-library.controller.js';
import { PrismaAccountLibraryRepository } from './modules/account-library/prisma-account-library.repository.js';
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import mercurius, { IResolverObject } from 'mercurius';
import {
  MAX_ROOM_PARTICIPANTS,
  TAKEOVER_PROMPT_TIMEOUT_MS,
  FAILED_TAKEOVER_CLEANUP_INTERVAL_MS,
  RoomAccess,
  RoomChatPolicy,
  GRAPHQL_SCHEMA_STRING,
} from '@aadat/contracts';
import {
  IDatabaseService,
  PrismaDatabaseService,
} from './infrastructure/database/index.js';
import {
  ICacheService,
  RedisCacheService,
} from './infrastructure/cache/index.js';
import {
  IS3StorageService,
  S3StorageService,
} from './infrastructure/storage/index.js';
import {
  IWeatherService,
  OpenWeatherService,
} from './infrastructure/weather/index.js';
import { ServerEnvironmentConfig, ConfigurationError } from './infrastructure/config/index.js';
import { ErrorHandlerMiddleware } from './shared/middleware/index.js';
import { RootGraphQLResolvers } from './shared/graphql/index.js';
import { HealthModule } from './modules/health/index.js';
import { AuthGraphQLController } from './modules/auth/controllers/auth-graphql.controller.js';
import { GraphQLErrorFormatter } from './shared/graphql/graphql-error-formatter.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { WarehouseModule } from './modules/warehouse/warehouse.module.js';
import { RoomsModule } from './modules/rooms/rooms.module.js';
import { InstaMusModule } from './modules/instamus/instamus.module.js';
import { GlobalPlayModule } from './modules/global-play/global-play.module.js';
import { MediaModule } from './modules/media/index.js';
import { AnalyticsModule } from './modules/analytics/index.js';

/**
 * Server Bootstrap Configuration
 */
export interface IServerBootstrapConfig {
  readonly port: number;
  readonly host: string;
  readonly nodeEnv?: 'development' | 'production' | 'test';
  readonly enableLogging?: boolean;
  readonly enableGraphiql?: boolean;
  readonly rateLimitGlobalMax?: number;
  readonly rateLimitGlobalTimeWindowMs?: number;
  readonly rateLimitAuthMax?: number;
  readonly rateLimitAuthTimeWindowMs?: number;
}

/**
 * Abstract Lifecycle Component (SOLID - Interface Segregation)
 */
export interface ILifecycleComponent {
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Application Dependencies Interface (Dependency Inversion Principle)
 */
export interface IApplicationDependencies {
  readonly databaseService: IDatabaseService;
  readonly cacheService: ICacheService;
  readonly storageService?: IS3StorageService;
  readonly weatherService?: IWeatherService;
  readonly authModule?: AuthModule;
  readonly mediaModule?: MediaModule;
  readonly analyticsModule?: AnalyticsModule;
}

/**
 * Server Application Bootstrap
 * Strictly adheres to OOP & SOLID: receives all dependencies via constructor injection.
 * Manages Fastify lifecycle, Mercurius GraphQL, security middleware, and module composition roots.
 */
export class AadatServerApplication implements ILifecycleComponent {
  private readonly config: IServerBootstrapConfig;
  private readonly databaseService: IDatabaseService;
  private readonly cacheService: ICacheService;
  private readonly fastify: FastifyInstance;
  private readonly developmentCatalog: DevelopmentCatalogModule | null;
  private isRunning: boolean = false;
  private databaseStarted = false;
  private cacheStarted = false;
  private starting: Promise<void> | null = null;
  private stopping: Promise<void> | null = null;

  // Feature Module Composition Roots (Modular Monolith)
  public readonly healthModule: HealthModule;
  public readonly authModule: AuthModule;
  public readonly mediaModule: MediaModule;
  public readonly catalogModule: CatalogModule;
  public readonly warehouseModule: WarehouseModule;
  public readonly roomsModule: RoomsModule;
  public readonly instamusModule: InstaMusModule;
  public readonly globalPlayModule: GlobalPlayModule;
  public readonly analyticsModule: AnalyticsModule;

  public constructor(
    config: IServerBootstrapConfig,
    dependencies: IApplicationDependencies
  ) {
    this.config = config;
    this.databaseService = dependencies.databaseService;
    this.cacheService = dependencies.cacheService;

    const storage =
      dependencies.storageService ??
      new S3StorageService({
        bucketName: process.env['AWS_S3_BUCKET_NAME'] ?? 'aadat-music-media-private',
        region: process.env['AWS_REGION'] ?? 'ap-south-1',
      });

    const weather =
      dependencies.weatherService ??
      new OpenWeatherService({
        apiKey: process.env['OPENWEATHER_API_KEY'] ?? '',
      });

    // Initialize Feature Module Composition Roots
    this.healthModule = new HealthModule({
      databaseService: this.databaseService,
      cacheService: this.cacheService,
    });

    this.authModule =
      dependencies.authModule ??
      new AuthModule({
        databaseService: this.databaseService,
        cacheService: this.cacheService,
        rateLimitAuthMax: config.rateLimitAuthMax,
        rateLimitAuthTimeWindowMs: config.rateLimitAuthTimeWindowMs,
      });

    this.mediaModule =
      dependencies.mediaModule ??
      new MediaModule({
        storageService: storage,
        cacheService: this.cacheService,
        databaseService: this.databaseService,
        authGuard: this.authModule.getAuthGuard(),
      });

    this.catalogModule = new CatalogModule({
      databaseService: this.databaseService,
      storageService: storage,
    });

    this.developmentCatalog = DevelopmentCatalogModule.fromEnvironment(this.catalogModule.getService(), { ...process.env, NODE_ENV: config.nodeEnv });

    this.warehouseModule = new WarehouseModule({
      databaseService: this.databaseService,
    });

    this.roomsModule = new RoomsModule({
      databaseService: this.databaseService,
      cacheService: this.cacheService,
      authGuard: this.authModule.getAuthGuard(),
      corsOrigins: (process.env['CORS_ORIGIN'] ?? 'http://localhost:3000,http://localhost:8081')
        .split(',')
        .map((o) => o.trim()),
    });

    this.instamusModule = new InstaMusModule({
      databaseService: this.databaseService,
      catalog:this.catalogModule.getService(),
    });

    this.globalPlayModule = new GlobalPlayModule({
      databaseService: this.databaseService,
      weatherService: weather,
    });

    this.analyticsModule =
      dependencies.analyticsModule ??
      new AnalyticsModule({
        cacheService: this.cacheService,
        databaseService: this.databaseService,
        authGuard: this.authModule.getAuthGuard(),
      });

    // Initialize Fastify Instance
    this.fastify = Fastify({
      logger: config.enableLogging ? {
        redact: { paths: ['req.headers.authorization', 'req.body.variables', 'req.body.idToken',
          'req.body.refreshToken', 'res.body.accessToken', 'res.body.refreshToken'], censor: '[REDACTED]' },
      } : false,
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupGraphQL();
  }

  private setupMiddleware(): void {
    // Centralized Error Handler
    this.fastify.setErrorHandler((error, request, reply) => {
      ErrorHandlerMiddleware.handle(error, request, reply);
    });

    // Security Headers (Helmet)
    this.fastify.register(helmet, {
      contentSecurityPolicy: false, // Required for Mercurius GraphiQL if enabled
    });

    // CORS Configuration
    const corsOrigins = (process.env['CORS_ORIGIN'] ?? 'http://localhost:3000,http://localhost:8081')
      .split(',')
      .map((o) => o.trim());

    this.fastify.register(cors, {
      origin: corsOrigins,
      credentials: true,
    });

    // Distributed Rate Limiting (Redis-backed)
    const isProduction =
      this.config.nodeEnv === 'production' || process.env['NODE_ENV'] === 'production';

    let redisClient: unknown;
    if (this.cacheService instanceof RedisCacheService) {
      redisClient = this.cacheService.getClient();
    }

    if (isProduction && !redisClient) {
      throw new ConfigurationError(
        'Redis-backed distributed rate limiting is mandatory in production. Silent in-memory fallback is prohibited.'
      );
    }

    const globalMax = this.config.rateLimitGlobalMax ?? 100;
    const globalTimeWindowMs = this.config.rateLimitGlobalTimeWindowMs ?? 60000;

    this.fastify.register(rateLimit, {
      global: true,
      max: globalMax,
      timeWindow: globalTimeWindowMs,
      redis: redisClient ?? undefined,
      nameSpace: 'aadat:ratelimit:',
      skipOnError: false, // Strict: do not bypass rate limiting on store errors
      errorResponseBuilder: (_request, context) => {
        return {
          statusCode: 429,
          error: 'Too Many Requests',
          message: `Rate limit exceeded, retry in ${context.after}`,
          timestamp: new Date().toISOString(),
        };
      },
    });
  }

  private setupRoutes(): void {
    this.fastify.register(async (app) => {
      // Register Health Module Routes (/health, /health/live, /health/ready)
      this.healthModule.registerRoutes(app);
      this.developmentCatalog?.register(app);

      // Register Auth Module Routes (/api/auth/google, /api/auth/refresh, /api/auth/logout, /api/auth/me)
      this.authModule.registerRoutes(app);

      // Register Media Module Routes (/api/v1/media/upload-ticket, /api/v1/media/confirm-upload, /api/v1/media/playback-url)
      this.mediaModule.registerRoutes(app);

      // Register Analytics Module Routes (/api/v1/playback/sessions/*, /api/v1/playback/events/*, /api/v1/playback/analytics/*)
      this.analyticsModule.registerRoutes(app);

      // Register Rooms Module Routes (/api/v1/rooms)
      this.roomsModule.registerRoutes(app);

      // Register Global Play Module Routes (/api/v1/weather)
      this.globalPlayModule.registerRoutes(app);

      // Root Info Route
      app.get('/', async (_request, reply) => {
        reply.status(200).send({
          name: 'Aadat Music API',
          version: '0.1.0',
          status: 'online',
          endpoints: {
            health: '/health',
            auth: '/api/auth',
            media: '/api/v1/media',
            playback: '/api/v1/playback',
            rooms: '/api/v1/rooms',
            weather: '/api/v1/weather',
            graphql: '/graphql',
          },
        });
      });
    });
  }

  private setupGraphQL(): void {
    const rootResolvers = new RootGraphQLResolvers({
      healthService: this.healthModule.getService(),
      userRepository: this.authModule.getUserRepository(),
    });

    const authGuard = this.authModule.getAuthGuard();

    const root = rootResolvers.buildResolvers();
    const accountService = new AccountLibraryService(new PrismaAccountLibraryRepository(this.databaseService,this.catalogModule.getService()), process.env['ACCOUNT_PERSISTENCE_ENABLED'] === 'true');
    const account = new AccountLibraryController(accountService).buildResolvers();
    const auth = new AuthGraphQLController(
      this.authModule.getAuthService(),
      accountService.isEnabled(),
      new ProfileService(this.authModule.getUserRepository(), accountService.isEnabled() && this.authModule.getAuthService().isEnabled?.() === true),
      this.mediaModule.getStorageService()
    ).buildResolvers();
    const catalog = this.catalogModule.getController().buildResolvers();
    this.fastify.register(mercurius, {
      schema: GRAPHQL_SCHEMA_STRING,
      resolvers: {
        ...root,
        Track: catalog.Track,
        Query: { ...(root.Query as IResolverObject), ...(auth.Query as IResolverObject), ...(catalog.Query as IResolverObject), ...(account.Query as IResolverObject) },
        Mutation: { ...(root.Mutation as IResolverObject), ...(auth.Mutation as IResolverObject), ...(account.Mutation as IResolverObject), ...(this.instamusModule.buildResolvers().Mutation as IResolverObject) },
      },
      allowBatchedQueries: false,
      queryDepth: 10,
      errorFormatter: GraphQLErrorFormatter.format,
      context: async (request) => {
        const authHeader = request.headers.authorization;
        if (!authHeader) {
          return {};
        }
        // Reject invalid Bearer tokens instead of silently accepting them as guest authentication
        const userContext = await authGuard.validateToken(authHeader);
        return {
          userId: userContext.userId,
          sessionId: userContext.sessionId,
          userEmail: userContext.email,
        };
      },
      graphiql: this.config.enableGraphiql ?? false,
      path: '/graphql',
    });
  }

  public start(): Promise<void> {
    if (this.isRunning) return Promise.resolve();
    if (this.starting) return this.starting;
    this.starting = this.startApplication();
    return this.starting;
  }

  private async startApplication(): Promise<void> {
    try {
      this.databaseStarted = true;
      await this.databaseService.connect();
      if (!await this.databaseService.ping()) {
        throw new Error('Database readiness check failed');
      }
      this.cacheStarted = true;
      await this.cacheService.connect();
      await this.fastify.ready();
      this.roomsModule.initializeSocket(this.fastify.server);
      await this.fastify.listen({ port: this.config.port, host: this.config.host });
      this.isRunning = true;
    } catch (error) {
      await this.closeResources().catch(() => {});
      throw error;
    }
  }

  public stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.stopping = (async () => {
      if (this.starting) await this.starting.catch(() => {});
      await this.closeResources();
    })();
    return this.stopping;
  }

  private async closeResources(): Promise<void> {
    this.isRunning = false;
    try {
      this.roomsModule.getSocketHandler().getIO()?.close();
      await this.fastify.close();
    } finally {
      try {
        if (this.cacheStarted) {
          this.cacheStarted = false;
          await this.cacheService.disconnect();
        }
      } finally {
        if (this.databaseStarted) {
          this.databaseStarted = false;
          await this.databaseService.disconnect();
        }
      }
    }
  }

  public getStatus(): { isRunning: boolean; port: number } {
    return {
      isRunning: this.isRunning,
      port: this.config.port,
    };
  }

  public getFastifyInstance(): FastifyInstance {
    return this.fastify;
  }

  public getDatabaseService(): IDatabaseService {
    return this.databaseService;
  }

  public getCacheService(): ICacheService {
    return this.cacheService;
  }
}

/**
 * Application Composition Root Factory
 * Wires concrete infrastructure adapters and injects them into the application instance.
 */
export function createApplication(
  overrides?: Partial<IServerBootstrapConfig>,
  customEnv?: ServerEnvironmentConfig
): AadatServerApplication {
  const env = customEnv ?? ServerEnvironmentConfig.fromEnv();

  const config: IServerBootstrapConfig = {
    port: overrides?.port ?? env.port,
    host: overrides?.host ?? env.host,
    nodeEnv: overrides?.nodeEnv ?? env.nodeEnv,
    enableLogging: overrides?.enableLogging ?? env.nodeEnv === 'development',
    enableGraphiql: overrides?.enableGraphiql ?? env.nodeEnv === 'development',
    rateLimitGlobalMax: overrides?.rateLimitGlobalMax ?? env.rateLimitGlobalMax,
    rateLimitGlobalTimeWindowMs: overrides?.rateLimitGlobalTimeWindowMs ?? env.rateLimitGlobalTimeWindowMs,
    rateLimitAuthMax: overrides?.rateLimitAuthMax ?? env.rateLimitAuthMax,
    rateLimitAuthTimeWindowMs: overrides?.rateLimitAuthTimeWindowMs ?? env.rateLimitAuthTimeWindowMs,
  };

  const databaseService = new PrismaDatabaseService({
    connectionString: env.databaseUrl,
    logQueries: env.nodeEnv === 'development',
  });

  const cacheService = new RedisCacheService({
    url: env.redisUrl,
    host: env.redisHost,
    port: env.redisPort,
    password: env.redisPassword,
    useTls: env.redisUseTls,
  });

  const authModule = new AuthModule({
    databaseService,
    cacheService,
    googleClientId: env.googleClientId,
    jwtSecret: env.jwtSecret,
    jwtExpirationSeconds: env.jwtAccessExpirationSeconds,
    refreshTokenExpirationDays: env.refreshTokenExpirationDays,
    rateLimitAuthMax: config.rateLimitAuthMax,
    rateLimitAuthTimeWindowMs: config.rateLimitAuthTimeWindowMs,
  });

  const storageService = new S3StorageService({
    bucketName: env.awsS3BucketName,
    region: env.awsRegion,
    accessKeyId: env.awsAccessKeyId,
    secretAccessKey: env.awsSecretAccessKey,
    endpoint: env.awsS3Endpoint,
    forcePathStyle: env.awsS3ForcePathStyle,
    presignedUploadExpirySeconds: env.awsS3PresignedUploadExpirySeconds,
    presignedDownloadExpirySeconds: env.awsS3PresignedDownloadExpirySeconds,
  });

  return new AadatServerApplication(config, {
    databaseService,
    cacheService,
    storageService,
    authModule,
  });
}

// Module configuration sanity check constants
export const BOOTSTRAP_CONSTANTS = {
  maxParticipants: MAX_ROOM_PARTICIPANTS,
  takeoverTimeoutMs: TAKEOVER_PROMPT_TIMEOUT_MS,
  cleanupIntervalMs: FAILED_TAKEOVER_CLEANUP_INTERVAL_MS,
  defaultAccess: RoomAccess.PUBLIC,
  defaultChatPolicy: RoomChatPolicy.EPHEMERAL_SESSION_ONLY,
} as const;

export { ServerEnvironmentConfig, ConfigurationError } from './infrastructure/config/index.js';

