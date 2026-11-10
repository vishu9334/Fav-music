/** Explicit local-only environment overlay; never imported by the production entrypoint. */
export class LocalRedisDevelopmentConfig {
  public create(base: NodeJS.ProcessEnv, profile: NodeJS.ProcessEnv, inherited: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    if (base['NODE_ENV'] === 'production' || inherited['NODE_ENV'] === 'production') {
      throw new Error('Local Redis development cannot run in a production environment.');
    }
    if (base['NODE_TLS_REJECT_UNAUTHORIZED'] === '0' || inherited['NODE_TLS_REJECT_UNAUTHORIZED'] === '0') {
      throw new Error('TLS certificate verification must remain enabled.');
    }
    const required: Record<string, string> = {
      NODE_ENV: 'development', HOST: '127.0.0.1', PORT: '4000',
      REDIS_URL: 'redis://127.0.0.1:6379/15', REDIS_HOST: '127.0.0.1', REDIS_PORT: '6379',
      REDIS_TLS: 'false', REDIS_PASSWORD: '', AUTH_ENABLED: 'false',
      ACCOUNT_PERSISTENCE_ENABLED: 'false', ENABLE_GRAPHIQL: 'false',
    };
    // Profile files cannot smuggle database, OAuth or signing changes into the environment.
    for (const [key, value] of Object.entries(profile)) {
      if (!(key in required) || value !== required[key]) throw new Error('The local Redis profile differs from the reviewed development settings.');
    }
    for (const [key, value] of Object.entries(required)) {
      if (profile[key] !== value) throw new Error('The local Redis profile is incomplete.');
    }
    return { ...inherited, ...base, ...required };
  }
}
