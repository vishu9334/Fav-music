import { GraphQLCatalogRepository } from '../catalog/graphql-catalog.repository';
import { nativeAuthTransport, type AuthTransport } from '../auth/adapters/native-auth.transport';

export class DevelopmentPlaybackConfig {
  public constructor(private readonly mode = process.env.EXPO_PUBLIC_APP_MODE,
    private readonly enabled = process.env.EXPO_PUBLIC_DEVELOPMENT_CATALOG_ENABLED,
    private readonly endpoint = process.env.EXPO_PUBLIC_DEVELOPMENT_CATALOG_ENDPOINT,
    private readonly main = process.env.EXPO_PUBLIC_GRAPHQL_ENDPOINT) {}
  public endpointUrl(): string {
    const match = this.endpoint?.match(/^(https:\/\/(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}(?::443)?)\/development\/catalog\/graphql$/);
    if (this.mode !== 'development-playback-verification' || this.enabled !== 'true' || !match || this.main !== match[1] + '/graphql') throw new Error('The internal playback verification endpoint is not configured.');
    return this.endpoint!;
  }
}

/** Purpose-scoped diagnostic access, never passed to AuthModule or persisted as an account. */
export class DevelopmentCatalogClient {
  private key: string | null = null;
  private expiresAt = 0;
  private generation = 0;
  public readonly repository: GraphQLCatalogRepository;
  public constructor(private readonly config = new DevelopmentPlaybackConfig(), private readonly network: AuthTransport = nativeAuthTransport,
    private readonly now: () => number = Date.now) {
    this.repository = new GraphQLCatalogRepository(() => config.endpointUrl(), this.transport);
  }
  public clear(): void { this.key = null; this.expiresAt = 0; this.generation++; }
  public deadline(): number { return this.expiresAt; }
  public async unlock(key: string): Promise<void> {
    this.clear();
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(key)) throw new Error('Enter the private development catalog key.');
    this.key = key; this.expiresAt = this.now() + 15_000;
    const generation = this.generation;
    try {
      const response = await this.transport(this.config.endpointUrl(), { method: 'POST', headers: {}, body: JSON.stringify({ query: 'query {developmentCatalogAccess{expiresAt expiresInSeconds}}' }) });
      const body = await response.json() as { data?: { developmentCatalogAccess?: { expiresInSeconds?: number } }; errors?: unknown };
      const seconds = body.data?.developmentCatalogAccess?.expiresInSeconds;
      if (!response.ok || generation !== this.generation || body.errors || !Number.isInteger(seconds) || !seconds || seconds < 1 || seconds > 7200) throw new Error();
      this.expiresAt = this.now() + seconds * 1000;
    } catch { if (generation === this.generation) this.clear(); throw new Error('Development catalog access failed or expired. No account was signed in.'); }
  }
  public readonly transport: AuthTransport = async (endpoint, options) => {
    if (endpoint !== this.config.endpointUrl()) throw new Error('Diagnostic access cannot be sent to another API.');
    if (!this.key || this.expiresAt <= this.now()) { this.clear(); throw new Error('Development catalog key expired. Enter a new key.'); }
    const key = this.key, generation = this.generation;
    const response = await this.network(endpoint, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, redirect: 'error', cache: 'no-store' });
    if (generation !== this.generation || this.expiresAt <= this.now()) throw new Error('Development catalog access changed.');
    if (response.status === 401 || response.status === 403) { this.clear(); throw new Error('Development catalog key expired or was revoked.'); }
    return response;
  };
}
