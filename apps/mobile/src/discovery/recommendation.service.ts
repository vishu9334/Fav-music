import { DemoCatalog } from '../catalog/demo-catalog';
import { IPlayableTrack } from '../data/sample-tracks';
import {
  mapWeatherConditionToAffinity,
  Mood,
  PlayedTrack,
  TimePeriod,
  WeatherCondition,
} from './discovery.types';

export interface DiscoveryContext {
  readonly period: TimePeriod | null;
  readonly weather?: WeatherCondition | null;
  readonly mood: Mood | null;
  readonly season: string;
  readonly decade: string;
}

export interface Recommendation {
  readonly track: IPlayableTrack;
  readonly queue: readonly IPlayableTrack[];
  readonly message: string;
  readonly label: string;
}

function deterministicMomentUnit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export class RecommendationService {
  private readonly getRandomUnit: (seed: string) => number;

  public constructor(
    private readonly catalog: DemoCatalog,
    random?: () => number
  ) {
    if (typeof random === 'function') {
      this.getRandomUnit = () => {
        const val = random();
        return Number.isFinite(val) ? Math.max(0, Math.min(0.999999999, val)) : 0;
      };
    } else {
      this.getRandomUnit = (seed: string) => deterministicMomentUnit(seed);
    }
  }

  /**
   * Validates metadata and streaming availability of a track.
   * Discards tracks with missing IDs, blank titles, invalid artists, or zero duration.
   */
  private isValidPlayableTrack(track: IPlayableTrack): boolean {
    if (!track.id || typeof track.id !== 'string') return false;
    if (!track.title || typeof track.title !== 'string' || !track.title.trim()) return false;
    if (!track.artist || typeof track.artist !== 'string' || !track.artist.trim()) return false;
    if (!track.duration || track.duration <= 0) return false;
    if (track.catalogSource === 'catalog' || track.catalogSource === 'local') return true;
    return typeof track.url === 'string' && track.url.trim().length > 0;
  }

  public candidates(context: DiscoveryContext, excludedIds: readonly string[] = []): IPlayableTrack[] {
    const excluded = new Set(excludedIds);
    return this.catalog
      .search({ mood: context.mood ?? '', season: context.season, decade: context.decade })
      .filter((track) => !excluded.has(track.id) && this.isValidPlayableTrack(track))
      .sort((a, b) => this.affinity(b.id, context) - this.affinity(a.id, context));
  }

  /**
   * Deterministic affinity scoring:
   * Considers current local time period (+10) and actual weather (+8) only when reliable.
   * If weather is unavailable, gracefully relies purely on time without inventing weather.
   */
  public affinity(id: string, context: DiscoveryContext): number {
    const meta = this.catalog.metadata(id);
    let score = 0;

    // Time affinity
    if (context.period && meta?.times?.includes(context.period)) {
      score += 10;
    }

    // Weather affinity: only when reliable weather data is provided
    if (context.weather && meta?.weatherAffinities && meta.weatherAffinities.length > 0) {
      const targetAffinity = mapWeatherConditionToAffinity(context.weather);
      if (meta.weatherAffinities.includes(targetAffinity)) {
        score += 8;
      }
    }

    return score;
  }

  /**
   * Deterministic, non-AI recommendation selection.
   * Avoids repeatedly selecting recently played songs, penalizes currently playing track,
   * and prioritizes time-affine and weather-affine music.
   */
  public choose(
    context: DiscoveryContext,
    history: readonly PlayedTrack[],
    currentId?: string,
    excludedIds: readonly string[] = []
  ): Recommendation | null {
    const candidates = this.candidates(context, excludedIds);
    if (!candidates.length) return null; // Never silently escape an explicit user filter.

    const alternatives = candidates.filter((track) => track.id !== currentId);
    const available = alternatives.length ? alternatives : candidates;

    // Recency tracking (anti-repetition)
    const recent = [...new Set(history.slice(0, 20).map((entry) => entry.trackId))];
    const unseen = available.filter((track) => !recent.includes(track.id));

    let pool = unseen;
    if (!pool.length) {
      // If all candidates were played recently, pick the least-recently played
      const oldest = Math.max(...available.map((track) => recent.indexOf(track.id)));
      pool = available.filter((track) => recent.indexOf(track.id) === oldest);
    }

    // Filter by highest affinity within the candidate pool
    const maxAffinity = Math.max(0, ...pool.map((track) => this.affinity(track.id, context)));
    if (maxAffinity > 0) {
      pool = pool.filter((track) => this.affinity(track.id, context) === maxAffinity);
    }

    // Deterministic selection from the top affinity pool
    const seed = `${context.period ?? 'AnyTime'}:${context.weather ?? 'NoWeather'}:${history[0]?.trackId ?? 'Start'}`;
    const unit = this.getRandomUnit(seed);
    const track = pool[Math.floor(unit * pool.length)]!;

    const repeated = recent.includes(track.id) || track.id === currentId;
    const label = [
      'Discovery',
      context.mood ?? context.period ?? 'Demo mix',
      context.weather ?? '',
      context.season,
      context.decade,
    ]
      .filter(Boolean)
      .join(' · ');

    const noun = track.catalogSource === 'catalog' ? 'track' : 'demo';
    const message = [
      repeated
        ? `The matching ${noun} pool is small; using the least-recent available choice.`
        : `Choosing a ${noun} outside your recent plays.`,
      context.period && !this.affinity(track.id, context)
        ? this.catalog.metadata(track.id)?.times?.length
          ? 'Using another time affinity within your selected filters.'
          : `This ${noun} has no time tags; your other filters are preserved.`
        : '',
      candidates.length === 1 ? `Only one ${noun} matches these filters.` : '',
    ]
      .filter(Boolean)
      .join(' ');

    const remaining = candidates
      .filter((item) => item.id !== track.id)
      .sort((a, b) => {
        if (a.id === currentId) return 1;
        if (b.id === currentId) return -1;
        const first = recent.indexOf(a.id);
        const second = recent.indexOf(b.id);
        if (first < 0 && second >= 0) return -1;
        if (second < 0 && first >= 0) return 1;
        return second - first || this.affinity(b.id, context) - this.affinity(a.id, context);
      });

    return { track, queue: [track, ...remaining], label, message };
  }
}
