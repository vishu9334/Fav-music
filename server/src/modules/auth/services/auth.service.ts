import {
  IAuthResult,
  IAuthService,
  IGoogleTokenVerifier,
  IJwtTokenService,
  IRefreshResult,
  ISessionService,
} from '../contracts/auth-service.contract.js';
import {
  IUserEntity,
  IUserRepository,
} from '../contracts/user-repository.contract.js';
import {
  ConflictError,
  UnauthorizedError,
  DomainError,
} from '../../../shared/errors/domain.error.js';

export interface IAuthServiceDependencies {
  readonly enabled?: boolean;
  readonly userRepository: IUserRepository;
  readonly tokenVerifier: IGoogleTokenVerifier;
  readonly jwtTokenService: IJwtTokenService;
  readonly sessionService: ISessionService;
  readonly tokenExpirationSeconds?: number;
}
export class AuthenticationOnHoldError extends DomainError {
  public readonly code = 'AUTH_ON_HOLD'; public readonly statusCode = 503;
}

/**
 * Concrete Authentication Business Logic Service
 * Strictly adheres to Single Responsibility: encapsulates authentication policies,
 * anti-takeover checks, token issuance, and rotation rules.
 * Never touches Prisma or HTTP transport directly.
 */
export class AuthService implements IAuthService {
  private readonly enabled: boolean;
  private readonly userRepository: IUserRepository;
  private readonly tokenVerifier: IGoogleTokenVerifier;
  private readonly jwtTokenService: IJwtTokenService;
  private readonly sessionService: ISessionService;
  private readonly tokenExpirationSeconds: number;

  public constructor(dependencies: IAuthServiceDependencies) {
    this.enabled = dependencies.enabled ?? false;
    this.userRepository = dependencies.userRepository;
    this.tokenVerifier = dependencies.tokenVerifier;
    this.jwtTokenService = dependencies.jwtTokenService;
    this.sessionService = dependencies.sessionService;
    this.tokenExpirationSeconds = dependencies.tokenExpirationSeconds ?? 900;
  }

  public async loginWithGoogle(idToken: string): Promise<IAuthResult> {
    this.requireEnabled();
    const payload = await this.tokenVerifier.verifyIdToken(idToken);

    // Guard: reject unverified email addresses from Google
    if (!payload.emailVerified) {
      throw new UnauthorizedError(
        'Google account email is not verified. Verified email is required for registration.'
      );
    }

    // Step 1: Look up existing user by Google unique identifier (sub)
    let user = await this.userRepository.findByGoogleSub(payload.sub);

    if (!user) {
      // Step 2: Anti-Account-Takeover check: look up if email already registered without googleSub
      const existingUserWithEmail = await this.userRepository.findByEmail(payload.email);
      if (existingUserWithEmail) {
        throw new ConflictError(
          'An account with this email address already exists. Automatic linking is prohibited for security reasons.'
        );
      }

      // Step 3: Register brand-new user
      const displayName = payload.name && payload.name.trim().length > 0
        ? payload.name.trim()
        : payload.email.split('@')[0] ?? 'Aadat Listener';

      try {
        user = await this.userRepository.create({
          email: payload.email, displayName, googleSub: payload.sub, avatarKey: null,
        });
      } catch (error) {
        if (!(error instanceof ConflictError)) throw error;
        // A concurrent first login may have created this verified Google subject.
        user = await this.userRepository.findByGoogleSub(payload.sub);
        if (!user) throw error; // Never auto-link a different identity by email.
      }
    }

    this.requireActive(user);

    // Step 4: Create new session family and issuance
    const session = await this.sessionService.createSession(user.id);

    // Step 5: Mint short-lived access token with sessionId (jti)
    const accessToken = await this.jwtTokenService.signAccessToken({
      userId: user.id,
      email: user.email,
      sessionId: session.sessionId,
    });

    return {
      accessToken,
      refreshToken: session.rawRefreshToken,
      user,
      expiresIn: this.tokenExpirationSeconds,
    };
  }

  public async refreshSession(refreshToken: string): Promise<IRefreshResult> {
    this.requireEnabled();
    const rotated = await this.sessionService.rotateRefreshToken(refreshToken);

    const user = await this.userRepository.findById(rotated.userId);
    if (!user || user.status !== 'ACTIVE') {
      await this.sessionService.revokeFamily(rotated.familyId);
      // If user was deleted or disabled
      await this.sessionService.revokeSessionById(rotated.sessionId);
      throw new UnauthorizedError('User associated with session no longer exists');
    }

    const accessToken = await this.jwtTokenService.signAccessToken({
      userId: user.id,
      email: user.email,
      sessionId: rotated.sessionId,
    });

    return {
      accessToken,
      refreshToken: rotated.rawRefreshToken,
      expiresIn: this.tokenExpirationSeconds,
    };
  }

  public async logout(refreshToken?: string, sessionId?: string): Promise<void> {
    this.requireEnabled();
    if (refreshToken) {
      await this.sessionService.revokeSession(refreshToken);
    }
    if (sessionId) {
      await this.sessionService.revokeSessionById(sessionId);
    }
  }

  public async getCurrentUser(userId: string): Promise<IUserEntity> {
    this.requireEnabled();
    if (!userId) {
      throw new UnauthorizedError('Authentication required to access current user identity');
    }
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }
    this.requireActive(user);
    return user;
  }

  public async searchUsers(query: string): Promise<IUserEntity[]> {
    this.requireEnabled();
    const clean = typeof query === 'string' ? query.trim().replace(/^@/, '') : '';
    if (!clean || clean.length > 50) return [];
    if (this.userRepository.searchUsers) {
      return this.userRepository.searchUsers(clean);
    }
    const byEmail = await this.userRepository.findByEmail(clean);
    if (byEmail && byEmail.status === 'ACTIVE') return [byEmail];
    return [];
  }

  private requireActive(user: IUserEntity): void {
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedError('This account is not active');
    }
  }
  public isEnabled(): boolean { return this.enabled; }
  private requireEnabled(): void {
    if (!this.enabled) throw new AuthenticationOnHoldError('Account authentication is on hold pending database and secure endpoint approval.');
  }
}

