import { IAuthenticatedUserContext, IAuthGuard } from '../contracts/auth-guard.contract.js';
import { UnauthorizedError } from '../../errors/domain.error.js';
import {
  IJwtTokenService,
  ISessionService,
} from '../../../modules/auth/contracts/auth-service.contract.js';
import { IUserRepository } from '../../../modules/auth/contracts/user-repository.contract.js';
import { JwtTokenService } from '../../../modules/auth/services/jwt-token.service.js';

export interface IJwtGuardConfig {
  readonly secret?: string;
  readonly userRepository?: IUserRepository;
  readonly jwtTokenService?: IJwtTokenService;
  readonly sessionService?: ISessionService;
}

/**
 * Class-based JWT Authentication Guard (jose backed)
 * Validates bearer token header, verifies cryptographic signature,
 * and confirms session revocation status with ISessionService.
 */
export class JwtAuthGuard implements IAuthGuard {
  private readonly jwtTokenService: IJwtTokenService;
  private readonly sessionService?: ISessionService;
  private readonly userRepository?: IUserRepository;

  public constructor(config: IJwtGuardConfig) {
    if (config.jwtTokenService) {
      this.jwtTokenService = config.jwtTokenService;
    } else if (config.secret && config.secret.length >= 32) {
      this.jwtTokenService = new JwtTokenService(config.secret);
    } else {
      throw new Error(
        'JwtAuthGuard requires either a valid IJwtTokenService or a secret of at least 32 characters'
      );
    }
    this.sessionService = config.sessionService;
    this.userRepository = config.userRepository;
  }

  public async validateToken(
    authorizationHeader: string | undefined
  ): Promise<IAuthenticatedUserContext> {
    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or malformed Authorization header');
    }

    const token = authorizationHeader.slice(7).trim();
    if (!token) {
      throw new UnauthorizedError('Bearer token payload cannot be empty');
    }

    try {
      const verified = await this.jwtTokenService.verifyAccessToken(token);

      // Verify active session revocation status if sessionService is configured
      if (this.sessionService && verified.sessionId) {
        const isActive = await this.sessionService.isSessionActive(verified.sessionId);
        if (!isActive) {
          throw new UnauthorizedError('Session has expired or has been revoked');
        }
      }

      if (this.userRepository) {
        const user = await this.userRepository.findById(verified.userId);
        if (!user || user.status !== 'ACTIVE') {
          throw new UnauthorizedError('This account is not active');
        }
      }
      return {
        userId: verified.userId,
        email: verified.email,
        sessionId: verified.sessionId,
      };
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        throw err;
      }
      throw new UnauthorizedError('Invalid, expired or malformed access token');
    }
  }

  public getJwtTokenService(): IJwtTokenService {
    return this.jwtTokenService;
  }
}
