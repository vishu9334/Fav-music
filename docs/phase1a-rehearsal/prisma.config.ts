// PREPARED ONLY. No database may be created or written until the user approves
// the local-only rehearsal described in PHASE_1A_FINAL_MIGRATION_READINESS.md.
// This config never loads .env or accepts DATABASE_URL / DIRECT_DATABASE_URL.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineConfig } from '@prisma/config';

const rootInput = process.env['REHEARSAL_ROOT'];
const input = process.env['REHEARSAL_DATABASE_URL'];
if (!rootInput || !input) throw new Error('Explicit local rehearsal target is required');
const root = fs.realpathSync(rootInput);
const temp = fs.realpathSync(os.tmpdir());
if (!root.startsWith(path.join(temp, 'aadat-phase1a-rehearsal-')) || fs.lstatSync(rootInput).isSymbolicLink()
  || (fs.statSync(root).mode & 0o077) !== 0) {
  throw new Error('Rehearsal root must be a dedicated private temporary directory');
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'target.json'), 'utf8')) as {
  port: number; databases: string[];
};
let url: URL;
try { url = new URL(input); } catch { throw new Error('Invalid local rehearsal URL'); }
const allowedParameters = new Set(['schema', 'sslmode', 'connect_timeout', 'socket_timeout']);
const db = url.pathname.slice(1);
if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || url.username !== 'aadat_rehearsal'
  || !url.password || !Number.isInteger(manifest.port) || manifest.port <= 1024 || manifest.port > 65535
  || manifest.port === 5432 || Number(url.port) !== manifest.port
  || !/^aadat_phase1a_(apply|atomic|recovery|forward)_[a-f0-9]{12}$/.test(db)
  || !Array.isArray(manifest.databases) || !manifest.databases.includes(db)
  || !!url.hash || new Set(url.searchParams.keys()).size !== [...url.searchParams.keys()].length
  || url.searchParams.get('schema') !== 'public' || url.searchParams.get('sslmode') !== 'disable'
  || [...url.searchParams.keys()].some((key) => !allowedParameters.has(key))) {
  throw new Error('Refusing a non-manifest or non-loopback rehearsal target');
}

// A forward-correction scenario needs its own scratch copy plus a synthetic
// second migration. It can never change the reviewed candidate in docs.
const forward = process.env['REHEARSAL_SCENARIO'] === 'forward';
if (forward && !db.startsWith('aadat_phase1a_forward_')) throw new Error('Forward scenario needs its own database');
export default defineConfig({
  schema: path.join(import.meta.dirname, 'schema.prisma'),
  migrations: {
    path: forward ? path.join(root, 'forward-migrations')
      : path.join(import.meta.dirname, '../phase1a-migration-candidate/migrations'),
  },
  datasource: { url: url.toString() },
});
