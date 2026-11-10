import { isCatalogId } from '../catalog/catalog-api';
import type { PlayedTrack } from './discovery.types';

/** Existing account-document limit; storage/API fields and journal versions do not change. */
export const HISTORY_LIMIT = 200;
export function historyTrackId(value: unknown): string | null {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) return null;
  // Legacy journals keep their references; UUID case never creates two canonical songs.
  return isCatalogId(value) ? value.toLowerCase() : value;
}
export function normalizeHistory(value: unknown): readonly PlayedTrack[] {
  const byId = new Map<string, PlayedTrack>();
  if (Array.isArray(value)) for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>, trackId = historyTrackId(item.trackId);
    const timestamp = typeof item.playedAt === 'number' ? item.playedAt : typeof item.lastPlayedAt === 'number' ? item.lastPlayedAt : null;
    if (!trackId || timestamp === null || !Number.isSafeInteger(timestamp) || timestamp < 0) continue;
    const previous = byId.get(trackId);
    if (!previous || timestamp > previous.playedAt) byId.set(trackId, { trackId, playedAt: timestamp });
  }
  return [...byId.values()].sort((a,b)=>b.playedAt-a.playedAt).slice(0,HISTORY_LIMIT);
}
export function sameHistory(a: readonly PlayedTrack[], b: readonly PlayedTrack[]): boolean {
  return a === b || (a.length === b.length && a.every((entry,index)=>entry.trackId===b[index]?.trackId && entry.playedAt===b[index]?.playedAt));
}
