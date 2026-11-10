export type ServiceHealthStatus = 'up' | 'down' | 'degraded';

export interface IHealthStatusResponse {
  readonly status: 'ok' | 'degraded' | 'unhealthy';
  readonly uptimeSeconds: number;
  readonly timestamp: string;
  readonly version: string;
  readonly services: {
    readonly database: ServiceHealthStatus;
    readonly cache: ServiceHealthStatus;
  };
}

export interface ILiveStatusResponse {
  readonly status: 'alive';
  readonly timestamp: string;
}

export interface IReadyStatusResponse {
  readonly status: 'ready' | 'not_ready';
  readonly timestamp: string;
  readonly ready: boolean;
}

/**
 * Health Check Service Contract (SOLID - Interface Segregation)
 */
export interface IHealthCheckService {
  getHealthStatus(): Promise<IHealthStatusResponse>;
  isLive(): ILiveStatusResponse;
  getReadyStatus(): Promise<IReadyStatusResponse>;
}

