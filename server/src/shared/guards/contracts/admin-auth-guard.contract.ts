import { UserRole, AccountStatus } from '../../../generated/prisma/client.js';
import { IAuthenticatedUserContext } from './auth-guard.contract.js';

export interface IAdminUserContext extends IAuthenticatedUserContext {
  readonly role: UserRole;
  readonly status: AccountStatus;
}

export interface IAdminAuthGuardOptions {
  /**
   * Minimum required role for the endpoint.
   * Defaults to UserRole.ADMIN if omitted.
   */
  readonly minRole?: UserRole;

  /**
   * Whether to bypass Redis role cache and read authoritative PostgreSQL data directly.
   * Mandatory for sensitive administrative mutations (deletions, quarantines, role modifications).
   * Defaults to false.
   */
  readonly bypassCache?: boolean;
}

/**
 * Admin Authentication & Authorization Guard Contract
 * Strictly enforces authoritative database role checks and session verification.
 */
export interface IAdminAuthGuard {
  verifyAdminAccess(
    authorizationHeader: string | undefined,
    options?: IAdminAuthGuardOptions
  ): Promise<IAdminUserContext>;
  invalidateUserRoleCache(userId: string): Promise<void>;
}
