import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserRole, AccountStatus, AuditAction } from '../../../generated/prisma/client.js';
import {
  IAdminUserRepository,
  IAdminUserRoleRecord,
} from '../contracts/admin-user-repository.contract.js';
import {
  IAdminAuditLogEntity,
  IAdminAuditRepository,
  ICreateAuditLogData,
} from '../contracts/admin-audit-repository.contract.js';
import {
  DatabaseTransactionContext,
  ITransactionRunner,
} from '../../../infrastructure/database/contracts/database.contract.js';
import { ICacheService } from '../../../infrastructure/cache/contracts/cache.contract.js';
import { AdminBootstrapService } from '../services/admin-bootstrap.service.js';
import {
  DEFAULT_BOOTSTRAP_LOCK_IDENTIFIER,
  DEFAULT_RECOVERY_NONCE_LOCK_PREFIX,
} from '../contracts/admin-bootstrap.contract.js';
import { ValidationFailedError } from '../../../shared/errors/domain.error.js';
import { readTokenSecurely, runRecoverCli } from '../cli/recover.cli.js';
import { runGenerateRecoveryTokenCli } from '../cli/generate-recovery-token.cli.js';

describe('AdminBootstrapService Suite (Remediated)', () => {
  let mockAdminUserRepository: IAdminUserRepository;
  let mockAdminAuditRepository: IAdminAuditRepository;
  let mockTransactionRunner: ITransactionRunner;
  let mockCacheService: ICacheService;
  let rawQueriesExecuted: string[];
  let service: AdminBootstrapService;

  const recoverySecret = 'test-recovery-secret-minimum-32-chars-long-123456';
  let currentTime = 1700000000000;

  const validRegisteredUser: IAdminUserRoleRecord = {
    id: 'user-google-1',
    email: 'first-owner@aadatmusic.com',
    displayName: 'First Owner',
    role: UserRole.USER,
    status: AccountStatus.ACTIVE,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    currentTime = 1700000000000;
    rawQueriesExecuted = [];

    mockAdminUserRepository = {
      findRoleAndStatusById: vi.fn().mockResolvedValue(validRegisteredUser),
      findByEmail: vi.fn().mockResolvedValue(validRegisteredUser),
      updateUserRole: vi.fn(),
      updateUserStatus: vi.fn(),
      listUsers: vi.fn(),
      countSuperAdmins: vi.fn().mockResolvedValue(0), // Zero state default
    };

    const auditLogs: IAdminAuditLogEntity[] = [];
    mockAdminAuditRepository = {
      createLog: vi.fn().mockImplementation(async (data: ICreateAuditLogData) => {
        const log: IAdminAuditLogEntity = {
          id: `audit-${auditLogs.length + 1}`,
          adminId: data.adminId,
          action: data.action,
          targetType: data.targetType,
          targetId: data.targetId,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          metadata: data.metadata ?? null,
          createdAt: new Date(currentTime),
        };
        auditLogs.push(log);
        return log;
      }),
      listLogs: vi.fn().mockResolvedValue({ logs: auditLogs, total: auditLogs.length }),
      hasNonceBeenUsed: vi.fn().mockImplementation(async (nonce: string) => {
        return auditLogs.some((l) => (l.metadata as { nonce?: string })?.nonce === nonce);
      }),
    };

    // Transaction mock executes callback with simulated Prisma tx client
    mockTransactionRunner = {
      runTransaction: vi.fn().mockImplementation(async (action) => {
        const mockTx = {
          $executeRaw: vi.fn().mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => {
            const query = strings.reduce((acc, str, i) => acc + str + (values[i] !== undefined ? String(values[i]) : ''), '');
            rawQueriesExecuted.push(query);
            return Promise.resolve(1);
          }),
          user: {
            count: vi.fn().mockResolvedValue(0),
            update: vi.fn().mockResolvedValue({
              id: validRegisteredUser.id,
              email: validRegisteredUser.email,
              role: UserRole.SUPER_ADMIN,
              status: AccountStatus.ACTIVE,
            }),
          },
        } as unknown as DatabaseTransactionContext;
        return action(mockTx);
      }),
    };

    const cacheStore = new Map<string, string>();
    mockCacheService = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      isConnected: vi.fn().mockReturnValue(true),
      get: vi.fn().mockImplementation(async (k: string) => cacheStore.get(k) ?? null),
      set: vi.fn().mockImplementation(async (k: string, v: string) => {
        cacheStore.set(k, v);
      }),
      delete: vi.fn().mockImplementation(async (k: string) => {
        cacheStore.delete(k);
      }),
      exists: vi.fn().mockImplementation(async (k: string) => cacheStore.has(k)),
      ping: vi.fn().mockResolvedValue('PONG'),
      eval: vi.fn().mockImplementation(async (script: string, _numKeys: number, ...args: (string | number)[]) => {
        // Mock atomic SET NX
        if (script.includes("SET") && script.includes("NX")) {
          const key = String(args[0]);
          const val = String(args[1]);
          if (cacheStore.has(key)) {
            return null; // Already exists
          }
          cacheStore.set(key, val);
          return 'OK';
        }
        // Mock compare and delete
        if (script.includes("GET") && script.includes("DEL")) {
          const key = String(args[0]);
          const expectedVal = String(args[1]);
          if (cacheStore.get(key) === expectedVal) {
            cacheStore.delete(key);
            return 1;
          }
          return 0;
        }
        return 1;
      }),
    };

    service = new AdminBootstrapService({
      adminUserRepository: mockAdminUserRepository,
      adminAuditRepository: mockAdminAuditRepository,
      transactionRunner: mockTransactionRunner,
      cacheService: mockCacheService,
      recoverySecret,
      timeProvider: () => currentTime,
    });
  });

  describe('Zero-State Bootstrap & Concurrency Safety Tests', () => {
    it('rejects bootstrap if email is missing or malformed', async () => {
      await expect(service.bootstrapInitialSuperAdmin({ email: '' })).rejects.toThrow(
        ValidationFailedError
      );
      await expect(service.bootstrapInitialSuperAdmin({ email: 'not-an-email' })).rejects.toThrow(
        'valid email address is required'
      );
    });

    it('rejects bootstrap if a SUPER_ADMIN already exists in PostgreSQL', async () => {
      vi.mocked(mockAdminUserRepository.countSuperAdmins).mockResolvedValueOnce(1);

      await expect(
        service.bootstrapInitialSuperAdmin({ email: validRegisteredUser.email })
      ).rejects.toThrow('At least one active SUPER_ADMIN already exists');

      expect(mockTransactionRunner.runTransaction).not.toHaveBeenCalled();
    });

    it('rejects bootstrap if the target user account does not exist in PostgreSQL', async () => {
      vi.mocked(mockAdminUserRepository.findByEmail).mockResolvedValueOnce(null);

      await expect(
        service.bootstrapInitialSuperAdmin({ email: 'unregistered@aadatmusic.com' })
      ).rejects.toThrow('The user must first authenticate via Google OAuth');
    });

    it('rejects bootstrap if the target user account is suspended or deactivated', async () => {
      vi.mocked(mockAdminUserRepository.findByEmail).mockResolvedValueOnce({
        ...validRegisteredUser,
        status: AccountStatus.SUSPENDED,
      });

      await expect(
        service.bootstrapInitialSuperAdmin({ email: validRegisteredUser.email })
      ).rejects.toThrow('Cannot bootstrap a non-active user account');
    });

    it('executes transaction-scoped PostgreSQL advisory lock before zero-state recheck', async () => {
      const result = await service.bootstrapInitialSuperAdmin({
        email: validRegisteredUser.email,
        ipAddress: '10.0.0.1',
        userAgent: 'Aadat-Secure-CLI/1.0',
        correlationId: 'req-corr-123',
      });

      expect(result.userId).toBe(validRegisteredUser.id);
      expect(result.role).toBe(UserRole.SUPER_ADMIN);

      // Verify that transaction executed the advisory lock with the documented key identifier
      expect(rawQueriesExecuted.some((q) => q.includes('pg_advisory_xact_lock') && q.includes(DEFAULT_BOOTSTRAP_LOCK_IDENTIFIER))).toBe(true);

      // Verify audit log creation inside transaction
      expect(mockAdminAuditRepository.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: validRegisteredUser.id,
          action: AuditAction.SYSTEM_BOOTSTRAP,
          targetType: 'USER',
          targetId: validRegisteredUser.id,
        }),
        expect.anything()
      );

      // Verify cache invalidation
      expect(mockCacheService.delete).toHaveBeenCalledWith(
        `aadat:auth:role:${validRegisteredUser.id}`
      );
    });

    it('supports custom, documented advisory lock identifier via dependency injection', async () => {
      const customLockKey = 'custom:lock:aadat_bootstrap_v2';
      const customService = new AdminBootstrapService({
        adminUserRepository: mockAdminUserRepository,
        adminAuditRepository: mockAdminAuditRepository,
        transactionRunner: mockTransactionRunner,
        cacheService: mockCacheService,
        recoverySecret,
        bootstrapLockIdentifier: customLockKey,
        timeProvider: () => currentTime,
      });

      await customService.bootstrapInitialSuperAdmin({
        email: validRegisteredUser.email,
      });

      expect(rawQueriesExecuted.some((q) => q.includes('pg_advisory_xact_lock') && q.includes(customLockKey))).toBe(true);
    });

    it('prevents concurrent bootstrap race conditions via transactional advisory lock check', async () => {
      // Simulate that inside the advisory-locked transaction, another concurrent runner completed first
      vi.mocked(mockTransactionRunner.runTransaction).mockImplementationOnce(async (action) => {
        const mockTx = {
          $executeRaw: vi.fn().mockResolvedValue(1),
          user: {
            count: vi.fn().mockResolvedValue(1), // Already 1 created concurrently!
            update: vi.fn(),
          },
        } as unknown as DatabaseTransactionContext;
        return action(mockTx);
      });

      await expect(
        service.bootstrapInitialSuperAdmin({ email: validRegisteredUser.email })
      ).rejects.toThrow('Concurrent bootstrap conflict');
    });
  });

  describe('Break-Glass Disaster Recovery & Atomic Replay Prevention Tests', () => {
    it('generates a valid signed emergency recovery token and consumes it successfully', async () => {
      const token = await service.generateEmergencyRecoveryToken({
        email: validRegisteredUser.email,
        ttlSeconds: 300,
        nonce: 'nonce-uuid-1',
      });

      expect(token).toContain('.');

      const result = await service.recoverSuperAdminAccess({
        email: validRegisteredUser.email,
        token,
        ipAddress: '192.168.1.1',
        userAgent: 'Break-Glass-CLI',
      });

      expect(result.userId).toBe(validRegisteredUser.id);
      expect(result.role).toBe(UserRole.SUPER_ADMIN);
      expect(result.status).toBe(AccountStatus.ACTIVE);

      // Verify per-nonce PostgreSQL advisory lock execution
      expect(
        rawQueriesExecuted.some(
          (q) =>
            q.includes('pg_advisory_xact_lock') &&
            q.includes(`${DEFAULT_RECOVERY_NONCE_LOCK_PREFIX}nonce-uuid-1`)
        )
      ).toBe(true);

      // Verify BREAK_GLASS_RECOVERY audit entry
      expect(mockAdminAuditRepository.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.BREAK_GLASS_RECOVERY,
          targetType: 'USER',
          targetId: validRegisteredUser.id,
          metadata: expect.objectContaining({
            nonce: 'nonce-uuid-1',
          }),
        }),
        expect.anything()
      );
    });

    it('rejects recovery token with forged or invalid cryptographic HMAC signature', async () => {
      const token = await service.generateEmergencyRecoveryToken({
        email: validRegisteredUser.email,
      });

      const [payload] = token.split('.');
      const forgedToken = `${payload}.forged_tampered_signature_hex`;

      await expect(
        service.recoverSuperAdminAccess({
          email: validRegisteredUser.email,
          token: forgedToken,
        })
      ).rejects.toThrow('Invalid emergency recovery token signature');
    });

    it('rejects recovery token if presented for a different email address', async () => {
      const token = await service.generateEmergencyRecoveryToken({
        email: 'original@aadatmusic.com',
      });

      await expect(
        service.recoverSuperAdminAccess({
          email: 'attacker@aadatmusic.com',
          token,
        })
      ).rejects.toThrow('Emergency recovery token does not match target email address');
    });

    it('rejects expired recovery tokens', async () => {
      const token = await service.generateEmergencyRecoveryToken({
        email: validRegisteredUser.email,
        ttlSeconds: 60,
      });

      // Advance time by 61 seconds
      currentTime += 61 * 1000;

      await expect(
        service.recoverSuperAdminAccess({
          email: validRegisteredUser.email,
          token,
        })
      ).rejects.toThrow('Emergency recovery token has expired');
    });

    it('atomically reserves nonce in Redis using SET NX and rejects concurrent replay', async () => {
      const token = await service.generateEmergencyRecoveryToken({
        email: validRegisteredUser.email,
        nonce: 'nonce-atomic-123',
      });

      // First recovery -> succeeds and reserves nonce
      await service.recoverSuperAdminAccess({
        email: validRegisteredUser.email,
        token,
      });

      // Second recovery with same token -> rejected due to atomic SET NX failure
      await expect(
        service.recoverSuperAdminAccess({
          email: validRegisteredUser.email,
          token,
        })
      ).rejects.toThrow('Emergency recovery token has already been consumed or is currently being processed (replay detected)');
    });

    it('releases Redis reservation safely via compare-and-delete if the database transaction fails', async () => {
      const token = await service.generateEmergencyRecoveryToken({
        email: validRegisteredUser.email,
        nonce: 'nonce-failure-rollback',
      });

      // Simulate database failure during transaction
      vi.mocked(mockTransactionRunner.runTransaction).mockRejectedValueOnce(
        new Error('Database connectivity failure during recovery')
      );

      await expect(
        service.recoverSuperAdminAccess({
          email: validRegisteredUser.email,
          token,
        })
      ).rejects.toThrow('Database connectivity failure during recovery');

      // Verify that the compare-and-delete Lua script was executed to release the reservation
      expect(mockCacheService.eval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call(\'DEL\''),
        1,
        'aadat:recovery:reservation:nonce-failure-rollback',
        expect.any(String)
      );
    });

    it('rejects recovery if nonce is already recorded in durable PostgreSQL audit log', async () => {
      const token = await service.generateEmergencyRecoveryToken({
        email: validRegisteredUser.email,
        nonce: 'nonce-audit-recorded',
      });

      // Simulate durable PostgreSQL check returning true
      vi.mocked(mockAdminAuditRepository.hasNonceBeenUsed).mockResolvedValueOnce(true);

      await expect(
        service.recoverSuperAdminAccess({
          email: validRegisteredUser.email,
          token,
        })
      ).rejects.toThrow('Emergency recovery token has already been recorded in audit log');
    });

    it('throws error if recoverySecret is missing or less than 32 characters', async () => {
      const unconfiguredService = new AdminBootstrapService({
        adminUserRepository: mockAdminUserRepository,
        adminAuditRepository: mockAdminAuditRepository,
        transactionRunner: mockTransactionRunner,
        recoverySecret: 'too-short',
      });

      await expect(
        unconfiguredService.generateEmergencyRecoveryToken({ email: 'test@aadat.com' })
      ).rejects.toThrow('requires a recoverySecret of at least 32 characters');
    });
  });

  describe('CLI Secret Leakage Prevention & STDIN Input Tests', () => {
    it('runRecoverCli rejects any --token command-line argument with CWE-214 error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit(1)');
      }) as unknown as (code?: string | number | null | undefined) => never);

      await expect(
        runRecoverCli(['--email=test@aadat.com', '--token=sensitive-secret-token'])
      ).rejects.toThrow('process.exit(1)');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('prohibited (CWE-214)')
      );

      consoleErrorSpy.mockRestore();
      exitSpy.mockRestore();
    });

    it('readTokenSecurely reads token from AADAT_RECOVERY_TOKEN environment variable', async () => {
      const previous = process.env.AADAT_RECOVERY_TOKEN;
      process.env.AADAT_RECOVERY_TOKEN = 'secret-env-recovery-token';

      try {
        const token = await readTokenSecurely();
        expect(token).toBe('secret-env-recovery-token');
      } finally {
        process.env.AADAT_RECOVERY_TOKEN = previous;
      }
    });

    it('runGenerateRecoveryTokenCli requires mandatory --confirm-break-glass flag', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit(1)');
      }) as unknown as (code?: string | number | null | undefined) => never);

      await expect(
        runGenerateRecoveryTokenCli(['--email=owner@aadat.com'])
      ).rejects.toThrow('process.exit(1)');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('--confirm-break-glass is required')
      );

      consoleErrorSpy.mockRestore();
      exitSpy.mockRestore();
    });
  });
});
