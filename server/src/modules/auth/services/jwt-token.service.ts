import { SignJWT, jwtVerify } from 'jose';
import { IJwtTokenService } from '../contracts/auth-service.contract.js';
import { UnauthorizedError } from '../../../shared/errors/domain.error.js';

/**
 * Concrete JWT Token Service using jose
 * Replaces custom cryptography with maintained, auditable standard library.
 */
export class JwtTokenService implements IJwtTokenService {
  private readonly secretKey: Uint8Array;
  private readonly expirationSeconds: number;

  public constructor(secret: string, expirationSeconds: number = 900) {
    if (!secret || secret.trim().length < 32) {
      throw new Error('JWT secret must be at least 32 characters long');
    }
    this.secretKey = new TextEncoder().encode(secret.trim());
    this.expirationSeconds = expirationSeconds > 0 ? expirationSeconds : 900;
  }

  public async signAccessToken(payload: {
    userId: string;
    email: string;
    sessionId: string;
  }): Promise<string> {
    return new SignJWT({
      email: payload.email,
      sessionId: payload.sessionId,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(payload.userId)
      .setJti(payload.sessionId)
      .setIssuedAt()
      .setExpirationTime(`${this.expirationSeconds}s`)
      .sign(this.secretKey);
  }

  public async verifyAccessToken(token: string): Promise<{
    userId: string;
    email: string;
    sessionId: string;
  }> {
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      throw new UnauthorizedError('Access token is required');
    }

    try {
      const { payload } = await jwtVerify(token.trim(), this.secretKey, {
        algorithms: ['HS256'],
      });

      if (!payload.sub || typeof payload.sub !== 'string') {
        throw new UnauthorizedError('Access token missing valid subject (sub) claim');
      }

      const email = payload['email'] as string | undefined;
      if (!email || typeof email !== 'string') {
        throw new UnauthorizedError('Access token missing valid email claim');
      }

      const sessionId = (payload.jti ?? payload['sessionId']) as string | undefined;
      if (!sessionId || typeof sessionId !== 'string') {
        throw new UnauthorizedError('Access token missing valid session identifier (jti)');
      }

      return {
        userId: payload.sub,
        email,
        sessionId,
      };
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      throw new UnauthorizedError('Invalid, expired or malformed access token');
    }
  }

  public getExpirationSeconds(): number {
    return this.expirationSeconds;
  }
}

