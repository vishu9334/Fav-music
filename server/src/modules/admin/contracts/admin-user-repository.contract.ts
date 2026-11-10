import { UserRole, AccountStatus } from '../../../generated/prisma/client.js';

export interface IAdminUserRoleRecord {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: UserRole;
  readonly status: AccountStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface IAdminUserListQuery {
  readonly page?: number;
  readonly limit?: number;
  readonly role?: UserRole;
  readonly status?: AccountStatus;
  readonly search?: string;
}

export interface IAdminUserListResult {
  readonly users: IAdminUserRoleRecord[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

/**
 * Admin User Persistence Contract (SOLID - Interface Segregation Principle)
 * Strictly encapsulates administrative user queries and role mutations.
 */
export interface IAdminUserRepository {
  findRoleAndStatusById(userId: string): Promise<IAdminUserRoleRecord | null>;
  findByEmail(email: string): Promise<IAdminUserRoleRecord | null>;
  updateUserRole(
    adminId: string,
    targetUserId: string,
    newRole: UserRole
  ): Promise<IAdminUserRoleRecord>;
  updateUserStatus(
    adminId: string,
    targetUserId: string,
    newStatus: AccountStatus
  ): Promise<IAdminUserRoleRecord>;
  listUsers(query?: IAdminUserListQuery): Promise<IAdminUserListResult>;
  countSuperAdmins(): Promise<number>;
}
