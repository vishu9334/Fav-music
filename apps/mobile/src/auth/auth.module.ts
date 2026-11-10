import { AuthConfig } from './services/auth-config';
import { NativeGoogleAuthProvider } from './adapters/native-google-auth.provider';
import { SecureSessionRepository } from './repositories/secure-session.repository';
import { GraphQLAuthRepository } from './repositories/graphql-auth.repository';
import { AuthService } from './services/auth.service';
import { AuthController } from './controllers/auth.controller';

export class AuthModule {
  private static controller: AuthController | null = null;
  private static service: AuthService | null = null;
  public static getController(): AuthController {
    if (!this.controller) {
      const config = new AuthConfig();
      this.service = new AuthService(new GraphQLAuthRepository(config), new SecureSessionRepository(), new NativeGoogleAuthProvider(config), Date.now, () => { config.credentialEndpoint(); });
      this.controller = new AuthController(this.service);
    }
    return this.controller;
  }
  public static getSession(): AuthService { this.getController(); return this.service!; }
  public static isEnabled(): boolean { return new AuthConfig().isEnabled(); }
}
