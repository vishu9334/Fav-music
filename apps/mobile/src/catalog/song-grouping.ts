import type { IPlayableTrack } from '../data/sample-tracks';

export interface ISongGroup {
  readonly id: string;
  readonly baseTitle: string;
  readonly primaryTrack: IPlayableTrack;
  readonly versions: readonly IPlayableTrack[];
  readonly versionCount: number;
}

/**
 * Normalizes song titles by stripping parentheses, brackets and dash suffixes (e.g. "(Remix)", "(From 'KING')", "- Hard Rock", etc.)
 */
export function normalizeSongTitle(title: string): string {
  const cleaned = title
    .replace(/\s*[\(\[].*?[\)\]]/gi, '')
    .replace(/\s*-\s*.*$/gi, '')
    .trim();
  return cleaned || title.trim();
}

/**
 * Groups tracks that share the same normalized title and primary artist into canonical groups.
 */
export function groupTracksByVersion(tracks: readonly IPlayableTrack[]): readonly ISongGroup[] {
  const groups = new Map<string, IPlayableTrack[]>();
  for (const track of tracks) {
    const norm = normalizeSongTitle(track.title).toLowerCase();
    const key = norm || track.id;
    const list = groups.get(key) ?? [];
    list.push(track);
    groups.set(key, list);
  }

  const result: ISongGroup[] = [];
  for (const [, versions] of groups) {
    const base = normalizeSongTitle(versions[0]!.title) || versions[0]!.title;
    // Primary track is either exact match to base title, or the first track
    const exact = versions.find((t) => t.title.trim().toLowerCase() === base.toLowerCase());
    const primary = exact ?? versions[0]!;
    result.push({
      id: primary.id,
      baseTitle: base,
      primaryTrack: primary,
      versions,
      versionCount: versions.length,
    });
  }
  return result;
}

/**
 * Unlists duplicate and alternate versions of tracks so only 1 single main track is listed for each song.
 */
export function unlistDuplicateVersions(tracks: readonly IPlayableTrack[]): readonly IPlayableTrack[] {
  const groups = groupTracksByVersion(tracks);
  return groups.map((g) => g.primaryTrack);
}

