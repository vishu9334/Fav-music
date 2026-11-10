import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ReliableWeatherProvider,
  ILocationProvider,
  ILocationCoords,
} from '../weather.service';
import { normalizeWeatherCondition } from '../discovery.types';

describe('ReliableWeatherProvider — Real API & Backend Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockLocation = (
    coords: ILocationCoords | null = { latitude: 19.076, longitude: 72.8777 },
    initialPermission = false
  ): ILocationProvider & { requestCount: number } => {
    let perm = initialPermission;
    let reqCount = 0;
    return {
      get requestCount() {
        return reqCount;
      },
      hasPermission: async () => perm,
      requestPermission: async () => {
        reqCount++;
        perm = true;
        return perm;
      },
      getCurrentPosition: async () => coords,
    };
  };

  describe('Location Permission — Requested Only When Needed', () => {
    it('does not request location permission upon instantiation', () => {
      const location = createMockLocation();
      new ReliableWeatherProvider({ locationProvider: location });
      expect(location.requestCount).toBe(0);
    });

    it('requests location permission when getWeather is called for the first time without permission', async () => {
      const location = createMockLocation();
      const mockFetch: typeof fetch = async () =>
        new Response(
          JSON.stringify({
            condition: 'Clear',
            isReliable: true,
            tempCelsius: 28,
          }),
          { status: 200 }
        );

      const provider = new ReliableWeatherProvider({
        locationProvider: location,
        fetchFn: mockFetch,
        baseUrl: 'http://backend.internal',
      });

      expect(location.requestCount).toBe(0);
      const snapshot = await provider.getWeather();
      expect(location.requestCount).toBe(1);
      expect(snapshot).not.toBeNull();
      expect(snapshot?.condition).toBe('Sunny');
    });

    it('returns null and does not call backend if user denies permission', async () => {
      const denyingLocation: ILocationProvider = {
        hasPermission: async () => false,
        requestPermission: async () => false,
        getCurrentPosition: async () => null,
      };

      const fetchSpy = vi.fn();
      const provider = new ReliableWeatherProvider({
        locationProvider: denyingLocation,
        fetchFn: fetchSpy as any,
      });

      const snapshot = await provider.getWeather();
      expect(snapshot).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns null if coordinates cannot be obtained', async () => {
      const noCoordsLocation: ILocationProvider = {
        hasPermission: async () => true,
        requestPermission: async () => true,
        getCurrentPosition: async () => null,
      };

      const fetchSpy = vi.fn();
      const provider = new ReliableWeatherProvider({
        locationProvider: noCoordsLocation,
        fetchFn: fetchSpy as any,
      });

      const snapshot = await provider.getWeather();
      expect(snapshot).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('Fastify Backend Connection & Condition Normalization', () => {
    it('connects to Fastify /api/v1/weather endpoint and maps real condition', async () => {
      let requestedUrl = '';
      const mockFetch: typeof fetch = async (url) => {
        requestedUrl = String(url);
        return new Response(
          JSON.stringify({
            condition: 'Rainy',
            isReliable: true,
            tempCelsius: 24,
            city: 'Mumbai',
          }),
          { status: 200 }
        );
      };

      const location = createMockLocation({ latitude: 19.076, longitude: 72.8777 }, true);
      const provider = new ReliableWeatherProvider({
        locationProvider: location,
        fetchFn: mockFetch,
        baseUrl: 'http://test-server:4000',
      });

      const snapshot = await provider.getWeather();
      expect(requestedUrl).toBe('http://test-server:4000/api/v1/weather?lat=19.076&lon=72.8777');
      expect(snapshot).not.toBeNull();
      expect(snapshot?.condition).toBe('Rainy');
      expect(snapshot?.isReliable).toBe(true);
    });

    it.each([
      ['Clear', 'Sunny'],
      ['Sun', 'Sunny'],
      ['Clouds', 'Cloudy'],
      ['Overcast', 'Cloudy'],
      ['Mist', 'Cloudy'],
      ['Rain', 'Rainy'],
      ['Drizzle', 'Rainy'],
      ['Thunderstorm', 'Stormy'],
      ['Snow', 'Cold'],
    ])('normalizes weather condition string %s to %s', (raw, expected) => {
      expect(normalizeWeatherCondition(raw)).toBe(expected);
    });
  });

  describe('Caching (10-30 min) & Fast Fallback', () => {
    it('serves cached snapshot within TTL without calling backend again', async () => {
      let calls = 0;
      const mockFetch: typeof fetch = async () => {
        calls++;
        return new Response(
          JSON.stringify({
            condition: 'Clear',
            isReliable: true,
            tempCelsius: 28,
          }),
          { status: 200 }
        );
      };

      const location = createMockLocation({ latitude: 19.076, longitude: 72.8777 }, true);
      const provider = new ReliableWeatherProvider({
        locationProvider: location,
        fetchFn: mockFetch,
        cacheTtlMs: 15 * 60 * 1000,
      });

      const first = await provider.getWeather();
      expect(calls).toBe(1);
      expect(first?.condition).toBe('Sunny');

      // Second immediate call
      const second = await provider.getWeather();
      expect(calls).toBe(1); // Cached! No additional network fetch
      expect(second?.condition).toBe('Sunny');
    });

    it('gracefully returns null upon network timeout, allowing time-only fallback', async () => {
      const slowFetch: typeof fetch = async (_url, init) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('Timeout');
            err.name = 'AbortError';
            reject(err);
          });
        });
      };

      const location = createMockLocation({ latitude: 19.076, longitude: 72.8777 }, true);
      const provider = new ReliableWeatherProvider({
        locationProvider: location,
        fetchFn: slowFetch,
        timeoutMs: 50,
      });

      const snapshot = await provider.getWeather();
      expect(snapshot).toBeNull(); // Clean fallback to time-only
    });

    it('gracefully returns null upon HTTP 500 or 401 error from backend', async () => {
      const errorFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            condition: null,
            isReliable: false,
            error: 'OpenWeather HTTP 401: Invalid API key',
          }),
          { status: 200 } // Or 500
        );
      };

      const location = createMockLocation({ latitude: 19.076, longitude: 72.8777 }, true);
      const provider = new ReliableWeatherProvider({
        locationProvider: location,
        fetchFn: errorFetch,
      });

      const snapshot = await provider.getWeather();
      expect(snapshot).toBeNull(); // Does not claim fake weather
    });
  });
});

