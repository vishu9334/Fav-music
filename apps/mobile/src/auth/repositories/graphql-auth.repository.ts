import { AuthConfig } from '../services/auth-config';
import { AuthError, AuthUser, IAuthRepository, LoginResult, SessionTokens } from '../contracts/auth.contract';
import { AuthTransport, nativeAuthTransport } from '../adapters/native-auth.transport';

const USER_FIELDS = 'id email displayName avatarUrl chatRetentionPreference createdAt';

/** HTTP/GraphQL transport; no client-provided identity is accepted as authentication. */
export class GraphQLAuthRepository implements IAuthRepository {
  private readyUntil = 0;
  private readiness: Promise<void> | null = null;
  public constructor(private readonly config: AuthConfig, private readonly transport: AuthTransport = nativeAuthTransport) {}

  /** No credentials or personal data leave the device during this readiness request. */
  public async prepare(): Promise<void> {
    this.config.credentialEndpoint();
    if (this.readyUntil > Date.now()) return;
    if (!this.readiness) this.readiness = this.request<{ authCapabilities: { service: string; version: number; authenticationEnabled: boolean; cloudCollectionsEnabled: boolean } }>(
      'query AuthReadiness { authCapabilities { service version authenticationEnabled cloudCollectionsEnabled } }', {}
    ).then(({ authCapabilities: value }) => {
      if (!value || value.service !== 'aadat-music' || value.version !== 1 || value.authenticationEnabled !== true || typeof value.cloudCollectionsEnabled !== 'boolean') {
        throw new AuthError('CONFIGURATION', 'Account sign-in is not ready on the approved server. Your existing local collections remain preserved.');
      }
      this.readyUntil = Date.now() + 60_000;
    }).finally(() => { this.readiness = null; });
    return this.readiness;
  }

  public async login(idToken: string): Promise<LoginResult> {
    await this.prepare();
    const data = await this.request<{ loginWithGoogle: LoginResult }>(
      `mutation Login($idToken: String!) { loginWithGoogle(idToken: $idToken) { accessToken refreshToken expiresIn user { ${USER_FIELDS} } } }`,
      { idToken }
    );
    this.tokens(data.loginWithGoogle);
    return { ...this.tokens(data.loginWithGoogle), user: this.user(data.loginWithGoogle.user) };
  }

  public async refresh(refreshToken: string): Promise<SessionTokens> {
    await this.prepare();
    const data = await this.request<{ refreshSession: SessionTokens }>(
      'mutation Refresh($refreshToken: String!) { refreshSession(refreshToken: $refreshToken) { accessToken refreshToken expiresIn } }',
      { refreshToken }
    );
    return this.tokens(data.refreshSession);
  }

  public async me(accessToken: string): Promise<AuthUser> {
    await this.prepare();
    const data = await this.request<{ me: AuthUser }>(`query Me { me { ${USER_FIELDS} } }`, {}, accessToken);
    return this.user(data.me);
  }

  public async logout(refreshToken: string): Promise<void> {
    await this.prepare();
    const data = await this.request<{ logout: boolean }>(
      'mutation Logout($refreshToken: String!) { logout(refreshToken: $refreshToken) }', { refreshToken }
    );
    if (data.logout !== true) throw new AuthError('SERVER', 'Server logout was not confirmed.');
  }

  private async request<T>(query: string, variables: Record<string, string>, accessToken?: string): Promise<T> {
    const endpoint = this.config.credentialEndpoint();
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 15000);
    try {
      const response = await this.transport(endpoint, {
        method: 'POST', signal: abort.signal, redirect: 'error', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify({ query, variables }),
      });
      if (response.status === 401) throw new AuthError('UNAUTHORIZED', 'Your session has expired. Sign in again.');
      if (response.status === 403) throw new AuthError('FORBIDDEN', 'This account cannot access Fav Music.');
      if (response.status === 429) throw new AuthError('RATE_LIMITED', 'Too many attempts. Please wait before retrying.');
      if ([502, 503, 504, 530].includes(response.status)) throw new AuthError('SERVER', 'Fav Music’s sign-in server is unavailable. Please try again later.');
      if (!response.ok) throw new AuthError('SERVER', 'The authentication service is temporarily unavailable.');
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object') {
        throw new AuthError('SERVER', 'The server returned an invalid authentication response.');
      }
      const result = payload as { data?: T; errors?: Array<{ extensions?: { code?: string } }> };
      if (result.errors?.length) {
        const code = result.errors[0]?.extensions?.code;
        if (code === 'UNAUTHORIZED' || code === 'UNAUTHENTICATED') {
          throw new AuthError('UNAUTHORIZED', 'Your session is invalid or expired. Sign in again.');
        }
        if (code === 'FORBIDDEN') throw new AuthError('FORBIDDEN', 'This account is not available.');
        if (code === 'AUTH_ON_HOLD') throw new AuthError('CONFIGURATION', 'Account sign-in is on hold on the server. Your existing local collections remain preserved.');
        throw new AuthError('SERVER', 'Authentication could not be completed. Please retry.');
      }
      if (!result.data) throw new AuthError('SERVER', 'The server returned an invalid authentication response.');
      return result.data;
    } catch (error) {
      if (error instanceof AuthError) throw error;
      if (error instanceof SyntaxError) throw new AuthError('SERVER', 'The server returned an invalid response.');
      throw new AuthError('OFFLINE', 'Cannot reach Fav Music. Check your connection and retry.');
    } finally {
      clearTimeout(timeout);
    }
  }

  private tokens(value: SessionTokens): SessionTokens {
    if (!value || typeof value.accessToken !== 'string' || !value.accessToken
      || typeof value.refreshToken !== 'string' || !value.refreshToken
      || value.accessToken.length > 20000 || /\s/.test(value.accessToken) || value.refreshToken.length > 4096 || /\s/.test(value.refreshToken)
      || !Number.isInteger(value.expiresIn) || value.expiresIn <= 0 || value.expiresIn > 86400) {
      throw new AuthError('SERVER', 'The server returned invalid session credentials.');
    }
    return { accessToken: value.accessToken, refreshToken: value.refreshToken, expiresIn: value.expiresIn };
  }

  private user(value: AuthUser): AuthUser {
    if (!value || typeof value.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.id)
      || typeof value.email !== 'string' || !value.email.trim() || value.email.length > 320
      || typeof value.displayName !== 'string' || !value.displayName.trim() || value.displayName.length > 200
      || !(value.avatarUrl === null || (typeof value.avatarUrl === 'string' && value.avatarUrl.length <= 8192 && /^https:\/\//.test(value.avatarUrl)))
      || !['EPHEMERAL_SESSION_ONLY', 'PERSISTENT_HISTORY'].includes(value.chatRetentionPreference)
      || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) {
      throw new AuthError('SERVER', 'The server returned an invalid profile.');
    }
    return { id: value.id, email: value.email, displayName: value.displayName, avatarUrl: value.avatarUrl,
      chatRetentionPreference: value.chatRetentionPreference, createdAt: value.createdAt };
  }
}
