import { ConfigurationError } from './server-environment.config.js';

export interface LocalAccountRuntime {
  readonly port: number;
  readonly redisPort: number;
  readonly appPassword: string;
  readonly redisPassword: string;
  readonly jwtSecret: string;
  readonly identityDirectory: string;
}

/** Child-process overrides; production .env is never edited or used as a fallback. */
export class LocalAccountDevelopmentConfig {
  public create(base: Readonly<Record<string, string | undefined>>, runtime: LocalAccountRuntime): Record<string, string> {
    if (![runtime.port, runtime.redisPort].every(port => Number.isInteger(port) && port > 1024 && port < 65536)
      || runtime.port === runtime.redisPort || runtime.port === 5432 || runtime.redisPort === 6379
      || ![runtime.appPassword, runtime.redisPassword, runtime.jwtSecret].every(secret => /^[a-f0-9]{64}$/.test(secret))
      || !runtime.identityDirectory.startsWith('/')) throw new ConfigurationError('Invalid private local runtime.');
    const googleClientId = base['GOOGLE_CLIENT_ID']?.trim() ?? '';
    if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(googleClientId) || /replace|placeholder|dummy/i.test(googleClientId)) throw new ConfigurationError('A real Google Web client ID is required.');
    const provider = base['MUSIC_PROVIDER'];
    const providerUrl = base['JIOSAAVN_API_BASE_URL']?.replace(/\/$/, '');
    if (provider !== 'jiosaavn-development' || providerUrl !== 'https://saavn.bycomsolutions.com/api') throw new ConfigurationError('The approved Saavn development provider must be configured explicitly.');
    return {
      NODE_ENV: 'development', HOST: '127.0.0.1', PORT: '4000', ENABLE_GRAPHIQL: 'false',
      DATABASE_URL: `postgresql://aadat_app:${runtime.appPassword}@127.0.0.1:${runtime.port}/aadat_local?sslmode=disable`,
      DIRECT_DATABASE_URL: `postgresql://aadat_app:${runtime.appPassword}@127.0.0.1:${runtime.port}/aadat_local?sslmode=disable`,
      REDIS_URL: `redis://:${runtime.redisPassword}@127.0.0.1:${runtime.redisPort}/0`, REDIS_TLS: 'false',
      GOOGLE_CLIENT_ID: googleClientId, JWT_SECRET: runtime.jwtSecret,
      JWT_ACCESS_EXPIRATION_SECONDS: '900', REFRESH_TOKEN_EXPIRATION_DAYS: '7',
      AUTH_ENABLED: 'true', ACCOUNT_PERSISTENCE_ENABLED: 'true', CATALOG_ENABLED: 'true',
      MUSIC_PROVIDER: provider, JIOSAAVN_API_BASE_URL: providerUrl,
      MUSIC_DISCOVERY_QUERY: base['MUSIC_DISCOVERY_QUERY'] || 'Aadat', MUSIC_PROVIDER_IDENTITY_FILE: runtime.identityDirectory,
      CORS_ORIGIN: 'http://localhost:8081',
    };
  }
}
