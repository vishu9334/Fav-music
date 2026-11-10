import { FastifyInstance } from 'fastify';
import { IDatabaseService } from '../../infrastructure/database/contracts/database.contract.js';
import { ICacheService } from '../../infrastructure/cache/contracts/cache.contract.js';
import { IUserRepository } from './contracts/user-repository.contract.js';
import {
  IAuthService,
  IGoogleTokenVerifier,
  IJwtTokenService,
  ISessionService,
} from './contracts/auth-service.contract.js';
import { PrismaUserRepository } from './repositories/prisma-user.repository.js';
import { GoogleTokenVerifier } from './adapters/google-token-verifier.js';
import { JwtTokenService } from './services/jwt-token.service.js';
import { SessionService } from './services/session.service.js';
import { AuthService } from './services/auth.service.js';
import { AuthController } from './controllers/auth.controller.js';
import { IAuthGuard } from '../../shared/guards/contracts/auth-guard.contract.js';
import { JwtAuthGuard } from '../../shared/guards/implementations/jwt-auth.guard.js';

export interface IAuthModuleDependencies {
  readonly authenticationEnabled?: boolean;
  readonly databaseService: IDatabaseService;
  readonly cacheService: ICacheService;
  readonly googleClientId?: string;
  readonly jwtSecret?: string;
  readonly jwtExpirationSeconds?: number;
  readonly refreshTokenExpirationDays?: number;
  readonly rateLimitAuthMax?: number;
  readonly rateLimitAuthTimeWindowMs?: number;

  // Optional mock injections for hermetic testing (Dependency Inversion Principle)
  readonly userRepository?: IUserRepository;
  readonly tokenVerifier?: IGoogleTokenVerifier;
  readonly jwtTokenService?: IJwtTokenService;
  readonly sessionService?: ISessionService;
  readonly authGuard?: IAuthGuard;
}

/**
 * Authentication Feature Module Composition Root
 * Wires repository, external provider adapters, session management, and controllers.
 */
export class AuthModule {
  private readonly dependencies: IAuthModuleDependencies;
  private readonly userRepository: IUserRepository;
  private readonly tokenVerifier: IGoogleTokenVerifier;
  private readonly jwtTokenService: IJwtTokenService;
  private readonly sessionService: ISessionService;
  private readonly authGuard: IAuthGuard;
  private readonly authService: IAuthService;
  private readonly authController: AuthController;

  public constructor(dependencies: IAuthModuleDependencies) {
    this.dependencies = dependencies;

    // 1. Repository
    this.userRepository =
      dependencies.userRepository ??
      new PrismaUserRepository(dependencies.databaseService);

    // 2. Google Token Verifier Adapter
    const clientId =
      dependencies.googleClientId ??
      process.env['GOOGLE_CLIENT_ID'] ?? '';

    this.tokenVerifier =
      dependencies.tokenVerifier ?? new GoogleTokenVerifier(clientId);

    // 3. JWT Token Service (jose)
    const secret =
      dependencies.jwtSecret ??
      process.env['JWT_SECRET'] ?? '';

    const jwtExp = dependencies.jwtExpirationSeconds ?? 900;

    this.jwtTokenService =
      dependencies.jwtTokenService ??
      new JwtTokenService(secret, jwtExp);

    // 4. Session Service (Redis with atomic Lua rotation)
    const refreshDays = dependencies.refreshTokenExpirationDays ?? 7;

    this.sessionService =
      dependencies.sessionService ??
      new SessionService(dependencies.cacheService, {
        refreshTokenExpirationDays: refreshDays,
      });

    // 5. Auth Guard
    this.authGuard =
      dependencies.authGuard ??
      new JwtAuthGuard({
        jwtTokenService: this.jwtTokenService,
        sessionService: this.sessionService,
        userRepository: this.userRepository,
      });

    // 6. Business Logic Service
    this.authService = new AuthService({
      enabled: dependencies.authenticationEnabled ?? process.env['AUTH_ENABLED'] === 'true',
      userRepository: this.userRepository,
      tokenVerifier: this.tokenVerifier,
      jwtTokenService: this.jwtTokenService,
      sessionService: this.sessionService,
      tokenExpirationSeconds: jwtExp,
    });

    // 7. REST Controller
    this.authController = new AuthController({
      authService: this.authService,
      authGuard: this.authGuard,
      rateLimitMax: dependencies.rateLimitAuthMax,
      rateLimitTimeWindowMs: dependencies.rateLimitAuthTimeWindowMs,
    });
  }

  public registerRoutes(fastify: FastifyInstance): void {
    this.authController.registerRoutes(fastify);
  }

  public getUserRepository(): IUserRepository {
    return this.userRepository;
  }

  public getAuthService(): IAuthService {
    return this.authService;
  }

  public getAuthGuard(): IAuthGuard {
    return this.authGuard;
  }

  public getSessionService(): ISessionService {
    return this.sessionService;
  }

  public getJwtTokenService(): IJwtTokenService {
    return this.jwtTokenService;
  }

  public getGoogleTokenVerifier(): IGoogleTokenVerifier {
    return this.tokenVerifier;
  }

  public getDependencies(): IAuthModuleDependencies {
    return this.dependencies;
  }
}
