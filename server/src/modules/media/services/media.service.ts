import crypto from 'node:crypto';
import { IS3StorageService } from '../../../infrastructure/storage/contracts/storage.contract.js';
import {
  IUploadTicket,
  IUploadTicketRepository,
  MediaType,
} from '../contracts/upload-ticket-repository.contract.js';
import { IUserRepository } from '../../auth/contracts/user-repository.contract.js';
import { ITrackMediaRepository } from '../contracts/track-media-repository.contract.js';
import {
  IMediaContentValidator,
  MediaContentValidator,
} from './media-content-validator.js';
import {
  IMediaService,
  IRequestUploadTicketInput,
  IUploadTicketResult,
  IConfirmUploadInput,
  IConfirmUploadResult,
  ITrackPlaybackInput,
  ITrackPlaybackResult,
  IAvatarPlaybackInput,
  IAvatarPlaybackResult,
  IRemoveAvatarResult,
} from '../contracts/media.contract.js';
import {
  NotFoundError,
  ForbiddenError,
  ValidationFailedError,
  PayloadTooLargeError,
  ConflictError,
} from '../../../shared/errors/domain.error.js';

export interface IMediaServiceDependencies {
  readonly storageService: IS3StorageService;
  readonly ticketRepository: IUploadTicketRepository;
  readonly userRepository: IUserRepository;
  readonly trackRepository?: ITrackMediaRepository;
  readonly contentValidator?: IMediaContentValidator;
  readonly presignedUploadExpirySeconds?: number;
  readonly presignedDownloadExpirySeconds?: number;
}

/**
 * Media Service implementing IMediaService.
 * Strictly adheres to class-based OOP, SOLID, and DI.
 * Enforces staging isolation, atomic Redis confirmation, immutable promotion,
 * S3 presigned POST size boundaries, and database-driven playback authorization.
 */
export class MediaService implements IMediaService {
  private readonly storageService: IS3StorageService;
  private readonly ticketRepository: IUploadTicketRepository;
  private readonly userRepository: IUserRepository;
  private readonly trackRepository?: ITrackMediaRepository;
  private readonly contentValidator: IMediaContentValidator;
  private readonly presignedUploadExpirySeconds: number;
  private readonly presignedDownloadExpirySeconds: number;

  // Maximum allowed sizes per media category (bytes)
  private static readonly MAX_SIZE_LIMITS: Record<MediaType, number> = {
    AVATAR: 5 * 1024 * 1024, // 5 MB
    TRACK_AUDIO: 50 * 1024 * 1024, // 50 MB
    TRACK_VIDEO: 100 * 1024 * 1024, // 100 MB
    TRACK_ARTWORK: 10 * 1024 * 1024, // 10 MB
    STAGING: 75 * 1024 * 1024, // 75 MB
  };

  // Whitelisted MIME types per media category
  private static readonly ALLOWED_MIME_TYPES: Record<MediaType, readonly string[]> = {
    AVATAR: ['image/jpeg', 'image/png', 'image/webp'],
    TRACK_AUDIO: [
      'audio/mpeg',
      'audio/aac',
      'audio/flac',
      'audio/wav',
      'audio/x-wav',
      'audio/mp4',
      'audio/m4a',
    ],
    TRACK_VIDEO: ['video/mp4', 'video/webm'],
    TRACK_ARTWORK: ['image/jpeg', 'image/png', 'image/webp'],
    STAGING: [
      'audio/mpeg',
      'audio/aac',
      'audio/flac',
      'audio/wav',
      'audio/mp4',
      'audio/m4a',
      'video/mp4',
      'video/webm',
      'image/jpeg',
      'image/png',
      'image/webp',
    ],
  };

  public constructor(dependencies: IMediaServiceDependencies) {
    this.storageService = dependencies.storageService;
    this.ticketRepository = dependencies.ticketRepository;
    this.userRepository = dependencies.userRepository;
    this.trackRepository = dependencies.trackRepository;
    this.contentValidator = dependencies.contentValidator ?? new MediaContentValidator();
    this.presignedUploadExpirySeconds = dependencies.presignedUploadExpirySeconds ?? 900;
    this.presignedDownloadExpirySeconds = dependencies.presignedDownloadExpirySeconds ?? 3600;
  }

  /**
   * Generates a secure upload ticket bound strictly to an ephemeral staging key
   * and S3 Presigned POST policy. Catalog ingestion is restricted to ADMIN roles.
   */
  public async createUploadTicket(
    userId: string,
    input: IRequestUploadTicketInput,
    userRole?: string
  ): Promise<IUploadTicketResult> {
    if (!userId || userId.trim().length === 0) {
      throw new ForbiddenError('Authenticated user ID is required to generate an upload ticket');
    }

    const mediaType = input.mediaType;
    if (!MediaService.MAX_SIZE_LIMITS[mediaType]) {
      throw new ValidationFailedError(`Invalid mediaType: "${mediaType}"`);
    }

    // Role-based Access Control: Catalog ingestion is restricted to ADMIN/SYSTEM
    const isCatalogMedia =
      mediaType === 'TRACK_AUDIO' ||
      mediaType === 'TRACK_VIDEO' ||
      mediaType === 'TRACK_ARTWORK';

    if (isCatalogMedia && userRole !== 'ADMIN' && userRole !== 'SYSTEM') {
      throw new ForbiddenError('Catalog media ingestion is restricted to administrators');
    }

    const normContentType = (input.contentType || '').trim().toLowerCase();
    const allowedTypes = MediaService.ALLOWED_MIME_TYPES[mediaType];
    if (!allowedTypes.includes(normContentType)) {
      throw new ValidationFailedError(
        `Disallowed Content-Type "${input.contentType}" for media type ${mediaType}. Allowed: ${allowedTypes.join(', ')}`
      );
    }

    const maxSizeBytes = MediaService.MAX_SIZE_LIMITS[mediaType];
    if (input.contentLength !== undefined && input.contentLength > maxSizeBytes) {
      throw new PayloadTooLargeError(
        `Declared file size (${input.contentLength} bytes) exceeds maximum allowed size for ${mediaType} (${maxSizeBytes} bytes)`
      );
    }

    // All uploads write strictly to an ephemeral staging key; NEVER directly to permanent keys
    const extension = this.mimeToExtension(normContentType);
    const stagingKey = `uploads/staging/${userId}/${crypto.randomUUID()}.${extension}`;
    const ticketId = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + this.presignedUploadExpirySeconds * 1000;

    const ticket: IUploadTicket = {
      ticketId,
      userId,
      stagingKey,
      mediaType,
      expectedContentType: normContentType,
      maxSizeBytes,
      createdAt: now,
      expiresAt,
      status: 'PENDING',
    };

    // Save ephemeral ticket to Redis
    await this.ticketRepository.saveTicket(ticket, this.presignedUploadExpirySeconds);

    // Generate S3 Presigned POST with bucket-enforced content-length-range
    const presignedPost = await this.storageService.getPresignedPostData(
      stagingKey,
      normContentType,
      this.presignedUploadExpirySeconds,
      1,
      maxSizeBytes
    );

    return {
      ticketId,
      stagingKey,
      presignedPost,
      expiresInSeconds: this.presignedUploadExpirySeconds,
      maxSizeBytes,
      expectedContentType: normContentType,
    };
  }

  /**
   * Atomically confirms upload ticket via Redis CAS lock, verifies staging S3 object,
   * performs immutable copy to permanent key, cleans up staging, and commits DB update.
   */
  public async confirmUpload(
    userId: string,
    input: IConfirmUploadInput
  ): Promise<IConfirmUploadResult> {
    if (!input.ticketId || input.ticketId.trim().length === 0) {
      throw new ValidationFailedError('ticketId is required for upload confirmation');
    }

    // 1. Atomic Lock Acquisition (PENDING -> PROCESSING)
    const lockResult = await this.ticketRepository.acquireProcessingLock(
      input.ticketId,
      userId,
      30000 // 30-second lock TTL
    );

    if (lockResult.reason === 'ALREADY_CONFIRMED' && lockResult.ticket?.permanentKey) {
      return {
        confirmed: true,
        objectKey: lockResult.ticket.permanentKey,
        mediaType: lockResult.ticket.mediaType,
        idempotent: true,
      };
    }

    if (lockResult.reason === 'NOT_FOUND') {
      throw new NotFoundError('Upload ticket not found or has expired');
    }

    if (lockResult.reason === 'FORBIDDEN') {
      throw new ForbiddenError('You are not authorized to confirm this upload ticket');
    }

    if (lockResult.reason === 'EXPIRED') {
      throw new ValidationFailedError('Upload ticket has expired');
    }

    if (lockResult.reason === 'CONCURRENT_PROCESSING') {
      throw new ConflictError('Upload confirmation is already in progress');
    }

    if (lockResult.reason === 'REJECTED') {
      throw new ValidationFailedError('Upload ticket has already been rejected');
    }

    if (!lockResult.acquired || !lockResult.ticket) {
      throw new ConflictError('Failed to acquire upload confirmation processing lock');
    }

    const ticket = lockResult.ticket;
    let permanentKeyCreated: string | null = null;
    let dbCommitted = false;

    try {
      // 2. S3 Staging Object Existence Check
      const head = await this.storageService.headObject(ticket.stagingKey);
      if (!head) {
        await this.safeReleaseLock(ticket.ticketId, true, 'Staging object not found');
        throw new NotFoundError(
          'Uploaded media object does not exist in staging storage. Please upload before confirmation.'
        );
      }

      // 3. ContentLength Check
      if (head.contentLength === undefined || head.contentLength <= 0) {
        await this.safeDeleteObject(ticket.stagingKey);
        await this.safeReleaseLock(ticket.ticketId, true, 'Empty file');
        throw new ValidationFailedError('Uploaded media file is empty (0 bytes)');
      }

      if (head.contentLength > ticket.maxSizeBytes) {
        await this.safeDeleteObject(ticket.stagingKey);
        await this.safeReleaseLock(ticket.ticketId, true, 'Oversized file');
        throw new PayloadTooLargeError(
          `Uploaded file size (${head.contentLength} bytes) exceeds allowed limit of ${ticket.maxSizeBytes} bytes`
        );
      }

      // 4. ContentType Header Check
      if (
        !head.contentType ||
        head.contentType.toLowerCase() !== ticket.expectedContentType.toLowerCase()
      ) {
        await this.safeDeleteObject(ticket.stagingKey);
        await this.safeReleaseLock(ticket.ticketId, true, 'ContentType mismatch');
        throw new ValidationFailedError(
          `Uploaded Content-Type header "${head.contentType}" does not match expected "${ticket.expectedContentType}"`
        );
      }

      // 5. Binary Magic Bytes Inspection
      const headerBytes = await this.storageService.getObjectBytes(
        ticket.stagingKey,
        'bytes=0-63'
      );
      const contentValidation = this.contentValidator.validateSignature(
        headerBytes,
        ticket.expectedContentType
      );

      if (!contentValidation.isValid) {
        await this.safeDeleteObject(ticket.stagingKey);
        await this.safeReleaseLock(ticket.ticketId, true, 'Invalid signature');
        throw new ValidationFailedError(
          `Media content verification failed: ${contentValidation.error ?? 'Unrecognized file signature'}`
        );
      }

      // 6. Promotion to Permanent Key with Immutable Source ETag Check
      const extension = this.mimeToExtension(ticket.expectedContentType);
      const permanentKey = this.generatePermanentKey(ticket.userId, ticket.mediaType, extension);
      const sourceETag = head.etag;

      // S3 CopyObjectCommand enforces CopySourceIfMatch to ensure staging object was not altered in-flight
      await this.storageService.copyObject(ticket.stagingKey, permanentKey, sourceETag);
      permanentKeyCreated = permanentKey;

      // Purge staging object immediately after copy
      await this.safeDeleteObject(ticket.stagingKey);

      // 7. Database Update — Never delete existing S3 avatar before new DB update commits
      let oldAvatarKeyToPrune: string | null = null;
      if (ticket.mediaType === 'AVATAR') {
        const existingUser = await this.userRepository.findById(userId);
        if (existingUser?.avatarKey && existingUser.avatarKey !== permanentKey) {
          oldAvatarKeyToPrune = existingUser.avatarKey;
        }
        await this.userRepository.updateAvatarKey(userId, permanentKey);
        dbCommitted = true;
      }

      // 8. Atomic Ticket Finalization
      await this.ticketRepository.confirmTicket(ticket.ticketId, permanentKey, sourceETag);

      // 9. Post-Commit S3 Cleanup — Prune old avatar ONLY after new upload and DB update succeed
      if (oldAvatarKeyToPrune) {
        await this.safeDeleteObject(oldAvatarKeyToPrune);
      }

      return {
        confirmed: true,
        objectKey: permanentKey,
        mediaType: ticket.mediaType,
      };
    } catch (error: unknown) {
      // Reconciliation on unexpected error (e.g., DB failure after S3 copy)
      // Only delete permanentKeyCreated if database commit was not completed
      if (permanentKeyCreated && !dbCommitted) {
        await this.safeDeleteObject(permanentKeyCreated);
      }
      await this.safeReleaseLock(ticket.ticketId, false);
      throw error;
    }
  }

  /**
   * Resolves track playback URL strictly from trusted PostgreSQL repository records.
   * Arbitrary client-supplied keys are completely rejected.
   */
  public async getTrackPlaybackUrl(
    userId: string,
    input: ITrackPlaybackInput
  ): Promise<ITrackPlaybackResult> {
    if (!userId) {
      throw new ForbiddenError('Authentication required to access playback');
    }

    const trackId = (input.trackId || '').trim();
    if (!trackId) {
      throw new ValidationFailedError('trackId is required');
    }

    if (!this.trackRepository) {
      throw new NotFoundError('Track repository is unavailable');
    }

    const track = await this.trackRepository.findById(trackId);
    if (!track) {
      throw new NotFoundError(`Track with id "${trackId}" not found`);
    }

    if (!track.audioKey) {
      throw new NotFoundError(`Track "${trackId}" has no associated audio media`);
    }

    const requested = input.expiresInSeconds ?? this.presignedDownloadExpirySeconds;
    if (!Number.isInteger(requested) || requested < 1) throw new ValidationFailedError('Invalid playback expiry.');
    const expirySeconds = Math.min(requested, this.presignedDownloadExpirySeconds,
      track.licenseExpiresAt ? Math.floor((track.licenseExpiresAt.getTime() - Date.now()) / 1000) : this.presignedDownloadExpirySeconds);
    if (expirySeconds < 1) throw new NotFoundError('The media license has expired.');
    const downloadUrl = await this.storageService.getPresignedDownloadUrl(
      track.audioKey,
      expirySeconds
    );

    return {
      downloadUrl,
      expiresInSeconds: expirySeconds,
      trackId,
      audioKey: track.audioKey,
    };
  }

  /**
   * Resolves user avatar URL strictly from trusted PostgreSQL repository records.
   * Arbitrary client-supplied keys are completely rejected.
   */
  public async getUserAvatarUrl(
    requesterUserId: string,
    input: IAvatarPlaybackInput
  ): Promise<IAvatarPlaybackResult> {
    if (!requesterUserId) {
      throw new ForbiddenError('Authentication required to access user media');
    }

    const targetUserId = (input.targetUserId || '').trim();
    if (!targetUserId) {
      throw new ValidationFailedError('targetUserId is required');
    }

    const targetUser = await this.userRepository.findById(targetUserId);
    if (!targetUser) {
      throw new NotFoundError(`User with id "${targetUserId}" not found`);
    }

    if (!targetUser.avatarKey) {
      throw new NotFoundError(`User "${targetUserId}" does not have an avatar set`);
    }

    const requested = input.expiresInSeconds ?? this.presignedDownloadExpirySeconds;
    if (!Number.isInteger(requested) || requested < 1) {
      throw new ValidationFailedError('Invalid avatar URL expiry seconds');
    }
    const expirySeconds = Math.min(requested, this.presignedDownloadExpirySeconds);
    const downloadUrl = await this.storageService.getPresignedDownloadUrl(
      targetUser.avatarKey,
      expirySeconds
    );

    return {
      downloadUrl,
      expiresInSeconds: expirySeconds,
      userId: targetUserId,
      avatarKey: targetUser.avatarKey,
    };
  }

  /**
   * Authorizes and removes user avatar from PostgreSQL and deletes object from S3.
   * Requires caller to be the target user or possess ADMIN / SUPER_ADMIN role.
   * Ensures database update commits successfully before purging S3 storage.
   */
  public async removeUserAvatar(
    requesterUserId: string,
    targetUserId: string,
    userRole?: string
  ): Promise<IRemoveAvatarResult> {
    if (!requesterUserId) {
      throw new ForbiddenError('Authentication required to remove avatar');
    }

    const target = (targetUserId || '').trim();
    if (!target) {
      throw new ValidationFailedError('targetUserId is required');
    }

    if (requesterUserId !== target && userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN') {
      throw new ForbiddenError('You are only authorized to remove your own avatar');
    }

    const user = await this.userRepository.findById(target);
    if (!user) {
      throw new NotFoundError(`User with id "${target}" not found`);
    }

    if (user.avatarKey) {
      const oldAvatarKey = user.avatarKey;
      // Commit database update first to preserve consistency if database update fails
      await this.userRepository.updateAvatarKey(target, null);
      await this.safeDeleteObject(oldAvatarKey);
    }

    return {
      removed: true,
      userId: target,
    };
  }

  public getTrackRepository(): ITrackMediaRepository | undefined {
    return this.trackRepository;
  }

  /**
   * Generates deterministic, unexposed permanent destination keys.
   */
  private generatePermanentKey(
    userId: string,
    mediaType: MediaType,
    extension: string
  ): string {
    const fileId = crypto.randomUUID();
    switch (mediaType) {
      case 'AVATAR':
        return `avatars/${userId}/${fileId}.${extension}`;
      case 'TRACK_AUDIO':
        return `tracks/audio/${fileId}.${extension}`;
      case 'TRACK_VIDEO':
        return `tracks/video/${fileId}.${extension}`;
      case 'TRACK_ARTWORK':
        return `tracks/art/${fileId}.${extension}`;
      case 'STAGING':
        return `uploads/staging/${userId}/${fileId}.${extension}`;
    }
  }

  private mimeToExtension(mime: string): string {
    switch (mime) {
      case 'image/jpeg':
        return 'jpg';
      case 'image/png':
        return 'png';
      case 'image/webp':
        return 'webp';
      case 'audio/mpeg':
        return 'mp3';
      case 'audio/aac':
      case 'audio/mp4':
      case 'audio/m4a':
        return 'm4a';
      case 'audio/flac':
        return 'flac';
      case 'audio/wav':
      case 'audio/x-wav':
        return 'wav';
      case 'video/mp4':
        return 'mp4';
      case 'video/webm':
        return 'webm';
      default:
        return 'bin';
    }
  }

  /**
   * Safe cleanup suppressing secondary errors to preserve the original domain error.
   */
  private async safeDeleteObject(objectKey: string): Promise<void> {
    try {
      await this.storageService.deleteObject(objectKey);
    } catch {
      // Suppress secondary storage failure
    }
  }

  /**
   * Safe lock release suppressing secondary errors to preserve the original domain error.
   */
  private async safeReleaseLock(
    ticketId: string,
    markRejected: boolean,
    reason?: string
  ): Promise<void> {
    try {
      await this.ticketRepository.releaseProcessingLock(ticketId, markRejected, reason);
    } catch {
      // Suppress secondary cache failure
    }
  }
}
