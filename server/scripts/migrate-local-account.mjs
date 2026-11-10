import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LocalAccountFiles } from './local-account-files.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const { Client } = require('pg');
const server = fileURLToPath(new URL('../', import.meta.url));
export class LocalAccountMigration {
  async run() {
    const { root, target } = LocalAccountFiles.load();
    const artifact = fs.readFileSync(path.join(server, 'development/local-account/migrations/20261107000100_initial/migration.sql'));
    const results = [];
    for (const database of [target.database, target.verificationDatabase]) {
      const client = new Client({ connectionString: LocalAccountFiles.url(database, true), connectionTimeoutMillis: 5000 });
      try {
        await client.connect();
        const { rows: [id] } = await client.query("SELECT current_user AS role, current_database() AS database, current_setting('data_directory') AS directory, host(inet_server_addr()) AS host, inet_server_port() AS port");
        if (id.role !== 'aadat_owner' || id.database !== database || id.host !== '127.0.0.1' || id.port !== target.port || fs.realpathSync(id.directory) !== fs.realpathSync(path.join(root, 'pgdata'))) throw new Error('Refusing a non-local migration target');
        // Explicit isolated Prisma config never loads server/.env or any Neon connection.
        const env = { ...process.env, AADAT_LOCAL_DATABASE: database };
        delete env.DATABASE_URL; delete env.DIRECT_DATABASE_URL;
        execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy', '--config', 'development/local-account/prisma.config.ts'], { cwd: server, env, timeout: 30_000, stdio: 'pipe' });
        await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
        await client.query('GRANT USAGE ON SCHEMA public TO aadat_app');
        const { rows: tables } = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename");
        for (const { tablename } of tables) await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."${tablename.replaceAll('"', '""')}" TO aadat_app`);
        const { rows: history } = await client.query('SELECT migration_name, checksum, finished_at IS NOT NULL AS applied, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at');
        if (history.length !== 1 || !history[0].applied || history[0].rolled_back_at || history[0].checksum !== crypto.createHash('sha256').update(artifact).digest('hex')) throw new Error('Migration history does not match the reviewed artifact');
        const { rows: [counts] } = await client.query('SELECT count(*)::integer AS users FROM "User"');
        results.push({ database, tables: tables.length, historyMatches: true, users: counts.users });
      } finally { await client.end(); }
      const app = new Client({ connectionString: LocalAccountFiles.url(database), connectionTimeoutMillis: 5000 });
      try {
        await app.connect();
        const { rows: [permissions] } = await app.query("SELECT current_user AS role, has_table_privilege(current_user, '\"User\"', 'SELECT,INSERT,UPDATE,DELETE') AS account_dml, has_table_privilege(current_user, '\"_prisma_migrations\"', 'UPDATE') AS history_write, has_schema_privilege(current_user, 'public', 'CREATE') AS ddl");
        if (permissions.role !== 'aadat_app' || !permissions.account_dml || permissions.history_write || permissions.ddl) throw new Error('Application privileges are not least-privilege');
      } finally { await app.end(); }
    }
    console.log(JSON.stringify({ localMigrations: results, appRole: 'DML only; no DDL/history writes', neonContacted: false }));
  }
}
if (process.argv[2] !== '--apply-local') throw new Error('Only --apply-local is supported');
new LocalAccountMigration().run().catch(error => { console.error(JSON.stringify({ localMigrationFailed: true, name: error.name, code: error.code ?? null })); process.exitCode = 1; });
