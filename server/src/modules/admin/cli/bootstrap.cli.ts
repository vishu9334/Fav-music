#!/usr/bin/env node
import process from 'node:process';
import { PrismaDatabaseService } from '../../../infrastructure/database/implementations/prisma-database.service.js';
import { RedisCacheService } from '../../../infrastructure/cache/implementations/redis-cache.service.js';
import { PrismaAdminUserRepository } from '../repositories/prisma-admin-user.repository.js';
import { PrismaAdminAuditRepository } from '../repositories/prisma-admin-audit.repository.js';
import { AdminBootstrapService } from '../services/admin-bootstrap.service.js';

/**
 * Super Admin Bootstrap CLI Runner
 *
 * Usage:
 *   pnpm --filter @aadat/server admin:bootstrap --email="owner@aadatmusic.com"
 *
 * Enforces:
 * - Direct database connection (DIRECT_DATABASE_URL / DATABASE_URL).
 * - Zero-state bootstrap verification (aborts if any SUPER_ADMIN exists).
 * - Target user existence & ACTIVE state check.
 * - Immutable AdminAuditLog entry creation.
 */
export async function runBootstrapCli(args: string[] = process.argv.slice(2)): Promise<void> {
  const emailArg = args.find((arg) => arg.startsWith('--email='));
  const email = emailArg ? emailArg.split('=')[1]?.trim() : undefined;

  if (!email) {
    console.error('Error: Missing required argument: --email=<user-email>');
    console.error('Example: pnpm --filter @aadat/server admin:bootstrap --email="admin@aadatmusic.com"');
    process.exit(1);
  }

  const databaseUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Error: Missing DIRECT_DATABASE_URL or DATABASE_URL in environment');
    process.exit(1);
  }

  const databaseService = new PrismaDatabaseService({
    connectionString: databaseUrl,
    maxConnections: 2,
    logQueries: false,
  });

  let cacheService: RedisCacheService | undefined;
  if (process.env.REDIS_URL || process.env.REDIS_HOST) {
    cacheService = new RedisCacheService({
      url: process.env.REDIS_URL,
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
      password: process.env.REDIS_PASSWORD || undefined,
    });
  }

  try {
    await databaseService.connect();
    if (cacheService) {
      await cacheService.connect();
    }

    const adminUserRepository = new PrismaAdminUserRepository({
      databaseService,
      cacheService,
    });

    const adminAuditRepository = new PrismaAdminAuditRepository({
      databaseService,
    });

    const bootstrapService = new AdminBootstrapService({
      adminUserRepository,
      adminAuditRepository,
      transactionRunner: databaseService,
      cacheService,
      recoverySecret: process.env.BOOTSTRAP_RECOVERY_SECRET,
    });

    console.log(`[BOOTSTRAP] Initiating zero-state SUPER_ADMIN bootstrap for: ${email}`);
    const result = await bootstrapService.bootstrapInitialSuperAdmin({ email });

    console.log('[BOOTSTRAP] SUCCESS: SUPER_ADMIN bootstrapped successfully.');
    console.log(`[BOOTSTRAP] User ID: ${result.userId}`);
    console.log(`[BOOTSTRAP] Email: ${result.email}`);
    console.log(`[BOOTSTRAP] Role: ${result.role}`);
    console.log(`[BOOTSTRAP] Status: ${result.status}`);
    console.log(`[BOOTSTRAP] Audit Log ID: ${result.auditLogId}`);
    console.log(`[BOOTSTRAP] Timestamp: ${result.bootstrappedAt.toISOString()}`);
  } catch (error) {
    console.error(`[BOOTSTRAP] FAILED: ${(error as Error).message}`);
    process.exit(1);
  } finally {
    if (cacheService?.isConnected()) {
      await cacheService.disconnect();
    }
    await databaseService.disconnect();
  }
}

// Auto-run if executed directly
if (process.argv[1]?.endsWith('bootstrap.cli.ts') || process.argv[1]?.endsWith('bootstrap.cli.js')) {
  runBootstrapCli().catch(() => process.exit(1));
}

