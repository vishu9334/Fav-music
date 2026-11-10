import { PrismaClient } from '../../../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { NeonConnectionFactory } from './neon-connection.factory.js';
import {
  DatabaseTransactionContext,
  IDatabaseService,
  ITransactionRunner,
} from '../contracts/database.contract.js';

export interface IPrismaDatabaseConfig {
  readonly connectionString: string;
  readonly maxConnections?: number;
  readonly idleTimeoutMillis?: number;
  readonly connectionTimeoutMillis?: number;
  readonly logQueries?: boolean;
}

/**
 * Concrete Database Service implementing IDatabaseService & ITransactionRunner
 * Encapsulates pg.Pool, @prisma/adapter-pg, and PrismaClient connection lifecycle.
 */
export class PrismaDatabaseService implements IDatabaseService, ITransactionRunner {
  private readonly client: PrismaClient;
  private readonly pool: pg.Pool;
  private connected: boolean = false;

  public constructor(config: IPrismaDatabaseConfig) {
    this.pool = new pg.Pool({
      ...new NeonConnectionFactory().create(config.connectionString),
      max: config.maxConnections ?? 10,
      idleTimeoutMillis: config.idleTimeoutMillis ?? 10000,
      connectionTimeoutMillis: config.connectionTimeoutMillis ?? 5000,
    });

    const adapter = new PrismaPg(this.pool);

    this.client = new PrismaClient({
      adapter,
      log: config.logQueries ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
    });
  }

  public async connect(): Promise<void> {
    if (this.connected) {
      return;
    }
    await this.client.$connect();
    this.connected = true;
  }

  public async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }
    await this.client.$disconnect();
    await this.pool.end();
    this.connected = false;
  }

  public getClient(): PrismaClient {
    return this.client;
  }

  public isConnected(): boolean {
    return this.connected;
  }

  /**
   * Non-destructive active database health check via SELECT 1.
   * Guarantees zero modification to tables or data.
   */
  public async ping(): Promise<boolean> {
    try {
      const res = await this.pool.query('SELECT 1 AS alive');
      return res.rowCount !== null && res.rowCount > 0;
    } catch {
      return false;
    }
  }

  public async runTransaction<T>(
    action: (tx: DatabaseTransactionContext) => Promise<T>,
    options?: { maxWait?: number; timeout?: number }
  ): Promise<T> {
    return this.client.$transaction(action, options);
  }
}
