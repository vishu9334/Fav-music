import { seedDemoFixture } from './demo-fixture';
import { describe, expect, it } from 'vitest';
import { DemoCatalog, demoCatalog } from '../demo-catalog';
import { SAMPLE_TRACKS } from '../../data/sample-tracks';

describe('Demo catalog search and honest categories', () => {
  it('reuses exactly the existing three demo tracks', () => {
    expect(demoCatalog.tracks()).toEqual(SAMPLE_TRACKS);
    expect(demoCatalog.tracks().map((t) => t.url)).toEqual(SAMPLE_TRACKS.map((t) => t.url));
  });
  it('matches title, artist and album with normalized whitespace/case and all query terms', () => {
    expect(demoCatalog.search({ query: '  SOUNDHELIX   ambience  ' }).map((t) => t.id)).toEqual(['sample-track-1']);
    expect(demoCatalog.search({ query: 'kobra collective' }).map((t) => t.id)).toEqual(['sample-track-2']);
    expect(demoCatalog.search({ query: 'Harmonic Horizons' }).map((t) => t.id)).toEqual(['sample-track-3']);
    expect(demoCatalog.search({ query: '   ' })).toHaveLength(3);
    expect(demoCatalog.search({ query: 'no such song' })).toEqual([]);
  });
  it('never invents release years for demos', () => {
    expect(demoCatalog.search({ decade: 'Undated' })).toHaveLength(3);
    expect(demoCatalog.search({ decade: '1990s' })).toEqual([]);
    expect(demoCatalog.search({ decade: '2020s' })).toEqual([]);
  });
  it('correctly filters verified years supplied to a catalog and intersects seasonal/search filters', () => {
    const catalog = new DemoCatalog([
      { track: SAMPLE_TRACKS[0]!, releaseYear: 1999, seasons: ['Winter'] },
      { track: SAMPLE_TRACKS[1]!, releaseYear: 2000, seasons: ['Summer'] },
      { track: SAMPLE_TRACKS[2]!, seasons: ['Winter'] },
    ]);
    expect(catalog.search({ decade: '1990s', season: 'Winter', query: 'ambience' })).toEqual([SAMPLE_TRACKS[0]]);
    expect(catalog.search({ decade: '2000s' })).toEqual([SAMPLE_TRACKS[1]]);
    expect(catalog.search({ decade: 'Undated', season: 'Winter' })).toEqual([SAMPLE_TRACKS[2]]);
    expect(catalog.search({ decade: '1990s', season: 'Summer' })).toEqual([]);
  });
  it('resolves saved IDs in playlist order, deduplicating and dropping unavailable entries', () => {
    expect(demoCatalog.tracks(['sample-track-3', 'removed', 'sample-track-1', 'sample-track-3']))
      .toEqual([SAMPLE_TRACKS[2], SAMPLE_TRACKS[0]]);
    expect(demoCatalog.search({ season: 'Monsoon' }).map((t) => t.id)).toEqual(['sample-track-3']);
  });
});

seedDemoFixture();
