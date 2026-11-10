import { FastifyReply, FastifyRequest } from 'fastify';
import { IHealthCheckService } from '../contracts/health.contract.js';

/**
 * Health Controller
 * Thin HTTP transport controller mapping requests to HealthCheckService.
 */
export class HealthController {
  private readonly healthService: IHealthCheckService;

  public constructor(healthService: IHealthCheckService) {
    this.healthService = healthService;
  }

  public async getHealth(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const health = await this.healthService.getHealthStatus();
    const statusCode = health.status === 'unhealthy' ? 503 : 200;
    reply.status(statusCode).send(health);
  }

  public async getLive(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const live = this.healthService.isLive();
    reply.status(200).send(live);
  }

  public async getReady(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ready = await this.healthService.getReadyStatus();
    const statusCode = ready.ready ? 200 : 503;
    reply.status(statusCode).send(ready);
  }
}

