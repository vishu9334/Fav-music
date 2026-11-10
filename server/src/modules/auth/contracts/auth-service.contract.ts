import { IUserEntity } from './user-repository.contract.js';

/**
 * Payload verified and extracted from Google OAuth ID token
 */
export interface IGoogleTokenPayload {
  readonly sub: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly name?: string;
  readonly picture?: string;
}

/**
 * Google ID Token Verifier Contract
 */
export interface IGoogleTokenVerifier {
  verifyIdToken(idToken: string): Promise<IGoogleTokenPayload>;
}

/**
 * JWT Access Token Service Contract (jose based)
 */
export interface IJwtTokenService {
  signAccessToken(payload: {
    userId: string;
    email: string;
    sessionId: string;
  }): Promise<string>;

  verifyAccessToken(token: string): Promise<{
    userId: string;
    email: string;
    sessionId: string;
  }>;
}

/**
 * Session data stored in distributed state
 */
export interface ISessionRecord {
  readonly userId: string;
  readonly familyId: string;
  readonly sessionId: string;
  readonly createdAt: number;
}

/**
 * Session Management Contract (Redis backed, cryptographic hashes only)
 */
export interface ISessionService {
  createSession(userId: string): Promise<{
    rawRefreshToken: string;
    familyId: string;
    sessionId: string;
  }>;

  rotateRefreshToken(rawRefreshToken: string): Promise<{
    rawRefreshToken: string;
    familyId: string;
    sessionId: string;
    userId: string;
  }>;

  revokeSession(rawRefreshToken: string): Promise<void>;

  revokeSessionById(sessionId: string): Promise<void>;

  revokeFamily(familyId: string): Promise<void>;

  isSessionActive(sessionId: string): Promise<boolean>;
}

/**
 * Authentication Result returned to client
 */
export interface IAuthResult {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly user: IUserEntity;
  readonly expiresIn: number;
}

/**
 * Token Refresh Result returned to client
 */
export interface IRefreshResult {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
}

/**
 * Authentication Business Logic Service Contract
 */
export interface IAuthService {
  isEnabled?(): boolean;
  loginWithGoogle(idToken: string): Promise<IAuthResult>;
  refreshSession(refreshToken: string): Promise<IRefreshResult>;
  logout(refreshToken?: string, sessionId?: string): Promise<void>;
  getCurrentUser(userId: string): Promise<IUserEntity>;
  searchUsers(query: string): Promise<IUserEntity[]>;
}

