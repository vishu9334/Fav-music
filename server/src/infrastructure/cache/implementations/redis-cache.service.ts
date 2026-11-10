import { Redis, RedisOptions } from 'ioredis';
import { ICacheService } from '../contracts/cache.contract.js';

export interface IRedisConfig {
  readonly url?: string;
  readonly host?: string;
  readonly port?: number;
  readonly password?: string;
  readonly useTls?: boolean;
  readonly connectTimeoutMs?: number;
  readonly maxRetriesPerRequest?: number;
  readonly lazyConnect?: boolean;
}

export interface IRedisCacheServiceDependencies {
  readonly client?: Redis;
}

/**
 * Concrete Production Redis Cache Service
 * Strictly class-based, adhering to SOLID principles and ICacheService contract.
 * Manages ioredis connection lifecycle, timeouts, safe error trapping, and zero credential leakage.
 */
export class RedisCacheService implements ICacheService {
  private readonly client: Redis;
  private readonly config: IRedisConfig;
  private isExplicitlyConnected: boolean = false;

  public constructor(
    config: IRedisConfig,
    dependencies?: IRedisCacheServiceDependencies
  ) {
    this.config = config;

    if (dependencies?.client) {
      this.client = dependencies.client;
    } else {
      const options: RedisOptions = {
        lazyConnect: config.lazyConnect ?? true,
        connectTimeout: config.connectTimeoutMs ?? 5000,
        maxRetriesPerRequest: config.maxRetriesPerRequest ?? 3,
        retryStrategy(times: number) {
          if (times > 3) {
            return null; // Stop retrying after 3 attempts
          }
          return Math.min(times * 100, 1000);
        },
      };

      if (config.useTls) {
        options.tls = {};
      }

      if (config.url) {
        this.client = new Redis(config.url, options);
      } else {
        options.host = config.host ?? '127.0.0.1';
        options.port = config.port ?? 6379;
        if (config.password) {
          options.password = config.password;
        }
        this.client = new Redis(options);
      }
    }

    // Attach silent error handler to prevent unhandled EventEmitter process crashes
    this.client.on('error', (_err: Error) => {
      // Safe trap: logs are handled through centralized application logging, avoiding raw secret dumps
    });
  }

  public async connect(): Promise<void> {
    if (this.isConnected()) {
      return;
    }

    try {
      if (this.client.status === 'wait') {
        await this.client.connect();
      }
      this.isExplicitlyConnected = true;
    } catch (error) {
      this.isExplicitlyConnected = false;
      const sanitizedMessage = error instanceof Error ? error.message : 'Unknown Redis connection error';
      throw new Error(`[RedisService] Failed to connect: ${sanitizedMessage}`);
    }
  }

  public async disconnect(): Promise<void> {
    this.isExplicitlyConnected = false;
    try {
      if (this.client.status !== 'end') {
        await this.client.quit();
      }
    } catch {
      this.client.disconnect();
    }
  }

  public isConnected(): boolean {
    return this.client.status === 'ready' || (this.isExplicitlyConnected && this.client.status === 'connect');
  }

  public async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      const sanitizedMessage = error instanceof Error ? error.message : 'Unknown Redis read error';
      throw new Error(`[RedisService] Read failed for key "${key}": ${sanitizedMessage}`);
    }
  }

  public async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      const sanitizedMessage = error instanceof Error ? error.message : 'Unknown Redis write error';
      throw new Error(`[RedisService] Write failed for key "${key}": ${sanitizedMessage}`);
    }
  }

  public async delete(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      const sanitizedMessage = error instanceof Error ? error.message : 'Unknown Redis delete error';
      throw new Error(`[RedisService] Delete failed for key "${key}": ${sanitizedMessage}`);
    }
  }

  public async exists(key: string): Promise<boolean> {
    try {
      const count = await this.client.exists(key);
      return count > 0;
    } catch (error) {
      const sanitizedMessage = error instanceof Error ? error.message : 'Unknown Redis exists error';
      throw new Error(`[RedisService] Exists check failed for key "${key}": ${sanitizedMessage}`);
    }
  }

  public async ping(): Promise<string> {
    try {
      return await this.client.ping();
    } catch (error) {
      const sanitizedMessage = error instanceof Error ? error.message : 'Unknown Redis ping error';
      throw new Error(`[RedisService] Ping failed: ${sanitizedMessage}`);
    }
  }

  public async eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown> {
    try {
      return await this.client.eval(script, numKeys, ...args);
    } catch (error) {
      const sanitizedMessage = error instanceof Error ? error.message : 'Unknown Redis eval error';
      throw new Error(`[RedisService] Eval failed: ${sanitizedMessage}`);
    }
  }

  public getClient(): Redis {
    return this.client;
  }

  public getConfig(): IRedisConfig {
    return {
      host: this.config.host,
      port: this.config.port,
      useTls: this.config.useTls,
      // Credentials omitted to avoid leakage
    };
  }
}
