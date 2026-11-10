import { OAuth2Client } from 'google-auth-library';
import {
  IGoogleTokenPayload,
  IGoogleTokenVerifier,
} from '../contracts/auth-service.contract.js';
import { UnauthorizedError } from '../../../shared/errors/domain.error.js';

/**
 * Isolated Google OAuth ID Token Verifier Adapter
 * Strictly class-based, encapsulates google-auth-library calls.
 * Verifies cryptographic signatures, expiration, issuer, audience, and subject claims.
 */
export class GoogleTokenVerifier implements IGoogleTokenVerifier {
  private readonly client: OAuth2Client;
  private readonly clientId: string;

  public constructor(clientId: string, client?: OAuth2Client) {
    if (!clientId || clientId.trim().length === 0) {
      throw new Error('Google Client ID must be configured for GoogleTokenVerifier');
    }
    this.clientId = clientId.trim();
    this.client = client ?? new OAuth2Client(this.clientId);
  }

  public async verifyIdToken(idToken: string): Promise<IGoogleTokenPayload> {
    if (!idToken || typeof idToken !== 'string' || idToken.trim().length === 0) {
      throw new UnauthorizedError('Google ID token is required and must be a non-empty string');
    }

    try {
      const ticket = await this.client.verifyIdToken({
        idToken: idToken.trim(),
        audience: this.clientId,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        throw new UnauthorizedError('Invalid Google ID token: empty payload returned');
      }

      if (typeof payload.sub !== 'string' || !payload.sub.trim()) {
        throw new UnauthorizedError('Invalid Google ID token: missing subject (sub) claim');
      }

      if (typeof payload.email !== 'string' || !payload.email.trim()) {
        throw new UnauthorizedError('Invalid Google ID token: missing email claim');
      }

      return {
        sub: payload.sub,
        email: payload.email.toLowerCase().trim(),
        emailVerified: payload.email_verified === true,
        name: payload.name,
        picture: payload.picture,
      };
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      throw new UnauthorizedError('Google ID token verification failed');
    }
  }

  public getClientId(): string {
    return this.clientId;
  }
}

