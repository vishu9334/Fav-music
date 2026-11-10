#!/usr/bin/env node
import process from 'node:process';
import { PrismaDatabaseService } from '../../../infrastructure/database/implementations/prisma-database.service.js';
import { PrismaAdminUserRepository } from '../repositories/prisma-admin-user.repository.js';
import { PrismaAdminAuditRepository } from '../repositories/prisma-admin-audit.repository.js';
import { AdminBootstrapService } from '../services/admin-bootstrap.service.js';

/**
 * Restricted Emergency Recovery Token Generator CLI
 *
 * Usage:
 *   pnpm --filter @aadat/server admin:generate-recovery-token --email="owner@aadatmusic.com" --confirm-break-glass
 *
 * Enforces:
 * - Independent operator authorization via BOOTSTRAP_RECOVERY_SECRET.
 * - Mandatory --confirm-break-glass safety acknowledgment flag.
 * - Time-limited validity (default 300 seconds, capped at 900).
 */
export async function runGenerateRecoveryTokenCli(
  args: string[] = process.argv.slice(2)
): Promise<void> {
  const emailArg = args.find((arg) => arg.startsWith('--email='));
  const email = emailArg ? emailArg.split('=')[1]?.trim() : undefined;

  const hasConfirmed = args.includes('--confirm-break-glass');
  if (!hasConfirmed) {
    console.error('Error: Mandatory confirmation flag --confirm-break-glass is required.');
    console.error('Generating an emergency recovery token bypasses normal administrative hierarchy.');
    console.error('Usage: pnpm --filter @aadat/server admin:generate-recovery-token --email="owner@aadatmusic.com" --confirm-break-glass');
    process.exit(1);
  }

  if (!email) {
    console.error('Error: Missing required argument: --email=<user-email>');
    process.exit(1);
  }

  const recoverySecret = process.env.BOOTSTRAP_RECOVERY_SECRET;
  if (!recoverySecret || recoverySecret.length < 32) {
    console.error('Error: BOOTSTRAP_RECOVERY_SECRET must be defined with at least 32 characters in environment');
    process.exit(1);
  }

  const ttlArg = args.find((arg) => arg.startsWith('--ttl='));
  const ttlSeconds = ttlArg ? Number(ttlArg.split('=')[1]) : 300;

  const databaseUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Error: Missing DIRECT_DATABASE_URL or DATABASE_URL in environment');
    process.exit(1);
  }

  const databaseService = new PrismaDatabaseService({
    connectionString: databaseUrl,
    maxConnections: 1,
    logQueries: false,
  });

  try {
    await databaseService.connect();

    const adminUserRepository = new PrismaAdminUserRepository({
      databaseService,
    });
    const adminAuditRepository = new PrismaAdminAuditRepository({
      databaseService,
    });

    const bootstrapService = new AdminBootstrapService({
      adminUserRepository,
      adminAuditRepository,
      transactionRunner: databaseService,
      recoverySecret,
    });

    const token = await bootstrapService.generateEmergencyRecoveryToken({
      email,
      ttlSeconds,
    });

    console.log('[RECOVERY TOKEN GENERATED]');
    console.log(`Target Email: ${email}`);
    console.log(`Validity: ${ttlSeconds} seconds`);
    console.log('Secure Token (single-use):');
    console.log(token);
    console.log('\nDeliver this token securely to the authorized operator.');
  } catch (error) {
    console.error(`[TOKEN GENERATION FAILED]: ${(error as Error).message}`);
    process.exit(1);
  } finally {
    await databaseService.disconnect();
  }
}

// Auto-run if executed directly
if (
  process.argv[1]?.endsWith('generate-recovery-token.cli.ts') ||
  process.argv[1]?.endsWith('generate-recovery-token.cli.js')
) {
  runGenerateRecoveryTokenCli().catch(() => process.exit(1));
}

