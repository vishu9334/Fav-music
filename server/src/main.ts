import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createApplication } from './index.js';
import { ServerBootstrap } from './bootstrap/server-bootstrap.js';

// Resolves server/.env from both src/main.ts and compiled dist/main.js, regardless of cwd.
// Deployed environment variables take precedence; no credentials are printed.
if (process.env['AADAT_LOCAL_ACCOUNT_RUNTIME'] !== 'true') {
  dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), override: false });
}

const bootstrap = new ServerBootstrap({
  createApplication: () => createApplication({
    enableGraphiql: process.env['ENABLE_GRAPHIQL'] === 'true',
  }),
  log: (message) => { console.info(message); },
});

const shutdown = (): void => {
  void bootstrap.stop().catch(() => {
    console.error('[Shutdown] API cleanup failed. No credentials have been logged.');
    process.exitCode = 1;
  });
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

void bootstrap.start().catch((error: unknown) => {
  // Raw adapter/network errors can include connection details. Keep terminal output safe.
  const code = (error as { code?: unknown } | null)?.code;
  const safeCode = code === 'EADDRINUSE' ? ' Port is already in use.' : '';
  console.error(`[Startup] API failed to start.${safeCode} Check server configuration and dependency connectivity.`);
  process.exitCode = 1;
});
