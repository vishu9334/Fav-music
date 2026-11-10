/**
 * Safe Configuration Error
 * Thrown when required environment configuration is missing or invalid.
 * Guaranteed never to leak credential values in error messages.
 */
export class ConfigurationError extends Error {
  public constructor(message: string) {
    super(`[ConfigurationError] ${message}`);
    this.name = 'ConfigurationError';
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

export interface IServerEnvironmentConfig {
  readonly nodeEnv: 'development' | 'production' | 'test';
  readonly port: number;
  readonly host: string;
  readonly corsOrigins: readonly string[];
  readonly databaseUrl: string;
  readonly directDatabaseUrl?: string;
  readonly redisUrl?: string;
  readonly redisHost?: string;
  readonly redisPort: number;
  readonly redisPassword?: string;
  readonly redisUseTls: boolean;
  readonly googleClientId: string;
  readonly jwtSecret: string;
  readonly jwtAccessExpirationSeconds: number;
  readonly refreshTokenExpirationDays: number;
  readonly rateLimitGlobalMax: number;
  readonly rateLimitGlobalTimeWindowMs: number;
  readonly rateLimitAuthMax: number;
  readonly rateLimitAuthTimeWindowMs: number;
  readonly awsRegion: string;
  readonly awsS3BucketName: string;
  readonly awsAccessKeyId?: string;
  readonly awsSecretAccessKey?: string;
  readonly awsS3Endpoint?: string;
  readonly awsS3ForcePathStyle: boolean;
  readonly awsS3PresignedUploadExpirySeconds: number;
  readonly awsS3PresignedDownloadExpirySeconds: number;
}

/**
 * Validated Server Environment Configuration
 * Strictly enforces NO HARDCODING, zero fallback production credentials,
 * and zero credential leakage in logs or string representations.
 */
export class ServerEnvironmentConfig implements IServerEnvironmentConfig {
  public readonly nodeEnv: 'development' | 'production' | 'test';
  public readonly port: number;
  public readonly host: string;
  public readonly corsOrigins: readonly string[];
  public readonly databaseUrl: string;
  public readonly directDatabaseUrl?: string;
  public readonly redisUrl?: string;
  public readonly redisHost?: string;
  public readonly redisPort: number;
  public readonly redisPassword?: string;
  public readonly redisUseTls: boolean;
  public readonly googleClientId: string;
  public readonly jwtSecret: string;
  public readonly jwtAccessExpirationSeconds: number;
  public readonly refreshTokenExpirationDays: number;
  public readonly rateLimitGlobalMax: number;
  public readonly rateLimitGlobalTimeWindowMs: number;
  public readonly rateLimitAuthMax: number;
  public readonly rateLimitAuthTimeWindowMs: number;
  public readonly awsRegion: string;
  public readonly awsS3BucketName: string;
  public readonly awsAccessKeyId?: string;
  public readonly awsSecretAccessKey?: string;
  public readonly awsS3Endpoint?: string;
  public readonly awsS3ForcePathStyle: boolean;
  public readonly awsS3PresignedUploadExpirySeconds: number;
  public readonly awsS3PresignedDownloadExpirySeconds: number;

  public constructor(config: IServerEnvironmentConfig) {
    this.nodeEnv = config.nodeEnv;
    this.port = config.port;
    this.host = config.host;
    this.corsOrigins = Object.freeze([...config.corsOrigins]);
    this.databaseUrl = config.databaseUrl;
    this.directDatabaseUrl = config.directDatabaseUrl;
    this.redisUrl = config.redisUrl;
    this.redisHost = config.redisHost;
    this.redisPort = config.redisPort;
    this.redisPassword = config.redisPassword;
    this.redisUseTls = config.redisUseTls;
    this.googleClientId = config.googleClientId;
    this.jwtSecret = config.jwtSecret;
    this.jwtAccessExpirationSeconds = config.jwtAccessExpirationSeconds;
    this.refreshTokenExpirationDays = config.refreshTokenExpirationDays;
    this.rateLimitGlobalMax = config.rateLimitGlobalMax;
    this.rateLimitGlobalTimeWindowMs = config.rateLimitGlobalTimeWindowMs;
    this.rateLimitAuthMax = config.rateLimitAuthMax;
    this.rateLimitAuthTimeWindowMs = config.rateLimitAuthTimeWindowMs;
    this.awsRegion = config.awsRegion;
    this.awsS3BucketName = config.awsS3BucketName;
    this.awsAccessKeyId = config.awsAccessKeyId;
    this.awsSecretAccessKey = config.awsSecretAccessKey;
    this.awsS3Endpoint = config.awsS3Endpoint;
    this.awsS3ForcePathStyle = config.awsS3ForcePathStyle;
    this.awsS3PresignedUploadExpirySeconds = config.awsS3PresignedUploadExpirySeconds;
    this.awsS3PresignedDownloadExpirySeconds = config.awsS3PresignedDownloadExpirySeconds;
  }

  /**
   * Factory loading and strictly validating configuration from process environment.
   * Fails fast if required variables are missing or malformed.
   */
  public static fromEnv(env: NodeJS.ProcessEnv = process.env): ServerEnvironmentConfig {
    const rawNodeEnv = env['NODE_ENV'] ?? 'development';
    const nodeEnv: 'development' | 'production' | 'test' =
      rawNodeEnv === 'production' || rawNodeEnv === 'test' ? rawNodeEnv : 'development';

    // 1. Port Validation
    const rawPort = env['PORT'] ?? '4000';
    const parsedPort = Number.parseInt(rawPort, 10);
    if (Number.isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      throw new ConfigurationError(`Invalid PORT configuration: "${rawPort}". Must be between 1 and 65535.`);
    }

    // 2. Host Validation
    const host = env['HOST'] || '0.0.0.0';

    // 3. CORS Origins Validation
    const rawCors = env['CORS_ORIGIN'] ?? 'http://localhost:3000,http://localhost:8081';
    const corsOrigins = rawCors
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);

    // 4. Database URL Validation (PostgreSQL)
    const databaseUrl = env['DATABASE_URL'];
    if (!databaseUrl || databaseUrl.trim().length === 0) {
      throw new ConfigurationError('DATABASE_URL is required but not set in server/.env.');
    }
    if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
      throw new ConfigurationError('DATABASE_URL must be a valid PostgreSQL connection URI.');
    }

    const directDatabaseUrl = env['DIRECT_DATABASE_URL'] || undefined;

    // 5. Redis URL & Host Validation
    const redisUrl = env['REDIS_URL'];
    const rawRedisHost = env['REDIS_HOST'];
    const redisHost = rawRedisHost && !rawRedisHost.startsWith('redis://') && !rawRedisHost.startsWith('rediss://')
      ? rawRedisHost
      : undefined;

    // Fall back to REDIS_HOST if REDIS_URL was put in REDIS_HOST
    const effectiveRedisUrl = redisUrl ?? (rawRedisHost && (rawRedisHost.startsWith('redis://') || rawRedisHost.startsWith('rediss://')) ? rawRedisHost : undefined);

    if (!effectiveRedisUrl && !redisHost) {
      throw new ConfigurationError('Either REDIS_URL or REDIS_HOST must be configured in server/.env.');
    }

    const rawRedisPort = env['REDIS_PORT'] ?? '6379';
    const parsedRedisPort = Number.parseInt(rawRedisPort, 10);
    if (Number.isNaN(parsedRedisPort) || parsedRedisPort < 1 || parsedRedisPort > 65535) {
      throw new ConfigurationError(`Invalid REDIS_PORT configuration: "${rawRedisPort}". Must be between 1 and 65535.`);
    }

    const redisPassword = env['REDIS_PASSWORD'] || undefined;

    // TLS detection: rediss:// scheme or explicit REDIS_TLS=true
    const redisUseTls =
      effectiveRedisUrl?.startsWith('rediss://') === true ||
      env['REDIS_TLS'] === 'true' ||
      env['REDIS_TLS'] === '1';

    // 6. Google Client ID Validation
    const googleClientId = env['GOOGLE_CLIENT_ID'];
    if (!googleClientId || googleClientId.trim().length === 0) {
      throw new ConfigurationError('GOOGLE_CLIENT_ID is required but not set in server/.env.');
    }

    // 7. JWT Secret Validation (minimum 32 characters for cryptographic security)
    const jwtSecret = env['JWT_SECRET'];
    if (!jwtSecret || jwtSecret.trim().length === 0) {
      throw new ConfigurationError('JWT_SECRET is required but not set in server/.env.');
    }
    if (jwtSecret.trim().length < 32) {
      throw new ConfigurationError('JWT_SECRET must be at least 32 characters long for cryptographic security.');
    }

    if (nodeEnv === 'production' && (
      !/^[\w-]+\.apps\.googleusercontent\.com$/.test(googleClientId.trim())
      || /replace|placeholder|dummy/i.test(googleClientId)
      || /^(replace|placeholder|dummy|your[-_ ])/i.test(jwtSecret.trim())
    )) {
      throw new ConfigurationError('Production authentication requires real OAuth and signing configuration.');
    }

    // 8. JWT & Refresh Token Expirations
    const rawJwtAccessExp = env['JWT_ACCESS_EXPIRATION_SECONDS'] ?? '900';
    const jwtAccessExpirationSeconds = Number.parseInt(rawJwtAccessExp, 10);
    if (Number.isNaN(jwtAccessExpirationSeconds) || jwtAccessExpirationSeconds < 60) {
      throw new ConfigurationError(`Invalid JWT_ACCESS_EXPIRATION_SECONDS: "${rawJwtAccessExp}". Must be at least 60 seconds.`);
    }

    const rawRefreshExpDays = env['REFRESH_TOKEN_EXPIRATION_DAYS'] ?? '7';
    const refreshTokenExpirationDays = Number.parseInt(rawRefreshExpDays, 10);
    if (Number.isNaN(refreshTokenExpirationDays) || refreshTokenExpirationDays < 1) {
      throw new ConfigurationError(`Invalid REFRESH_TOKEN_EXPIRATION_DAYS: "${rawRefreshExpDays}". Must be at least 1 day.`);
    }

    // 9. Rate Limit Configurations
    const rawGlobalMax = env['RATE_LIMIT_GLOBAL_MAX'] ?? '100';
    const rateLimitGlobalMax = Number.parseInt(rawGlobalMax, 10);
    if (Number.isNaN(rateLimitGlobalMax) || rateLimitGlobalMax < 1) {
      throw new ConfigurationError(`Invalid RATE_LIMIT_GLOBAL_MAX: "${rawGlobalMax}". Must be a positive integer.`);
    }

    const rawGlobalTimeWindow = env['RATE_LIMIT_GLOBAL_TIME_WINDOW_MS'] ?? '60000';
    const rateLimitGlobalTimeWindowMs = Number.parseInt(rawGlobalTimeWindow, 10);
    if (Number.isNaN(rateLimitGlobalTimeWindowMs) || rateLimitGlobalTimeWindowMs < 1000) {
      throw new ConfigurationError(`Invalid RATE_LIMIT_GLOBAL_TIME_WINDOW_MS: "${rawGlobalTimeWindow}". Must be at least 1000 ms.`);
    }

    const rawAuthMax = env['RATE_LIMIT_AUTH_MAX'] ?? '10';
    const rateLimitAuthMax = Number.parseInt(rawAuthMax, 10);
    if (Number.isNaN(rateLimitAuthMax) || rateLimitAuthMax < 1) {
      throw new ConfigurationError(`Invalid RATE_LIMIT_AUTH_MAX: "${rawAuthMax}". Must be a positive integer.`);
    }

    const rawAuthTimeWindow = env['RATE_LIMIT_AUTH_TIME_WINDOW_MS'] ?? '60000';
    const rateLimitAuthTimeWindowMs = Number.parseInt(rawAuthTimeWindow, 10);
    if (Number.isNaN(rateLimitAuthTimeWindowMs) || rateLimitAuthTimeWindowMs < 1000) {
      throw new ConfigurationError(`Invalid RATE_LIMIT_AUTH_TIME_WINDOW_MS: "${rawAuthTimeWindow}". Must be at least 1000 ms.`);
    }

    // 10. AWS S3 Storage Validation & Normalization
    const rawAwsRegion = env['AWS_REGION']?.trim();
    let awsRegion = 'ap-south-1';
    if (rawAwsRegion) {
      const lower = rawAwsRegion.toLowerCase();
      if (lower.includes('mumbai') || lower === 'ap-south-1') {
        awsRegion = 'ap-south-1';
      } else {
        awsRegion = rawAwsRegion;
      }
    }

    const awsS3BucketName = env['AWS_S3_BUCKET_NAME']?.trim() || 'aadat-music-media-dev';
    const awsAccessKeyId = env['AWS_ACCESS_KEY_ID']?.trim() || undefined;
    const awsSecretAccessKey = env['AWS_SECRET_ACCESS_KEY']?.trim() || undefined;

    let awsS3Endpoint = env['AWS_S3_ENDPOINT']?.trim() || undefined;
    if (awsS3Endpoint) {
      if (!awsS3Endpoint.startsWith('http://') && !awsS3Endpoint.startsWith('https://')) {
        awsS3Endpoint = `https://${awsS3Endpoint}`;
      }
    }

    const awsS3ForcePathStyle =
      env['AWS_S3_FORCE_PATH_STYLE'] === 'true' || env['AWS_S3_FORCE_PATH_STYLE'] === '1';

    const rawUploadExp = env['AWS_S3_PRESIGNED_UPLOAD_EXPIRY_SECONDS'] ?? '900';
    const awsS3PresignedUploadExpirySeconds = Number.parseInt(rawUploadExp, 10);
    if (Number.isNaN(awsS3PresignedUploadExpirySeconds) || awsS3PresignedUploadExpirySeconds < 10) {
      throw new ConfigurationError(
        `Invalid AWS_S3_PRESIGNED_UPLOAD_EXPIRY_SECONDS: "${rawUploadExp}". Must be at least 10 seconds.`
      );
    }

    const rawDownloadExp = env['AWS_S3_PRESIGNED_DOWNLOAD_EXPIRY_SECONDS'] ?? '3600';
    const awsS3PresignedDownloadExpirySeconds = Number.parseInt(rawDownloadExp, 10);
    if (Number.isNaN(awsS3PresignedDownloadExpirySeconds) || awsS3PresignedDownloadExpirySeconds < 10) {
      throw new ConfigurationError(
        `Invalid AWS_S3_PRESIGNED_DOWNLOAD_EXPIRY_SECONDS: "${rawDownloadExp}". Must be at least 10 seconds.`
      );
    }

    return new ServerEnvironmentConfig({
      nodeEnv,
      port: parsedPort,
      host,
      corsOrigins,
      databaseUrl,
      directDatabaseUrl,
      redisUrl: effectiveRedisUrl,
      redisHost,
      redisPort: parsedRedisPort,
      redisPassword,
      redisUseTls,
      googleClientId,
      jwtSecret,
      jwtAccessExpirationSeconds,
      refreshTokenExpirationDays,
      rateLimitGlobalMax,
      rateLimitGlobalTimeWindowMs,
      rateLimitAuthMax,
      rateLimitAuthTimeWindowMs,
      awsRegion,
      awsS3BucketName,
      awsAccessKeyId,
      awsSecretAccessKey,
      awsS3Endpoint,
      awsS3ForcePathStyle,
      awsS3PresignedUploadExpirySeconds,
      awsS3PresignedDownloadExpirySeconds,
    });
  }

  /**
   * Safe string serialization with zero secret leakage.
   */
  public toSafeLog(): Record<string, unknown> {
    return {
      nodeEnv: this.nodeEnv,
      port: this.port,
      host: this.host,
      corsOrigins: this.corsOrigins,
      databaseUrl: '[REDACTED_POSTGRESQL_URI]',
      directDatabaseUrl: this.directDatabaseUrl ? '[REDACTED_DIRECT_POSTGRESQL_URI]' : undefined,
      redisUrl: this.redisUrl ? '[REDACTED_REDIS_URI]' : undefined,
      redisHost: this.redisHost ?? '[FROM_REDIS_URL]',
      redisPort: this.redisPort,
      redisUseTls: this.redisUseTls,
      googleClientId: '[REDACTED_GOOGLE_CLIENT_ID]',
      jwtSecret: '[REDACTED_JWT_SECRET]',
      jwtAccessExpirationSeconds: this.jwtAccessExpirationSeconds,
      refreshTokenExpirationDays: this.refreshTokenExpirationDays,
      rateLimitGlobalMax: this.rateLimitGlobalMax,
      rateLimitGlobalTimeWindowMs: this.rateLimitGlobalTimeWindowMs,
      rateLimitAuthMax: this.rateLimitAuthMax,
      rateLimitAuthTimeWindowMs: this.rateLimitAuthTimeWindowMs,
      awsRegion: this.awsRegion,
      awsS3BucketName: this.awsS3BucketName,
      awsAccessKeyId: this.awsAccessKeyId ? '[REDACTED_AWS_ACCESS_KEY_ID]' : undefined,
      awsSecretAccessKey: this.awsSecretAccessKey ? '[REDACTED_AWS_SECRET_ACCESS_KEY]' : undefined,
      awsS3Endpoint: this.awsS3Endpoint,
      awsS3ForcePathStyle: this.awsS3ForcePathStyle,
      awsS3PresignedUploadExpirySeconds: this.awsS3PresignedUploadExpirySeconds,
      awsS3PresignedDownloadExpirySeconds: this.awsS3PresignedDownloadExpirySeconds,
    };
  }
}

