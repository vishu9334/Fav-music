import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { UserDto, AuthSessionDto } from '@aadat/contracts';
import { IAuthService } from '../contracts/auth-service.contract.js';
import { IUserEntity } from '../contracts/user-repository.contract.js';
import { IAuthGuard } from '../../../shared/guards/contracts/auth-guard.contract.js';
import { ValidationFailedError } from '../../../shared/errors/domain.error.js';

export interface IAuthControllerDependencies {
  readonly authService: IAuthService;
  readonly authGuard: IAuthGuard;
  readonly rateLimitMax?: number;
  readonly rateLimitTimeWindowMs?: number;
}

/**
 * REST Authentication Controller
 * Strictly adheres to Single Responsibility: request parsing, input validation,
 * HTTP status codes, and serialization. Business logic is strictly delegated to IAuthService.
 */
export class AuthController {
  private readonly authService: IAuthService;
  private readonly authGuard: IAuthGuard;
  private readonly rateLimitMax: number;
  private readonly rateLimitTimeWindowMs: number;

  public constructor(dependencies: IAuthControllerDependencies) {
    this.authService = dependencies.authService;
    this.authGuard = dependencies.authGuard;
    this.rateLimitMax = dependencies.rateLimitMax ?? 10;
    this.rateLimitTimeWindowMs = dependencies.rateLimitTimeWindowMs ?? 60000;
  }

  public registerRoutes(fastify: FastifyInstance): void {
    const authRateLimitConfig = {
      rateLimit: {
        max: this.rateLimitMax,
        timeWindow: this.rateLimitTimeWindowMs,
      },
    };

    fastify.post(
      '/api/auth/google',
      { config: authRateLimitConfig },
      this.loginWithGoogle.bind(this)
    );
    fastify.post(
      '/api/auth/refresh',
      { config: authRateLimitConfig },
      this.refreshSession.bind(this)
    );
    fastify.post(
      '/api/auth/logout',
      { config: authRateLimitConfig },
      this.logout.bind(this)
    );
    fastify.get('/api/auth/me', this.getCurrentUser.bind(this));
    fastify.get('/api/auth/users/search', this.searchUsers.bind(this));
  }

  public async loginWithGoogle(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const body = request.body as { idToken?: unknown } | undefined;
    if (!body || typeof body.idToken !== 'string' || body.idToken.trim().length === 0) {
      throw new ValidationFailedError('Field "idToken" is required and must be a non-empty string');
    }

    const result = await this.authService.loginWithGoogle(body.idToken.trim());

    const response: AuthSessionDto = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: this.mapUserToDto(result.user),
    };

    reply.status(200).send(response);
  }

  public async refreshSession(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const body = request.body as { refreshToken?: unknown } | undefined;
    if (!body || typeof body.refreshToken !== 'string' || body.refreshToken.trim().length === 0) {
      throw new ValidationFailedError('Field "refreshToken" is required and must be a non-empty string');
    }

    const result = await this.authService.refreshSession(body.refreshToken.trim());

    reply.status(200).send({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
    });
  }

  public async logout(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const body = request.body as { refreshToken?: unknown } | undefined;
    const refreshToken = typeof body?.refreshToken === 'string' ? body.refreshToken.trim() : undefined;

    let sessionId: string | undefined;
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const userContext = await this.authGuard.validateToken(authHeader);
        sessionId = (userContext as { sessionId?: string }).sessionId;
      } catch {
        // Safe: logout should still proceed even if access token is already expired
      }
    }

    await this.authService.logout(refreshToken, sessionId);

    reply.status(200).send({
      success: true,
      message: 'Logged out successfully',
    });
  }

  public async getCurrentUser(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userContext = await this.authGuard.validateToken(request.headers.authorization);
    const user = await this.authService.getCurrentUser(userContext.userId);

    reply.status(200).send(this.mapUserToDto(user));
  }

  public async searchUsers(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    await this.authGuard.validateToken(request.headers.authorization);
    const query = (request.query as { query?: string } | undefined)?.query ?? '';
    const users = await this.authService.searchUsers(query);
    reply.status(200).send({ users: users.map((u) => this.mapUserToDto(u)) });
  }

  private mapUserToDto(user: IUserEntity): UserDto {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarKey: user.avatarKey,
      avatarUrl: null, // Presigned download URL resolved on demand by storage service
      chatRetentionPreference: user.chatRetentionPreference,
      createdAt: user.createdAt.toISOString(),
    };
  }
}

