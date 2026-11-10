import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { LocalAccountFiles } from './local-account-files.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const { Client } = require('pg');
const { Redis } = require('ioredis');
const bin = '/opt/homebrew/opt/postgresql@18/bin';
process.umask(0o077);
const freePort = () => new Promise((resolve, reject) => { const server = net.createServer(); server.on('error', reject); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
const command = (file, args, options = {}) => execFileSync(file, args, { encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'], ...options });

export class LocalAccountSetup {
  async initialize() {
    fs.mkdirSync(LocalAccountFiles.base, { recursive: true, mode: 0o700 });
    const pointer = path.join(LocalAccountFiles.base, 'current.json');
    if (fs.existsSync(pointer)) throw new Error('A local runtime already exists; inspect it instead of replacing account data');
    const root = fs.mkdtempSync(path.join(LocalAccountFiles.base, 'runtime-'));
    let port = await freePort();
    while (port === 5432) port = await freePort();
    let redisPort = await freePort();
    while (redisPort === port || redisPort === 6379) redisPort = await freePort();
    const target = { version: 1, host: '127.0.0.1', port, redisPort, database: 'aadat_local', verificationDatabase: 'aadat_verify', createdAt: new Date().toISOString() };
    const secrets = Object.fromEntries(['ownerPassword', 'appPassword', 'redisPassword', 'jwtSecret'].map(key => [key, crypto.randomBytes(32).toString('hex')]));
    fs.writeFileSync(path.join(root, 'target.json'), JSON.stringify(target), { mode: 0o600 });
    fs.writeFileSync(path.join(root, 'credentials.json'), JSON.stringify(secrets), { mode: 0o600 });
    fs.writeFileSync(pointer, JSON.stringify({ root }), { flag: 'wx', mode: 0o600 });
    const passwordFile = path.join(root, 'owner-password');
    fs.writeFileSync(passwordFile, secrets.ownerPassword, { mode: 0o600 });
    command(path.join(bin, 'initdb'), ['-D', path.join(root, 'pgdata'), '-U', 'aadat_owner', '--pwfile', passwordFile, '--auth-host=scram-sha-256', '--auth-local=reject', '--encoding=UTF8', '--locale=C']);
    const socket = fs.mkdtempSync('/private/tmp/aadat-local-account-socket-');
    fs.appendFileSync(path.join(root, 'pgdata', 'postgresql.conf'), `\nlisten_addresses = '127.0.0.1'\nport = ${port}\nunix_socket_directories = '${socket}'\n`);
    command(path.join(bin, 'pg_ctl'), ['-D', path.join(root, 'pgdata'), '-l', path.join(root, 'postgres.log'), '-w', 'start']);
    fs.mkdirSync(path.join(root, 'redis'), { mode: 0o700 });
    const redisConfig = path.join(root, 'redis.conf');
    fs.writeFileSync(redisConfig, `bind 127.0.0.1\nprotected-mode yes\nport ${redisPort}\nrequirepass ${secrets.redisPassword}\ndir "${path.join(root, 'redis')}"\nappendonly yes\nappendfsync everysec\ndaemonize yes\npidfile "${path.join(root, 'redis.pid')}"\nlogfile "${path.join(root, 'redis.log')}"\n`, { mode: 0o600 });
    command('/opt/homebrew/bin/redis-server', [redisConfig]);
    const client = new Client({ connectionString: LocalAccountFiles.url('postgres', true), connectionTimeoutMillis: 5000 });
    try {
      await client.connect();
      const { rows: [identity] } = await client.query("SELECT current_user AS role, current_setting('data_directory') AS directory, host(inet_server_addr()) AS host, inet_server_port() AS port");
      if (identity.role !== 'aadat_owner' || fs.realpathSync(identity.directory) !== fs.realpathSync(path.join(root, 'pgdata')) || identity.host !== '127.0.0.1' || identity.port !== port) throw new Error('Local target identity mismatch');
      // Password is generated hex, never supplied by a user and never logged.
      await client.query(`CREATE ROLE aadat_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${secrets.appPassword}'`);
      for (const database of ['aadat_local', 'aadat_verify']) {
        await client.query(`CREATE DATABASE ${database} OWNER aadat_owner`);
        await client.query(`REVOKE CONNECT ON DATABASE ${database} FROM PUBLIC`);
        await client.query(`GRANT CONNECT ON DATABASE ${database} TO aadat_app`);
      }
    } finally { await client.end(); }
    const redis = new Redis({ host: '127.0.0.1', port: redisPort, password: secrets.redisPassword, lazyConnect: true, retryStrategy: () => null });
    try { await redis.connect(); if (await redis.ping() !== 'PONG') throw new Error('Private Redis did not become ready'); } finally { redis.disconnect(); }
    fs.writeFileSync(path.join(root, 'initialized.json'), JSON.stringify({ at: new Date().toISOString(), postgres: true, redisAof: true, liveConnections: 0, fakeApplicationUsers: 0 }));
    console.log(JSON.stringify({ initialized: true, postgres: '127.0.0.1:' + port, redis: '127.0.0.1:' + redisPort, databases: ['aadat_local', 'aadat_verify'], credentialsPrinted: false, neonContacted: false }));
  }
}
if (process.argv[2] === '--initialize') {
  new LocalAccountSetup().initialize().catch(error => { console.error(JSON.stringify({ localSetupFailed: true, name: error.name, code: error.code ?? null })); process.exitCode = 1; });
} else { console.error('Use --initialize to create one new isolated local runtime. Existing runtimes are never replaced.'); process.exitCode = 1; }
