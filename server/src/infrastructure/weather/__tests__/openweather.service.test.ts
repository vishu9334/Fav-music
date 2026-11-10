import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenWeatherService } from '../implementations/openweather.service.js';

describe('OpenWeatherService — Unit & Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Key Verification & Zero-Exposure Safety', () => {
    it('initializes with config and preserves key internally without leaking in toString or errors', async () => {
      const mockKey = 'secret-test-key-1234567890abcdef';
      const service = new OpenWeatherService({
        apiKey: mockKey,
        fetchFn: async () => new Response(JSON.stringify({ cod: 401, message: 'Invalid API key' }), { status: 401 }),
      });

      const snapshot = await service.getCurrentWeather(19.076, 72.8777);
      expect(snapshot.isReliable).toBe(false);
      // Ensure the error message never leaks the API key string
      expect(snapshot.error).toBeDefined();
      expect(snapshot.error).not.toContain(mockKey);
      expect(JSON.stringify(snapshot)).not.toContain(mockKey);
    });

    it('returns dev/offline fallback snapshot when apiKey is sample-api-key or empty', async () => {
      const service = new OpenWeatherService({ apiKey: 'sample-api-key' });
      const snapshot = await service.getCurrentWeather(19.076, 72.8777);
      expect(snapshot.condition).toBe('clear');
      expect(snapshot.tempCelsius).toBeGreaterThan(0);
      expect(snapshot.isReliable).toBe(false);
    });
  });

  describe('Official OpenWeather Current Weather API Response Verification', () => {
    it('verifies the real configured environment key behavior against official API endpoint', async () => {
      const envKey = process.env['OPENWEATHER_API_KEY'];
      if (!envKey) {
        // Skip live call if env is not configured in this test runner context
        return;
      }

      const service = new OpenWeatherService({ apiKey: envKey });
      const snapshot = await service.getCurrentWeather(19.076, 72.8777);

      // Verify that the service executed safely and produced a structured snapshot
      expect(snapshot).toBeDefined();
      expect(typeof snapshot.condition).toBe('string');
      expect(typeof snapshot.tempCelsius).toBe('number');
      expect(typeof snapshot.isReliable).toBe('boolean');

      // The live key in server/.env is hex 32 chars.
      // If active -> isReliable is true.
      // If unactivated / 401 -> isReliable is false, error message set, zero crash.
      if (!snapshot.isReliable) {
        expect(snapshot.error).toBeDefined();
        expect(snapshot.error).not.toContain(envKey);
      }
    });
  });

  describe('Condition ID Mapping to Canonical Aadat Conditions', () => {
    it.each([
      [200, 'Thunderstorm', 'Stormy'],
      [232, 'Heavy Thunderstorm', 'Stormy'],
      [300, 'Drizzle', 'Rainy'],
      [500, 'Light Rain', 'Rainy'],
      [502, 'Heavy Rain', 'Rainy'],
      [600, 'Light Snow', 'Snowy'],
      [616, 'Rain and Snow', 'Snowy'],
      [701, 'Mist', 'Foggy'],
      [741, 'Fog', 'Foggy'],
      [771, 'Squall', 'Windy'],
      [781, 'Tornado', 'Windy'],
      [800, 'Clear', 'Clear'],
      [801, 'Few Clouds', 'Cloudy'],
      [804, 'Overcast Clouds', 'Cloudy'],
    ])('maps OpenWeather id %i (%s) to %s', (id, main, expected) => {
      expect(OpenWeatherService.mapCondition(id, main)).toBe(expected);
    });
  });

  describe('Server-Side Caching (10-30 min requirement)', () => {
    it('caches successful weather snapshots for identical coordinate vicinity and avoids redundant fetch', async () => {
      let fetchCount = 0;
      const mockFetch: typeof fetch = async () => {
        fetchCount++;
        return new Response(
          JSON.stringify({
            weather: [{ id: 800, main: 'Clear' }],
            main: { temp: 28.4 },
            name: 'Mumbai',
          }),
          { status: 200 }
        );
      };

      const service = new OpenWeatherService({
        apiKey: 'mock-valid-key',
        cacheTtlMs: 15 * 60 * 1000, // 15 mins
        fetchFn: mockFetch,
      });

      const first = await service.getCurrentWeather(19.076, 72.8777);
      expect(fetchCount).toBe(1);
      expect(first.isReliable).toBe(true);
      expect(first.condition).toBe('Clear');
      expect(first.tempCelsius).toBe(28);
      expect(first.city).toBe('Mumbai');

      // Second request at nearby coordinates rounded to 2 decimal places (19.08, 72.88)
      const second = await service.getCurrentWeather(19.079, 72.8771);
      expect(fetchCount).toBe(1); // Cached! No additional HTTP call
      expect(second.condition).toBe('Clear');
      expect(second.tempCelsius).toBe(28);
    });
  });

  describe('Timeout & Error Handling', () => {
    it('handles timeout gracefully and returns fallback snapshot without crashing', async () => {
      const slowFetch: typeof fetch = async (_url, init) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      };

      const service = new OpenWeatherService({
        apiKey: 'mock-key',
        timeoutMs: 50, // Short timeout for test
        fetchFn: slowFetch,
      });

      const snapshot = await service.getCurrentWeather(19.076, 72.8777);
      expect(snapshot.isReliable).toBe(false);
      expect(snapshot.error).toContain('timed out');
    });

    it('handles HTTP 500 server errors and returns fallback snapshot', async () => {
      const failingFetch: typeof fetch = async () => {
        return new Response(JSON.stringify({ message: 'Internal OpenWeather server error' }), { status: 500 });
      };

      const service = new OpenWeatherService({
        apiKey: 'mock-key',
        fetchFn: failingFetch,
      });

      const snapshot = await service.getCurrentWeather(19.076, 72.8777);
      expect(snapshot.isReliable).toBe(false);
      expect(snapshot.error).toContain('HTTP 500');
    });
  });
});

