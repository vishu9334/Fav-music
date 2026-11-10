import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AvatarApiClient } from '../repositories/avatar-api.client';
import { AuthModule } from '../auth.module';
import { AuthConfig } from '../services/auth-config';
import { AuthUser } from '../contracts/auth.contract';

const testUser: AuthUser = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'test@example.com',
  displayName: 'Test User',
  avatarUrl: null,
  chatRetentionPreference: 'EPHEMERAL_SESSION_ONLY',
  createdAt: '2026-11-01T00:00:00Z',
};

describe('AvatarApiClient — Real Server Media Subsystem Integration', () => {
  const config = new AuthConfig('https://api.favmusic.test/graphql', 'client-id', {
    enabled: true,
    verifiedEndpoint: 'https://api.favmusic.test/graphql',
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    // Stub AuthModule session
    vi.spyOn(AuthModule, 'getSession').mockReturnValue({
      withAccessToken: vi.fn(async <T>(_userId: string, cb: (token: string) => Promise<T>): Promise<T> =>
        cb('verified-jwt-token')
      ),
      getExpiresAt: () => Date.now() + 3600_000,
    } as unknown as ReturnType<typeof AuthModule.getSession>);
  });

  describe('getAvatarUrl', () => {
    it('returns authoritative presigned download URL when avatar exists on server', async () => {
      const mockTransport = vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toBe(`https://api.favmusic.test/api/v1/media/users/${testUser.id}/avatar`);
        expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer verified-jwt-token');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            downloadUrl: 'https://s3.amazonaws.com/bucket/avatars/user-1/avatar.jpg?sig=valid',
            userId: testUser.id,
            avatarKey: 'avatars/user-1/avatar.jpg',
          }),
        } as unknown as Response;
      });

      const client = new AvatarApiClient(mockTransport, config);
      const url = await client.getAvatarUrl(testUser.id);
      expect(url).toBe('https://s3.amazonaws.com/bucket/avatars/user-1/avatar.jpg?sig=valid');
      expect(mockTransport).toHaveBeenCalledOnce();
    });

    it('returns null when user has no avatar set (HTTP 404)', async () => {
      const mockTransport = vi.fn(async () => ({
        ok: false,
        status: 404,
        json: async () => ({ message: 'User does not have an avatar set' }),
      } as unknown as Response));

      const client = new AvatarApiClient(mockTransport, config);
      const url = await client.getAvatarUrl(testUser.id);
      expect(url).toBeNull();
    });

    it('throws UNAUTHORIZED when session token is expired (HTTP 401)', async () => {
      const mockTransport = vi.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Session expired' }),
      } as unknown as Response));

      const client = new AvatarApiClient(mockTransport, config);
      await expect(client.getAvatarUrl(testUser.id)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });
  });

  describe('uploadAvatar', () => {
    it('executes full upload ticket, S3 upload, and server confirmation lifecycle', async () => {
      const calls: string[] = [];
      const mockTransport = vi.fn(async (url: string, init: RequestInit) => {
        calls.push(url);
        if (url.endsWith('/upload-ticket')) {
          expect(init.method).toBe('POST');
          const body = JSON.parse(init.body as string) as { mediaType: string; contentType: string };
          expect(body.mediaType).toBe('AVATAR');
          expect(body.contentType).toBe('image/jpeg');
          return {
            ok: true,
            status: 201,
            json: async () => ({
              ticketId: 'ticket-123',
              stagingKey: 'uploads/staging/user-1/file.jpg',
              presignedPost: {
                url: 'https://mock-s3.amazonaws.com',
                fields: { key: 'uploads/staging/user-1/file.jpg' },
              },
            }),
          } as unknown as Response;
        }

        if (url.endsWith('/confirm-upload')) {
          expect(init.method).toBe('POST');
          const body = JSON.parse(init.body as string) as { ticketId: string };
          expect(body.ticketId).toBe('ticket-123');
          return {
            ok: true,
            status: 200,
            json: async () => ({ confirmed: true, objectKey: 'avatars/user-1/file.jpg' }),
          } as unknown as Response;
        }

        if (url.includes(`/users/${testUser.id}/avatar`)) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              downloadUrl: 'https://mock-s3.amazonaws.com/avatars/user-1/file.jpg?sig=valid',
            }),
          } as unknown as Response;
        }

        throw new Error(`Unexpected endpoint: ${url}`);
      });

      // Stub global fetch for S3 POST upload
      const globalFetchMock = vi.fn(async () => ({
        ok: true,
        status: 204,
      } as unknown as Response));
      vi.stubGlobal('fetch', globalFetchMock);

      const client = new AvatarApiClient(mockTransport, config);
      const confirmedUrl = await client.uploadAvatar(testUser.id, {
        uri: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD',
        mimeType: 'image/jpeg',
        byteLength: 20,
      });

      expect(confirmedUrl).toBe('https://mock-s3.amazonaws.com/avatars/user-1/file.jpg?sig=valid');
      expect(globalFetchMock).toHaveBeenCalledWith('https://mock-s3.amazonaws.com', expect.anything());
      expect(calls).toEqual([
        'https://api.favmusic.test/api/v1/media/upload-ticket',
        'https://api.favmusic.test/api/v1/media/confirm-upload',
        `https://api.favmusic.test/api/v1/media/users/${testUser.id}/avatar`,
      ]);

      vi.unstubAllGlobals();
    });

    it('rejects upload and does not fabricate success state if ticket creation fails', async () => {
      const mockTransport = vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ message: 'Server error' }),
      } as unknown as Response));

      const client = new AvatarApiClient(mockTransport, config);
      await expect(
        client.uploadAvatar(testUser.id, {
          uri: 'data:image/jpeg;base64,1234',
          mimeType: 'image/jpeg',
          byteLength: 4,
        })
      ).rejects.toThrow('Server could not grant an upload ticket');
    });
  });

  describe('removeAvatar', () => {
    it('sends authenticated DELETE request to server media endpoint', async () => {
      const mockTransport = vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toBe(`https://api.favmusic.test/api/v1/media/users/${testUser.id}/avatar`);
        expect(init.method).toBe('DELETE');
        expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer verified-jwt-token');
        return {
          ok: true,
          status: 200,
          json: async () => ({ removed: true, userId: testUser.id }),
        } as unknown as Response;
      });

      const client = new AvatarApiClient(mockTransport, config);
      await client.removeAvatar(testUser.id);
      expect(mockTransport).toHaveBeenCalledOnce();
    });

    it('throws FORBIDDEN when user attempts to delete an unauthorized profile photo (HTTP 403)', async () => {
      const mockTransport = vi.fn(async () => ({
        ok: false,
        status: 403,
        json: async () => ({ message: 'Forbidden' }),
      } as unknown as Response));

      const client = new AvatarApiClient(mockTransport, config);
      await expect(client.removeAvatar(testUser.id)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });
});
