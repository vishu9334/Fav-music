import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserRole, AccountStatus } from '../../../generated/prisma/client.js';
import { IAuthGuard, IAuthenticatedUserContext } from '../../../shared/guards/contracts/auth-guard.contract.js';
import { AdminAuthGuard } from '../../../shared/guards/implementations/admin-auth.guard.js';
import {
  IAdminUserRepository,
  IAdminUserRoleRecord,
} from '../contracts/admin-user-repository.contract.js';
import { PrismaAdminUserRepository } from '../repositories/prisma-admin-user.repository.js';
import { ICacheService } from '../../../infrastructure/cache/contracts/cache.contract.js';
import { IDatabaseService } from '../../../infrastructure/database/contracts/database.contract.js';
import { NotFoundError, UnauthorizedError } from '../../../shared/errors/domain.error.js';

describe('AdminAuthGuard & RBAC Authorization Suite', () => {
  let mockBaseAuthGuard: IAuthGuard;
  let mockAdminUserRepository: IAdminUserRepository;
  let mockCacheService: ICacheService;
  let guard: AdminAuthGuard;

  const validAdminUser: IAdminUserRoleRecord = {
    id: 'user-admin-1',
    email: 'admin@aadatmusic.com',
    displayName: 'Admin Officer',
    role: UserRole.ADMIN,
    status: AccountStatus.ACTIVE,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  const validSuperAdminUser: IAdminUserRoleRecord = {
    id: 'user-super-1',
    email: 'owner@aadatmusic.com',
    displayName: 'Super Admin',
    role: UserRole.SUPER_ADMIN,
    status: AccountStatus.ACTIVE,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  const validModeratorUser: IAdminUserRoleRecord = {
    id: 'user-mod-1',
    email: 'mod@aadatmusic.com',
    displayName: 'Moderator',
    role: UserRole.CONTENT_MODERATOR,
    status: AccountStatus.ACTIVE,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  const standardUser: IAdminUserRoleRecord = {
    id: 'user-listener-1',
    email: 'listener@gmail.com',
    displayName: 'Normal Listener',
    role: UserRole.USER,
    status: AccountStatus.ACTIVE,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    mockBaseAuthGuard = {
      validateToken: vi.fn().mockResolvedValue({
        userId: validAdminUser.id,
        email: validAdminUser.email,
        sessionId: 'session-123',
      } as IAuthenticatedUserContext),
    };

    mockAdminUserRepository = {
      findRoleAndStatusById: vi.fn().mockResolvedValue(validAdminUser),
      findByEmail: vi.fn().mockResolvedValue(validAdminUser),
      updateUserRole: vi.fn(),
      updateUserStatus: vi.fn(),
      listUsers: vi.fn(),
      countSuperAdmins: vi.fn().mockResolvedValue(1),
    };

    const cacheStore = new Map<string, string>();
    mockCacheService = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      isConnected: vi.fn().mockReturnValue(true),
      get: vi.fn().mockImplementation(async (key: string) => cacheStore.get(key) ?? null),
      set: vi.fn().mockImplementation(async (key: string, value: string) => {
        cacheStore.set(key, value);
      }),
      delete: vi.fn().mockImplementation(async (key: string) => {
        cacheStore.delete(key);
      }),
      exists: vi.fn().mockImplementation(async (key: string) => cacheStore.has(key)),
      ping: vi.fn().mockResolvedValue('PONG'),
      eval: vi.fn().mockResolvedValue(null),
    };

    guard = new AdminAuthGuard({
      baseAuthGuard: mockBaseAuthGuard,
      adminUserRepository: mockAdminUserRepository,
      cacheService: mockCacheService,
      cacheTtlSeconds: 60,
    });
  });

  describe('Authentication & Session Boundary Tests', () => {
    it('rejects unauthenticated requests when baseAuthGuard fails (missing/invalid Bearer token)', async () => {
      vi.mocked(mockBaseAuthGuard.validateToken).mockRejectedValueOnce(
        new UnauthorizedError('Missing or malformed Authorization header')
      );

      await expect(guard.verifyAdminAccess(undefined)).rejects.toThrow(UnauthorizedError);
      expect(mockAdminUserRepository.findRoleAndStatusById).not.toHaveBeenCalled();
    });

    it('rejects requests when the user session has been revoked in Redis', async () => {
      vi.mocked(mockBaseAuthGuard.validateToken).mockRejectedValueOnce(
        new UnauthorizedError('Session has expired or has been revoked')
      );

      await expect(guard.verifyAdminAccess('Bearer token-revoked')).rejects.toThrow(
        'Session has expired or has been revoked'
      );
      expect(mockAdminUserRepository.findRoleAndStatusById).not.toHaveBeenCalled();
    });

    it('rejects access if the authenticated user ID is not found in authoritative PostgreSQL', async () => {
      vi.mocked(mockAdminUserRepository.findRoleAndStatusById).mockResolvedValueOnce(null);

      await expect(guard.verifyAdminAccess('Bearer valid-token')).rejects.toThrow(
        'User account not found'
      );
    });
  });

  describe('Account Lifecycle & Status Tests', () => {
    it('rejects suspended administrators even if they have ADMIN role', async () => {
      vi.mocked(mockAdminUserRepository.findRoleAndStatusById).mockResolvedValueOnce({
        ...validAdminUser,
        status: AccountStatus.SUSPENDED,
      });

      await expect(guard.verifyAdminAccess('Bearer valid-token')).rejects.toThrow(
        'Account is suspended'
      );
    });

    it('rejects deactivated administrators even if they have SUPER_ADMIN role', async () => {
      vi.mocked(mockAdminUserRepository.findRoleAndStatusById).mockResolvedValueOnce({
        ...validSuperAdminUser,
        status: AccountStatus.DEACTIVATED,
      });

      await expect(guard.verifyAdminAccess('Bearer valid-token')).rejects.toThrow(
        'Account is deactivated'
      );
    });
  });

  describe('RBAC Privilege Escalation & Authorization Tests', () => {
    it('rejects standard USER accounts attempting to access admin endpoints', async () => {
      vi.mocked(mockBaseAuthGuard.validateToken).mockResolvedValueOnce({
        userId: standardUser.id,
        email: standardUser.email,
        sessionId: 'session-user',
      });
      vi.mocked(mockAdminUserRepository.findRoleAndStatusById).mockResolvedValueOnce(standardUser);

      await expect(guard.verifyAdminAccess('Bearer user-token')).rejects.toThrow(
        'USER role insufficient'
      );
    });

    it('prevents privilege escalation: ignores stale JWT role claim and enforces live PostgreSQL role', async () => {
      // The JWT token claims to be SUPER_ADMIN
      vi.mocked(mockBaseAuthGuard.validateToken).mockResolvedValueOnce({
        userId: standardUser.id,
        email: standardUser.email,
        sessionId: 'session-user',
        role: 'SUPER_ADMIN', // Stale claim in JWT
      });

      // But authoritative database says user is only USER
      vi.mocked(mockAdminUserRepository.findRoleAndStatusById).mockResolvedValueOnce({
        ...standardUser,
        role: UserRole.USER,
      });

      // Must be rejected based on database truth
      await expect(guard.verifyAdminAccess('Bearer forged-token')).rejects.toThrow(
        'USER role insufficient'
      );
    });

    it('permits CONTENT_MODERATOR when minRole is CONTENT_MODERATOR', async () => {
      vi.mocked(mockBaseAuthGuard.validateToken).mockResolvedValueOnce({
        userId: validModeratorUser.id,
        email: validModeratorUser.email,
        sessionId: 'session-mod',
      });
      vi.mocked(mockAdminUserRepository.findRoleAndStatusById).mockResolvedValueOnce(validModeratorUser);

      const context = await guard.verifyAdminAccess('Bearer mod-token', {
        minRole: UserRole.CONTENT_MODERATOR,
      });

      expect(context.userId).toBe(validModeratorUser.id);
      expect(context.role).toBe(UserRole.CONTENT_MODERATOR);
      expect(context.status).toBe(AccountStatus.ACTIVE);
    });

    it('rejects CONTENT_MODERATOR when endpoint requires ADMIN role', async () => {
      vi.mocked(mockBaseAuthGuard.validateToken).mockResolvedValueOnce({
        userId: validModeratorUser.id,
        email: validModeratorUser.email,
        sessionId: 'session-mod',
      });
      vi.mocked(mockAdminUserRepository.findRoleAndStatusById).mockResolvedValueOnce(validModeratorUser);

      await expect(
        guard.verifyAdminAccess('Bearer mod-token', { minRole: UserRole.ADMIN })
      ).rejects.toThrow('Requires ADMIN');
    });

    it('permits ADMIN when endpoint requires ADMIN role', async () => {
      const context = await guard.verifyAdminAccess('Bearer admin-token', {
        minRole: UserRole.ADMIN,
      });

      expect(context.userId).toBe(validAdminUser.id);
      expect(context.role).toBe(UserRole.ADMIN);
    });

    it('rejects ADMIN when endpoint requires SUPER_ADMIN role', async () => {
      await expect(
        guard.verifyAdminAccess('Bearer admin-token', { minRole: UserRole.SUPER_ADMIN })
      ).rejects.toThrow('Requires SUPER_ADMIN');
    });

    it('permits SUPER_ADMIN on any administrative endpoint', async () => {
      vi.mocked(mockBaseAuthGuard.validateToken).mockResolvedValueOnce({
        userId: validSuperAdminUser.id,
        email: validSuperAdminUser.email,
        sessionId: 'session-super',
      });
      vi.mocked(mockAdminUserRepository.findRoleAndStatusById).mockResolvedValueOnce(validSuperAdminUser);

      const context = await guard.verifyAdminAccess('Bearer super-token', {
        minRole: UserRole.SUPER_ADMIN,
      });

      expect(context.userId).toBe(validSuperAdminUser.id);
      expect(context.role).toBe(UserRole.SUPER_ADMIN);
    });
  });

  describe('Caching & Invalidation Strategy Tests', () => {
    it('caches the resolved role in Redis and serves subsequent requests from cache', async () => {
      // First call -> populates cache from DB
      await guard.verifyAdminAccess('Bearer admin-token');
      expect(mockAdminUserRepository.findRoleAndStatusById).toHaveBeenCalledTimes(1);
      expect(mockCacheService.set).toHaveBeenCalledWith(
        `aadat:auth:role:${validAdminUser.id}`,
        JSON.stringify({ role: UserRole.ADMIN, status: AccountStatus.ACTIVE }),
        60
      );

      // Second call -> hits cache
      const context = await guard.verifyAdminAccess('Bearer admin-token');
      expect(context.role).toBe(UserRole.ADMIN);
      expect(mockAdminUserRepository.findRoleAndStatusById).toHaveBeenCalledTimes(1); // Not called again
    });

    it('bypasses cache when bypassCache: true is specified (for sensitive mutations)', async () => {
      // Pre-seed cache with stale data
      await mockCacheService.set(
        `aadat:auth:role:${validAdminUser.id}`,
        JSON.stringify({ role: UserRole.SUPER_ADMIN, status: AccountStatus.ACTIVE })
      );

      // Query with bypassCache: true -> must query PostgreSQL directly
      const context = await guard.verifyAdminAccess('Bearer admin-token', {
        bypassCache: true,
      });

      expect(mockAdminUserRepository.findRoleAndStatusById).toHaveBeenCalledTimes(1);
      expect(context.role).toBe(UserRole.ADMIN); // Real DB value, not cached SUPER_ADMIN
    });

    it('invalidates cache correctly via invalidateUserRoleCache', async () => {
      await mockCacheService.set(
        `aadat:auth:role:${validAdminUser.id}`,
        JSON.stringify({ role: UserRole.ADMIN, status: AccountStatus.ACTIVE })
      );

      await guard.invalidateUserRoleCache(validAdminUser.id);

      const cached = await mockCacheService.get(`aadat:auth:role:${validAdminUser.id}`);
      expect(cached).toBeNull();
    });
  });
});

describe('PrismaAdminUserRepository Unit Tests', () => {
  let mockPrisma: {
    user: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
  };
  let mockDbService: IDatabaseService;
  let mockCacheService: ICacheService;
  let repo: PrismaAdminUserRepository;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
    };

    mockDbService = {
      getClient: vi.fn().mockReturnValue(mockPrisma),
      connect: vi.fn(),
      disconnect: vi.fn(),
      isConnected: vi.fn().mockReturnValue(true),
    } as unknown as IDatabaseService;

    mockCacheService = {
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as ICacheService;

    repo = new PrismaAdminUserRepository({
      databaseService: mockDbService,
      cacheService: mockCacheService,
    });
  });

  it('findRoleAndStatusById queries Prisma and maps to IAdminUserRoleRecord', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      email: 'test@aadat.com',
      displayName: 'Test User',
      role: UserRole.ADMIN,
      status: AccountStatus.ACTIVE,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    });

    const result = await repo.findRoleAndStatusById('user-1');
    expect(result).not.toBeNull();
    expect(result?.id).toBe('user-1');
    expect(result?.role).toBe(UserRole.ADMIN);
    expect(result?.status).toBe(AccountStatus.ACTIVE);
  });

  it('updateUserRole updates role in database and invalidates role cache', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'user-1' });
    mockPrisma.user.update.mockResolvedValueOnce({
      id: 'user-1',
      email: 'test@aadat.com',
      displayName: 'Test User',
      role: UserRole.SUPER_ADMIN,
      status: AccountStatus.ACTIVE,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    });

    const result = await repo.updateUserRole('admin-actor', 'user-1', UserRole.SUPER_ADMIN);
    expect(result.role).toBe(UserRole.SUPER_ADMIN);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { role: UserRole.SUPER_ADMIN },
      select: expect.any(Object),
    });
    expect(mockCacheService.delete).toHaveBeenCalledWith('aadat:auth:role:user-1');
  });

  it('updateUserRole throws NotFoundError if target user does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);

    await expect(
      repo.updateUserRole('admin-actor', 'non-existent', UserRole.ADMIN)
    ).rejects.toThrow(NotFoundError);
  });

  it('updateUserStatus updates account status and invalidates role cache', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'user-1' });
    mockPrisma.user.update.mockResolvedValueOnce({
      id: 'user-1',
      email: 'test@aadat.com',
      displayName: 'Test User',
      role: UserRole.USER,
      status: AccountStatus.SUSPENDED,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    });

    const result = await repo.updateUserStatus('admin-actor', 'user-1', AccountStatus.SUSPENDED);
    expect(result.status).toBe(AccountStatus.SUSPENDED);
    expect(mockCacheService.delete).toHaveBeenCalledWith('aadat:auth:role:user-1');
  });

  it('countSuperAdmins counts active super admins correctly', async () => {
    mockPrisma.user.count.mockResolvedValueOnce(2);

    const count = await repo.countSuperAdmins();
    expect(count).toBe(2);
    expect(mockPrisma.user.count).toHaveBeenCalledWith({
      where: {
        role: UserRole.SUPER_ADMIN,
        status: AccountStatus.ACTIVE,
      },
    });
  });
});
