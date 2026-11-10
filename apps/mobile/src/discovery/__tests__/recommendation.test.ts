import { seedDemoFixture } from '../../catalog/__tests__/demo-fixture';
import { describe, expect, it } from 'vitest';
import { DECADES, DemoCatalog, demoCatalog, matchesDecade } from '../../catalog/demo-catalog';
import { SAMPLE_TRACKS } from '../../data/sample-tracks';
import { localTimePeriod } from '../discovery.types';
import { DiscoveryContext, RecommendationService } from '../recommendation.service';

const context: DiscoveryContext = { period: 'Morning', mood: null, season: '', decade: '' };
const history = (...ids: string[]) => ids.map((trackId, index) => ({ trackId, playedAt: 1000 - index }));
describe('Local time and exact release-year ranges', () => {
  it.each([[0, 'Night'], [4, 'Night'], [5, 'Morning'], [11, 'Morning'], [12, 'Afternoon'], [16, 'Afternoon'], [17, 'Evening'], [20, 'Evening'], [21, 'Night'], [23, 'Night']] as const)('maps local hour %i to %s', (hour, expected) => {
    expect(localTimePeriod(new Date(2026, 10, 6, hour, 59))).toBe(expected);
  });
  it('uses local date accessors and tolerates an unavailable clock', () => {
    const date = new Date(2026, 10, 6, 7); date.getUTCHours = () => 22;
    expect(localTimePeriod(date)).toBe('Morning'); expect(localTimePeriod(new Date(NaN))).toBeNull();
  });
  it.each([[1989, []], [1990, ['90s']], [1999, ['90s']], [2000, ['2000–2010']], [2010, ['2000–2010']],
    [2011, ['2011–2020']], [2020, ['2011–2020']], [2021, ['2021 onwards']], [2026, ['2021 onwards']],
    [undefined, ['Undated']], [NaN, ['Undated']], [2010.5, ['Undated']], [-1, ['Undated']]] as const)('assigns year %s without overlapping ranges', (year, expected) => {
      expect(DECADES.filter((value) => matchesDecade(year, value))).toEqual(expected);
    });
  it('keeps legacy decade filters compatible and never dates the actual demos', () => {
    expect(matchesDecade(2010, '2010s')).toBe(true); expect(matchesDecade(2010, '2000s')).toBe(false);
    expect(demoCatalog.search({ decade: 'Undated' })).toEqual(SAMPLE_TRACKS);
    for (const value of DECADES.filter((value) => value !== 'Undated')) expect(demoCatalog.search({ decade: value })).toEqual([]);
  });
});

describe('Rule-based demo discovery with repeat avoidance', () => {
  const service = new RecommendationService(demoCatalog, () => 0);
  it('selects a time-affine demo and creates a duplicate-free queue with the selection first', () => {
    const choice = service.choose(context, []);
    expect(choice?.track.id).toBe('sample-track-1'); expect(choice?.queue[0]).toEqual(choice?.track);
    expect(new Set(choice?.queue.map((t) => t.id)).size).toBe(3);
    expect(service.choose({ ...context, period: 'Evening' }, [])?.track.id).toBe('sample-track-3');
  });
  it('uses randomness among equally suitable, fresh candidates', () => {
    expect(new RecommendationService(demoCatalog, () => 0.99).choose(context, [])?.track.id).toBe('sample-track-2');
  });
  it('honors mood/season/year intersections and reports an empty pool without falling through filters', () => {
    expect(service.candidates({ ...context, mood: 'Calm', season: 'Winter', decade: 'Undated' }).map((t) => t.id)).toEqual(['sample-track-1', 'sample-track-3']);
    expect(service.choose({ ...context, mood: 'Energy', season: 'Winter' }, [])).toBeNull();
    expect(service.choose({ ...context, decade: '2011–2020' }, [])).toBeNull();
  });
  it('avoids current and recently played tracks even if another time affinity is needed', () => {
    const choice = service.choose(context, history('sample-track-2', 'sample-track-1'), 'sample-track-2');
    expect(choice?.track.id).toBe('sample-track-3'); expect(choice?.message).toContain('another time affinity');
    expect(choice?.queue.at(-1)?.id).toBe('sample-track-2');
  });
  it('uses the least-recent candidate when all matching demos have been heard', () => {
    expect(service.choose(context, history('sample-track-2', 'sample-track-1', 'sample-track-3'), 'sample-track-2')?.track.id).toBe('sample-track-3');
    expect(service.choose({ ...context, mood: 'Focus' }, history('sample-track-1'), 'sample-track-1')?.message).toContain('Only one demo');
  });
  it('excludes removed/hidden tracks from both selection and the resulting queue', () => {
    const choice = service.choose(context, [], undefined, ['sample-track-1', 'sample-track-2']);
    expect(choice?.queue.map((t) => t.id)).toEqual(['sample-track-3']);
    expect(service.choose(context, [], undefined, SAMPLE_TRACKS.map((t) => t.id))).toBeNull();
  });
  it('handles an empty catalog, missing affinity tags and invalid random values safely', () => {
    expect(new RecommendationService(new DemoCatalog([])).choose(context, [])).toBeNull();
    const sparse = new DemoCatalog([{ track: SAMPLE_TRACKS[0]!, seasons: [] }]);
    expect(new RecommendationService(sparse, () => NaN).choose(context, [])?.track.id).toBe('sample-track-1');
    expect(new RecommendationService(sparse).choose({ ...context, mood: 'Calm' }, [])).toBeNull();
  });
});

seedDemoFixture();
