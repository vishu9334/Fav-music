import { IWeatherService, IWeatherSnapshot } from '../contracts/weather.contract.js';

export interface IOpenWeatherConfig {
  readonly apiKey: string;
  readonly timeoutMs?: number;
  readonly cacheTtlMs?: number;
  readonly fetchFn?: typeof fetch;
}

interface ICachedWeather {
  readonly snapshot: IWeatherSnapshot;
  readonly expiresAt: number;
}

/**
 * Concrete Weather Service implementing IWeatherService.
 * Calls OpenWeather Current Weather API v2.5 with timeout handling,
 * server-side caching (10-30 min), condition normalization, and
 * safe fallback without exposing API keys.
 */
export class OpenWeatherService implements IWeatherService {
  private readonly config: IOpenWeatherConfig;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly cache = new Map<string, ICachedWeather>();

  public constructor(config: IOpenWeatherConfig) {
    this.config = config;
    this.timeoutMs = config.timeoutMs ?? 5000;
    // Default 15 minutes cache TTL (within 10-30 min requirement)
    this.cacheTtlMs = config.cacheTtlMs ?? 15 * 60 * 1000;
    this.fetchFn = config.fetchFn ?? globalThis.fetch;
  }

  /**
   * Maps OpenWeather condition IDs to canonical Aadat weather conditions:
   * 2xx: Stormy (Thunderstorm)
   * 3xx / 5xx: Rainy (Drizzle, Rain)
   * 6xx: Snowy (Snow)
   * 7xx: Foggy / Windy (Atmosphere)
   * 800: Clear
   * 80x: Cloudy (Clouds)
   */
  public static mapCondition(id?: number, main?: string): string {
    if (typeof id === 'number') {
      if (id >= 200 && id < 300) return 'Stormy';
      if (id >= 300 && id < 600) return 'Rainy';
      if (id >= 600 && id < 700) return 'Snowy';
      if (id >= 700 && id < 800) {
        if (id === 771 || id === 781) return 'Windy';
        return 'Foggy';
      }
      if (id === 800) return 'Clear';
      if (id > 800 && id < 900) return 'Cloudy';
    }

    const normalized = (main ?? '').trim().toLowerCase();
    if (normalized.includes('thunder') || normalized.includes('storm')) return 'Stormy';
    if (normalized.includes('rain') || normalized.includes('drizzle')) return 'Rainy';
    if (normalized.includes('snow')) return 'Snowy';
    if (normalized.includes('cloud')) return 'Cloudy';
    if (normalized.includes('fog') || normalized.includes('mist') || normalized.includes('haze')) return 'Foggy';
    if (normalized.includes('clear') || normalized.includes('sun')) return 'Clear';
    return 'Clear';
  }

  public async getCurrentWeather(
    latitude: number,
    longitude: number
  ): Promise<IWeatherSnapshot> {
    const cacheKey = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
    const now = Date.now();
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      return cached.snapshot;
    }

    const apiKey = this.config.apiKey?.trim();

    // Dev / mock fallback mode when no key or sample key is configured
    if (!apiKey || apiKey === 'sample-api-key') {
      const fallback: IWeatherSnapshot = {
        condition: 'clear',
        tempCelsius: 22,
        isReliable: false,
        timestamp: now,
      };
      return fallback;
    }

    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const endpoint = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&appid=${apiKey}`;
      const response = await this.fetchFn(endpoint, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutTimer);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const rawMessage = (errorBody as { message?: string })?.message ?? 'API error';
        return {
          condition: 'clear',
          tempCelsius: 22,
          isReliable: false,
          timestamp: now,
          error: `OpenWeather HTTP ${response.status}: ${rawMessage}`,
        };
      }

      const data = (await response.json()) as {
        weather?: Array<{ id?: number; main?: string; description?: string }>;
        main?: { temp?: number };
        name?: string;
      };

      const primaryWeather = data.weather?.[0];
      const condition = OpenWeatherService.mapCondition(
        primaryWeather?.id,
        primaryWeather?.main
      );
      const tempCelsius = Math.round(data.main?.temp ?? 20);
      const city = typeof data.name === 'string' && data.name.trim() ? data.name : undefined;

      const snapshot: IWeatherSnapshot = {
        condition,
        tempCelsius,
        isReliable: true,
        timestamp: now,
        city,
      };

      this.cache.set(cacheKey, {
        snapshot,
        expiresAt: now + this.cacheTtlMs,
      });

      // Cleanup stale cache entries periodically
      if (this.cache.size > 200) {
        for (const [key, item] of this.cache.entries()) {
          if (item.expiresAt <= now) {
            this.cache.delete(key);
          }
        }
      }

      return snapshot;
    } catch (err: unknown) {
      clearTimeout(timeoutTimer);
      const isAbort = (err as Error)?.name === 'AbortError';
      return {
        condition: 'clear',
        tempCelsius: 22,
        isReliable: false,
        timestamp: now,
        error: isAbort
          ? 'OpenWeather API request timed out'
          : 'Weather service network connection failure',
      };
    }
  }

  public getConfig(): IOpenWeatherConfig {
    return this.config;
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public getCacheSize(): number {
    return this.cache.size;
  }
}

