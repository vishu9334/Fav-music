import { AuthError } from '../contracts/auth.contract';

export type AuthTransport = (endpoint: string, options: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;
interface NativeAuthTransport {
  readonly version: number;
  request(id: string, endpoint: string, approved: string, body: string, bearer: string | null): Promise<{ status: number; body: string }>;
  requestHttp?(id: string, endpoint: string, approved: string, method: string, body: string, bearer: string | null): Promise<{ status: number; body: string }>;
  cancel(id: string): void;
}
let serial = 0;
/** No fallback to RN's redirect-following fetch for credentials. Never installs a native-module polyfill. */
export const nativeAuthTransport: AuthTransport = async (endpoint, options) => {
  let module: NativeAuthTransport | undefined;
  try { module = (await import('react-native')).NativeModules.AadatAuthTransport as NativeAuthTransport | undefined; } catch { /* Safe failure in older runtimes. */ }
  if (!module || module.version !== 1 || typeof module.request !== 'function' || typeof module.cancel !== 'function') throw new AuthError('CONFIGURATION', 'This app version needs the secure Android sign-in transport. Please update the Android app before signing in.');
  const id = `auth-${Date.now()}-${++serial}`, signal = options.signal;
  if (signal?.aborted) throw new AuthError('OFFLINE', 'Secure authentication request was cancelled.');
  const method = (options.method ?? 'POST').toUpperCase();
  if (!['POST', 'GET'].includes(method)) throw new AuthError('CONFIGURATION', 'This API request method is not supported.');
  if (method === 'GET' && !module.requestHttp) throw new AuthError('CONFIGURATION', 'Update the Android app to load listening rooms.');
  const headers = (options.headers ?? {}) as Record<string, string>, bearer = headers.Authorization?.replace(/^Bearer /, '') ?? null;
  let cancel!: () => void;
  const aborted = new Promise<never>((_resolve, reject) => { cancel = () => { try { module!.cancel(id); } catch { /* The native session may already be closed. */ } reject(new AuthError('OFFLINE', 'Secure authentication request timed out or was cancelled.')); }; });
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const request = method === 'GET' ? module.requestHttp!(id, endpoint, endpoint, method, '', bearer)
      : module.request(id, endpoint, endpoint, typeof options.body === 'string' ? options.body : '', bearer);
    const response = await Promise.race([request, aborted]);
    return { status: response.status, ok: response.status >= 200 && response.status < 300, json: async () => JSON.parse(response.body) as unknown };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError('OFFLINE', 'A secure connection to Fav Music could not be completed. Retry when the approved server is available.');
  } finally { signal?.removeEventListener('abort', cancel); }
};

/** OS cryptographic UUID, rather than an identity inferred from device/time. */
export async function newMutationId(): Promise<string> {
  const module = (await import('react-native')).NativeModules.AadatAuthTransport as { randomId?: () => Promise<string> } | undefined;
  if (!module?.randomId) throw new AuthError('CONFIGURATION', 'Update the Android app before synchronizing collections.');
  const value = await module.randomId();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new AuthError('CONFIGURATION', 'Secure request identity is unavailable.');
  return value;
}
