import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { randomBytes, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Redis } from 'ioredis';
import { LocalRedisDevelopmentConfig } from '../dist/infrastructure/config/local-redis-development.config.js';
import { ServerEnvironmentConfig } from '../dist/infrastructure/config/server-environment.config.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
if (args.length > 1 || args.length === 1 && !['--check', '--start', '--start-playback-check'].includes(args[0])) throw new Error('Use --check, --start or --start-playback-check.');
const mode = args[0] ?? '--check';
const base = dotenv.parse(await fs.readFile(new URL('../.env', import.meta.url), 'utf8'));
const profile = dotenv.parse(await fs.readFile(new URL('../development/local-redis.env', import.meta.url), 'utf8'));
const env = new LocalRedisDevelopmentConfig().create(base, profile, process.env);
for (const key of Object.keys(env)) if (key.startsWith('AADAT_DEVELOPMENT_CATALOG_')) delete env[key];
ServerEnvironmentConfig.fromEnv(env);
const redis = new Redis(env.REDIS_URL, { lazyConnect: true, enableReadyCheck: false,
  connectTimeout: 3000, maxRetriesPerRequest: 0, retryStrategy: () => null });
redis.on('error', () => {});
try {
  await redis.connect();
  if (await redis.ping() !== 'PONG') throw new Error('Local Redis did not answer PING.');
  const values = await redis.config('GET', 'bind', 'protected-mode', 'port', 'databases');
  const config = Object.fromEntries(Array.from({ length: values.length / 2 }, (_, i) => [values[i * 2], values[i * 2 + 1]]));
  const bindings = (config.bind ?? '').split(/\s+/).filter(Boolean).map(value => value.replace(/^-/, ''));
  if (!bindings.length || bindings.some(value => !['127.0.0.1', '::1'].includes(value))
    || config['protected-mode'] !== 'yes' || config.port !== '6379' || Number(config.databases) < 16) {
    throw new Error('Redis must remain bound only to loopback, with protected mode and database 15 available.');
  }
} catch {
  console.error('[LocalDevelopment] Loopback Redis safety/readiness check failed. No fallback or service start.');
  process.exitCode = 1;
} finally { redis.disconnect(); }
if (!process.exitCode) {
  console.info('[LocalDevelopment] Redis PING PASS; loopback/protected-mode PASS; database 15 selected; auth/cloud writes disabled.');
  if (mode === '--check') console.info('[LocalDevelopment] Check only: no backend or Redis service was started; configuration files unchanged.');
  else {
    if (mode === '--start-playback-check') {
      const directory = path.join(tmpdir(), 'aadat-development-catalog-' + randomUUID());
      await fs.mkdir(directory, { mode: 0o700 });
      const key = randomBytes(32).toString('base64url'), expiresAt = Date.now() + 7_200_000;
      const keyFile = path.join(directory, 'access.json');
      await fs.writeFile(keyFile, JSON.stringify({ key, expiresAt, purpose: 'read-only-development-catalog' }), { mode: 0o600, flag: 'wx' });
      env.AADAT_DEVELOPMENT_CATALOG_ENABLED = 'true'; env.AADAT_DEVELOPMENT_CATALOG_KEY = key; env.AADAT_DEVELOPMENT_CATALOG_EXPIRES_AT = String(expiresAt);
      console.info('[LocalDevelopment] Private read-only access file: ' + keyFile);
    }
    const child = spawn(process.execPath, [fileURLToPath(new URL('../dist/main.js', import.meta.url))], { cwd: root, env, stdio: 'inherit' });
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { child.kill(signal); });
    child.on('error', () => { console.error('[LocalDevelopment] Backend process could not start.'); process.exitCode = 1; });
    child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
  }
}
