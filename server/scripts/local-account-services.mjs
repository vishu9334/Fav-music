import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { LocalAccountFiles } from './local-account-files.mjs';
const require = createRequire(new URL('../package.json', import.meta.url));
const { Client } = require('pg');
const { Redis } = require('ioredis');

/** Starts only the existing private daemons after a Mac reboot; never initializes/replaces data. */
export class LocalAccountServices {
  async ensureRunning() {
    const { root, target, secrets } = LocalAccountFiles.load();
    if (!fs.existsSync(path.join(root, 'initialized.json'))) throw new Error('Local initialization is incomplete; existing files must be inspected');
    const bin = '/opt/homebrew/opt/postgresql@18/bin', data = path.join(root, 'pgdata');
    const setting = name => execFileSync(path.join(bin, 'postgres'), ['-D', data, '-C', name], { encoding: 'utf8', timeout: 5000 }).trim();
    if (setting('listen_addresses') !== '127.0.0.1' || setting('port') !== String(target.port)) throw new Error('Local PostgreSQL loopback settings changed');
    const status = spawnSync(path.join(bin, 'pg_ctl'), ['-D', data, 'status'], { encoding: 'utf8', timeout: 5000, stdio: 'pipe' });
    if (status.status === 3) execFileSync(path.join(bin, 'pg_ctl'), ['-D', data, '-l', path.join(root, 'postgres.log'), '-w', 'start'], { timeout: 30_000, stdio: 'pipe' });
    else if (status.status !== 0) throw new Error('Local PostgreSQL state needs inspection');
    const database = new Client({ connectionString: LocalAccountFiles.url('aadat_local', true), connectionTimeoutMillis: 5000 });
    try {
      await database.connect();
      const { rows: [id] } = await database.query("SELECT current_database() AS database, current_setting('data_directory') AS directory, host(inet_server_addr()) AS host, inet_server_port() AS port");
      if (id.database !== 'aadat_local' || id.host !== '127.0.0.1' || id.port !== target.port || fs.realpathSync(id.directory) !== fs.realpathSync(data)) throw new Error('Refusing an unexpected database');
    } finally { await database.end(); }
    const configuration = fs.readFileSync(path.join(root, 'redis.conf'), 'utf8');
    if (!configuration.includes('bind 127.0.0.1\n') || !configuration.includes(`port ${target.redisPort}\n`) || !configuration.includes(`requirepass ${secrets.redisPassword}\n`) || !configuration.includes('protected-mode yes\n') || !configuration.includes('appendonly yes\n')) throw new Error('Private Redis safety settings changed');
    const ping = async () => {
      const redis = new Redis({ host: '127.0.0.1', port: target.redisPort, password: secrets.redisPassword, lazyConnect: true, connectTimeout: 1500, retryStrategy: () => null, maxRetriesPerRequest: 0 });
      redis.on('error', () => {});
      try { await redis.connect(); if (await redis.ping() !== 'PONG') throw new Error('Private Redis readiness failed'); }
      finally { redis.disconnect(); }
    };
    try { await ping(); } catch (error) {
      if (error.code !== 'ECONNREFUSED') throw new Error('Private Redis is occupied or cannot authenticate; no replacement attempted');
      execFileSync('/opt/homebrew/bin/redis-server', [path.join(root, 'redis.conf')], { timeout: 10_000, stdio: 'pipe' });
      await ping();
    }
  }
}
