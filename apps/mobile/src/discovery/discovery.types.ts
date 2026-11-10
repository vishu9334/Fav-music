export const TIME_PERIODS = ['Morning', 'Afternoon', 'Evening', 'Night'] as const;
export type TimePeriod = typeof TIME_PERIODS[number];
export const MOODS = ['Calm', 'Focus', 'Happy', 'Energy', 'Reflective'] as const;
export type Mood = typeof MOODS[number];
export const WEATHER_CONDITIONS = ['Sunny', 'Rainy', 'Cloudy', 'Stormy', 'Cold'] as const;
export type WeatherCondition = typeof WEATHER_CONDITIONS[number];

export interface WeatherSnapshot {
  readonly condition: WeatherCondition;
  readonly isReliable: boolean;
  readonly timestamp: number;
  readonly tempCelsius?: number | null;
  readonly city?: string;
  readonly coords?: { latitude: number; longitude: number } | null;
}

export function mapWeatherConditionToAffinity(weather: WeatherCondition): string {
  switch (weather) {
    case 'Sunny':
      return 'CLEAR_SUNNY';
    case 'Rainy':
      return 'RAINY';
    case 'Cloudy':
      return 'CLOUDY';
    case 'Stormy':
      return 'STORMY';
    case 'Cold':
      return 'SNOW_COLD';
  }
}

export function normalizeWeatherCondition(raw: string): WeatherCondition | null {
  const normalized = (raw ?? '').trim().toLowerCase();
  if (normalized.includes('thunder') || normalized.includes('storm')) return 'Stormy';
  if (normalized.includes('rain') || normalized.includes('drizzle')) return 'Rainy';
  if (normalized.includes('snow') || normalized.includes('cold')) return 'Cold';
  if (
    normalized.includes('cloud') ||
    normalized.includes('overcast') ||
    normalized.includes('fog') ||
    normalized.includes('mist') ||
    normalized.includes('haze')
  ) {
    return 'Cloudy';
  }
  if (normalized.includes('clear') || normalized.includes('sun')) return 'Sunny';
  return null;
}

export interface PlayedTrack { readonly trackId: string; readonly playedAt: number }
export interface ListeningHistory { readonly version: 1; readonly entries: readonly PlayedTrack[] }
export interface IHistoryRepository { load(): Promise<unknown | null>; save(data: ListeningHistory): Promise<void | ListeningHistory> }

export function localTimePeriod(date: Date): TimePeriod | null {
  const hour = date.getHours();
  if (!Number.isFinite(hour)) return null;
  if (hour >= 5 && hour < 12) return 'Morning';
  if (hour >= 12 && hour < 17) return 'Afternoon';
  if (hour >= 17 && hour < 21) return 'Evening';
  return 'Night';
}
