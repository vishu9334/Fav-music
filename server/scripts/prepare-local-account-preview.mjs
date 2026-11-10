import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

/** Generates only public EAS configuration. Never submits a build or updates EAS environments. */
export class LocalAccountPreviewPreparation {
  async prepare() {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const mobile = dotenv.parse(fs.readFileSync(path.join(root, 'apps/mobile/.env.local')));
    const server = dotenv.parse(fs.readFileSync(path.join(root, 'server/.env')));
    const endpoint = mobile.EXPO_PUBLIC_GRAPHQL_ENDPOINT;
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/graphql'
      || endpoint !== mobile.EXPO_PUBLIC_AUTH_VERIFIED_ENDPOINT || mobile.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID !== server.GOOGLE_CLIENT_ID
      || !/^[\w-]+\.apps\.googleusercontent\.com$/.test(mobile.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '')) throw new Error('Unverified public OAuth/HTTPS configuration');
    const response = await new Promise((resolve, reject) => {
      const request = https.request(url, { method: 'POST', family: 4, timeout: 12000, headers: { 'content-type': 'application/json' } }, result => {
        if (result.statusCode !== 200 || result.headers.location) { result.resume(); reject(new Error('HTTPS readiness failed')); return; }
        let text = ''; result.setEncoding('utf8'); result.on('data', chunk => { text += chunk; if (text.length > 65536) result.destroy(new Error('Readiness response too large')); });
        result.on('error', reject); result.on('end', () => { try { resolve(JSON.parse(text)); } catch { reject(new Error('Invalid readiness response')); } });
      });
      request.on('timeout', () => request.destroy(new Error('Readiness timed out'))); request.on('error', reject);
      request.end(JSON.stringify({ query: '{authCapabilities{service version authenticationEnabled cloudCollectionsEnabled}}' }));
    });
    const caps = response.data?.authCapabilities;
    if (response.errors || caps?.service !== 'aadat-music' || caps.version !== 1 || !caps.authenticationEnabled || !caps.cloudCollectionsEnabled) throw new Error('Real account services are not ready');
    const env = Object.fromEntries(['EXPO_PUBLIC_GRAPHQL_ENDPOINT', 'EXPO_PUBLIC_AUTH_VERIFIED_ENDPOINT', 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'EXPO_PUBLIC_APP_MODE', 'EXPO_PUBLIC_AUTH_ENABLED', 'EXPO_PUBLIC_CATALOG_ENABLED', 'EXPO_PUBLIC_ACCOUNT_PERSISTENCE_ENABLED', 'EXPO_PUBLIC_DEVELOPMENT_CATALOG_ENABLED', 'EXPO_PUBLIC_SOCKET_ENDPOINT'].map(key => [key, mobile[key]]));
    if (env.EXPO_PUBLIC_APP_MODE !== 'account' || ['EXPO_PUBLIC_AUTH_ENABLED', 'EXPO_PUBLIC_CATALOG_ENABLED', 'EXPO_PUBLIC_ACCOUNT_PERSISTENCE_ENABLED'].some(key => env[key] !== 'true') || env.EXPO_PUBLIC_DEVELOPMENT_CATALOG_ENABLED !== 'false') throw new Error('Authenticated mobile mode is not configured');
    const file = path.join(root, 'eas.json'), config = JSON.parse(fs.readFileSync(file));
    config.build['preview-local-account'] = { extends: 'preview', environment: 'preview', env };
    fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
    console.log(JSON.stringify({ profile: 'preview-local-account', endpoint, oauthAudienceMatchesBackend: true, privateCredentialsIncluded: false, buildSubmitted: false, remoteEnvironmentChanged: false }));
  }
}
new LocalAccountPreviewPreparation().prepare().catch(error => { console.error(JSON.stringify({ previewPrepared: false, name: error.name })); process.exitCode = 1; });
