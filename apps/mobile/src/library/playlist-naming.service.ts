import { DemoCatalog } from '../catalog/demo-catalog';

/** Small, deterministic metadata rules. A suggestion is never applied automatically. */
export class PlaylistNamingService {
  public constructor(private readonly catalog: DemoCatalog) {}
  public availableName(name: string, existingNames: readonly string[]): string {
    const base = name.trim().replace(/\s+/g, ' ').slice(0, 60) || 'My next mix';
    const used = new Set(existingNames.map((item) => item.trim().toLocaleLowerCase()));
    let candidate = base, suffix = 1;
    while (used.has(candidate.toLocaleLowerCase())) {
      const ending = ` ${++suffix}`; candidate = base.slice(0, 60 - ending.length) + ending;
    }
    return candidate;
  }
  public suggestions(ids: readonly string[], existingNames: readonly string[]): string[] {
    const tracks = this.catalog.tracks(ids);
    const artist = tracks[0]?.artist, album = tracks[0]?.album;
    const bases = [
      ...(artist && tracks.every((t) => t.artist === artist) ? [`${artist} Essentials`] : []),
      ...(album && tracks.every((t) => t.album === album) ? [`${album} Mix`] : []),
      ...(tracks.length ? ['The demo edit', 'On repeat'] : ['My next mix', 'Quiet moments', 'On repeat']),
    ];
    const used = new Set(existingNames.map((name) => name.trim().toLocaleLowerCase()));
    return [...new Set(bases)].slice(0, 3).map((base) => {
      const candidate = this.availableName(base, [...used]);
      used.add(candidate.toLocaleLowerCase()); return candidate;
    });
  }
}
