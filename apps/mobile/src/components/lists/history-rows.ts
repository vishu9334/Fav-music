import type { PlayedTrack } from '../../discovery/discovery.types';
import { normalizeHistory } from '../../discovery/history-normalization';
/** Identity belongs to the canonical song, never its timestamp or current row position. */
export function historyRows(history:readonly PlayedTrack[]):readonly (PlayedTrack&{key:string})[]{
  return normalizeHistory(history).map(entry=>({...entry,key:entry.trackId}));
}
