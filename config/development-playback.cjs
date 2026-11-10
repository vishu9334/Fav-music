class DevelopmentPlaybackBuildConfig {
  apply(config, env) {
    const enabled = env.EXPO_PUBLIC_DEVELOPMENT_CATALOG_ENABLED === 'true';
    const mode = env.EXPO_PUBLIC_APP_MODE === 'development-playback-verification';
    if (Object.keys(env).some(k => /^EXPO_PUBLIC_.*(?:DEVELOPMENT|CATALOG).*(?:KEY|TOKEN|SECRET)/.test(k))) throw new Error('Diagnostic access keys must never be public build variables.');
    if (!enabled && !mode && env.EAS_BUILD_PROFILE !== 'preview-real-songs') return config;
    if (!enabled || !mode || env.EAS_BUILD_PROFILE !== 'preview-real-songs' || config.android?.package !== 'com.favmusic') throw new Error('Playback verification is restricted to the explicit internal preview-real-songs variant.');
    const endpoint = new URL(env.EXPO_PUBLIC_DEVELOPMENT_CATALOG_ENDPOINT || '');
    const main = new URL(env.EXPO_PUBLIC_GRAPHQL_ENDPOINT || '');
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.port && endpoint.port !== '443' || endpoint.pathname !== '/development/catalog/graphql' || endpoint.origin !== main.origin || main.pathname !== '/graphql' || main.username || main.password || main.search || main.hash) throw new Error('Diagnostic endpoints require the reviewed HTTPS origin and exact read-only path.');
    for (const key of ['EXPO_PUBLIC_AUTH_ENABLED', 'EXPO_PUBLIC_CATALOG_ENABLED', 'EXPO_PUBLIC_ACCOUNT_PERSISTENCE_ENABLED']) if (env[key] !== 'false') throw new Error('Account and normal catalog activation are excluded from this variant.');
    return { ...config, extra: { ...config.extra, developmentPlaybackVerification: true } };
  }
}
module.exports = { DevelopmentPlaybackBuildConfig };
