import { Season } from '../catalog/demo-catalog';
import { TimePeriod, WeatherCondition } from './discovery.types';

export interface ISolarCoordinates {
  readonly latitude: number;
  readonly longitude: number;
}

export interface MomentInfo {
  readonly isDay: boolean;
  readonly dayOrNight: 'Day' | 'Night';
  readonly solarAltitude: number;
  readonly timePeriod: TimePeriod;
  readonly season: Season;
  readonly weather: WeatherCondition | null;
  readonly title: string;
  readonly subtitle: string;
  readonly playButtonLabel: string;
  readonly badgeLabel: string;
}

/**
 * Standard NOAA solar position algorithm.
 * Computes solar elevation angle (degrees above/below horizon) from latitude, longitude, and date.
 * -0.833° accounts for standard atmospheric refraction and solar disc diameter at sunrise/sunset.
 */
export function calculateSolarAltitude(
  latitude: number,
  longitude: number,
  date: Date = new Date()
): number {
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;

  const startOfYear = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const diffMs = date.getTime() - startOfYear.getTime();
  const dayOfYear = Math.floor(diffMs / 86400000) + 1;

  const utcHours =
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (utcHours - 12) / 24);

  // Equation of time in minutes
  const eqtime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  // Solar declination in radians
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  // True solar time in minutes
  const timeOffset = eqtime + 4 * longitude;
  const tst = ((utcHours * 60 + timeOffset) % 1440 + 1440) % 1440;
  const hourAngle = (tst / 4 - 180) * rad;

  const latRad = latitude * rad;
  const sinAltitude =
    Math.sin(latRad) * Math.sin(decl) +
    Math.cos(latRad) * Math.cos(decl) * Math.cos(hourAngle);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAltitude))) * deg;

  return Math.round(altitude * 10) / 10;
}

/**
 * Returns 'Day' or 'Night' based on solar altitude when coordinates are available,
 * or device local hour as a resilient fallback.
 */
export function detectDayOrNight(
  coords: ISolarCoordinates | null,
  date: Date = new Date()
): 'Day' | 'Night' {
  if (coords && Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude)) {
    const altitude = calculateSolarAltitude(coords.latitude, coords.longitude, date);
    return altitude > -0.833 ? 'Day' : 'Night';
  }
  const hour = date.getHours();
  return hour >= 6 && hour < 18 ? 'Day' : 'Night';
}

/**
 * Detects current season based on date and latitude (Northern vs Southern hemisphere).
 * India (Bollywood) calendar seasons:
 * - March - April: Spring (Basant)
 * - May - June: Summer (Garmi)
 * - July - September: Monsoon (Barish / Sawan)
 * - October - November: Autumn (Sharad / Hemant)
 * - December - February: Winter (Sardi)
 */
export function detectSeason(date: Date = new Date(), latitude = 20): Season {
  let month = date.getMonth(); // 0 = Jan, 11 = Dec

  // Invert for southern hemisphere
  if (latitude < 0) {
    month = (month + 6) % 12;
  }

  switch (month) {
    case 2: // March
    case 3: // April
      return 'Spring';
    case 4: // May
    case 5: // June
      return 'Summer';
    case 6: // July
    case 7: // August
    case 8: // September
      return 'Monsoon';
    case 9: // October
    case 10: // November
      return 'Autumn';
    case 11: // December
    case 0: // January
    case 1: // February
    default:
      return 'Winter';
  }
}

/**
 * Determines the time period (Morning, Afternoon, Evening, Night)
 * using local solar/clock progression.
 */
export function detectTimePeriod(
  _coords: ISolarCoordinates | null = null,
  date: Date = new Date()
): TimePeriod {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'Morning';
  if (hour >= 12 && hour < 17) return 'Afternoon';
  if (hour >= 17 && hour < 21) return 'Evening';
  return 'Night';
}

/**
 * Resolves default coordinates from device timezone if GPS has not yet delivered coordinates.
 */
export function resolveCoordinatesFromTimezone(): ISolarCoordinates {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz.includes('Kolkata') || tz.includes('Calcutta') || tz.includes('India')) {
      return { latitude: 28.6139, longitude: 77.209 }; // New Delhi, India
    }
    if (tz.includes('Dubai') || tz.includes('Muscat')) {
      return { latitude: 25.2048, longitude: 55.2708 };
    }
    if (tz.includes('New_York') || tz.includes('Toronto')) {
      return { latitude: 40.7128, longitude: -74.006 };
    }
    if (tz.includes('London')) {
      return { latitude: 51.5074, longitude: -0.1278 };
    }
  } catch {
    // ignore
  }
  return { latitude: 28.6139, longitude: 77.209 }; // Default Bollywood anchor: India
}

/**
 * Constructs rich contextual titles, badges, and button labels tailored to
 * the exact live moment (Day/Night, Season, Weather, Solar Altitude).
 */
export function buildMomentInfo(
  coords: ISolarCoordinates | null,
  weather: WeatherCondition | null,
  date: Date = new Date()
): MomentInfo {
  const resolvedCoords = coords ?? resolveCoordinatesFromTimezone();
  const solarAltitude = calculateSolarAltitude(
    resolvedCoords.latitude,
    resolvedCoords.longitude,
    date
  );
  const isDay = solarAltitude > -0.833;
  const dayOrNight: 'Day' | 'Night' = isDay ? 'Day' : 'Night';
  const timePeriod = detectTimePeriod(resolvedCoords, date);
  const season = detectSeason(date, resolvedCoords.latitude);

  // Weather takes priority if rainy/stormy
  const isRain = weather === 'Rainy' || weather === 'Stormy';
  const isCold = weather === 'Cold';

  let title = 'Bollywood for you';
  let subtitle = 'Curated Bollywood melodies for your moment';
  let playButtonLabel = 'Play Bollywood';

  if (isRain) {
    title = 'Rimjhim Barish · Monsoon Magic';
    subtitle = `🌧️ Rain detected · Soulful & romantic rain melodies (${season})`;
    playButtonLabel = 'Play Rainy Bollywood';
  } else if (isCold) {
    title = 'Sardi ki Shaam · Winter Melodies';
    subtitle = `❄️ Winter chill detected · Cozy & soulful Bollywood acoustic (${season})`;
    playButtonLabel = 'Play Winter Bollywood';
  } else if (!isDay || timePeriod === 'Night') {
    title = 'Raat ke Geet · Bollywood Unplugged';
    subtitle = `🌙 Night (${solarAltitude}° solar altitude) · Late-night chill & acoustic ${season}`;
    playButtonLabel = 'Play Night Bollywood';
  } else if (timePeriod === 'Morning') {
    title = 'Subah ki Shuruat · Morning Acoustic';
    subtitle = `☀️ Morning (${solarAltitude}° solar altitude) · Fresh & uplifting Bollywood start`;
    playButtonLabel = 'Play Morning Bollywood';
  } else if (timePeriod === 'Afternoon') {
    title = 'Dopahar ke Gaane · Bollywood Energy';
    subtitle = `☀️ Afternoon · High-energy & vibrant Bollywood hits`;
    playButtonLabel = 'Play Afternoon Bollywood';
  } else if (timePeriod === 'Evening') {
    title = 'Shaam ke Sur · Golden Hour';
    subtitle = `🌇 Sunset & Golden Hour · Soulful evening romantic melodies`;
    playButtonLabel = 'Play Evening Bollywood';
  }

  const badgeParts = [
    isDay ? '☀️ Day' : '🌙 Night',
    weather ? `${weather === 'Rainy' ? '🌧️' : weather === 'Sunny' ? '☀️' : weather === 'Cold' ? '❄️' : '⛅'} ${weather}` : null,
    `${season === 'Monsoon' ? '🌧️' : season === 'Winter' ? '❄️' : season === 'Summer' ? '☀️' : season === 'Spring' ? '🌸' : '🍂'} ${season}`,
  ].filter(Boolean);

  const badgeLabel = badgeParts.join(' · ');

  return {
    isDay,
    dayOrNight,
    solarAltitude,
    timePeriod,
    season,
    weather,
    title,
    subtitle,
    playButtonLabel,
    badgeLabel,
  };
}
