import { FastifyInstance } from 'fastify';
import { IDatabaseService } from '../../infrastructure/database/contracts/database.contract.js';
import { ICacheService } from '../../infrastructure/cache/contracts/cache.contract.js';
import { HealthCheckService } from './services/health-check.service.js';
import { HealthController } from './controllers/health.controller.js';

export interface IHealthModuleDependencies {
  readonly databaseService: IDatabaseService;
  readonly cacheService: ICacheService;
  readonly version?: string;
}

/**
 * Health Feature Module Composition Root
 * Wires HealthController & HealthCheckService and registers Fastify routes.
 */
export class HealthModule {
  private readonly controller: HealthController;
  private readonly service: HealthCheckService;

  public constructor(dependencies: IHealthModuleDependencies) {
    this.service = new HealthCheckService(dependencies);
    this.controller = new HealthController(this.service);
  }

  public registerRoutes(fastify: FastifyInstance): void {
    fastify.get('/health', (req, reply) => this.controller.getHealth(req, reply));
    fastify.get('/health/live', (req, reply) => this.controller.getLive(req, reply));
    fastify.get('/health/ready', (req, reply) => this.controller.getReady(req, reply));
  }

  public getService(): HealthCheckService {
    return this.service;
  }

  public getController(): HealthController {
    return this.controller;
  }
}

