const { createHash } = require('node:crypto');

/** Public Expo values are compiled into JS; changing profiles must invalidate old transforms. */
class MobilePublicEnvironment {
  cacheVersion(previous, env) {
    const entries = Object.keys(env).filter(key => key.startsWith('EXPO_PUBLIC_')).sort().map(key => [key, env[key]]);
    const digest = createHash('sha256').update(JSON.stringify(entries)).digest('hex');
    return `${previous || '1'}-aadat-public-env-${digest}`;
  }
}
module.exports = { MobilePublicEnvironment };
