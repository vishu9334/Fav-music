import { Prisma, PrismaClient } from '../../../generated/prisma/client.js';

export type DatabaseTransactionContext = Prisma.TransactionClient;

/**
 * Database Service Contract (SOLID - Interface Segregation)
 */
export interface IDatabaseService {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getClient(): PrismaClient;
  isConnected(): boolean;
  ping(): Promise<boolean>;
}

/**
 * Transaction Runner Contract (Unit of Work abstraction)
 */
export interface ITransactionRunner {
  runTransaction<T>(action: (tx: DatabaseTransactionContext) => Promise<T>): Promise<T>;
}

