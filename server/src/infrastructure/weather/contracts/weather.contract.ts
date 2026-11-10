export interface IWeatherSnapshot {
  readonly condition: string; // e.g. "Clear", "Rainy", "Cloudy", "Stormy", "Snowy", "Foggy"
  readonly tempCelsius: number;
  readonly isReliable: boolean;
  readonly timestamp: number;
  readonly city?: string;
  readonly error?: string;
}

/**
 * Weather Service Contract (for Contextual Smart Shuffle)
 */
export interface IWeatherService {
  getCurrentWeather(latitude: number, longitude: number): Promise<IWeatherSnapshot>;
}

