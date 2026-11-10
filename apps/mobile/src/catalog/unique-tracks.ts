import type { IPlayableTrack } from '../data/sample-tracks';

export const musicText = (value: string): string => value.normalize('NFKC').toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Keep the first recording, even when the provider gives it multiple IDs. */
export function uniqueTracks(tracks: readonly IPlayableTrack[]): readonly IPlayableTrack[] {
  const ids = new Set<string>(), recordings = new Set<string>();
  const unique = tracks.filter(track => {
    const recording = JSON.stringify([musicText(track.title), musicText(track.artist)]);
    if (ids.has(track.id) || recordings.has(recording)) return false;
    ids.add(track.id); recordings.add(recording); return true;
  });
  return unique.length === tracks.length ? tracks : unique;
}
