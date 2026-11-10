import { AuthError } from '../contracts/auth.contract';

/** Public application configuration only. Google client secrets never belong here. */
export class AuthConfig {
  public constructor(
    public readonly endpoint = process.env.EXPO_PUBLIC_GRAPHQL_ENDPOINT ?? '',
    public readonly googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
    private readonly policy = { enabled: process.env.EXPO_PUBLIC_AUTH_ENABLED === 'true',
      verifiedEndpoint: process.env.EXPO_PUBLIC_AUTH_VERIFIED_ENDPOINT ?? '' }
  ) {}

  public graphqlEndpoint(): string {
    // RN 0.76's URL getters are incomplete; validate the complete public URI directly.
    if (this.endpoint.length > 2048 || /[\s\\\u0000-\u001f\u007f?#<>"`]/.test(this.endpoint)
      || !/^(?:https:\/\/(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}(?::443)?|http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?)\/[^\s]*$/.test(this.endpoint)) {
      throw new AuthError('CONFIGURATION', 'Secure sign-in is not configured in this app yet. Please try again after setup is complete.');
    }
    return this.endpoint;
  }

  public credentialEndpoint(): string {
    const endpoint = this.graphqlEndpoint();
    if (!this.policy.enabled || endpoint !== this.policy.verifiedEndpoint) {
      throw new AuthError('CONFIGURATION', 'Account sign-in is awaiting approved secure setup. Your existing local files remain preserved.');
    }
    return endpoint;
  }
  public apiBaseUrl(): string {
    const endpoint = this.credentialEndpoint();
    return endpoint.replace(/\/graphql\/?$/, '');
  }
  public isEnabled(): boolean { try { this.credentialEndpoint(); return true; } catch { return false; } }

  public googleClientId(): string {
    const value = this.googleWebClientId.trim();
    if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(value)
      || /replace|placeholder|dummy/i.test(value)) {
      throw new AuthError('CONFIGURATION', 'Google sign-in is not configured in this app yet. Please try again after setup is complete.');
    }
    return value;
  }
}
