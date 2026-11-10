import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { MobilePublicEnvironment } = require('../../../../../config/mobile-public-environment.cjs') as { MobilePublicEnvironment: new () => { cacheVersion(previous: string, env: Record<string, string>): string } };
describe('public Expo environment transform cache', () => {
  it('invalidates transforms when account/diagnostic flags, endpoint or public audience change', () => {
    const config = new MobilePublicEnvironment(), normal = { EXPO_PUBLIC_APP_MODE: 'account', EXPO_PUBLIC_AUTH_ENABLED: 'true', EXPO_PUBLIC_GRAPHQL_ENDPOINT: 'https://one.example/graphql', EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'one.apps.googleusercontent.com' };
    const key = config.cacheVersion('metro', normal);
    for (const change of [{ EXPO_PUBLIC_AUTH_ENABLED: 'false' }, { EXPO_PUBLIC_APP_MODE: 'development-playback-verification' }, { EXPO_PUBLIC_GRAPHQL_ENDPOINT: 'https://two.example/graphql' }, { EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'two.apps.googleusercontent.com' }]) expect(config.cacheVersion('metro', { ...normal, ...change })).not.toBe(key);
    expect(config.cacheVersion('metro', {})).not.toBe(key);
  });
  it('is stable across variable order and excludes private backend values', () => {
    const config = new MobilePublicEnvironment();
    expect(config.cacheVersion('metro', { EXPO_PUBLIC_A: 'a', EXPO_PUBLIC_B: 'b', JWT_SECRET: 'one' })).toBe(config.cacheVersion('metro', { JWT_SECRET: 'two', EXPO_PUBLIC_B: 'b', EXPO_PUBLIC_A: 'a' }));
  });
});
