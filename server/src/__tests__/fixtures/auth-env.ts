import { afterEach, beforeEach, vi } from 'vitest';

/** Hermetic test credentials, replacing the removed runtime credential fallbacks. */
export function configureTestAuth(): void {
  beforeEach(() => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-web-client.apps.googleusercontent.com');
    vi.stubEnv('JWT_SECRET', 'test-only-signing-key-not-for-production-0123456789abcdef');
    vi.stubEnv('AUTH_ENABLED', 'true');
  });
  afterEach(() => { vi.unstubAllEnvs(); });
}
