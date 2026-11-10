import { ChatRetentionPreference } from '@aadat/contracts';
import { IDatabaseService } from '../../../infrastructure/database/contracts/database.contract.js';
import {
  ICreateUserData,
  IUserEntity,
  IUserRepository,
} from '../contracts/user-repository.contract.js';
import { ConflictError } from '../../../shared/errors/domain.error.js';

/**
 * Concrete Prisma Implementation of IUserRepository
 * Strictly adheres to Repository pattern: encapsulates Prisma queries only.
 * No business logic, transport handling, or token verification permitted here.
 */
export class PrismaUserRepository implements IUserRepository {
  private readonly databaseService: IDatabaseService;

  public constructor(databaseService: IDatabaseService) {
    this.databaseService = databaseService;
  }

  public async updateProfile(id:string,data:{displayName:string;chatRetentionPreference:ChatRetentionPreference}):Promise<IUserEntity> {
    return this.mapToEntity(await this.databaseService.getClient().user.update({where:{id,status:'ACTIVE'},data}));
  }
  public async findById(id: string): Promise<IUserEntity | null> {
    const user = await this.databaseService.getClient().user.findUnique({
      where: { id },
    });
    if (!user) {
      return null;
    }
    return this.mapToEntity(user);
  }

  public async findByEmail(email: string): Promise<IUserEntity | null> {
    const user = await this.databaseService.getClient().user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (!user) {
      return null;
    }
    return this.mapToEntity(user);
  }

  public async findByGoogleSub(googleSub: string): Promise<IUserEntity | null> {
    const user = await this.databaseService.getClient().user.findUnique({
      where: { googleSub },
    });
    if (!user) {
      return null;
    }
    return this.mapToEntity(user);
  }

  public async create(data: ICreateUserData): Promise<IUserEntity> {
    try {
      const user = await this.databaseService.getClient().user.create({
        data: {
          email: data.email.toLowerCase().trim(),
          displayName: data.displayName.trim(),
          googleSub: data.googleSub,
          avatarKey: data.avatarKey ?? null,
          chatRetentionPreference:
            data.chatRetentionPreference ?? ChatRetentionPreference.EPHEMERAL_SESSION_ONLY,
        },
      });
      return this.mapToEntity(user);
    } catch (error: unknown) {
      // Prisma P2002: Unique constraint failed
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
        throw new ConflictError(
          'An account with this email or identity already exists. Automatic account linking is prohibited.'
        );
      }
      throw error;
    }
  }

  public async updateChatRetentionPreference(
    id: string,
    preference: ChatRetentionPreference
  ): Promise<IUserEntity> {
    const user = await this.databaseService.getClient().user.update({
      where: { id },
      data: {
        chatRetentionPreference: preference,
      },
    });
    return this.mapToEntity(user);
  }

  public async updateAvatarKey(id: string, avatarKey: string | null): Promise<IUserEntity> {
    const user = await this.databaseService.getClient().user.update({
      where: { id },
      data: {
        avatarKey,
      },
    });
    return this.mapToEntity(user);
  }

  public async searchUsers(query: string): Promise<IUserEntity[]> {
    const clean = query.trim().replace(/^@/, '');
    if (!clean) return [];
    const users = await this.databaseService.getClient().user.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { displayName: { contains: clean, mode: 'insensitive' } },
          { email: { startsWith: clean, mode: 'insensitive' } },
          { id: clean },
        ],
      },
      take: 10,
    });
    return users.map((u) => this.mapToEntity(u));
  }

  private mapToEntity(user: {
    id: string;
    email: string;
    displayName: string;
    avatarKey: string | null;
    googleSub: string | null;
    status: string;
    chatRetentionPreference: unknown;
    createdAt: Date;
    updatedAt: Date;
  }): IUserEntity {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarKey: user.avatarKey,
      googleSub: user.googleSub,
      status: user.status === 'ACTIVE' ? 'ACTIVE' : user.status === 'SUSPENDED' ? 'SUSPENDED' : 'DEACTIVATED',
      chatRetentionPreference:
        user.chatRetentionPreference === 'PERSISTENT_HISTORY'
          ? ChatRetentionPreference.PERSISTENT_HISTORY
          : ChatRetentionPreference.EPHEMERAL_SESSION_ONLY,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}

