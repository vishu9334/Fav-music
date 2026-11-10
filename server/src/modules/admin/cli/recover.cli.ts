#!/usr/bin/env node
import process from 'node:process';
import readline from 'node:readline';
import { PrismaDatabaseService } from '../../../infrastructure/database/implementations/prisma-database.service.js';
import { RedisCacheService } from '../../../infrastructure/cache/implementations/redis-cache.service.js';
import { PrismaAdminUserRepository } from '../repositories/prisma-admin-user.repository.js';
import { PrismaAdminAuditRepository } from '../repositories/prisma-admin-audit.repository.js';
import { AdminBootstrapService } from '../services/admin-bootstrap.service.js';

/**
 * Reads token securely from AADAT_RECOVERY_TOKEN environment variable or STDIN.
 * Prohibits passing tokens as command-line arguments (CWE-214).
 */
export async function readTokenSecurely(): Promise<string> {
  if (process.env.AADAT_RECOVERY_TOKEN && process.env.AADAT_RECOVERY_TOKEN.trim().length > 0) {
    return process.env.AADAT_RECOVERY_TOKEN.trim();
  }

  return new Promise<string>((resolve, reject) => {
    if (process.stdin.isTTY) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question('Enter emergency recovery token (input hidden): ', (answer) => {
        rl.close();
        const trimmed = answer.trim();
        if (!trimmed) {
          reject(new Error('No recovery token was provided via prompt'));
        } else {
          resolve(trimmed);
        }
      });
    } else {
      let data = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk) => {
        data += chunk;
      });
      process.stdin.on('end', () => {
        const trimmed = data.trim();
        if (!trimmed) {
          reject(new Error('No recovery token was received via piped STDIN'));
        } else {
          resolve(trimmed);
        }
      });
      process.stdin.on('error', (err) => reject(err));
    }
  });
}

/**
 * Break-Glass Emergency Recovery CLI Runner
 *
 * Usage:
 *   pnpm --filter @aadat/server admin:recover-access --email="owner@aadatmusic.com"
 *   (Prompts securely for token via STDIN or reads from AADAT_RECOVERY_TOKEN)
 *
 * Security:
 * - Rejects any --token command-line argument to prevent process table / /proc inspection.
 * - Enforces zero echoing or printing of recovery tokens.
 * - Performs atomic Redis nonce reservation and PostgreSQL per-nonce advisory locking.
 */
export async function runRecoverCli(args: string[] = process.argv.slice(2)): Promise<void> {
  // Prohibit passing token as CLI argument
  if (args.some((arg) => arg.startsWith('--token'))) {
    console.error('Error: Passing recovery tokens via command-line arguments is prohibited (CWE-214).');
    console.error('Tokens must be supplied via secure STDIN prompt or the AADAT_RECOVERY_TOKEN environment variable.');
    console.error('Usage: pnpm --filter @aadat/server admin:recover-access --email="owner@aadatmusic.com"');
    process.exit(1);
  }

  const emailArg = args.find((arg) => arg.startsWith('--email='));
  const email = emailArg ? emailArg.split('=')[1]?.trim() : undefined;

  if (!email) {
    console.error('Error: Missing required argument: --email=<user-email>');
    console.error('Usage: pnpm --filter @aadat/server admin:recover-access --email="owner@aadatmusic.com"');
    process.exit(1);
  }

  const recoverySecret = process.env.BOOTSTRAP_RECOVERY_SECRET;
  if (!recoverySecret || recoverySecret.length < 32) {
    console.error('Error: BOOTSTRAP_RECOVERY_SECRET must be defined with at least 32 characters in environment');
    process.exit(1);
  }

  const databaseUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Error: Missing DIRECT_DATABASE_URL or DATABASE_URL in environment');
    process.exit(1);
  }

  let token: string;
  try {
    token = await readTokenSecurely();
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
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
      recoverySecret,
    });

    console.log(`[RECOVERY] Executing break-glass emergency recovery for: ${email}`);
    const result = await bootstrapService.recoverSuperAdminAccess({ email, token });

    console.log('[RECOVERY] SUCCESS: Account recovered and elevated to SUPER_ADMIN.');
    console.log(`[RECOVERY] User ID: ${result.userId}`);
    console.log(`[RECOVERY] Email: ${result.email}`);
    console.log(`[RECOVERY] Role: ${result.role}`);
    console.log(`[RECOVERY] Status: ${result.status}`);
    console.log(`[RECOVERY] Audit Log ID: ${result.auditLogId}`);
    console.log(`[RECOVERY] Timestamp: ${result.recoveredAt.toISOString()}`);
  } catch (error) {
    console.error(`[RECOVERY] FAILED: ${(error as Error).message}`);
    process.exit(1);
  } finally {
    if (cacheService?.isConnected()) {
      await cacheService.disconnect();
    }
    await databaseService.disconnect();
  }
}

// Auto-run if executed directly
if (process.argv[1]?.endsWith('recover.cli.ts') || process.argv[1]?.endsWith('recover.cli.js')) {
  runRecoverCli().catch(() => process.exit(1));
}
