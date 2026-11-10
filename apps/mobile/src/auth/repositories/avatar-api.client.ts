import { AuthModule } from '../auth.module';
import { AuthConfig } from '../services/auth-config';
import { AuthError } from '../contracts/auth.contract';
import { AuthTransport, nativeAuthTransport } from '../adapters/native-auth.transport';
import { OptimizedPhoto } from '../services/profile-photo.service';

export class AvatarApiError extends Error {
  public constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'AvatarApiError';
  }
}

/**
 * Communicates with the real server media subsystem (/api/v1/media).
 * Enforces verified owner tokens and approved HTTPS endpoints for all operations.
 */
export class AvatarApiClient {
  public constructor(
    private readonly transport: AuthTransport = nativeAuthTransport,
    private readonly config = new AuthConfig()
  ) {}

  /**
   * Retrieves the user's authoritative presigned download URL from PostgreSQL/S3.
   * Returns null if user has no avatar set (HTTP 404).
   */
  public async getAvatarUrl(userId: string): Promise<string | null> {
    const base = this.config.apiBaseUrl();
    const endpoint = `${base}/api/v1/media/users/${encodeURIComponent(userId)}/avatar`;

    return AuthModule.getSession().withAccessToken(userId, async (token) => {
      const response = await this.transport(endpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (response.status === 404) {
        return null;
      }
      if (response.status === 401) {
        throw new AuthError('UNAUTHORIZED', 'Session expired. Sign in again to view your profile photo.');
      }
      if (!response.ok) {
        throw new AvatarApiError('RETRIEVAL_FAILED', 'Failed to retrieve profile photo from server.');
      }

      const data = (await response.json()) as { downloadUrl?: string };
      return data.downloadUrl ?? null;
    });
  }

  /**
   * Uploads an optimized profile photo using S3 presigned POST and confirms upload on server.
   * Atomically sets user.avatarKey in PostgreSQL and purges previous avatar if one existed.
   */
  public async uploadAvatar(userId: string, photo: OptimizedPhoto): Promise<string> {
    const base = this.config.apiBaseUrl();
    const ticketEndpoint = `${base}/api/v1/media/upload-ticket`;
    const confirmEndpoint = `${base}/api/v1/media/confirm-upload`;

    return AuthModule.getSession().withAccessToken(userId, async (token) => {
      // 1. Request staging upload ticket
      const ticketRes = await this.transport(ticketEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mediaType: 'AVATAR',
          contentType: photo.mimeType,
          contentLength: photo.byteLength > 0 ? photo.byteLength : undefined,
        }),
      });

      if (ticketRes.status === 401) {
        throw new AuthError('UNAUTHORIZED', 'Session expired. Sign in again to change your photo.');
      }
      if (!ticketRes.ok) {
        throw new AvatarApiError('TICKET_FAILED', 'Server could not grant an upload ticket for your photo.');
      }

      const ticket = (await ticketRes.json()) as {
        ticketId: string;
        stagingKey: string;
        presignedPost: { url: string; fields: Record<string, string> };
      };

      // 2. Perform direct upload to S3 storage via FormData
      const formData = new FormData();
      for (const [key, value] of Object.entries(ticket.presignedPost.fields)) {
        formData.append(key, value);
      }

      const fileData = {
        uri: photo.uri,
        name: `avatar.${photo.mimeType === 'image/png' ? 'png' : 'jpg'}`,
        type: photo.mimeType,
      };
      formData.append('file', fileData as unknown as Blob);

      const s3Res = await fetch(ticket.presignedPost.url, {
        method: 'POST',
        body: formData,
      });

      if (!s3Res.ok && s3Res.status !== 204 && s3Res.status !== 201) {
        throw new AvatarApiError('STORAGE_UPLOAD_FAILED', 'Could not upload media bytes to storage service.');
      }

      // 3. Confirm upload on server (CAS validation, ETag verification, promotion to permanent key)
      const confirmRes = await this.transport(confirmEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ticketId: ticket.ticketId }),
      });

      if (!confirmRes.ok) {
        throw new AvatarApiError('CONFIRM_FAILED', 'Server could not verify and commit your uploaded photo.');
      }

      // 4. Retrieve authoritative resolved download URL
      const confirmedUrl = await this.getAvatarUrl(userId);
      if (!confirmedUrl) {
        throw new AvatarApiError('URL_UNAVAILABLE', 'Server confirmed upload but photo URL is not yet available.');
      }

      return confirmedUrl;
    });
  }

  /**
   * Removes the user's avatar on server: purges permanent S3 object and nulls avatarKey in database.
   */
  public async removeAvatar(userId: string): Promise<void> {
    const base = this.config.apiBaseUrl();
    const endpoint = `${base}/api/v1/media/users/${encodeURIComponent(userId)}/avatar`;

    return AuthModule.getSession().withAccessToken(userId, async (token) => {
      const response = await this.transport(endpoint, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (response.status === 401) {
        throw new AuthError('UNAUTHORIZED', 'Session expired. Sign in again to remove your photo.');
      }
      if (response.status === 403) {
        throw new AuthError('FORBIDDEN', 'You are not authorized to remove this photo.');
      }
      if (!response.ok && response.status !== 404) {
        throw new AvatarApiError('REMOVAL_FAILED', 'Server could not remove your profile photo.');
      }
    });
  }
}

