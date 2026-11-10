import { UserRole, AccountStatus } from '../../../generated/prisma/client.js';
import { IAuthGuard } from '../contracts/auth-guard.contract.js';
import {
  IAdminAuthGuard,
  IAdminAuthGuardOptions,
  IAdminUserContext,
} from '../contracts/admin-auth-guard.contract.js';
import { IAdminUserRepository } from '../../../modules/admin/contracts/admin-user-repository.contract.js';
import { ICacheService } from '../../../infrastructure/cache/contracts/cache.contract.js';
import { ForbiddenError, UnauthorizedError } from '../../errors/domain.error.js';

export interface IAdminAuthGuardDependencies {
  readonly baseAuthGuard: IAuthGuard;
  readonly adminUserRepository: IAdminUserRepository;
  readonly cacheService?: ICacheService;
  readonly cacheTtlSeconds?: number;
}

const ROLE_HIERARCHY: Record<UserRole, number> = {
  [UserRole.USER]: 0,
  [UserRole.CONTENT_MODERATOR]: 1,
  [UserRole.ADMIN]: 2,
  [UserRole.SUPER_ADMIN]: 3,
};

/**
 * Authoritative Admin Authentication and Authorization Guard
 *
 * Enforces:
 * 1. Cryptographic JWT verification and Redis session revocation via IAuthGuard.
 * 2. Authoritative PostgreSQL role and account status verification (prevents stale JWT privilege escalation).
 * 3. Immediate rejection of USER role, suspended or deactivated accounts.
 * 4. Granular RBAC hierarchy verification (SUPER_ADMIN > ADMIN > CONTENT_MODERATOR > USER).
 * 5. Direct DB query bypass option for sensitive administrative mutations.
 * 6. Explicit cache invalidation upon role or status changes.
 */
export class AdminAuthGuard implements IAdminAuthGuard {
  private readonly baseAuthGuard: IAuthGuard;
  private readonly adminUserRepository: IAdminUserRepository;
  private readonly cacheService?: ICacheService;
  private readonly cacheTtlSeconds: number;

  public constructor(dependencies: IAdminAuthGuardDependencies) {
    this.baseAuthGuard = dependencies.baseAuthGuard;
    this.adminUserRepository = dependencies.adminUserRepository;
    this.cacheService = dependencies.cacheService;
    this.cacheTtlSeconds = dependencies.cacheTtlSeconds ?? 60;
  }

  public async verifyAdminAccess(
    authorizationHeader: string | undefined,
    options?: IAdminAuthGuardOptions
  ): Promise<IAdminUserContext> {
    // 1. Validate cryptographic Bearer JWT signature and Redis session revocation
    const baseUser = await this.baseAuthGuard.validateToken(authorizationHeader);
    const userId = baseUser.userId;

    const bypassCache = options?.bypassCache ?? false;
    const minRole = options?.minRole ?? UserRole.ADMIN;

    // 2. Resolve role and account status authoritatively
    let roleRecord: { role: UserRole; status: AccountStatus } | null = null;
    const cacheKey = this.getCacheKey(userId);

    if (!bypassCache && this.cacheService) {
      try {
        const cached = await this.cacheService.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as { role: UserRole; status: AccountStatus };
          if (parsed && parsed.role && parsed.status) {
            roleRecord = parsed;
          }
        }
      } catch {
        roleRecord = null;
      }
    }

    if (!roleRecord) {
      const dbUser = await this.adminUserRepository.findRoleAndStatusById(userId);
      if (!dbUser) {
        throw new UnauthorizedError('User account not found');
      }

      roleRecord = {
        role: dbUser.role,
        status: dbUser.status,
      };

      if (!bypassCache && this.cacheService) {
        try {
          await this.cacheService.set(
            cacheKey,
            JSON.stringify(roleRecord),
            this.cacheTtlSeconds
          );
        } catch {
          // Cache write failures must not break authoritative authorization
        }
      }
    }

    // 3. Verify Account Lifecycle Status
    if (roleRecord.status === AccountStatus.SUSPENDED) {
      throw new ForbiddenError('Administrative access denied: Account is suspended');
    }

    if (roleRecord.status === AccountStatus.DEACTIVATED) {
      throw new ForbiddenError('Administrative access denied: Account is deactivated');
    }

    if (roleRecord.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenError('Administrative access denied: Account is not active');
    }

    // 4. Reject standard USER role
    if (roleRecord.role === UserRole.USER) {
      throw new ForbiddenError('Administrative access denied: USER role insufficient');
    }

    // 5. Verify RBAC Role Hierarchy
    const userRoleWeight = ROLE_HIERARCHY[roleRecord.role] ?? -1;
    const requiredRoleWeight = ROLE_HIERARCHY[minRole] ?? 999;

    if (userRoleWeight < requiredRoleWeight) {
      throw new ForbiddenError(
        `Insufficient administrative privileges: Requires ${minRole}`
      );
    }

    return {
      userId: baseUser.userId,
      email: baseUser.email,
      sessionId: baseUser.sessionId,
      role: roleRecord.role,
      status: roleRecord.status,
    };
  }

  public async invalidateUserRoleCache(userId: string): Promise<void> {
    if (this.cacheService) {
      await this.cacheService.delete(this.getCacheKey(userId));
    }
  }

  private getCacheKey(userId: string): string {
    return `aadat:auth:role:${userId}`;
  }
}
