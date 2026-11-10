import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Private, persistent local runtime; never reads a production database URL. */
export class LocalAccountFiles {
  static base = path.join(os.homedir(), 'Library', 'Application Support', 'AadatMusic', 'LocalBackend');
  static load() {
    const pointer = JSON.parse(fs.readFileSync(path.join(this.base, 'current.json'), 'utf8'));
    const root = fs.realpathSync(pointer.root);
    if (!root.startsWith(fs.realpathSync(this.base) + path.sep)) throw new Error('Local runtime directory is outside its private root');
    const target = JSON.parse(fs.readFileSync(path.join(root, 'target.json'), 'utf8'));
    const secrets = JSON.parse(fs.readFileSync(path.join(root, 'credentials.json'), 'utf8'));
    if (target.version !== 1 || target.host !== '127.0.0.1' || !Number.isInteger(target.port) || target.port < 1024 || target.port === 5432
      || !Number.isInteger(target.redisPort) || target.redisPort < 1024 || target.redisPort === target.port
      || target.database !== 'aadat_local' || target.verificationDatabase !== 'aadat_verify'
      || !['ownerPassword', 'appPassword', 'redisPassword', 'jwtSecret'].every(key => /^[a-f0-9]{64}$/.test(secrets[key] ?? ''))
      || (fs.statSync(path.join(root, 'credentials.json')).mode & 0o077) !== 0) throw new Error('Invalid private local runtime configuration');
    return { root, target, secrets };
  }
  static url(database = 'aadat_local', owner = false) {
    const { target, secrets } = this.load();
    if (!['aadat_local', 'aadat_verify', 'postgres'].includes(database)) throw new Error('Unknown local database');
    const url = new URL(`postgresql://127.0.0.1:${target.port}/${database}`);
    url.username = owner ? 'aadat_owner' : 'aadat_app';
    url.password = owner ? secrets.ownerPassword : secrets.appPassword;
    url.searchParams.set('sslmode', 'disable'); // Loopback-only; remote TLS settings are never changed.
    return url.toString();
  }
}
