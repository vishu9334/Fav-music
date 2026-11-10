import { IDatabaseService, DatabaseTransactionContext } from '../../../infrastructure/database/contracts/database.contract.js';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  IAdminAuditLogEntity,
  IAdminAuditLogFilter,
  IAdminAuditLogListResult,
  IAdminAuditRepository,
  ICreateAuditLogData,
} from '../contracts/admin-audit-repository.contract.js';

export interface IPrismaAdminAuditRepositoryDependencies {
  readonly databaseService: IDatabaseService;
}

/**
 * Concrete Prisma Implementation of IAdminAuditRepository
 * Manages immutable audit trail writes and lookups.
 */
export class PrismaAdminAuditRepository implements IAdminAuditRepository {
  private readonly databaseService: IDatabaseService;

  public constructor(dependencies: IPrismaAdminAuditRepositoryDependencies) {
    this.databaseService = dependencies.databaseService;
  }

  public async createLog(
    data: ICreateAuditLogData,
    txContext?: DatabaseTransactionContext
  ): Promise<IAdminAuditLogEntity> {
    const client = txContext ?? this.databaseService.getClient();

    const created = await client.adminAuditLog.create({
      data: {
        adminId: data.adminId,
        action: data.action,
        targetType: data.targetType,
        targetId: data.targetId,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        metadata: data.metadata ? (data.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });

    return {
      id: created.id,
      adminId: created.adminId,
      action: created.action,
      targetType: created.targetType,
      targetId: created.targetId,
      ipAddress: created.ipAddress,
      userAgent: created.userAgent,
      metadata: created.metadata as Record<string, unknown> | null,
      createdAt: created.createdAt,
    };
  }

  public async listLogs(filter?: IAdminAuditLogFilter): Promise<IAdminAuditLogListResult> {
    const limit = Math.min(100, Math.max(1, filter?.limit ?? 50));
    const offset = Math.max(0, filter?.offset ?? 0);

    const where: Prisma.AdminAuditLogWhereInput = {};

    if (filter?.adminId) {
      where.adminId = filter.adminId;
    }
    if (filter?.action) {
      where.action = filter.action;
    }
    if (filter?.targetType) {
      where.targetType = filter.targetType;
    }
    if (filter?.targetId) {
      where.targetId = filter.targetId;
    }

    const [logs, total] = await Promise.all([
      this.databaseService.getClient().adminAuditLog.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      this.databaseService.getClient().adminAuditLog.count({ where }),
    ]);

    return {
      logs: logs.map((log) => ({
        id: log.id,
        adminId: log.adminId,
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        metadata: log.metadata as Record<string, unknown> | null,
        createdAt: log.createdAt,
      })),
      total,
    };
  }

  public async hasNonceBeenUsed(nonce: string): Promise<boolean> {
    const count = await this.databaseService.getClient().adminAuditLog.count({
      where: {
        metadata: {
          path: ['nonce'],
          equals: nonce,
        },
      },
    });

    return count > 0;
  }
}

