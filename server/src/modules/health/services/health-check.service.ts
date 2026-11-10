import { IDatabaseService } from '../../../infrastructure/database/contracts/database.contract.js';
import { ICacheService } from '../../../infrastructure/cache/contracts/cache.contract.js';
import {
  IHealthCheckService,
  IHealthStatusResponse,
  ILiveStatusResponse,
  IReadyStatusResponse,
  ServiceHealthStatus,
} from '../contracts/health.contract.js';

export interface IHealthCheckServiceDependencies {
  readonly databaseService: IDatabaseService;
  readonly cacheService: ICacheService;
  readonly version?: string;
}

/**
 * Health Check Business Service
 * Encapsulates status aggregation while strictly preserving security (zero credential exposure).
 */
export class HealthCheckService implements IHealthCheckService {
  private readonly databaseService: IDatabaseService;
  private readonly cacheService: ICacheService;
  private readonly version: string;
  private readonly startTime: number;

  public constructor(dependencies: IHealthCheckServiceDependencies) {
    this.databaseService = dependencies.databaseService;
    this.cacheService = dependencies.cacheService;
    this.version = dependencies.version ?? '0.1.0';
    this.startTime = Date.now();
  }

  public async getHealthStatus(): Promise<IHealthStatusResponse> {
    const isDbConnected = this.databaseService.isConnected();
    const isCacheConnected = this.cacheService.isConnected();

    const dbStatus: ServiceHealthStatus = isDbConnected ? 'up' : 'down';
    const cacheStatus: ServiceHealthStatus = isCacheConnected ? 'up' : 'down';

    let overallStatus: 'ok' | 'degraded' | 'unhealthy' = 'ok';
    if (!isDbConnected && !isCacheConnected) {
      overallStatus = 'unhealthy';
    } else if (!isDbConnected || !isCacheConnected) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      timestamp: new Date().toISOString(),
      version: this.version,
      services: {
        database: dbStatus,
        cache: cacheStatus,
      },
    };
  }

  public isLive(): ILiveStatusResponse {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
    };
  }

  public async getReadyStatus(): Promise<IReadyStatusResponse> {
    const isDbConnected = this.databaseService.isConnected();
    const isCacheConnected = this.cacheService.isConnected();
    const ready = isDbConnected && isCacheConnected;

    return {
      status: ready ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      ready,
    };
  }
}

