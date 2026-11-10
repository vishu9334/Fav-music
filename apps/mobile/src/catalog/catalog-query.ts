import type { CatalogQuery } from '@aadat/contracts';
export function catalogQuery(filter: { query?: string; mood?: string | null; season?: string; decade?: string }): CatalogQuery {
  const rawDecade = filter.decade ?? '';
  const decade = rawDecade.replace(/-/g, '–').trim();
  let range: readonly number[] = decade === '90s' ? [1990, 1999] : decade === '2000–2010' ? [2000, 2010] : decade === '2011–2020' ? [2011, 2020] : decade === '2021 onwards' ? [2021, 9999] : [];
  if (/^\d{3}0s$/.test(decade)) { const year = Number(decade.slice(0, 4)); range = [year, year + 9]; }
  return { query: filter.query?.trim() ?? '', mood: filter.mood || undefined, season: filter.season ? filter.season.toUpperCase() : undefined,
    undated: decade === 'Undated' || undefined, yearFrom: range[0], yearTo: range[1] };
}
export function catalogQueryKey(query: CatalogQuery): string {
  return JSON.stringify([(query.query ?? '').trim(), query.mood ?? '', query.season ?? '', query.yearFrom ?? null, query.yearTo ?? null, !!query.undated,query.hasVideo??null]);
}
