import { ChatRetentionPreference } from '@aadat/contracts';
import { ProfileService } from '../services/profile.service.js';
import { IResolvers } from 'mercurius';
import { IAuthService } from '../contracts/auth-service.contract.js';
import { IUserEntity } from '../contracts/user-repository.contract.js';
import { IGraphQLContext, IGraphQLUser } from '../../../shared/graphql/contracts/graphql-resolver.contract.js';
import { UnauthorizedError, ValidationFailedError } from '../../../shared/errors/domain.error.js';
import { IS3StorageService } from '../../../infrastructure/storage/contracts/storage.contract.js';

/** GraphQL transport only; identity and session policies stay in AuthService. */
export class AuthGraphQLController {
  public constructor(
    private readonly service: IAuthService,
    private readonly cloudCollectionsEnabled = false,
    private readonly profile?: ProfileService,
    private readonly storage?: IS3StorageService
  ) {}

  public buildResolvers(): IResolvers {
    return {
      Query: { me: this.me.bind(this), authCapabilities: () => ({ service: 'aadat-music', version: 1,
        authenticationEnabled: this.service.isEnabled?.() === true, cloudCollectionsEnabled: this.cloudCollectionsEnabled }) },
      Mutation: {
        loginWithGoogle: this.login.bind(this),
        refreshSession: this.refresh.bind(this),
        logout: this.logout.bind(this),
        updateProfile:async (_:unknown,args:{displayName:string;preference:ChatRetentionPreference},context:IGraphQLContext)=>{
          if(!this.profile)throw new UnauthorizedError('Profile changes are unavailable');
          return this.user(await this.profile.update(context.userId,args.displayName,args.preference));
        },
      },
    };
  }

  public async login(_parent: unknown, args: { idToken: string }): Promise<unknown> {
    const result = await this.service.loginWithGoogle(this.token(args.idToken));
    return { ...result, user: await this.user(result.user) };
  }

  public async refresh(_parent: unknown, args: { refreshToken: string }): Promise<unknown> {
    return this.service.refreshSession(this.token(args.refreshToken));
  }

  public async logout(_parent: unknown, args: { refreshToken?: string }, context: IGraphQLContext): Promise<boolean> {
    const token = args.refreshToken === undefined ? undefined : this.token(args.refreshToken);
    if (!token && !context.sessionId) throw new UnauthorizedError('Authentication required');
    await this.service.logout(token, context.sessionId);
    return true;
  }

  public async me(_parent: unknown, _args: unknown, context: IGraphQLContext): Promise<IGraphQLUser> {
    if (!context.userId) throw new UnauthorizedError('Authentication required');
    return this.user(await this.service.getCurrentUser(context.userId));
  }

  private token(value: unknown): string {
    if (typeof value !== 'string' || !value.trim() || value.length > 20000) {
      throw new ValidationFailedError('A valid authentication token is required');
    }
    return value.trim();
  }

  private async user(user: IUserEntity): Promise<IGraphQLUser> {
    let avatarUrl: string | null = null;
    if (user.avatarKey && this.storage) {
      try {
        avatarUrl = await this.storage.getPresignedDownloadUrl(user.avatarKey, 3600);
      } catch {
        avatarUrl = null;
      }
    }
    return {
      id: user.id, email: user.email, displayName: user.displayName, avatarUrl,
      chatRetentionPreference: user.chatRetentionPreference, createdAt: user.createdAt.toISOString(),
    };
  }
}
