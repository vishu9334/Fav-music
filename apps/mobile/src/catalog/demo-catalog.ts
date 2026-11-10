import { SAMPLE_TRACKS, type IPlayableTrack } from '../data/sample-tracks';
import type { Mood, TimePeriod } from '../discovery/discovery.types';

export const DECADES = ['90s', '2000–2010', '2011–2020', '2021 onwards', 'Undated'] as const;
export const LEGACY_DECADES = ['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'] as const;
export function isDecade(value: string): boolean {
  const norm = value.replace(/-/g, '–').trim();
  return [...DECADES, ...LEGACY_DECADES].some((item) => item === norm || item.toLowerCase() === norm.toLowerCase());
}
export function matchesDecade(year: number | undefined, value: string): boolean {
  const normValue = value.replace(/-/g, '–').trim().toLowerCase();
  const known = year !== undefined && Number.isInteger(year) && year > 0 && year <= 9999;
  if (normValue === 'undated') return !known;
  if (!known) return false;
  if (normValue === '90s' || normValue === '1990s') return year! >= 1990 && year! <= 1999;
  if (normValue === '2000–2010') return year! >= 2000 && year! <= 2010;
  if (normValue === '2011–2020') return year! >= 2011 && year! <= 2020;
  if (normValue === '2021 onwards' || normValue === '2021+') return year! >= 2021;
  return LEGACY_DECADES.some((item) => item.toLowerCase() === normValue) && `${Math.floor(year! / 10) * 10}s` === normValue;
}
export const SEASONS = ['Spring', 'Summer', 'Monsoon', 'Autumn', 'Winter'] as const;
export type Season = typeof SEASONS[number];
export interface CatalogEntry {
  readonly track: IPlayableTrack;
  readonly releaseYear?: number;
  readonly seasons: readonly Season[];
  readonly moods?: readonly Mood[];
  readonly times?: readonly TimePeriod[];
  readonly weatherAffinities?: readonly string[];
  readonly searchText?: string;
}
export interface CatalogFilter { readonly query?: string; readonly decade?: string; readonly season?: string; readonly mood?: string }

export const DEFAULT_DEMO_ENTRIES: readonly CatalogEntry[] = SAMPLE_TRACKS.map((track, index) => ({
  track,
  seasons: ([['Spring', 'Winter'], ['Summer', 'Autumn'], ['Monsoon', 'Winter']] as const)[index] ?? [],
  moods: ([['Calm', 'Focus'], ['Happy', 'Energy'], ['Calm', 'Reflective']] as const)[index] ?? [],
  times: ([['Morning', 'Night'], ['Morning', 'Afternoon'], ['Evening', 'Night']] as const)[index] ?? [],
  weatherAffinities: ([['CLEAR_SUNNY'], ['CLOUDY', 'RAINY'], ['RAINY', 'STORMY']] as const)[index] ?? [],
}));

export class DemoCatalog {
  private readonly byId: Map<string, CatalogEntry>;
  public constructor(private entries: readonly CatalogEntry[] = DEFAULT_DEMO_ENTRIES) {
    this.byId = new Map(entries.map((entry) => [entry.track.id, {
      ...entry,
      searchText: `${entry.track.title} ${entry.track.artist} ${entry.track.album ?? ''}`.normalize('NFKC').toLocaleLowerCase(),
    }]));
  }
  private readonly listeners = new Set<() => void>();
  public subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  public upsert(entries: readonly CatalogEntry[]): void {
    let changed = false;
    const equalList = (a: readonly string[] | undefined, b: readonly string[] | undefined) => (a?.length ?? 0) === (b?.length ?? 0) && (a ?? []).every((value, i) => value === b?.[i]);
    for (const entry of entries) {
      const prior = this.byId.get(entry.track.id);
      if (prior && prior.releaseYear === entry.releaseYear && equalList(prior.seasons, entry.seasons) && equalList(prior.moods, entry.moods) && equalList(prior.times, entry.times) && equalList(prior.weatherAffinities, entry.weatherAffinities)
        && Object.keys(prior.track).length === Object.keys(entry.track).length && Object.keys(entry.track).every(key => prior.track[key] === entry.track[key])) continue;
      // Precompute normalized search text to accelerate search
      const searchText = `${entry.track.title} ${entry.track.artist} ${entry.track.album ?? ''}`.normalize('NFKC').toLocaleLowerCase();
      this.byId.set(entry.track.id, { ...entry, searchText }); changed = true;
    }
    if (!changed) return;
    const remote = [...this.byId.values()].filter((entry) => entry.track.catalogSource === 'catalog');
    for (const entry of remote.slice(0, Math.max(0, remote.length - 500))) this.byId.delete(entry.track.id);
    this.entries = [...this.byId.values()]; for (const listener of this.listeners) listener();
  }
  public has(id: string): boolean { return this.byId.has(id); }
  public get(id: string): IPlayableTrack | undefined { return this.byId.get(id)?.track; }
  public metadata(id: string): CatalogEntry | undefined { return this.byId.get(id); }
  public tracks(ids?: readonly string[]): IPlayableTrack[] {
    return ids ? [...new Set(ids)].flatMap((id) => this.get(id) ? [this.get(id)!] : []) : this.entries.filter((entry) => entry.track.catalogSource !== 'local').map((e) => e.track);
  }
  public search(filter: CatalogFilter = {}): IPlayableTrack[] {
    const rawQuery = (filter.query ?? '').normalize('NFKC').trim().toLocaleLowerCase();
    const terms = rawQuery.split(/\s+/).filter(Boolean);
    const filterSeason = filter.season?.trim().toLowerCase();
    const filterMood = filter.mood?.trim().toLowerCase();
    return this.entries.filter((entry) => {
      if (entry.track.catalogSource === 'local') return false;
      const text = entry.searchText ?? `${entry.track.title} ${entry.track.artist} ${entry.track.album ?? ''}`.normalize('NFKC').toLocaleLowerCase();
      const meta = this.byId.get(entry.track.id);
      const moods = meta?.moods ?? entry.moods ?? [];
      const seasons = meta?.seasons ?? entry.seasons ?? [];
      return terms.every((term) => text.includes(term))
        && (!filter.decade || matchesDecade(entry.releaseYear ?? meta?.releaseYear, filter.decade))
        && (!filterSeason || seasons.some((season) => season.toLowerCase() === filterSeason))
        && (!filterMood || moods.some((mood) => mood.toLowerCase() === filterMood));
    }).map(({ track }) => track);
  }
}
export const demoCatalog = new DemoCatalog();
