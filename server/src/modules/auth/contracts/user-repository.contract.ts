import { ChatRetentionPreference } from '@aadat/contracts';

/**
 * User Domain Entity representation
 */
export interface IUserEntity {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly avatarKey: string | null;
  readonly googleSub: string | null;
  readonly status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  readonly chatRetentionPreference: ChatRetentionPreference;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * DTO for creating a new user upon first verified Google authentication
 */
export interface ICreateUserData {
  readonly email: string;
  readonly displayName: string;
  readonly googleSub: string;
  readonly avatarKey?: string | null;
  readonly chatRetentionPreference?: ChatRetentionPreference;
}

/**
 * User Persistence Repository Contract (SOLID - Dependency Inversion Principle)
 * Strictly isolates persistence logic from business logic.
 */
export interface IUserRepository {
  updateProfile?(id:string, data:{displayName:string;chatRetentionPreference:ChatRetentionPreference}):Promise<IUserEntity>;
  findById(id: string): Promise<IUserEntity | null>;
  findByEmail(email: string): Promise<IUserEntity | null>;
  findByGoogleSub(googleSub: string): Promise<IUserEntity | null>;
  create(data: ICreateUserData): Promise<IUserEntity>;
  updateChatRetentionPreference(
    id: string,
    preference: ChatRetentionPreference
  ): Promise<IUserEntity>;
  updateAvatarKey(id: string, avatarKey: string | null): Promise<IUserEntity>;
  searchUsers?(query: string): Promise<IUserEntity[]>;
}

