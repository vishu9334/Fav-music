import type { CatalogPage, CatalogQuery, CatalogSong } from '@aadat/contracts';
import { CatalogEntry, DemoCatalog, Season } from './demo-catalog';
import { ICatalogRepository } from './catalog-api';
import { CatalogMetadataCache } from './catalog-cache';
import { MOODS, Mood, TimePeriod } from '../discovery/discovery.types';
import { catalogQueryKey } from './catalog-query';
import { RequestQueue } from './request-queue';

export class CatalogClientService {
  private readonly songs = new Map<string, CatalogSong>();
  private readonly pages = new Map<string, { page: CatalogPage; expires: number }>();
  private readonly pending = new Map<string, Promise<CatalogPage>>();
  private readonly requests = new RequestQueue();
  private hydration: Promise<void> | null = null;
  public cacheError: string | null = null;
  public constructor(public readonly repository: ICatalogRepository, private readonly registry: DemoCatalog,
    private readonly cache: CatalogMetadataCache, private readonly now: () => number = Date.now) {}
  public initialize(): Promise<void> {
    if (!this.hydration) this.hydration = this.cache.load().then((songs) => this.register(songs)).catch(() => { this.cacheError = 'Saved catalog metadata could not be read; library IDs remain preserved.'; });
    return this.hydration;
  }
  private register(songs: readonly CatalogSong[]): void {
    for (const song of songs) { this.songs.delete(song.id); this.songs.set(song.id, song); }
    while (this.songs.size > 500) this.songs.delete(this.songs.keys().next().value!);
    const timeMap: Record<string, TimePeriod> = { DAWN: 'Morning', MORNING: 'Morning', AFTERNOON: 'Afternoon', EVENING: 'Evening', LATE_NIGHT: 'Night' };
    const seasonMap: Record<string, Season> = { SPRING: 'Spring', SUMMER: 'Summer', MONSOON: 'Monsoon', AUTUMN: 'Autumn', WINTER: 'Winter' };
    const entries: CatalogEntry[] = songs.map((song) => ({
      track: { id: song.id, title: song.title, artist: song.artistName, album: song.albumName ?? undefined, duration: song.durationSeconds,
        url: '', artwork: this.registry.get(song.id)?.artwork ?? '', catalogSource: 'catalog',sourceLabel:song.sourceLabel,developmentOnly:song.developmentOnly,catalogVideo: song.hasVideo, attribution: song.attribution, releaseYear: song.releaseYear ?? undefined },
      releaseYear: song.releaseYear ?? undefined, moods: song.moods.filter((mood): mood is Mood => (MOODS as readonly string[]).includes(mood)),
      times: song.timeAffinities.flatMap((value) => timeMap[value] ? [timeMap[value]!] : []), seasons: song.seasonAffinities.flatMap((value) => seasonMap[value] ? [seasonMap[value]!] : []),
      weatherAffinities: song.weatherAffinities,
    }));
    this.registry.upsert(entries);
  }
  public async remember(songs:readonly CatalogSong[]):Promise<void>{
    await this.initialize();this.register(songs);
    if(!this.cacheError)try{await this.cache.save([...this.songs.values()]);}catch{this.cacheError='Catalog metadata could not be cached.';}
  }
  public page(query: CatalogQuery, force = false, signal?: AbortSignal): Promise<CatalogPage> {
    const input = { ...query, query: (query.query ?? '').trim(), first: query.first ?? 20 }, key = JSON.stringify([catalogQueryKey(input), input.first, input.after ?? null]);
    const cached = this.pages.get(key); if (!force && cached && cached.expires > this.now()) {
      this.register(cached.page.nodes); this.pages.delete(key); this.pages.set(key, cached); return Promise.resolve(cached.page);
    }
    const current = this.pending.get(key); if (current) return current;
    const request = this.requests.run(async () => {
      await this.initialize(); const page = await this.repository.page(input, signal); this.register(page.nodes);
      this.pages.delete(key); this.pages.set(key, { page, expires: this.now() + 60_000 }); while (this.pages.size > 20) this.pages.delete(this.pages.keys().next().value!);
      if (!this.cacheError) try { await this.cache.save([...this.songs.values()]); } catch { this.cacheError = 'Catalog metadata is available this session but could not be cached.'; }
      return page;
    }, signal).finally(() => this.pending.delete(key)); this.pending.set(key, request); return request;
  }
  public async restore(ids: readonly string[], isCurrent:()=>boolean=()=>true): Promise<void> {
    await this.initialize();
    for (let start = 0; start < Math.min(ids.length, 500); start += 50) {if(!isCurrent())return;const songs=await this.repository.tracks(ids.slice(start,start+50));if(!isCurrent())return;this.register(songs);}
    if (!this.cacheError) try { await this.cache.save([...this.songs.values()]); } catch { this.cacheError = 'Catalog cache could not be saved.'; }
  }
}
