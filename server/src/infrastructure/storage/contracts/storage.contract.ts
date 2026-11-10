/**
 * S3 Storage Object Metadata
 */
export interface IStorageObjectMetadata {
  readonly contentLength?: number;
  readonly contentType?: string;
  readonly etag?: string;
  readonly lastModified?: Date;
}

/**
 * Presigned POST upload data including S3 bucket URL and policy fields
 */
export interface IPresignedPostData {
  readonly url: string;
  readonly fields: Record<string, string>;
}

/**
 * S3 Storage Service Contract
 * Generates short-lived presigned URLs on demand (S3 keys are stored, never expired URLs).
 * Supports cryptographic SigV4 signing, size enforcement, and byte-range streaming.
 */
export interface IS3StorageService {
  /**
   * Generates a short-lived presigned GET URL for streaming or downloading an object.
   * Naturally supports HTTP Range requests for mobile streaming (ExoPlayer/AVPlayer).
   */
  getPresignedDownloadUrl(objectKey: string, expiresInSeconds?: number): Promise<string>;

  /**
   * Generates a short-lived presigned PUT URL for client binary upload.
   */
  getPresignedUploadUrl(
    destinationKey: string,
    contentType: string,
    expiresInSeconds?: number,
    maxSizeBytes?: number
  ): Promise<string>;

  /**
   * Generates presigned POST data with bucket-enforced content-length-range and content-type conditions.
   */
  getPresignedPostData(
    destinationKey: string,
    contentType: string,
    expiresInSeconds?: number,
    minSizeBytes?: number,
    maxSizeBytes?: number
  ): Promise<IPresignedPostData>;

  /**
   * Retrieves object metadata (ContentLength, ContentType, ETag) or null if object does not exist.
   */
  headObject(objectKey: string): Promise<IStorageObjectMetadata | null>;

  /**
   * Retrieves object bytes, supporting byte ranges (e.g. "bytes=0-63" for magic byte verification).
   */
  getObjectBytes(objectKey: string, range?: string): Promise<Uint8Array>;

  /**
   * Deletes an object from private S3 storage (e.g. cleaning unverified or rejected uploads).
   */
  deleteObject(objectKey: string): Promise<void>;

  /**
   * Copies an object within the storage bucket (e.g. promoting staging media to catalog media).
   * Supports optional sourceETag for atomic CopySourceIfMatch precondition verification.
   */
  copyObject(sourceKey: string, destinationKey: string, sourceETag?: string): Promise<void>;
}


