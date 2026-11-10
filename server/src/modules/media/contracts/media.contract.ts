import { IPresignedPostData } from '../../../infrastructure/storage/contracts/storage.contract.js';
import { MediaType } from './upload-ticket-repository.contract.js';

export interface IRequestUploadTicketInput {
  readonly mediaType: MediaType;
  readonly contentType: string;
  readonly contentLength?: number;
}

export interface IUploadTicketResult {
  readonly ticketId: string;
  readonly stagingKey: string;
  readonly presignedPost: IPresignedPostData;
  readonly expiresInSeconds: number;
  readonly maxSizeBytes: number;
  readonly expectedContentType: string;
}

export interface IConfirmUploadInput {
  readonly ticketId: string;
}

export interface IConfirmUploadResult {
  readonly confirmed: boolean;
  readonly objectKey: string;
  readonly mediaType: MediaType;
  readonly idempotent?: boolean;
}

export interface ITrackPlaybackInput {
  readonly trackId: string;
  readonly expiresInSeconds?: number;
}

export interface ITrackPlaybackResult {
  readonly downloadUrl: string;
  readonly expiresInSeconds: number;
  readonly trackId: string;
  readonly audioKey: string;
}

export interface IAvatarPlaybackInput {
  readonly targetUserId: string;
  readonly expiresInSeconds?: number;
}

export interface IAvatarPlaybackResult {
  readonly downloadUrl: string;
  readonly expiresInSeconds: number;
  readonly userId: string;
  readonly avatarKey: string;
}

export interface IRemoveAvatarResult {
  readonly removed: boolean;
  readonly userId: string;
}

export interface IMediaService {
  /**
   * Generates a secure staging upload ticket bound to caller, size limits,
   * and S3 presigned POST policy. Catalog ingestion requires ADMIN role.
   */
  createUploadTicket(
    userId: string,
    input: IRequestUploadTicketInput,
    userRole?: string
  ): Promise<IUploadTicketResult>;

  /**
   * Atomically acquires ticket lock, validates staging object presence, size,
   * ContentType and magic bytes, performs immutable source copy to permanent key,
   * purges staging object, and commits database update.
   */
  confirmUpload(
    userId: string,
    input: IConfirmUploadInput
  ): Promise<IConfirmUploadResult>;

  /**
   * Authorizes and generates playback URL for catalog track via trusted database lookup.
   */
  getTrackPlaybackUrl(
    userId: string,
    input: ITrackPlaybackInput
  ): Promise<ITrackPlaybackResult>;

  /**
   * Authorizes and generates avatar URL for user via trusted database lookup.
   */
  getUserAvatarUrl(
    requesterUserId: string,
    input: IAvatarPlaybackInput
  ): Promise<IAvatarPlaybackResult>;

  /**
   * Authorizes and removes user avatar from PostgreSQL and deletes object from S3.
   * Requires caller to be the target user or possess ADMIN / SUPER_ADMIN role.
   */
  removeUserAvatar(
    requesterUserId: string,
    targetUserId: string,
    userRole?: string
  ): Promise<IRemoveAvatarResult>;
}
