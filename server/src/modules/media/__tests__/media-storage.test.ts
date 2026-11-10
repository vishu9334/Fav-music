import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { MediaContentValidator } from '../services/media-content-validator.js';
import { MediaService } from '../services/media.service.js';
import { MediaController } from '../controllers/media.controller.js';
import {
  IAcquireLockResult,
  IUploadTicket,
  IUploadTicketRepository,
} from '../contracts/upload-ticket-repository.contract.js';
import { IUserRepository, IUserEntity } from '../../auth/contracts/user-repository.contract.js';
import {
  ITrackMediaEntity,
  ITrackMediaRepository,
} from '../contracts/track-media-repository.contract.js';
import {
  IS3StorageService,
  IStorageObjectMetadata,
} from '../../../infrastructure/storage/contracts/storage.contract.js';
import { S3StorageService } from '../../../infrastructure/storage/implementations/s3-storage.service.js';
import {
  IAuthGuard,
  IAuthenticatedUserContext,
} from '../../../shared/guards/contracts/auth-guard.contract.js';
import { ErrorHandlerMiddleware } from '../../../shared/middleware/error-handler.middleware.js';
import { UnauthorizedError } from '../../../shared/errors/domain.error.js';
import { ChatRetentionPreference } from '@aadat/contracts';

describe('Media Content Magic Bytes Validator', () => {
  const validator = new MediaContentValidator();

  it('validates JPEG image magic bytes (FF D8 FF)', () => {
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const res = validator.validateSignature(jpegBytes, 'image/jpeg');
    expect(res.isValid).toBe(true);
    expect(res.detectedFormat).toBe('image/jpeg');
  });

  it('validates PNG image magic bytes (89 50 4E 47)', () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const res = validator.validateSignature(pngBytes, 'image/png');
    expect(res.isValid).toBe(true);
    expect(res.detectedFormat).toBe('image/png');
  });

  it('validates WebP image magic bytes (RIFF....WEBP)', () => {
    const webpBytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, // 'RIFF'
      0x24, 0x00, 0x00, 0x00, // length
      0x57, 0x45, 0x42, 0x50, // 'WEBP'
    ]);
    const res = validator.validateSignature(webpBytes, 'image/webp');
    expect(res.isValid).toBe(true);
    expect(res.detectedFormat).toBe('image/webp');
  });

  it('validates MP3 ID3v2 header magic bytes (ID3)', () => {
    const mp3Bytes = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]); // 'ID3'
    const res = validator.validateSignature(mp3Bytes, 'audio/mpeg');
    expect(res.isValid).toBe(true);
    expect(res.detectedFormat).toBe('audio/mpeg');
  });

  it('validates MP3 raw sync word (FF FB)', () => {
    const mp3Sync = new Uint8Array([0xff, 0xfb, 0x90, 0x64]);
    const res = validator.validateSignature(mp3Sync, 'audio/mpeg');
    expect(res.isValid).toBe(true);
    expect(res.detectedFormat).toBe('audio/mpeg');
  });

  it('validates MP4 ISO ftyp header', () => {
    const mp4Bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x20, // size
      0x66, 0x74, 0x79, 0x70, // 'ftyp'
      0x69, 0x73, 0x6f, 0x6d, // 'isom'
    ]);
    const res = validator.validateSignature(mp4Bytes, 'video/mp4');
    expect(res.isValid).toBe(true);
    expect(res.detectedFormat).toBe('video/mp4');
  });

  it('validates FLAC audio header (fLaC)', () => {
    const flacBytes = new Uint8Array([0x66, 0x4c, 0x61, 0x43, 0x00, 0x00]);
    const res = validator.validateSignature(flacBytes, 'audio/flac');
    expect(res.isValid).toBe(true);
    expect(res.detectedFormat).toBe('audio/flac');
  });

  it('validates WAV audio header (RIFF....WAVE)', () => {
    const wavBytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46,
      0x24, 0x00, 0x00, 0x00,
      0x57, 0x41, 0x56, 0x45, // 'WAVE'
    ]);
    const res = validator.validateSignature(wavBytes, 'audio/wav');
    expect(res.isValid).toBe(true);
    expect(res.detectedFormat).toBe('audio/wav');
  });

  it('rejects truncated or empty content (< 4 bytes)', () => {
    const shortBytes = new Uint8Array([0xff, 0xd8]);
    const res = validator.validateSignature(shortBytes, 'image/jpeg');
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('too small');
  });

  it('rejects text or HTML disguised as media', () => {
    const htmlBytes = new TextEncoder().encode('<!DOCTYPE html><html><body>malicious</body></html>');
    const res = validator.validateSignature(htmlBytes, 'image/jpeg');
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('Unrecognized media file signature');
  });

  it('rejects MIME mismatch when file signature does not match claimed Content-Type', () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const res = validator.validateSignature(pngBytes, 'audio/mpeg');
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('Content-Type mismatch');
  });
});

describe('S3 Storage Service Foundation', () => {
  it('initializes with IAM role / default credential provider fallback without static keys', () => {
    const s3 = new S3StorageService({
      bucketName: 'aadat-test-bucket',
      region: 'ap-south-1',
    });
    expect(s3.getConfig().bucketName).toBe('aadat-test-bucket');
    expect(s3.getConfig().region).toBe('ap-south-1');
  });

  it('generates presigned download URLs natively supporting byte-range streaming', async () => {
    const s3 = new S3StorageService({
      bucketName: 'aadat-private-bucket',
      region: 'ap-south-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    });

    const streamUrl = await s3.getPresignedDownloadUrl('tracks/audio/test-track.mp3', 3600);
    expect(streamUrl).toContain('aadat-private-bucket.s3.ap-south-1.amazonaws.com');
    expect(streamUrl).toContain('tracks/audio/test-track.mp3');
    expect(streamUrl).toContain('X-Amz-Expires=3600');
    expect(streamUrl).toContain('X-Amz-Signature=');
  });

  it('generates presigned POST data with content-length-range and content-type policies', async () => {
    const s3 = new S3StorageService({
      bucketName: 'aadat-private-bucket',
      region: 'ap-south-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    });

    const postData = await s3.getPresignedPostData(
      'uploads/staging/user-1/avatar.jpg',
      'image/jpeg',
      900,
      1,
      5 * 1024 * 1024
    );

    expect(postData.url).toContain('aadat-private-bucket');
    expect(postData.fields).toBeDefined();
    expect(postData.fields['key']).toBe('uploads/staging/user-1/avatar.jpg');
    expect(postData.fields['Content-Type']).toBe('image/jpeg');
  });
});

describe('Media Service & REST Controller Security Remediation (Gate 3D.2)', () => {
  let app: FastifyInstance;
  let mockStorageService: IS3StorageService;
  let mockTicketRepository: IUploadTicketRepository;
  let mockUserRepository: IUserRepository;
  let mockTrackRepository: ITrackMediaRepository;
  let mockAuthGuard: IAuthGuard;
  let mediaService: MediaService;
  let inMemoryTickets: Map<string, IUploadTicket>;

  const userA: IUserEntity = {
    status: 'ACTIVE',
    id: 'user-a-1111',
    email: 'usera@example.com',
    displayName: 'User A',
    avatarKey: 'avatars/user-a-1111/existing-avatar.jpg',
    googleSub: 'google-sub-a',
    chatRetentionPreference: ChatRetentionPreference.EPHEMERAL_SESSION_ONLY,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const userB: IUserEntity = {
    status: 'ACTIVE',
    id: 'user-b-2222',
    email: 'userb@example.com',
    displayName: 'User B',
    avatarKey: null,
    googleSub: 'google-sub-b',
    chatRetentionPreference: ChatRetentionPreference.EPHEMERAL_SESSION_ONLY,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleTrack: ITrackMediaEntity = {
    id: 'track-uuid-9999',
    title: 'Aadat Anthem',
    artistName: 'Jal',
    audioKey: 'tracks/audio/verified-aadat-anthem.mp3',
    videoKey: null,
    artworkKey: 'tracks/art/verified-art.jpg',
  };

  let authenticatedUser: IAuthenticatedUserContext = {
    userId: userA.id,
    email: userA.email,
  };

  beforeEach(async () => {
    inMemoryTickets = new Map();

    mockTicketRepository = {
      saveTicket: vi.fn(async (ticket: IUploadTicket) => {
        inMemoryTickets.set(ticket.ticketId, ticket);
      }),
      findTicket: vi.fn(async (ticketId: string) => {
        return inMemoryTickets.get(ticketId) ?? null;
      }),
      acquireProcessingLock: vi.fn(async (ticketId: string, userId: string, lockTtlMs = 30000): Promise<IAcquireLockResult> => {
        const ticket = inMemoryTickets.get(ticketId);
        if (!ticket) return { acquired: false, reason: 'NOT_FOUND' };
        if (ticket.userId !== userId) return { acquired: false, reason: 'FORBIDDEN' };
        if (Date.now() > ticket.expiresAt) return { acquired: false, reason: 'EXPIRED' };
        if (ticket.status === 'CONFIRMED') return { acquired: false, ticket, reason: 'ALREADY_CONFIRMED' };
        if (ticket.status === 'REJECTED') return { acquired: false, reason: 'REJECTED' };
        if (ticket.status === 'PROCESSING') {
          const lockedUntil = ticket.processingLockedUntil ?? 0;
          if (Date.now() < lockedUntil) {
            return { acquired: false, reason: 'CONCURRENT_PROCESSING' };
          }
          // Lock expired; allow recovery!
        }

        const updated: IUploadTicket = {
          ...ticket,
          status: 'PROCESSING',
          processingLockedUntil: Date.now() + lockTtlMs,
          attempts: (ticket.attempts ?? 0) + 1,
        };
        inMemoryTickets.set(ticketId, updated);
        return { acquired: true, ticket: updated, reason: 'ACQUIRED' };
      }),
      confirmTicket: vi.fn(async (ticketId: string, permanentKey: string, verifiedETag = '') => {
        const ticket = inMemoryTickets.get(ticketId);
        if (ticket) {
          inMemoryTickets.set(ticketId, {
            ...ticket,
            status: 'CONFIRMED',
            permanentKey,
            verifiedETag,
          });
        }
      }),
      releaseProcessingLock: vi.fn(async (ticketId: string, markRejected = false) => {
        const ticket = inMemoryTickets.get(ticketId);
        if (ticket) {
          inMemoryTickets.set(ticketId, {
            ...ticket,
            status: markRejected ? 'REJECTED' : 'PENDING',
            processingLockedUntil: undefined,
          });
        }
      }),
      deleteTicket: vi.fn(async (ticketId: string) => {
        inMemoryTickets.delete(ticketId);
      }),
    };

    mockUserRepository = {
      findById: vi.fn(async (id: string) => {
        if (id === userA.id) return userA;
        if (id === userB.id) return userB;
        return null;
      }),
      findByEmail: vi.fn(),
      findByGoogleSub: vi.fn(),
      create: vi.fn(),
      updateChatRetentionPreference: vi.fn(),
      updateAvatarKey: vi.fn(async (_id: string, avatarKey: string | null) => {
        return { ...userA, avatarKey };
      }),
    };

    mockTrackRepository = {
      findById: vi.fn(async (id: string) => {
        if (id === sampleTrack.id) return sampleTrack;
        return null;
      }),
      findByAudioKey: vi.fn(async (key: string) => {
        if (key === sampleTrack.audioKey) return sampleTrack;
        return null;
      }),
    };

    mockStorageService = {
      getPresignedDownloadUrl: vi.fn(async (key: string, exp = 3600) => {
        return `https://mock-bucket.s3.amazonaws.com/${key}?sig=mock&expires=${exp}`;
      }),
      getPresignedUploadUrl: vi.fn(),
      getPresignedPostData: vi.fn(async (key: string, contentType: string) => {
        return {
          url: 'https://mock-bucket.s3.amazonaws.com',
          fields: { key, 'Content-Type': contentType },
        };
      }),
      headObject: vi.fn(async (_key: string): Promise<IStorageObjectMetadata | null> => {
        return {
          contentLength: 1024,
          contentType: 'image/jpeg',
          etag: '"mock-etag-abc123"',
          lastModified: new Date(),
        };
      }),
      getObjectBytes: vi.fn(async () => {
        return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      }),
      deleteObject: vi.fn(async () => {}),
      copyObject: vi.fn(async () => {}),
    };

    mockAuthGuard = {
      validateToken: vi.fn(async (authHeader: string | undefined) => {
        if (!authHeader || !authHeader.startsWith('Bearer valid-token')) {
          throw new UnauthorizedError('Missing or invalid authorization token');
        }
        return authenticatedUser;
      }),
    };

    mediaService = new MediaService({
      storageService: mockStorageService,
      ticketRepository: mockTicketRepository,
      userRepository: mockUserRepository,
      trackRepository: mockTrackRepository,
      presignedUploadExpirySeconds: 900,
      presignedDownloadExpirySeconds: 3600,
    });

    const mediaController = new MediaController({
      mediaService,
      authGuard: mockAuthGuard,
    });

    app = Fastify();
    app.setErrorHandler(ErrorHandlerMiddleware.handle);
    mediaController.registerRoutes(app);
    await app.ready();
  });

  // --------------------------------------------------------------------------
  // Fix 1: Trusted Database-Driven Playback (Removal of Arbitrary Object Keys)
  // --------------------------------------------------------------------------
  describe('Fix 1: Trusted Database Records for Playback', () => {
    it('caps legacy stream leases at the remaining license lifetime and refuses expired or invalid requests', async () => {
      const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-06T00:00:00Z'));
      try {
        vi.mocked(mockTrackRepository.findById).mockResolvedValue({ ...sampleTrack, licenseExpiresAt: new Date(Date.now() + 45_000) });
        expect(await mediaService.getTrackPlaybackUrl('user-a', { trackId: sampleTrack.id, expiresInSeconds: 3600 })).toMatchObject({ expiresInSeconds: 45 });
        expect(mockStorageService.getPresignedDownloadUrl).toHaveBeenLastCalledWith(sampleTrack.audioKey, 45);
        await expect(mediaService.getTrackPlaybackUrl('user-a', { trackId: sampleTrack.id, expiresInSeconds: -1 })).rejects.toThrow('expiry');
        vi.mocked(mockTrackRepository.findById).mockResolvedValue({ ...sampleTrack, licenseExpiresAt: new Date(Date.now() - 1) });
        await expect(mediaService.getTrackPlaybackUrl('user-a', { trackId: sampleTrack.id })).rejects.toThrow('expired');
        expect(mockStorageService.getPresignedDownloadUrl).toHaveBeenCalledTimes(1);
      } finally { clock.mockRestore(); }
    });
    it('resolves track playback URL from trusted database record using trackId', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/media/tracks/${sampleTrack.id}/stream`,
        headers: { authorization: 'Bearer valid-token' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.downloadUrl).toContain(sampleTrack.audioKey);
      expect(body.trackId).toBe(sampleTrack.id);
      expect(mockTrackRepository.findById).toHaveBeenCalledWith(sampleTrack.id);
    });

    it('returns HTTP 404 when requested trackId does not exist in database', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/media/tracks/non-existent-track/stream',
        headers: { authorization: 'Bearer valid-token' },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().message).toContain('not found');
    });

    it('resolves user avatar playback URL from trusted database record using userId', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/media/users/${userA.id}/avatar`,
        headers: { authorization: 'Bearer valid-token' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.downloadUrl).toContain(userA.avatarKey);
      expect(body.userId).toBe(userA.id);
    });

    it('returns HTTP 404 when user has no avatar set', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/media/users/${userB.id}/avatar`,
        headers: { authorization: 'Bearer valid-token' },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().message).toContain('does not have an avatar set');
    });

    it('allows verified user to remove their own avatar, deleting S3 object and nulling database avatarKey', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/media/users/${userA.id}/avatar`,
        headers: { authorization: 'Bearer valid-token' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ removed: true, userId: userA.id });
      expect(mockStorageService.deleteObject).toHaveBeenCalledWith(userA.avatarKey);
      expect(mockUserRepository.updateAvatarKey).toHaveBeenCalledWith(userA.id, null);
    });

    it('rejects user attempting to remove another user avatar with 403 Forbidden', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/media/users/${userB.id}/avatar`,
        headers: { authorization: 'Bearer valid-token' },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().message).toContain('only authorized to remove your own avatar');
    });

    it('rejects unauthenticated avatar removal request with 401', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/media/users/${userA.id}/avatar`,
      });

      expect(res.statusCode).toBe(401);
    });

    it('rejects old arbitrary client-supplied playback query route with 404', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/media/playback-url?objectKey=tracks/audio/arbitrary.mp3',
        headers: { authorization: 'Bearer valid-token' },
      });

      // Arbitrary objectKey endpoint has been completely removed
      expect(res.statusCode).toBe(404);
    });
  });

  // --------------------------------------------------------------------------
  // Fix 2: Role-Based Catalog Ingestion Authorization
  // --------------------------------------------------------------------------
  describe('Fix 2: Catalog Media Ingestion RBAC', () => {
    it('rejects non-admin user attempting to request TRACK_AUDIO upload ticket with 403', async () => {
      authenticatedUser = { userId: userA.id, email: userA.email, role: 'USER' };

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/media/upload-ticket',
        headers: { authorization: 'Bearer valid-token' },
        payload: {
          mediaType: 'TRACK_AUDIO',
          contentType: 'audio/mpeg',
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe('Forbidden');
      expect(res.json().message).toContain('Catalog media ingestion is restricted to administrators');
    });

    it('allows verified ADMIN user to request TRACK_AUDIO upload ticket', async () => {
      authenticatedUser = { userId: userA.id, email: userA.email, role: 'ADMIN' };

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/media/upload-ticket',
        headers: { authorization: 'Bearer valid-token' },
        payload: {
          mediaType: 'TRACK_AUDIO',
          contentType: 'audio/mpeg',
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().ticketId).toBeDefined();
    });

    it('allows normal user to request personal media (AVATAR) upload ticket', async () => {
      authenticatedUser = { userId: userA.id, email: userA.email, role: 'USER' };

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/media/upload-ticket',
        headers: { authorization: 'Bearer valid-token' },
        payload: {
          mediaType: 'AVATAR',
          contentType: 'image/jpeg',
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().stagingKey).toMatch(new RegExp(`^uploads/staging/${userA.id}/`));
    });
  });

  // --------------------------------------------------------------------------
  // Fix 3 & 4: Staging Key Isolation & S3 Presigned POST Only
  // --------------------------------------------------------------------------
  describe('Fix 3 & 4: Staging Namespaces & Presigned POST with content-length-range', () => {
    it('issues ticket writing strictly to uploads/staging/ namespace and omits raw PUT URLs', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/media/upload-ticket',
        headers: { authorization: 'Bearer valid-token' },
        payload: {
          mediaType: 'AVATAR',
          contentType: 'image/jpeg',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.stagingKey).toMatch(new RegExp(`^uploads/staging/${userA.id}/[a-f0-9-]+\\.jpg$`));
      expect(body.presignedPost).toBeDefined();
      expect(body.uploadUrl).toBeUndefined(); // Raw PUT URL eliminated
      expect(mockStorageService.getPresignedPostData).toHaveBeenCalledWith(
        body.stagingKey,
        'image/jpeg',
        900,
        1,
        5 * 1024 * 1024
      );
    });

    it('rejects ticket creation if declared contentLength exceeds category maximum with HTTP 413', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/media/upload-ticket',
        headers: { authorization: 'Bearer valid-token' },
        payload: {
          mediaType: 'AVATAR',
          contentType: 'image/jpeg',
          contentLength: 6 * 1024 * 1024, // 6MB > 5MB ceiling
        },
      });

      expect(res.statusCode).toBe(413);
      expect(res.json().error).toBe('Payload Too Large');
    });
  });

  // --------------------------------------------------------------------------
  // Fix 5 & 6: Atomic Ticket Transitions, Concurrency Protection & Idempotency
  // --------------------------------------------------------------------------
  describe('Fix 5 & 6: Atomic Redis Transitions & Concurrency Protection', () => {
    it('rejects concurrent confirmation requests on the same ticket with HTTP 409 Conflict', async () => {
      const ticketRes = await mediaService.createUploadTicket(userA.id, {
        mediaType: 'AVATAR',
        contentType: 'image/jpeg',
      });

      // Simulate lock already acquired by a concurrent in-flight request
      mockTicketRepository.acquireProcessingLock = vi.fn().mockResolvedValue({
        acquired: false,
        reason: 'CONCURRENT_PROCESSING',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/media/confirm-upload',
        headers: { authorization: 'Bearer valid-token' },
        payload: { ticketId: ticketRes.ticketId },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe('Conflict');
      expect(res.json().message).toContain('already in progress');
    });

    it('returns idempotent HTTP 200 without duplicate execution if ticket is already CONFIRMED', async () => {
      const confirmedPermanentKey = `avatars/${userA.id}/already-confirmed.jpg`;

      mockTicketRepository.acquireProcessingLock = vi.fn().mockResolvedValue({
        acquired: false,
        reason: 'ALREADY_CONFIRMED',
        ticket: {
          ticketId: 'confirmed-ticket',
          userId: userA.id,
          stagingKey: `uploads/staging/${userA.id}/staging.jpg`,
          permanentKey: confirmedPermanentKey,
          mediaType: 'AVATAR',
          expectedContentType: 'image/jpeg',
          maxSizeBytes: 5 * 1024 * 1024,
          createdAt: Date.now() - 10000,
          expiresAt: Date.now() + 800000,
          status: 'CONFIRMED',
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/media/confirm-upload',
        headers: { authorization: 'Bearer valid-token' },
        payload: { ticketId: 'confirmed-ticket' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.confirmed).toBe(true);
      expect(body.idempotent).toBe(true);
      expect(body.objectKey).toBe(confirmedPermanentKey);
      // S3 copy and DB update were not redundantly called
      expect(mockStorageService.copyObject).not.toHaveBeenCalled();
      expect(mockUserRepository.updateAvatarKey).not.toHaveBeenCalled();
    });

    it('recovers lock cleanly if previous confirmation timed out (lock expired)', async () => {
      const ticketRes = await mediaService.createUploadTicket(userA.id, {
        mediaType: 'AVATAR',
        contentType: 'image/jpeg',
      });

      // Set ticket to PROCESSING with expired lock
      const existingTicket = inMemoryTickets.get(ticketRes.ticketId)!;
      inMemoryTickets.set(ticketRes.ticketId, {
        ...existingTicket,
        status: 'PROCESSING',
        processingLockedUntil: Date.now() - 1000, // expired 1s ago
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/media/confirm-upload',
        headers: { authorization: 'Bearer valid-token' },
        payload: { ticketId: ticketRes.ticketId },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().confirmed).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Fix 8 & 9: Immutable S3 Copy, Staging Deletion & Promotion to Permanent Key
  // --------------------------------------------------------------------------
  describe('Fix 8 & 9: Immutable Promotion & Overwrite Protection', () => {
    it('promotes staging media to permanent key using CopySourceIfMatch, purges staging, and commits DB', async () => {
      const ticketRes = await mediaService.createUploadTicket(userA.id, {
        mediaType: 'AVATAR',
        contentType: 'image/jpeg',
      });

      const stagingKey = ticketRes.stagingKey;
      const expectedETag = '"mock-etag-abc123"';

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/media/confirm-upload',
        headers: { authorization: 'Bearer valid-token' },
        payload: { ticketId: ticketRes.ticketId },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.confirmed).toBe(true);
      // Permanent key must be under avatars/{userId}/* and distinct from stagingKey
      expect(body.objectKey).toMatch(new RegExp(`^avatars/${userA.id}/[a-f0-9-]+\\.jpg$`));
      expect(body.objectKey).not.toBe(stagingKey);

      // S3 Copy was performed with source ETag matching
      expect(mockStorageService.copyObject).toHaveBeenCalledWith(
        stagingKey,
        body.objectKey,
        expectedETag
      );

      // Staging object was safely deleted
      expect(mockStorageService.deleteObject).toHaveBeenCalledWith(stagingKey);

      // Database avatarKey points strictly to permanent key
      expect(mockUserRepository.updateAvatarKey).toHaveBeenCalledWith(
        userA.id,
        body.objectKey
      );

      // Ticket is finalized as CONFIRMED
      expect(mockTicketRepository.confirmTicket).toHaveBeenCalledWith(
        ticketRes.ticketId,
        body.objectKey,
        expectedETag
      );
    });

    it('rolls back and cleans up permanent S3 key if downstream database update throws', async () => {
      const ticketRes = await mediaService.createUploadTicket(userA.id, {
        mediaType: 'AVATAR',
        contentType: 'image/jpeg',
      });

      mockUserRepository.updateAvatarKey = vi.fn().mockRejectedValue(new Error('PostgreSQL connection drop'));

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/media/confirm-upload',
        headers: { authorization: 'Bearer valid-token' },
        payload: { ticketId: ticketRes.ticketId },
      });

      expect(res.statusCode).toBe(500);
      // Permanent key that was copied must be cleaned up from S3
      expect(mockStorageService.deleteObject).toHaveBeenCalled();
      // Ticket lock was released
      expect(mockTicketRepository.releaseProcessingLock).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Fix 10 & 12: Preserving Domain Errors When Best-Effort Cleanup Fails
  // --------------------------------------------------------------------------
  describe('Fix 10 & 12: Error Preservation on Cleanup Failures', () => {
    it('preserves PayloadTooLargeError when secondary S3 deleteObject or Redis update fails', async () => {
      const ticketRes = await mediaService.createUploadTicket(userA.id, {
        mediaType: 'AVATAR',
        contentType: 'image/jpeg',
      });

      // S3 reports oversized content
      mockStorageService.headObject = vi.fn().mockResolvedValue({
        contentLength: 10 * 1024 * 1024, // 10MB
        contentType: 'image/jpeg',
        etag: '"etag-10mb"',
      });

      // Simulate failure in secondary cleanup delete
      mockStorageService.deleteObject = vi.fn().mockRejectedValue(new Error('S3 delete network timeout'));

      // Simulate failure in releasing lock
      mockTicketRepository.releaseProcessingLock = vi.fn().mockRejectedValue(new Error('Redis connection lost'));

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/media/confirm-upload',
        headers: { authorization: 'Bearer valid-token' },
        payload: { ticketId: ticketRes.ticketId },
      });

      // The original PayloadTooLargeError (413) is strictly preserved!
      expect(res.statusCode).toBe(413);
      expect(res.json().error).toBe('Payload Too Large');
    });

    it('preserves ValidationFailedError on MIME mismatch when cleanup fails', async () => {
      const ticketRes = await mediaService.createUploadTicket(userA.id, {
        mediaType: 'AVATAR',
        contentType: 'image/jpeg',
      });

      // S3 reports Content-Type mismatch
      mockStorageService.headObject = vi.fn().mockResolvedValue({
        contentLength: 1024,
        contentType: 'image/png', // Expected image/jpeg
        etag: '"etag-png"',
      });

      mockStorageService.deleteObject = vi.fn().mockRejectedValue(new Error('S3 error'));

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/media/confirm-upload',
        headers: { authorization: 'Bearer valid-token' },
        payload: { ticketId: ticketRes.ticketId },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Validation Failed');
      expect(res.json().message).toContain('Content-Type');
    });
  });

  // --------------------------------------------------------------------------
  // Stage 15 Safety Review: Atomic Replacement, Expiry & Account Isolation
  // --------------------------------------------------------------------------
  describe('Stage 15 Safety Review: Atomic Replacement, Expiry & Account Isolation', () => {
    it('never deletes existing S3 avatar if database update fails during avatar replacement', async () => {
      const existingAvatarKey = 'avatars/user-a/existing-avatar.jpg';
      mockUserRepository.findById = vi.fn().mockResolvedValue({
        ...userA,
        avatarKey: existingAvatarKey,
      });

      const ticketRes = await mediaService.createUploadTicket(userA.id, {
        mediaType: 'AVATAR',
        contentType: 'image/jpeg',
      });

      // Downstream database failure
      mockUserRepository.updateAvatarKey = vi.fn().mockRejectedValue(new Error('PostgreSQL deadlock error'));

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/media/confirm-upload',
        headers: { authorization: 'Bearer valid-token' },
        payload: { ticketId: ticketRes.ticketId },
      });

      expect(res.statusCode).toBe(500);
      // Existing avatar in S3 must NEVER be deleted when DB commit fails!
      expect(mockStorageService.deleteObject).not.toHaveBeenCalledWith(existingAvatarKey);
      // Staging key is deleted as part of initial copy
      expect(mockStorageService.deleteObject).toHaveBeenCalledWith(ticketRes.stagingKey);
    });

    it('deletes existing S3 avatar only after new upload and database update are successfully committed', async () => {
      const existingAvatarKey = 'avatars/user-a/existing-avatar.jpg';
      mockUserRepository.findById = vi.fn().mockResolvedValue({
        ...userA,
        avatarKey: existingAvatarKey,
      });

      const callOrder: string[] = [];
      mockUserRepository.updateAvatarKey = vi.fn().mockImplementation(async () => {
        callOrder.push('db:updateAvatarKey');
      });
      mockStorageService.deleteObject = vi.fn().mockImplementation(async (key: string) => {
        callOrder.push(`s3:deleteObject:${key}`);
      });

      const ticketRes = await mediaService.createUploadTicket(userA.id, {
        mediaType: 'AVATAR',
        contentType: 'image/jpeg',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/media/confirm-upload',
        headers: { authorization: 'Bearer valid-token' },
        payload: { ticketId: ticketRes.ticketId },
      });

      expect(res.statusCode).toBe(200);
      // Verify updateAvatarKey happened BEFORE deleteObject on existingAvatarKey
      const dbIndex = callOrder.indexOf('db:updateAvatarKey');
      const deleteExistingIndex = callOrder.indexOf(`s3:deleteObject:${existingAvatarKey}`);
      expect(dbIndex).toBeGreaterThan(-1);
      expect(deleteExistingIndex).toBeGreaterThan(-1);
      expect(dbIndex).toBeLessThan(deleteExistingIndex);
    });

    it('never deletes S3 avatar during avatar removal if database update fails', async () => {
      const existingAvatarKey = 'avatars/user-a/existing-avatar.jpg';
      mockUserRepository.findById = vi.fn().mockResolvedValue({
        ...userA,
        avatarKey: existingAvatarKey,
      });
      mockUserRepository.updateAvatarKey = vi.fn().mockRejectedValue(new Error('PostgreSQL connection drop'));

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/media/users/${userA.id}/avatar`,
        headers: { authorization: 'Bearer valid-token' },
      });

      expect(res.statusCode).toBe(500);
      // The S3 object must remain intact since database transaction did not commit
      expect(mockStorageService.deleteObject).not.toHaveBeenCalledWith(existingAvatarKey);
    });

    it('rejects cross-account upload confirmation when User B attempts to confirm User A ticket with 403 Forbidden', async () => {
      // User A creates ticket
      const ticketRes = await mediaService.createUploadTicket(userA.id, {
        mediaType: 'AVATAR',
        contentType: 'image/jpeg',
      });

      // User B attempts to confirm User A's ticket
      authenticatedUser = { userId: userB.id, email: userB.email, role: 'USER' };

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/media/confirm-upload',
        headers: { authorization: 'Bearer valid-token' },
        payload: { ticketId: ticketRes.ticketId },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe('Forbidden');
      expect(res.json().message).toContain('not authorized to confirm this upload ticket');
    });

    it('validates and caps presigned avatar download URL expiry seconds', async () => {
      mockUserRepository.findById = vi.fn().mockResolvedValue(userA);

      // Rejects negative expiry
      const invalidRes = await app.inject({
        method: 'GET',
        url: `/api/v1/media/users/${userA.id}/avatar?expiresInSeconds=-10`,
        headers: { authorization: 'Bearer valid-token' },
      });
      expect(invalidRes.statusCode).toBe(400);

      // Caps excessive expiry to configured maximum (3600 seconds)
      const cappedRes = await app.inject({
        method: 'GET',
        url: `/api/v1/media/users/${userA.id}/avatar?expiresInSeconds=999999`,
        headers: { authorization: 'Bearer valid-token' },
      });
      expect(cappedRes.statusCode).toBe(200);
      expect(cappedRes.json().expiresInSeconds).toBe(3600);
      expect(mockStorageService.getPresignedDownloadUrl).toHaveBeenCalledWith(
        userA.avatarKey,
        3600
      );
    });
  });
});
