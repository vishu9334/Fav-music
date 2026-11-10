import { AuditAction } from '../../../generated/prisma/client.js';
import { DatabaseTransactionContext } from '../../../infrastructure/database/contracts/database.contract.js';

export interface ICreateAuditLogData {
  readonly adminId: string;
  readonly action: AuditAction;
  readonly targetType: string;
  readonly targetId: string;
  readonly ipAddress: string;
  readonly userAgent: string;
  readonly metadata?: Record<string, unknown> | null;
}

export interface IAdminAuditLogEntity {
  readonly id: string;
  readonly adminId: string;
  readonly action: AuditAction;
  readonly targetType: string;
  readonly targetId: string;
  readonly ipAddress: string;
  readonly userAgent: string;
  readonly metadata: Record<string, unknown> | null;
  readonly createdAt: Date;
}

export interface IAdminAuditLogFilter {
  readonly adminId?: string;
  readonly action?: AuditAction;
  readonly targetType?: string;
  readonly targetId?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface IAdminAuditLogListResult {
  readonly logs: IAdminAuditLogEntity[];
  readonly total: number;
}

/**
 * Admin Audit Repository Contract (SOLID - Single Responsibility Principle)
 * Strictly encapsulates the creation and querying of immutable audit logs.
 */
export interface IAdminAuditRepository {
  createLog(
    data: ICreateAuditLogData,
    txContext?: DatabaseTransactionContext
  ): Promise<IAdminAuditLogEntity>;
  listLogs(filter?: IAdminAuditLogFilter): Promise<IAdminAuditLogListResult>;
  hasNonceBeenUsed(nonce: string): Promise<boolean>;
}

