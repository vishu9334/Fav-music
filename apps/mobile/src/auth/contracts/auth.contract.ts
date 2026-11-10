export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly chatRetentionPreference: string;
  readonly createdAt: string;
}
export interface SessionTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
}
export interface LoginResult extends SessionTokens { readonly user: AuthUser }
export interface StoredSession { readonly refreshToken?: string; readonly pendingLogout?: string; readonly userId?: string }
export interface ISessionRepository {
  read(): Promise<StoredSession>;
  write(session: StoredSession): Promise<void>;
}
export interface IGoogleAuthProvider {
  signIn(): Promise<string | null>;
  signOut(): Promise<void>;
}
export interface IAuthRepository {
  prepare?(): Promise<void>;
  login(idToken: string): Promise<LoginResult>;
  refresh(refreshToken: string): Promise<SessionTokens>;
  me(accessToken: string): Promise<AuthUser>;
  logout(refreshToken: string): Promise<void>;
}
export interface IAuthService {
  restore(): Promise<AuthUser | null>;
  login(): Promise<AuthUser | null>;
  logout(): Promise<boolean>;
  getExpiresAt?(): number | null;
  updateUser?(patch: Partial<AuthUser>): Promise<void>;
}
export interface IAuthenticatedSession {
  withAccessToken<T>(userId: string, request: (accessToken: string) => Promise<T>): Promise<T>;
  getExpiresAt(): number | null;
}
export type AuthErrorCode = 'CONFIGURATION' | 'OFFLINE' | 'UNAUTHORIZED' | 'FORBIDDEN'
  | 'RATE_LIMITED' | 'STORAGE' | 'PROVIDER' | 'SERVER';
export class AuthError extends Error {
  public constructor(public readonly code: AuthErrorCode, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}
