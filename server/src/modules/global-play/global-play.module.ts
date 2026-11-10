import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { IDatabaseService } from '../../infrastructure/database/contracts/database.contract.js';
import { IWeatherService } from '../../infrastructure/weather/contracts/weather.contract.js';

export interface IGlobalPlayModuleDependencies {
  readonly databaseService: IDatabaseService;
  readonly weatherService: IWeatherService;
}

/**
 * Global Play Feature Module Composition Root
 * Exposes weather and smart playback contextual APIs.
 */
export class GlobalPlayModule {
  private readonly dependencies: IGlobalPlayModuleDependencies;

  public constructor(dependencies: IGlobalPlayModuleDependencies) {
    this.dependencies = dependencies;
  }

  public getDependencies(): IGlobalPlayModuleDependencies {
    return this.dependencies;
  }

  public registerRoutes(fastify: FastifyInstance): void {
    const handleWeather = async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as Record<string, string | undefined>;
      const latStr = query['lat'] ?? query['latitude'];
      const lonStr = query['lon'] ?? query['longitude'];

      if (!latStr || !lonStr) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Both lat and lon query parameters are required.',
        });
      }

      const lat = parseFloat(latStr);
      const lon = parseFloat(lonStr);

      if (
        isNaN(lat) ||
        isNaN(lon) ||
        lat < -90 ||
        lat > 90 ||
        lon < -180 ||
        lon > 180
      ) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'lat must be between -90 and 90, and lon between -180 and 180.',
        });
      }

      try {
        const snapshot = await this.dependencies.weatherService.getCurrentWeather(lat, lon);
        return reply.status(200).send(snapshot);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Weather service error';
        return reply.status(200).send({
          condition: null,
          tempCelsius: null,
          isReliable: false,
          timestamp: Date.now(),
          error: message,
        });
      }
    };

    fastify.get('/api/v1/weather', handleWeather);
    fastify.get('/api/v1/weather/current', handleWeather);
  }
}

