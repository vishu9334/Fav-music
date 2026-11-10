import { UserRole, AccountStatus } from '../../../generated/prisma/client.js';
import { IDatabaseService } from '../../../infrastructure/database/contracts/database.contract.js';
import { ICacheService } from '../../../infrastructure/cache/contracts/cache.contract.js';
import { NotFoundError } from '../../../shared/errors/domain.error.js';
import {
  IAdminUserListQuery,
  IAdminUserListResult,
  IAdminUserRoleRecord,
  IAdminUserRepository,
} from '../contracts/admin-user-repository.contract.js';

export interface IPrismaAdminUserRepositoryDependencies {
  readonly databaseService: IDatabaseService;
  readonly cacheService?: ICacheService;
}

/**
 * Concrete Prisma Implementation of IAdminUserRepository
 * Handles direct PostgreSQL user role queries and mutations.
 * Strictly adheres to Single Responsibility and Dependency Inversion principles.
 */
export class PrismaAdminUserRepository implements IAdminUserRepository {
  private readonly databaseService: IDatabaseService;
  private readonly cacheService?: ICacheService;

  public constructor(dependencies: IPrismaAdminUserRepositoryDependencies) {
    this.databaseService = dependencies.databaseService;
    this.cacheService = dependencies.cacheService;
  }

  public async findRoleAndStatusById(userId: string): Promise<IAdminUserRoleRecord | null> {
    const user = await this.databaseService.getClient().user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  public async findByEmail(email: string): Promise<IAdminUserRoleRecord | null> {
    const user = await this.databaseService.getClient().user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  public async updateUserRole(
    _adminId: string,
    targetUserId: string,
    newRole: UserRole
  ): Promise<IAdminUserRoleRecord> {
    const existing = await this.databaseService.getClient().user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundError(`User with id "${targetUserId}" not found`);
    }

    const updated = await this.databaseService.getClient().user.update({
      where: { id: targetUserId },
      data: { role: newRole },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Invalidate role cache immediately
    if (this.cacheService) {
      await this.cacheService.delete(`aadat:auth:role:${targetUserId}`);
    }

    return {
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      role: updated.role,
      status: updated.status,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  public async updateUserStatus(
    _adminId: string,
    targetUserId: string,
    newStatus: AccountStatus
  ): Promise<IAdminUserRoleRecord> {
    const existing = await this.databaseService.getClient().user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundError(`User with id "${targetUserId}" not found`);
    }

    const updated = await this.databaseService.getClient().user.update({
      where: { id: targetUserId },
      data: { status: newStatus },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Invalidate role cache immediately
    if (this.cacheService) {
      await this.cacheService.delete(`aadat:auth:role:${targetUserId}`);
    }

    return {
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      role: updated.role,
      status: updated.status,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  public async listUsers(query?: IAdminUserListQuery): Promise<IAdminUserListResult> {
    const page = Math.max(1, query?.page ?? 1);
    const limit = Math.min(100, Math.max(1, query?.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (query?.role) {
      where.role = query.role;
    }

    if (query?.status) {
      where.status = query.status;
    }

    if (query?.search) {
      const searchTerm = query.search.trim();
      where.OR = [
        { email: { contains: searchTerm, mode: 'insensitive' } },
        { displayName: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.databaseService.getClient().user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.databaseService.getClient().user.count({ where }),
    ]);

    return {
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      })),
      total,
      page,
      limit,
    };
  }

  public async countSuperAdmins(): Promise<number> {
    return this.databaseService.getClient().user.count({
      where: {
        role: UserRole.SUPER_ADMIN,
        status: AccountStatus.ACTIVE,
      },
    });
  }
}
