import { describe, expect, it } from 'vitest';
import {
  calculateSolarAltitude,
  detectDayOrNight,
  detectSeason,
  detectTimePeriod,
  buildMomentInfo,
  resolveCoordinatesFromTimezone,
} from '../solar-context';

describe('Solar Context & Moment Engine', () => {
  it('calculates positive solar altitude during midday and negative at midnight', () => {
    // New Delhi noon (12:00 PM IST = 06:30 UTC)
    const midday = new Date('2026-11-09T12:00:00+05:30');
    const noonAlt = calculateSolarAltitude(28.6139, 77.209, midday);
    expect(noonAlt).toBeGreaterThan(35); // Sun is high at noon in Delhi

    // New Delhi midnight (12:00 AM IST)
    const midnight = new Date('2026-11-09T00:00:00+05:30');
    const nightAlt = calculateSolarAltitude(28.6139, 77.209, midnight);
    expect(nightAlt).toBeLessThan(-50); // Sun is deep below horizon
  });

  it('accurately detects Day or Night from coordinates', () => {
    const coords = { latitude: 28.6139, longitude: 77.209 };

    const noon = new Date('2026-11-09T12:30:00+05:30');
    expect(detectDayOrNight(coords, noon)).toBe('Day');

    const midnight = new Date('2026-11-09T23:30:00+05:30');
    expect(detectDayOrNight(coords, midnight)).toBe('Night');
  });

  it('falls back to local hours for Day/Night when coordinates are unavailable', () => {
    const morning = new Date('2026-11-09T09:00:00');
    expect(detectDayOrNight(null, morning)).toBe('Day');

    const night = new Date('2026-11-09T22:00:00');
    expect(detectDayOrNight(null, night)).toBe('Night');
  });

  it('detects Indian seasons based on month', () => {
    // Monsoon (July - Sept)
    expect(detectSeason(new Date('2026-07-15'), 20)).toBe('Monsoon');
    expect(detectSeason(new Date('2026-08-15'), 20)).toBe('Monsoon');

    // Winter (Dec - Feb)
    expect(detectSeason(new Date('2026-12-25'), 20)).toBe('Winter');
    expect(detectSeason(new Date('2026-01-15'), 20)).toBe('Winter');

    // Summer (May - June)
    expect(detectSeason(new Date('2026-05-15'), 20)).toBe('Summer');

    // Spring (March - April)
    expect(detectSeason(new Date('2026-03-20'), 20)).toBe('Spring');

    // Autumn (Oct - Nov)
    expect(detectSeason(new Date('2026-11-09'), 20)).toBe('Autumn');
  });

  it('detects time periods across the day', () => {
    expect(detectTimePeriod(null, new Date('2026-11-09T08:00:00'))).toBe('Morning');
    expect(detectTimePeriod(null, new Date('2026-11-09T14:00:00'))).toBe('Afternoon');
    expect(detectTimePeriod(null, new Date('2026-11-09T19:00:00'))).toBe('Evening');
    expect(detectTimePeriod(null, new Date('2026-11-09T23:00:00'))).toBe('Night');
  });

  it('builds rich contextual titles with dynamic weather and solar elevation', () => {
    const coords = { latitude: 28.6139, longitude: 77.209 };

    // Rain scenario
    const rainyMoment = buildMomentInfo(coords, 'Rainy', new Date('2026-11-09T10:00:00+05:30'));
    expect(rainyMoment.title).toContain('Barish');
    expect(rainyMoment.badgeLabel).toContain('🌧️ Rainy');

    // Night scenario
    const nightMoment = buildMomentInfo(coords, null, new Date('2026-11-09T23:00:00+05:30'));
    expect(nightMoment.isDay).toBe(false);
    expect(nightMoment.dayOrNight).toBe('Night');
    expect(nightMoment.title).toContain('Raat ke Geet');
    expect(nightMoment.badgeLabel).toContain('🌙 Night');

    // Morning scenario
    const morningMoment = buildMomentInfo(coords, 'Sunny', new Date('2026-11-09T08:00:00+05:30'));
    expect(morningMoment.isDay).toBe(true);
    expect(morningMoment.timePeriod).toBe('Morning');
    expect(morningMoment.title).toContain('Subah');
    expect(morningMoment.badgeLabel).toContain('☀️ Day');
  });

  it('resolves timezone coordinates resiliently', () => {
    const coords = resolveCoordinatesFromTimezone();
    expect(Number.isFinite(coords.latitude)).toBe(true);
    expect(Number.isFinite(coords.longitude)).toBe(true);
  });
});

