import crypto from 'node:crypto';
import { UserRole, AccountStatus, AuditAction } from '../../../generated/prisma/client.js';
import { ITransactionRunner } from '../../../infrastructure/database/contracts/database.contract.js';
import { ICacheService } from '../../../infrastructure/cache/contracts/cache.contract.js';
import { IAdminUserRepository } from '../contracts/admin-user-repository.contract.js';
import { IAdminAuditRepository } from '../contracts/admin-audit-repository.contract.js';
import {
  DEFAULT_BOOTSTRAP_LOCK_IDENTIFIER,
  DEFAULT_RECOVERY_NONCE_LOCK_PREFIX,
  IBootstrapParams,
  IBootstrapResult,
  IBootstrapService,
  IGenerateRecoveryTokenParams,
  IRecoveryParams,
  IRecoveryResult,
} from '../contracts/admin-bootstrap.contract.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationFailedError,
} from '../../../shared/errors/domain.error.js';

export interface IAdminBootstrapServiceDependencies {
  readonly adminUserRepository: IAdminUserRepository;
  readonly adminAuditRepository: IAdminAuditRepository;
  readonly transactionRunner: ITransactionRunner;
  readonly cacheService?: ICacheService;
  readonly recoverySecret?: string;
  readonly bootstrapLockIdentifier?: string;
  readonly nonceLockPrefix?: string;
  readonly timeProvider?: () => number;
}

interface IRecoveryTokenPayload {
  readonly email: string;
  readonly expiresAt: number;
  readonly nonce: string;
}

/**
 * Super Admin Bootstrap & Emergency Disaster Recovery Service
 *
 * Implements:
 * 1. Zero-state bootstrap: strictly permits initial SUPER_ADMIN elevation only when 0 exist.
 * 2. Concurrency-safe: uses a configurable, documented PostgreSQL transaction-scoped advisory lock
 *    (DEFAULT_BOOTSTRAP_LOCK_IDENTIFIER) and re-checks zero-state within the lock.
 * 3. Identity verification: requires target account to exist and be in ACTIVE status.
 * 4. Immutable audit trail: logs SYSTEM_BOOTSTRAP and BREAK_GLASS_RECOVERY events atomically with role updates.
 * 5. Replay-resistant recovery: HMAC-SHA256 tokens with atomic ownership-bound Redis SET NX reservation,
 *    PostgreSQL transaction-scoped advisory locking by nonce, and compare-and-delete cleanup semantics.
 */
export class AdminBootstrapService implements IBootstrapService {
  private readonly adminUserRepository: IAdminUserRepository;
  private readonly adminAuditRepository: IAdminAuditRepository;
  private readonly transactionRunner: ITransactionRunner;
  private readonly cacheService?: ICacheService;
  private readonly recoverySecret?: string;
  private readonly bootstrapLockIdentifier: string;
  private readonly nonceLockPrefix: string;
  private readonly now: () => number;

  public constructor(dependencies: IAdminBootstrapServiceDependencies) {
    this.adminUserRepository = dependencies.adminUserRepository;
    this.adminAuditRepository = dependencies.adminAuditRepository;
    this.transactionRunner = dependencies.transactionRunner;
    this.cacheService = dependencies.cacheService;
    this.recoverySecret = dependencies.recoverySecret;
    this.bootstrapLockIdentifier =
      dependencies.bootstrapLockIdentifier ?? DEFAULT_BOOTSTRAP_LOCK_IDENTIFIER;
    this.nonceLockPrefix =
      dependencies.nonceLockPrefix ?? DEFAULT_RECOVERY_NONCE_LOCK_PREFIX;
    this.now = dependencies.timeProvider ?? (() => Date.now());
  }

  public async bootstrapInitialSuperAdmin(params: IBootstrapParams): Promise<IBootstrapResult> {
    const email = (params.email || '').toLowerCase().trim();
    if (!email || !email.includes('@')) {
      throw new ValidationFailedError('A valid email address is required for bootstrapping');
    }

    // 1. Authoritative Pre-Check: Refuse if any active SUPER_ADMIN already exists
    const superAdminCount = await this.adminUserRepository.countSuperAdmins();
    if (superAdminCount > 0) {
      throw new ConflictError(
        'Cannot bootstrap: At least one active SUPER_ADMIN already exists in the system. Use authorized role promotion or break-glass recovery.'
      );
    }

    // 2. Verify target user exists in PostgreSQL (must have authenticated via Google OAuth)
    const targetUser = await this.adminUserRepository.findByEmail(email);
    if (!targetUser) {
      throw new NotFoundError(
        `Target user "${email}" does not exist. The user must first authenticate via Google OAuth to establish account identity.`
      );
    }

    if (targetUser.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenError(
        `Target user account is "${targetUser.status}". Cannot bootstrap a non-active user account.`
      );
    }

    // 3. Execute Race-Safe Transaction with PostgreSQL Advisory Lock
    const result = await this.transactionRunner.runTransaction(async (tx) => {
      // 3.1 Acquire PostgreSQL transaction-scoped advisory lock using documented identifier.
      // hashtext('aadat:lock:super_admin_bootstrap') computes a deterministic signed 32-bit int.
      // Guarantees serialization of concurrent bootstrap requests under any transaction isolation level.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${this.bootstrapLockIdentifier}));`;

      // 3.2 Authoritative zero-state re-check inside the advisory lock
      const txSuperAdminCount = await tx.user.count({
        where: {
          role: UserRole.SUPER_ADMIN,
          status: AccountStatus.ACTIVE,
        },
      });

      if (txSuperAdminCount > 0) {
        throw new ConflictError(
          'Concurrent bootstrap conflict: Another process has already bootstrapped a SUPER_ADMIN.'
        );
      }

      // 3.3 Elevate target user to SUPER_ADMIN
      const updatedUser = await tx.user.update({
        where: { id: targetUser.id },
        data: {
          role: UserRole.SUPER_ADMIN,
          status: AccountStatus.ACTIVE,
        },
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
        },
      });

      // 3.4 Record immutable audit entry atomically inside transaction
      const auditLog = await this.adminAuditRepository.createLog(
        {
          adminId: targetUser.id,
          action: AuditAction.SYSTEM_BOOTSTRAP,
          targetType: 'USER',
          targetId: targetUser.id,
          ipAddress: params.ipAddress ?? '127.0.0.1 (CLI)',
          userAgent: params.userAgent ?? 'Aadat CLI Bootstrap Engine v1.0',
          metadata: {
            previousRole: targetUser.role,
            newRole: UserRole.SUPER_ADMIN,
            correlationId: params.correlationId ?? crypto.randomUUID(),
            timestamp: new Date(this.now()).toISOString(),
            lockIdentifier: this.bootstrapLockIdentifier,
          },
        },
        tx
      );

      return { updatedUser, auditLog };
    });

    // 4. Invalidate role cache
    if (this.cacheService) {
      await this.cacheService.delete(`aadat:auth:role:${targetUser.id}`);
    }

    return {
      userId: result.updatedUser.id,
      email: result.updatedUser.email,
      role: result.updatedUser.role,
      status: result.updatedUser.status,
      auditLogId: result.auditLog.id,
      bootstrappedAt: result.auditLog.createdAt,
    };
  }

  public async generateEmergencyRecoveryToken(
    params: IGenerateRecoveryTokenParams
  ): Promise<string> {
    if (!this.recoverySecret || this.recoverySecret.length < 32) {
      throw new Error(
        'AdminBootstrapService requires a recoverySecret of at least 32 characters to generate emergency recovery tokens'
      );
    }

    const email = (params.email || '').toLowerCase().trim();
    if (!email || !email.includes('@')) {
      throw new ValidationFailedError('A valid email address is required');
    }

    const ttlSeconds = Math.min(900, Math.max(60, params.ttlSeconds ?? 300)); // Default 5 mins, capped at 15 mins
    const expiresAt = this.now() + ttlSeconds * 1000;
    const nonce = params.nonce ?? crypto.randomUUID();

    const payload: IRecoveryTokenPayload = {
      email,
      expiresAt,
      nonce,
    };

    const serializedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.recoverySecret)
      .update(serializedPayload)
      .digest('hex');

    return `${serializedPayload}.${signature}`;
  }

  public async recoverSuperAdminAccess(params: IRecoveryParams): Promise<IRecoveryResult> {
    if (!this.recoverySecret || this.recoverySecret.length < 32) {
      throw new Error(
        'AdminBootstrapService requires a recoverySecret of at least 32 characters to verify emergency recovery tokens'
      );
    }

    const email = (params.email || '').toLowerCase().trim();
    const token = (params.token || '').trim();

    if (!email || !token) {
      throw new ValidationFailedError('Both target email and emergency recovery token are required');
    }

    const [payloadB64, providedSignature] = token.split('.');
    if (!payloadB64 || !providedSignature) {
      throw new UnauthorizedError('Malformed emergency recovery token format');
    }

    // 1. Verify HMAC cryptographic signature using timing-safe comparison
    const expectedSignature = crypto
      .createHmac('sha256', this.recoverySecret)
      .update(payloadB64)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const providedBuffer = Buffer.from(providedSignature, 'utf8');

    if (
      expectedBuffer.length !== providedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      throw new UnauthorizedError('Invalid emergency recovery token signature');
    }

    // 2. Decode & validate payload claims
    let payload: IRecoveryTokenPayload;
    try {
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    } catch {
      throw new UnauthorizedError('Corrupt emergency recovery token payload');
    }

    if (payload.email.toLowerCase().trim() !== email) {
      throw new ForbiddenError('Emergency recovery token does not match target email address');
    }

    if (this.now() > payload.expiresAt) {
      throw new UnauthorizedError('Emergency recovery token has expired');
    }

    // 3. Atomic Redis Nonce Reservation with Ownership-Bound Key
    const reservationOwnerId = crypto.randomUUID();
    const reservationKey = `aadat:recovery:reservation:${payload.nonce}`;
    const reservationTtlSec = Math.max(
      300,
      Math.ceil((payload.expiresAt - this.now()) / 1000) + 300
    );

    if (this.cacheService) {
      // Atomic SET NX: if key exists, reservation fails immediately
      const setNxScript = `
        return redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EX', ARGV[2])
      `;
      const reserved = await this.cacheService.eval(
        setNxScript,
        1,
        reservationKey,
        reservationOwnerId,
        reservationTtlSec
      );

      if (!reserved) {
        throw new ConflictError(
          'Emergency recovery token has already been consumed or is currently being processed (replay detected)'
        );
      }
    }

    // 4. Verify target user identity in PostgreSQL
    const targetUser = await this.adminUserRepository.findByEmail(email);
    if (!targetUser) {
      // Release reservation if target user doesn't exist
      await this.releaseReservationSafely(reservationKey, reservationOwnerId);
      throw new NotFoundError(`Target user "${email}" does not exist in the database`);
    }

    if (targetUser.status !== AccountStatus.ACTIVE) {
      await this.releaseReservationSafely(reservationKey, reservationOwnerId);
      throw new ForbiddenError(
        `Target user account is "${targetUser.status}". Cannot elevate non-active accounts.`
      );
    }

    // 5. Execute Transactional Recovery with Per-Nonce Advisory Locking
    try {
      const result = await this.transactionRunner.runTransaction(async (tx) => {
        // 5.1 Per-nonce PostgreSQL advisory lock: serializes all concurrent attempts for this specific nonce
        const nonceLockIdentifier = `${this.nonceLockPrefix}${payload.nonce}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${nonceLockIdentifier}));`;

        // 5.2 Race-safe verification against durable PostgreSQL audit log
        const isDbReplayed = await this.adminAuditRepository.hasNonceBeenUsed(payload.nonce);
        if (isDbReplayed) {
          throw new ConflictError(
            'Emergency recovery token has already been recorded in audit log (replay detected)'
          );
        }

        // 5.3 Elevate user
        const updatedUser = await tx.user.update({
          where: { id: targetUser.id },
          data: {
            role: UserRole.SUPER_ADMIN,
            status: AccountStatus.ACTIVE,
          },
          select: {
            id: true,
            email: true,
            role: true,
            status: true,
          },
        });

        // 5.4 Record immutable audit entry
        const auditLog = await this.adminAuditRepository.createLog(
          {
            adminId: targetUser.id,
            action: AuditAction.BREAK_GLASS_RECOVERY,
            targetType: 'USER',
            targetId: targetUser.id,
            ipAddress: params.ipAddress ?? '127.0.0.1 (CLI Recovery)',
            userAgent: params.userAgent ?? 'Aadat Break-Glass Emergency CLI Engine v1.0',
            metadata: {
              nonce: payload.nonce,
              expiresAt: payload.expiresAt,
              recoveredAt: new Date(this.now()).toISOString(),
              previousRole: targetUser.role,
              nonceLock: nonceLockIdentifier,
            },
          },
          tx
        );

        return { updatedUser, auditLog };
      });

      // 6. Transition reservation to permanent consumed marker in cache
      if (this.cacheService) {
        await this.cacheService.set(
          `aadat:recovery:consumed:${payload.nonce}`,
          '1',
          reservationTtlSec
        );
        await this.cacheService.delete(`aadat:auth:role:${targetUser.id}`);
      }

      return {
        userId: result.updatedUser.id,
        email: result.updatedUser.email,
        role: result.updatedUser.role,
        status: result.updatedUser.status,
        auditLogId: result.auditLog.id,
        recoveredAt: result.auditLog.createdAt,
      };
    } catch (error) {
      // Clean up reservation using safe compare-and-delete semantics
      await this.releaseReservationSafely(reservationKey, reservationOwnerId);
      throw error;
    }
  }

  /**
   * Safe compare-and-delete cleanup:
   * Only deletes the reservation key if it is still owned by reservationOwnerId.
   */
  private async releaseReservationSafely(
    reservationKey: string,
    reservationOwnerId: string
  ): Promise<void> {
    if (!this.cacheService) {
      return;
    }

    const compareAndDeleteScript = `
      if redis.call('GET', KEYS[1]) == ARGV[1] then
        return redis.call('DEL', KEYS[1])
      else
        return 0
      end
    `;

    try {
      await this.cacheService.eval(compareAndDeleteScript, 1, reservationKey, reservationOwnerId);
    } catch {
      // Safe trap to ensure primary transaction errors are preserved
    }
  }
}
