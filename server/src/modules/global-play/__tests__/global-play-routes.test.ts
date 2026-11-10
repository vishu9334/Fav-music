import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { GlobalPlayModule } from '../global-play.module.js';
import { IWeatherService, IWeatherSnapshot } from '../../../infrastructure/weather/contracts/weather.contract.js';

describe('GlobalPlayModule — Fastify Weather Routes Integration', () => {
  const mockWeatherService: IWeatherService = {
    getCurrentWeather: vi.fn(async (_lat: number, _lon: number): Promise<IWeatherSnapshot> => {
      return {
        condition: 'Clear',
        tempCelsius: 29,
        isReliable: true,
        timestamp: 1731069000000,
        city: 'Mumbai',
      };
    }),
  };

  const setupApp = async (service: IWeatherService = mockWeatherService) => {
    const fastify = Fastify({ logger: false });
    const module = new GlobalPlayModule({
      databaseService: {} as any,
      weatherService: service,
    });
    module.registerRoutes(fastify);
    await fastify.ready();
    return fastify;
  };

  it('returns 400 when lat or lon query parameter is missing', async () => {
    const app = await setupApp();
    const res1 = await app.inject({ method: 'GET', url: '/api/v1/weather' });
    expect(res1.statusCode).toBe(400);
    expect(res1.json().message).toContain('Both lat and lon');

    const res2 = await app.inject({ method: 'GET', url: '/api/v1/weather?lat=19.076' });
    expect(res2.statusCode).toBe(400);

    const res3 = await app.inject({ method: 'GET', url: '/api/v1/weather?lon=72.8777' });
    expect(res3.statusCode).toBe(400);
  });

  it('returns 400 when coordinates are out of bounds or not numeric', async () => {
    const app = await setupApp();
    const res1 = await app.inject({ method: 'GET', url: '/api/v1/weather?lat=abc&lon=72' });
    expect(res1.statusCode).toBe(400);

    const res2 = await app.inject({ method: 'GET', url: '/api/v1/weather?lat=100&lon=72' }); // lat > 90
    expect(res2.statusCode).toBe(400);

    const res3 = await app.inject({ method: 'GET', url: '/api/v1/weather?lat=19&lon=200' }); // lon > 180
    expect(res3.statusCode).toBe(400);
  });

  it('returns 200 with weather snapshot when coordinates are valid', async () => {
    const app = await setupApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/weather?lat=19.076&lon=72.8777',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.condition).toBe('Clear');
    expect(body.tempCelsius).toBe(29);
    expect(body.isReliable).toBe(true);
    expect(body.city).toBe('Mumbai');
    expect(mockWeatherService.getCurrentWeather).toHaveBeenCalledWith(19.076, 72.8777);
  });

  it('supports /api/v1/weather/current route alias', async () => {
    const app = await setupApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/weather/current?lat=19.076&lon=72.8777',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().condition).toBe('Clear');
  });

  it('returns 200 with unreliable fallback snapshot when weather service encounters error', async () => {
    const failingService: IWeatherService = {
      getCurrentWeather: vi.fn(async () => {
        throw new Error('Service network timeout');
      }),
    };

    const app = await setupApp(failingService);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/weather?lat=19.076&lon=72.8777',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.condition).toBeNull();
    expect(body.isReliable).toBe(false);
    expect(body.error).toContain('Service network timeout');
  });
});
