import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import dotenv from 'dotenv';
import { LocalAccountFiles } from './local-account-files.mjs';
import { LocalAccountServices } from './local-account-services.mjs';
import { LocalAccountDevelopmentConfig } from '../dist/infrastructure/config/local-account-development.config.js';
import { ServerEnvironmentConfig } from '../dist/infrastructure/config/server-environment.config.js';

const { root, target, secrets } = LocalAccountFiles.load();
const repo = fileURLToPath(new URL('../../', import.meta.url));
const base = dotenv.parse(fs.readFileSync(new URL('../.env', import.meta.url)));
const identityDirectory = path.join(root, 'provider-identities');
for (const slot of [0, 1]) {
  const source = path.join(repo, `.aadat-music/provider-identities.${slot}.json`);
  const destination = `${identityDirectory}.${slot}.json`;
  if (process.argv[2] === '--start' && !fs.existsSync(destination) && fs.existsSync(source)) {
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(destination, 0o600);
  }
}
const profile = new LocalAccountDevelopmentConfig().create(base, { ...target, ...secrets, identityDirectory });
ServerEnvironmentConfig.fromEnv(profile);
if (process.argv[2] === '--check') {
  console.log(JSON.stringify({ valid: true, database: 'loopback/aadat_local', redis: 'private loopback/0', realGoogleVerification: true, accountPersistence: true, protectedCatalog: true, neonContacted: false }));
} else if (process.argv[2] === '--start') {
  await new LocalAccountServices().ensureRunning();
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^(DATABASE_|DIRECT_DATABASE_|REDIS_|JWT_|GOOGLE_|AUTH_|AADAT_DEVELOPMENT_CATALOG_|AWS_|ACCOUNT_PERSISTENCE_|CATALOG_|MUSIC_|JIOSAAVN_|NODE_TLS_)/.test(key)) delete env[key];
  Object.assign(env, profile);
  // dotenv in main.js must not reintroduce production service settings omitted here.
  env.AADAT_LOCAL_ACCOUNT_RUNTIME = 'true';
  const child = spawn(process.execPath, [fileURLToPath(new URL('../dist/main.js', import.meta.url))], { cwd: repo, env, stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
  child.on('error', () => { console.error('[LocalAccount] Cannot start backend.'); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} else throw new Error('Use --check or --start');
