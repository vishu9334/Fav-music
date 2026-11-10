import { UserRole, AccountStatus } from '../../../generated/prisma/client.js';

export const DEFAULT_BOOTSTRAP_LOCK_IDENTIFIER = 'aadat:lock:super_admin_bootstrap';
export const DEFAULT_RECOVERY_NONCE_LOCK_PREFIX = 'aadat:lock:recovery_nonce:';

export interface IAdminBootstrapConfig {
  /**
   * Configurable, documented string identifier for PostgreSQL transaction-scoped advisory locking.
   * Defaults to DEFAULT_BOOTSTRAP_LOCK_IDENTIFIER ('aadat:lock:super_admin_bootstrap').
   */
  readonly bootstrapLockIdentifier?: string;

  /**
   * Minimum 32-character high-entropy secret for HMAC-SHA256 recovery tokens.
   */
  readonly recoverySecret?: string;

  /**
   * Prefix for per-nonce PostgreSQL transaction-scoped advisory locking.
   * Defaults to DEFAULT_RECOVERY_NONCE_LOCK_PREFIX ('aadat:lock:recovery_nonce:').
   */
  readonly nonceLockPrefix?: string;
}

export interface IBootstrapParams {
  readonly email: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly correlationId?: string;
}

export interface IBootstrapResult {
  readonly userId: string;
  readonly email: string;
  readonly role: UserRole;
  readonly status: AccountStatus;
  readonly auditLogId: string;
  readonly bootstrappedAt: Date;
}

export interface IRecoveryParams {
  readonly email: string;
  readonly token: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

export interface IRecoveryResult {
  readonly userId: string;
  readonly email: string;
  readonly role: UserRole;
  readonly status: AccountStatus;
  readonly auditLogId: string;
  readonly recoveredAt: Date;
}

export interface IGenerateRecoveryTokenParams {
  readonly email: string;
  readonly ttlSeconds?: number;
  readonly nonce?: string;
}

/**
 * Super Admin Bootstrap & Disaster Recovery Contract
 * Out-of-band management of zero-state bootstrap and emergency recovery.
 */
export interface IBootstrapService {
  bootstrapInitialSuperAdmin(params: IBootstrapParams): Promise<IBootstrapResult>;
  recoverSuperAdminAccess(params: IRecoveryParams): Promise<IRecoveryResult>;
  generateEmergencyRecoveryToken(params: IGenerateRecoveryTokenParams): Promise<string>;
}
