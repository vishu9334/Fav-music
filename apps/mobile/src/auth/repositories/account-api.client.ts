import { AuthModule } from '../auth.module';
import { AuthConfig } from '../services/auth-config';
import { AuthError } from '../contracts/auth.contract';
import { AuthTransport, nativeAuthTransport } from '../adapters/native-auth.transport';
export class AccountApiError extends Error { public constructor(public readonly code: string, message: string) { super(message); } }
/** Every request binds the verified owner and exact approved HTTPS endpoint. */
export class AccountApiClient {
  public constructor(private readonly transport: AuthTransport = nativeAuthTransport, private readonly config = new AuthConfig()) {}
  public owner(): string {
    const state = AuthModule.getController().getSnapshot();
    if (!state.user || !['authenticated','loading'].includes(state.status)) throw new AuthError('UNAUTHORIZED','Sign in to access your account.');
    return state.user.id;
  }
  public async request<T>(owner: string, query: string, variables: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
    const endpoint = this.config.credentialEndpoint();
    return AuthModule.getSession().withAccessToken(owner, async (token) => {
      const abort = new AbortController(), timeout = setTimeout(() => abort.abort(),15000);
      const cancel = () => abort.abort(); signal?.addEventListener('abort',cancel,{once:true}); if(signal?.aborted) abort.abort();
      try {
        const response = await this.transport(endpoint,{method:'POST',signal:abort.signal,redirect:'error',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({query,variables})});
        if (response.status === 401) throw new AuthError('UNAUTHORIZED','Your session has expired.');
        if (!response.ok) throw new AccountApiError('UNAVAILABLE','The account service is unavailable. Your pending changes are preserved.');
        const result = await response.json() as {data?:T;errors?:{extensions?:{code?:string}}[]};
        if (result.errors?.length) {
          const code = result.errors[0]?.extensions?.code ?? 'SERVER';
          if (['UNAUTHORIZED','UNAUTHENTICATED'].includes(code)) throw new AuthError('UNAUTHORIZED','Your session has expired.');
          throw new AccountApiError(code,code === 'CONFLICT' ? 'Another device changed your collections. Review both copies.' : 'The server could not save your changes. Your local copy is preserved.');
        }
        if (!result.data) throw new AccountApiError('SERVER','Invalid account response.');
        return result.data;
      } finally { clearTimeout(timeout);signal?.removeEventListener('abort',cancel); }
    });
  }
}
