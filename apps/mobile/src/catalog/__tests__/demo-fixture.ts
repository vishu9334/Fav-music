import { SAMPLE_TRACKS } from '../../data/sample-tracks';
import { demoCatalog, type CatalogEntry } from '../demo-catalog';
// These are demo mood collections. Release years are unknown, so none are invented.
export const DEMO_ENTRIES: readonly CatalogEntry[] = SAMPLE_TRACKS.map((track, index) => ({
  track, seasons: ([['Spring', 'Winter'], ['Summer', 'Autumn'], ['Monsoon', 'Winter']] as const)[index] ?? [],
  moods: ([['Calm', 'Focus'], ['Happy', 'Energy'], ['Calm', 'Reflective']] as const)[index] ?? [],
  times: ([['Morning', 'Night'], ['Morning', 'Afternoon'], ['Evening', 'Night']] as const)[index] ?? [],
}));


export function seedDemoFixture():void { demoCatalog.upsert(DEMO_ENTRIES); }
