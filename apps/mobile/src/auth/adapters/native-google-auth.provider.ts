import { AuthConfig } from '../services/auth-config';
import { AuthError, IGoogleAuthProvider } from '../contracts/auth.contract';

/** Lazy native loading keeps the existing player entry point safe in older APKs. */
export class NativeGoogleAuthProvider implements IGoogleAuthProvider {
  private configured = false;
  public constructor(private readonly config: AuthConfig) {}

  public async signIn(): Promise<string | null> {
    this.config.credentialEndpoint();
    const clientId = this.config.googleClientId();
    try {
      const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
      if (!this.configured) {
        GoogleSignin.configure({ webClientId: clientId, offlineAccess: false });
        this.configured = true;
      }
      if (!await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })) throw new AuthError('PROVIDER', 'Google Play Services is unavailable. Please update it before signing in.');
      const result = await GoogleSignin.signIn();
      if (result.type === 'cancelled') { this.report('CANCELLED'); return null; }
      if (!result.data.idToken) {
        throw new AuthError('CONFIGURATION', 'Google sign-in is not configured correctly. Please try again after setup is complete.');
      }
      this.report('SDK_SUCCESS');
      return result.data.idToken;
    } catch (error) {
      if (error instanceof AuthError) throw error;
      const code = String((error as { code?: unknown } | null)?.code ?? '');
      this.report(code);
      if (code === 'SIGN_IN_CANCELLED' || code === '12501') return null;
      if (code === 'NETWORK_ERROR' || code === '7') {
        throw new AuthError('OFFLINE', 'Google sign-in could not connect. Check your connection and retry.');
      }
      if (code === 'DEVELOPER_ERROR' || code === '10') {
        throw new AuthError('CONFIGURATION', 'Google sign-in isn’t set up correctly for this app. Please contact support.');
      }
      if (code === 'IN_PROGRESS') throw new AuthError('PROVIDER', 'Google sign-in is already open. Complete or close it to continue.');
      throw new AuthError('PROVIDER', 'Google sign-in couldn’t start. Update Google Play services and try again.');
    }
  }

  /** Only bounded status labels reach Logcat: never native errors, identities or tokens. */
  private report(code: string): void {
    const allowed = ['CANCELLED', 'SDK_SUCCESS', 'SIGN_IN_CANCELLED', '12501', 'DEVELOPER_ERROR', '10', 'NETWORK_ERROR', '7', 'IN_PROGRESS', 'PLAY_SERVICES_NOT_AVAILABLE', '12500', '12502', 'NULL_PRESENTER'];
    console.info(`[GoogleSignIn] ${allowed.includes(code) ? code : 'UNAVAILABLE'}`);
  }

  public async signOut(): Promise<void> {
    const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
    if (!this.configured) {
      GoogleSignin.configure({ webClientId: this.config.googleClientId(), offlineAccess: false });
      this.configured = true;
    }
    await GoogleSignin.signOut();
  }
}
