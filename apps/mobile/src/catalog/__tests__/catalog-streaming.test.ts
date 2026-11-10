import {DEMO_ENTRIES} from './demo-fixture';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogMediaKind, CatalogMediaLease, CatalogPage, CatalogSong } from '@aadat/contracts';
import { ICatalogRepository, secureCatalogUrl, validateSong } from '../catalog-api';
import { GraphQLCatalogRepository } from '../graphql-catalog.repository';
import { MediaLeaseService } from '../media-lease.service';
import { CatalogMetadataCache } from '../catalog-cache';
import { CatalogClientService } from '../catalog-client.service';
import { DemoCatalog } from '../demo-catalog';
import { IDocumentStorage, emptyLibrary, LocalLibrary } from '../../library/library.contract';
import { LibraryService } from '../../library/library.service';
import { ShareLinkService } from '../../sharing/share-link.service';
import { RecommendationService } from '../../discovery/recommendation.service';
import { catalogQuery, catalogQueryKey } from '../catalog-query';
import { nativeAudioAssetUri } from '../native-audio-asset';

const ID = '10000000-0000-4000-8000-000000000001', OTHER = '10000000-0000-4000-8000-000000000002';
function song(id = ID): CatalogSong {
  return { id, title: 'Test fixture only', artistName: 'Test artist', albumName: 'Fixture album', durationSeconds: 180,
    releaseYear: 2005, attribution: 'Synthetic test metadata; no production content', hasVideo: true,
    moods: ['Calm'], timeAffinities: ['MORNING'], seasonAffinities: ['WINTER'] };
}
function lease(trackId = ID, kind: CatalogMediaKind = 'AUDIO', seconds = 300, revision = 1): CatalogMediaLease {
  return { trackId, kind, url: `https://media.example.test/fixture?revision=${revision}`, issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: new Date(Date.parse('2026-01-01T00:00:00.000Z') + seconds * 1000).toISOString(), expiresInSeconds: seconds };
}
class MemoryDocuments implements IDocumentStorage {
  public readonly files = new Map<string, string>();
  public async read(name: string): Promise<string | null> { return this.files.get(name) ?? null; }
  public async write(name: string, value: string): Promise<void> { this.files.set(name, value); }
}
function repository(): ICatalogRepository {
  return { page: vi.fn(async () => ({ nodes: [song()], hasNextPage: false, endCursor: null })),
    tracks: vi.fn(async (ids: readonly string[]) => ids.map(song)), media: vi.fn(async (ids: readonly string[], kind: CatalogMediaKind) => ids.map((id) => lease(id, kind))) };
}
function transport(data: unknown) { return vi.fn(async () => ({ ok: true, json: async () => ({ data }) } as Response)); }

describe('Public GraphQL catalog boundaries', () => {
  it.each(['http://api.example.test/graphql', 'https://user:secret@api.example.test/graphql', 'https://api.example.test/graphql?token=secret',
    'https://api.example.test/graphql#fragment', 'file:///graphql'])('rejects insecure or credential-bearing endpoints: %s', async (endpoint) => {
    const fetcher = transport({}); await expect(new GraphQLCatalogRepository(() => endpoint, fetcher).page({})).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('sends no identity or secrets, strips unexpected metadata and preserves signed media queries', async () => {
    const fetcher = transport({ catalogPage: { nodes: [{ ...song(), audioKey: 'private', url: 'private' }], endCursor: null, hasNextPage: false } });
    const repo = new GraphQLCatalogRepository(() => 'https://api.example.test/graphql', fetcher);
    const page = await repo.page({ query: 'Test' }); expect(page.nodes).toEqual([song()]);
    const options = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(options[1]).toMatchObject({ redirect: 'error', cache: 'no-store', headers: { 'Content-Type': 'application/json' } });
    expect(JSON.stringify(options)).not.toMatch(/authorization|password|google|bearer/i);
    expect(secureCatalogUrl('https://media.example.test/file?X-Amz-Signature=abc&size=2')).toContain('?X-Amz-Signature=abc&size=2');
  });
  it('rejects duplicate identities, invalid metadata and mismatched restored IDs', async () => {
    await expect(new GraphQLCatalogRepository(() => 'https://api.example.test/graphql', transport({ catalogPage: { nodes: [song(), song()], endCursor: null, hasNextPage: false } })).page({})).rejects.toThrow('duplicate');
    expect(() => validateSong({ ...song(), durationSeconds: -1 })).toThrow('metadata');
    expect(() => validateSong({ ...song(), releaseYear: 0 })).toThrow('metadata');
    await expect(new GraphQLCatalogRepository(() => 'https://api.example.test/graphql', transport({ t0: song(OTHER) })).tracks([ID])).rejects.toThrow('identity');
  });
  it('restores metadata by variables and accepts explicit unavailable IDs without inventing tracks', async () => {
    const fetcher = transport({ t0: song(), t1: null });
    const result = await new GraphQLCatalogRepository(() => 'https://api.example.test/graphql', fetcher).tracks([ID, OTHER]);
    expect(result).toEqual([song()]);
    const call = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(call[1].body as string).variables).toEqual({ id0: ID, id1: OTHER });
  });
  it.each([
    [lease(), lease()], [{ ...lease(), kind: 'VIDEO' }], [{ ...lease(), url: 'http://media.example.test/file' }],
    [{ ...lease(), expiresInSeconds: 301 }], [{ ...lease(), expiresAt: 'invalid' }], [{ ...lease(), trackId: OTHER }],
  ])('rejects malformed media leases %j', async (...values) => {
    const rows = values; const repo = new GraphQLCatalogRepository(() => 'https://api.example.test/graphql', transport({ catalogMedia: rows }));
    await expect(repo.media([ID], 'AUDIO')).rejects.toThrow();
  });
  it('masks transport errors and never leaks signed URLs through its error', async () => {
    const fetcher = vi.fn(async () => { throw new Error('secret https://media.example.test/signed?token=private'); });
    await expect(new GraphQLCatalogRepository(() => 'https://api.example.test/graphql', fetcher).page({})).rejects.toThrow('music catalog is unavailable');
  });
});

describe('Memory-only media lease lifetime', () => {
  it('coalesces simultaneous requests, caches by kind, renews before expiry and supports forced retry', async () => {
    let now = 0; const repo = repository(), service = new MediaLeaseService(repo, () => now);
    await Promise.all([service.resolve([ID, ID], 'AUDIO'), service.resolve([ID], 'AUDIO')]);
    expect(repo.media).toHaveBeenCalledTimes(1);
    await service.resolve([ID], 'AUDIO'); expect(repo.media).toHaveBeenCalledTimes(1);
    now = 270_000; await service.resolve([ID], 'AUDIO'); expect(repo.media).toHaveBeenCalledTimes(2);
    await service.resolve([ID], 'AUDIO', true); await service.resolve([ID], 'VIDEO'); expect(repo.media).toHaveBeenCalledTimes(4);
  });
  it('rejects missing, foreign, duplicate and near-expired leases without accepting a playable source', async () => {
    for (const leases of [[], [lease(OTHER)], [lease(), lease()], [lease(ID, 'AUDIO', 20)]]) {
      const repo = repository(); repo.media = vi.fn(async () => leases);
      await expect(new MediaLeaseService(repo).resolve([ID], 'AUDIO')).rejects.toThrow();
    }
  });
  it('batches long queues into at most fifty IDs per request', async () => {
    const repo = repository(), ids = Array.from({ length: 101 }, (_, index) => `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
    expect((await new MediaLeaseService(repo).resolve(ids, 'AUDIO')).size).toBe(101);
    expect(vi.mocked(repo.media).mock.calls.map((call) => call[0].length)).toEqual([50, 50, 1]);
  });
});

describe('Catalog metadata cache and discovery integration', () => {
  it('journals public metadata only, recovers the last good revision and preserves corrupt files', async () => {
    const storage = new MemoryDocuments(), cache = new CatalogMetadataCache(storage);
    await cache.load(); await cache.save([{ ...song(), url: 'signed-secret', licenseReference: 'private-evidence' } as CatalogSong]);
    await cache.save([song(OTHER)]); storage.files.set('aadat-catalog-metadata-v1-1.json', '{interrupted');
    expect(await new CatalogMetadataCache(storage).load()).toEqual([song()]);
    expect([...storage.files.values()].join('')).not.toMatch(/signed-secret|private-evidence|licenseReference/);
    storage.files.set('aadat-catalog-metadata-v1-0.json', 'null');
    await expect(new CatalogMetadataCache(storage).load()).rejects.toThrow('preserved'); expect(storage.files.size).toBe(2);
  });
  it('bounds persisted metadata to five hundred records', async () => {
    const storage = new MemoryDocuments(), cache = new CatalogMetadataCache(storage);
    await cache.save(Array.from({ length: 501 }, (_, i) => song(`10000000-0000-4000-8000-${String(i).padStart(12, '0')}`)));
    expect(await new CatalogMetadataCache(storage).load()).toHaveLength(500);
  });
  it('coalesces pages, expires the cache, maps rule-based tags and preserves original demo sources', async () => {
    let now = 0; const repo = repository(), registry = new DemoCatalog(DEMO_ENTRIES), original = registry.tracks();
    const cache = new CatalogMetadataCache(new MemoryDocuments());
    const client = new CatalogClientService(repo, registry, cache, () => now);
    await Promise.all([client.page({}), client.page({})]); expect(repo.page).toHaveBeenCalledTimes(1);
    await client.page({}); expect(repo.page).toHaveBeenCalledTimes(1);
    now = 60_000; await client.page({}); expect(repo.page).toHaveBeenCalledTimes(2);
    expect(registry.tracks(original.map((track) => track.id))).toEqual(original);
    expect(registry.get(ID)).toMatchObject({ url: '', catalogSource: 'catalog', releaseYear: 2005 });
    expect(registry.search({ decade: '2000–2010', season: 'Winter', mood: 'Calm' }).map((track) => track.id)).toEqual([ID]);
    const choice = new RecommendationService(registry).choose({ period: 'Morning', mood: 'Calm', season: 'Winter', decade: '2000–2010' }, []);
    expect(choice?.track.id).toBe(ID); expect(choice?.message).not.toContain('demo');
    const offlineRegistry = new DemoCatalog(DEMO_ENTRIES); await new CatalogClientService(repo, offlineRegistry, cache).initialize();
    expect(offlineRegistry.get(ID)?.url).toBe(''); // Metadata restoration grants no media authorization.
  });
  it('bounds in-flight searches and permits retry after failures without losing demos', async () => {
    const repo = repository(), registry = new DemoCatalog(DEMO_ENTRIES); let release!: (page: CatalogPage) => void;
    const barrier = new Promise<CatalogPage>((resolve) => { release = resolve; }); repo.page = vi.fn(() => barrier);
    const client = new CatalogClientService(repo, registry, new CatalogMetadataCache(new MemoryDocuments()));
    const pending = Array.from({ length: 18 }, (_, i) => client.page({ query: String(i) }));
    await expect(client.page({ query: 'overflow' })).rejects.toThrow('busy');
    await vi.waitFor(() => expect(repo.page).toHaveBeenCalledTimes(2));
    release({ nodes: [], hasNextPage: false, endCursor: null }); await Promise.all(pending);
    expect(repo.page).toHaveBeenCalledTimes(18);
    repo.page = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue({ nodes: [song()], hasNextPage: false, endCursor: null });
    await expect(client.page({ query: 'retry' })).rejects.toThrow('Offline'); expect(registry.tracks()).toHaveLength(3);
    await client.page({ query: 'retry' }); expect(registry.has(ID)).toBe(true);
  });
  it('joins equivalent query objects independently of property order without republishing cached rows',async()=>{
    const repo=repository(),registry=new DemoCatalog(),client=new CatalogClientService(repo,registry,new CatalogMetadataCache(new MemoryDocuments())),changed=vi.fn();registry.subscribe(changed);
    await Promise.all([client.page({query:'calm',mood:'Calm'}),client.page({mood:'Calm',query:' calm '})]);expect(repo.page).toHaveBeenCalledTimes(1);
    changed.mockClear();for(let i=0;i<100;i++)await client.page({mood:'Calm',query:'calm'});expect(changed).not.toHaveBeenCalled();expect(repo.page).toHaveBeenCalledTimes(1);
  });
  it('restores cached page metadata after registry eviction without refetching or discarding saved IDs', async () => {
    const repo = repository(), registry = new DemoCatalog(DEMO_ENTRIES), client = new CatalogClientService(repo, registry, new CatalogMetadataCache(new MemoryDocuments()));
    await client.page({ query: 'saved page' });
    registry.upsert(Array.from({ length: 500 }, (_, i) => ({ track: { ...registry.get(ID)!, id: `10000000-0000-4000-8000-${String(i + 10).padStart(12, '0')}` }, seasons: [] })));
    expect(registry.has(ID)).toBe(false); await client.page({ query: 'saved page' });
    expect(registry.has(ID)).toBe(true); expect(repo.page).toHaveBeenCalledTimes(1);
    expect(registry.tracks().filter((track) => track.catalogSource === 'catalog')).toHaveLength(500);
  });
  it('maps decade filters without inferring dates and keys pages independently of cursor', () => {
    expect(catalogQuery({ decade: 'Undated' })).toMatchObject({ undated: true, yearFrom: undefined });
    expect(catalogQuery({ decade: '2021 onwards' })).toMatchObject({ yearFrom: 2021, yearTo: 9999 });
    expect(catalogQueryKey({ query: ' calm ', after: 'old' })).toBe(catalogQueryKey({ query: 'calm' }));
    expect(catalogQueryKey({ mood: 'Calm' })).not.toBe(catalogQueryKey({ mood: 'Happy' }));
  });
});

describe('Durable catalog references and sharing', () => {
  it('converts resolved Android raw assets to native resource URIs and preserves Metro/file sources', () => {
    expect(nativeAudioAssetUri('apps_mobile_assets_audio_motiontone', 'android')).toBe('android.resource://com.favmusic/raw/apps_mobile_assets_audio_motiontone');
    expect(nativeAudioAssetUri('apps_mobile_assets_audio_colourtone', 'android')).toBe('android.resource://com.favmusic/raw/apps_mobile_assets_audio_colourtone');
    expect(nativeAudioAssetUri('http://localhost:8081/assets/tone.m4a', 'android')).toBe('http://localhost:8081/assets/tone.m4a');
    expect(nativeAudioAssetUri('file:///bundle/tone.m4a', 'ios')).toBe('file:///bundle/tone.m4a');
    expect(() => nativeAudioAssetUri('', 'android')).toThrow('resolved');
  });
  it('retains real IDs in every local collection with missing metadata, and permits removal and Warehouse restore', async () => {
    let data: LocalLibrary = emptyLibrary(); const saved = { ...emptyLibrary(), likes: [ID], favourites: [ID], bookmarks: [ID], warehouse: [ID],
      playlists: [{ id: 'p', name: 'Saved', trackIds: [ID] }] };
    const repo = { load: async () => saved, save: vi.fn(async () => {}) };
    const service = new LibraryService(repo, new DemoCatalog(DEMO_ENTRIES), (next) => { data = next; });
    await service.initialize(); expect(data).toMatchObject(saved);
    await service.toggle('likes', ID); expect(data.likes).toEqual([]);
    await service.setPlaylistTrack('p', ID, false); expect(data.playlists[0]?.trackIds).toEqual([]);
    await service.createPlaylist('Future reference', [OTHER]); expect(data.playlists[1]?.trackIds).toEqual([OTHER]);
    await expect(service.toggle('likes', OTHER)).rejects.toThrow('unavailable');
    expect(JSON.stringify(repo.save.mock.calls)).not.toContain('https:');
  });
  it('shares real and mixed IDs without media leases or identity and keeps old demo links compatible', async () => {
    const registry = new DemoCatalog(DEMO_ENTRIES), client = new CatalogClientService(repository(), registry, new CatalogMetadataCache(new MemoryDocuments())); await client.page({});
    const links = new ShareLinkService(registry, { share: vi.fn(async () => {}) });
    const link = links.playlistLink({ id: 'private-local-id', name: 'Mixed', trackIds: [ID, 'sample-track-1'] });
    expect(links.parse(decodeURIComponent(link.split('?payload=')[1]!))).toMatchObject({ catalog: 'aadat-catalog-v1', ids: [ID, 'sample-track-1'] });
    expect(link).not.toMatch(/https|private-local-id|token|licenseReference/);
    expect(decodeURIComponent(links.trackLink('sample-track-1'))).toContain('aadat-demo-v1');
  });
});

describe('Unknown provider expiry is an explicit refresh policy',()=>{
  it('accepts no invented expiration and renews using the bounded policy or explicit retry',async()=>{
    const value={...lease(),expiresAt:null,expiresInSeconds:null,refreshAfterSeconds:120};
    const wire=new GraphQLCatalogRepository(()=> 'https://api.example.test/graphql',transport({catalogMedia:[value]}));
    expect((await wire.media([ID],'AUDIO'))[0]?.expiresAt).toBeNull();
    let now=0;const repo=repository();repo.media=vi.fn(async()=>[value]);const service=new MediaLeaseService(repo,()=>now);
    await service.resolve([ID],'AUDIO');now=89999;await service.resolve([ID],'AUDIO');expect(repo.media).toHaveBeenCalledTimes(1);
    now=90000;await service.resolve([ID],'AUDIO');expect(repo.media).toHaveBeenCalledTimes(2);
    await service.resolve([ID],'AUDIO',true);expect(repo.media).toHaveBeenCalledTimes(3);
  });
  it('rejects unknown expiry without a usable refresh policy',async()=>{
    const value={...lease(),expiresAt:null,expiresInSeconds:null};
    await expect(new GraphQLCatalogRepository(()=> 'https://api.example.test/graphql',transport({catalogMedia:[value]})).media([ID],'AUDIO')).rejects.toThrow('Invalid media lease');
  });
});
