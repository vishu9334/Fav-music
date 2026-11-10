import {
  S3Client,
  S3ClientConfig,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import {
  IS3StorageService,
  IStorageObjectMetadata,
  IPresignedPostData,
} from '../contracts/storage.contract.js';

export interface IS3Config {
  readonly bucketName: string;
  readonly region: string;
  readonly accessKeyId?: string;
  readonly secretAccessKey?: string;
  readonly endpoint?: string;
  readonly forcePathStyle?: boolean;
  readonly presignedUploadExpirySeconds?: number;
  readonly presignedDownloadExpirySeconds?: number;
}

/**
 * Concrete S3 Storage Service implementing IS3StorageService using AWS SDK v3.
 * Strictly adheres to OOP, SOLID, and native ESM.
 * Generates cryptographic SigV4 presigned URLs on demand from stored object keys.
 * Supports private buckets, default AWS credential provider chains, and byte-range streaming.
 */
export class S3StorageService implements IS3StorageService {
  private readonly config: IS3Config;
  private readonly s3Client: S3Client;

  public constructor(config: IS3Config, client?: S3Client) {
    this.config = config;

    if (client) {
      this.s3Client = client;
    } else {
      const clientConfig: S3ClientConfig = {
        region: config.region,
      };

      if (config.accessKeyId && config.secretAccessKey) {
        clientConfig.credentials = {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        };
      } else if (process.env['NODE_ENV'] === 'test') {
        // Hermetic fallback for test environments without real credentials
        clientConfig.credentials = {
          accessKeyId: 'test-mock-access-key-id',
          secretAccessKey: 'test-mock-secret-access-key',
        };
      }
      // In production/development without explicit credentials, falls back to default AWS credential chain

      if (config.endpoint) {
        clientConfig.endpoint = config.endpoint;
      }
      if (typeof config.forcePathStyle === 'boolean') {
        clientConfig.forcePathStyle = config.forcePathStyle;
      }

      this.s3Client = new S3Client(clientConfig);
    }
  }

  public async getPresignedDownloadUrl(
    objectKey: string,
    expiresInSeconds: number = this.config.presignedDownloadExpirySeconds ?? 3600
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucketName,
      Key: objectKey,
    });
    return await getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
  }

  public async getPresignedUploadUrl(
    destinationKey: string,
    contentType: string,
    expiresInSeconds: number = this.config.presignedUploadExpirySeconds ?? 900,
    maxSizeBytes?: number
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucketName,
      Key: destinationKey,
      ContentType: contentType,
      ...(maxSizeBytes ? { ContentLength: maxSizeBytes } : {}),
    });
    return await getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
  }

  public async getPresignedPostData(
    destinationKey: string,
    contentType: string,
    expiresInSeconds: number = this.config.presignedUploadExpirySeconds ?? 900,
    minSizeBytes: number = 1,
    maxSizeBytes: number = 50 * 1024 * 1024
  ): Promise<IPresignedPostData> {
    const result = await createPresignedPost(this.s3Client, {
      Bucket: this.config.bucketName,
      Key: destinationKey,
      Fields: {
        'Content-Type': contentType,
      },
      Conditions: [
        ['content-length-range', minSizeBytes, maxSizeBytes],
        ['eq', '$Content-Type', contentType],
        ['eq', '$key', destinationKey],
      ],
      Expires: expiresInSeconds,
    });
    return {
      url: result.url,
      fields: result.fields,
    };
  }

  public async headObject(objectKey: string): Promise<IStorageObjectMetadata | null> {
    try {
      const response = await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucketName,
          Key: objectKey,
        })
      );
      return {
        contentLength: response.ContentLength,
        contentType: response.ContentType,
        etag: response.ETag,
        lastModified: response.LastModified,
      };
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        (('name' in error && (error.name === 'NotFound' || error.name === 'NoSuchKey')) ||
          ('$metadata' in error &&
            (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode ===
              404))
      ) {
        return null;
      }
      throw error;
    }
  }

  public async getObjectBytes(objectKey: string, range?: string): Promise<Uint8Array> {
    const response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.config.bucketName,
        Key: objectKey,
        Range: range,
      })
    );

    if (!response.Body) {
      return new Uint8Array(0);
    }

    if (
      typeof (response.Body as { transformToByteArray?: () => Promise<Uint8Array> })
        .transformToByteArray === 'function'
    ) {
      return await (
        response.Body as { transformToByteArray: () => Promise<Uint8Array> }
      ).transformToByteArray();
    }

    if (response.Body instanceof Uint8Array) {
      return response.Body;
    }

    const stream = response.Body as NodeJS.ReadableStream;
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
  }

  public async deleteObject(objectKey: string): Promise<void> {
    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.config.bucketName,
        Key: objectKey,
      })
    );
  }

  public async copyObject(
    sourceKey: string,
    destinationKey: string,
    sourceETag?: string
  ): Promise<void> {
    await this.s3Client.send(
      new CopyObjectCommand({
        Bucket: this.config.bucketName,
        CopySource: `${this.config.bucketName}/${sourceKey}`,
        CopySourceIfMatch: sourceETag,
        Key: destinationKey,
      })
    );
  }

  public getConfig(): IS3Config {
    return this.config;
  }

  public getS3Client(): S3Client {
    return this.s3Client;
  }
}
