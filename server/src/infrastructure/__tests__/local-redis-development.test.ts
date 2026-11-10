import { describe, it, expect } from 'vitest';
import { LocalRedisDevelopmentConfig } from '../config/local-redis-development.config.js';
const profile = { NODE_ENV: 'development', HOST: '127.0.0.1', PORT: '4000', REDIS_URL: 'redis://127.0.0.1:6379/15',
  REDIS_HOST: '127.0.0.1', REDIS_PORT: '6379', REDIS_TLS: 'false', REDIS_PASSWORD: '',
  AUTH_ENABLED: 'false', ACCOUNT_PERSISTENCE_ENABLED: 'false', ENABLE_GRAPHIQL: 'false' };
const base = { REDIS_URL: 'rediss://private-fixture.example.invalid:9999', REDIS_PASSWORD: 'test-only',
  DATABASE_URL: 'postgresql://test-only.invalid/db', GOOGLE_CLIENT_ID: 'test-only', JWT_SECRET: 'test-only' };
describe('explicit local Redis development overlay', () => {
  it('preserves base production settings and PostgreSQL/OAuth material without mutating any input', () => {
    const before = { ...base }, inherited = { HOST: '0.0.0.0', REDIS_TLS: 'true' };
    const env = new LocalRedisDevelopmentConfig().create(base, profile, inherited);
    expect(base).toEqual(before); expect(inherited).toEqual({ HOST: '0.0.0.0', REDIS_TLS: 'true' });
    expect(env).toMatchObject({ ...profile, DATABASE_URL: base.DATABASE_URL, GOOGLE_CLIENT_ID: base.GOOGLE_CLIENT_ID, JWT_SECRET: base.JWT_SECRET });
  });
  it('cannot activate this profile under production or globally disabled TLS verification', () => {
    const config = new LocalRedisDevelopmentConfig();
    expect(() => config.create({ ...base, NODE_ENV: 'production' }, profile)).toThrow('production');
    expect(() => config.create(base, profile, { NODE_ENV: 'production' })).toThrow('production');
    expect(() => config.create(base, profile, { NODE_TLS_REJECT_UNAUTHORIZED: '0' })).toThrow('verification');
    expect(() => config.create({ ...base, NODE_TLS_REJECT_UNAUTHORIZED: '0' }, profile)).toThrow('verification');
  });
  it.each([
    { REDIS_URL: 'redis://127.0.0.1:6379/0' }, { REDIS_URL: 'redis://remote.example.invalid:6379/15' },
    { HOST: '0.0.0.0' }, { AUTH_ENABLED: 'true' }, { ACCOUNT_PERSISTENCE_ENABLED: 'true' },
    { DATABASE_URL: 'postgresql://unapproved.invalid/db' }, { REDIS_TLS: 'true' },
  ])('rejects an unreviewed target, security activation or production credential override: %j', patch => {
    expect(() => new LocalRedisDevelopmentConfig().create(base, { ...profile, ...patch })).toThrow('reviewed');
  });
  it('fails closed if the profile is incomplete', () => {
    const { REDIS_PASSWORD: _removed, ...incomplete } = profile;
    expect(() => new LocalRedisDevelopmentConfig().create(base, incomplete)).toThrow('incomplete');
  });
});
