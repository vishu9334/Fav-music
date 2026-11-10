import { describe, it, expect } from 'vitest';
import { LocalAccountDevelopmentConfig, type LocalAccountRuntime } from '../config/local-account-development.config.js';
const runtime: LocalAccountRuntime = { port: 56001, redisPort: 56002, appPassword: 'a'.repeat(64), redisPassword: 'b'.repeat(64), jwtSecret: 'c'.repeat(64), identityDirectory: '/private/local/provider-identities' };
const base = { GOOGLE_CLIENT_ID: '123-test.apps.googleusercontent.com', MUSIC_PROVIDER: 'jiosaavn-development', JIOSAAVN_API_BASE_URL: 'https://saavn.bycomsolutions.com/api', DATABASE_URL: 'postgres://production.invalid', REDIS_URL: 'rediss://production.invalid', JWT_SECRET: 'production-secret', AADAT_DEVELOPMENT_CATALOG_ENABLED: 'true' };
describe('isolated local account runtime', () => {
  it('uses only loopback app role and private Redis; enables genuine protected services', () => {
    const env = new LocalAccountDevelopmentConfig().create(base, runtime);
    expect(new URL(env.DATABASE_URL!).hostname).toBe('127.0.0.1');
    expect(new URL(env.DATABASE_URL!).username).toBe('aadat_app');
    expect(new URL(env.DATABASE_URL!).pathname).toBe('/aadat_local');
    expect(new URL(env.REDIS_URL!).port).toBe('56002');
    expect(env.ACCOUNT_PERSISTENCE_ENABLED).toBe('true');
    expect(env.AUTH_ENABLED).toBe('true');
    expect(env.AADAT_DEVELOPMENT_CATALOG_ENABLED).toBeUndefined();
    expect(env.JWT_SECRET).not.toBe(base.JWT_SECRET);
    expect(base.DATABASE_URL).toBe('postgres://production.invalid');
  });
  it.each([{ port: 5432 }, { redisPort: 6379 }, { redisPort: 56001 }, { jwtSecret: 'placeholder' }])('rejects unsafe local configuration %j', change => {
    expect(() => new LocalAccountDevelopmentConfig().create(base, { ...runtime, ...change })).toThrow();
  });
  it('requires real Google configuration and the already approved provider', () => {
    expect(() => new LocalAccountDevelopmentConfig().create({ ...base, GOOGLE_CLIENT_ID: '' }, runtime)).toThrow();
    expect(() => new LocalAccountDevelopmentConfig().create({ ...base, JIOSAAVN_API_BASE_URL: 'https://other.test' }, runtime)).toThrow();
  });
});
