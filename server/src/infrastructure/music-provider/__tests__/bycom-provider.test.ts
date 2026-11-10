import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import mercurius from 'mercurius';
import { GRAPHQL_SCHEMA_STRING } from '@aadat/contracts';
import { JioSaavnMusicProviderService } from '../implementations/jiosaavn-music-provider.service.js';
import { JioSaavnV3MusicProviderService } from '../implementations/jiosaavn-v3-music-provider.service.js';
import { FileProviderIdentityRepository } from '../implementations/file-provider-identity.repository.js';
import { ProviderCatalogService } from '../../../modules/catalog/services/provider-catalog.service.js';
import { CatalogGraphQLController } from '../../../modules/catalog/controllers/catalog-graphql.controller.js';
// Actual metadata, with explicitly test-only URLs; these tests make no external requests.
const captured = JSON.parse(await readFile(new URL('./fixtures/bycom-metadata.json', import.meta.url), 'utf8'));
const json = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { headers: { 'content-type': 'application/json' } });
function fixture() {
  const transport = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(String(input)), p = url.searchParams;
    if (url.pathname === '/api/search/songs') return json(p.get('page') === '1' ? captured.searchFirst : captured.searchNext);
    if (url.pathname === '/api/search/playlists') return json(captured.resources);
    if (url.pathname === '/api/artists/599452') return json(captured.artist);
    if (url.pathname === '/api/artists/599452/songs') return json(p.get('page') === '0' ? captured.artistFirst : captured.artistNext);
    if (url.pathname === '/api/albums') return json(captured.album);
    if (url.pathname === '/api/playlists') return json(p.get('page') === '1' ? captured.playlistFirst : p.get('page') === '2' ? captured.playlistNext : captured.playlistLast);
    if (url.pathname === '/api/songs') return json(captured.searchFirst.results.filter((s: { id: string }) => s.id === p.get('ids')));
    throw new Error('Unexpected test route');
  });
  return { transport, provider: new JioSaavnMusicProviderService({ apiBaseUrl: 'https://provider.example.invalid/api' }, transport as typeof fetch) };
}
async function service() {
  const f = fixture(), dir = await mkdtemp(join(tmpdir(), 'aadat-bycom-test-'));
  const identities = new FileProviderIdentityRepository(join(dir, 'identities'));
  return { ...f, dir, identities, catalog: new ProviderCatalogService(f.provider, identities) };
}
describe('Bycom compatibility using captured real metadata', () => {
  it('maps zero-based app cursors to one-based upstream search without repeating the first page', async () => {
    const f = fixture(), first = await f.provider.searchSongsPage({ query: 'Believer', limit: 10 }), next = await f.provider.searchSongsPage({ query: 'Believer', page: 1, limit: 10 });
    expect(first.results[0]).toMatchObject({ id: 'BeXBcbVK', title: 'Believer', artist: 'Imagine Dragons', durationSeconds: 204, releaseYear: 2018, album: 'Evolve', albumId: '13435951', audioUrl: 'https://media.example.invalid/test-only/320kbps' });
    expect(first.results.some(x => next.results.some(y => y.id === x.id))).toBe(false);
    expect(f.transport.mock.calls.map(call => new URL(String(call[0])).searchParams.get('page'))).toEqual(['1', '2']);
  });
  it('does not lose a final item when upstream start is one-based', async () => {
    const provider = new JioSaavnMusicProviderService({ apiBaseUrl: 'https://provider.example.invalid/api' }, vi.fn(async () => json({ ...captured.searchFirst, total: 11 })) as typeof fetch);
    expect((await provider.searchSongsPage({ query: 'Believer', limit: 10 })).hasMore).toBe(true);
  });
  it('keeps playlist totals unknown and continues past a full page even when songCount equals the page length', async () => {
    const f = fixture(), a = await f.provider.getCollection('playlists', '156710699', 0, 10), b = await f.provider.getCollection('playlists', '156710699', 1, 10);
    expect(a.songs).toMatchObject({ page: 0, total: null, hasMore: true });
    expect(a.songs.results.some(x => b.songs.results.some(y => y.id === x.id))).toBe(false);
    const last = await f.provider.getCollection('playlists', '156710699', 2, 10);
    expect(last.songs.results).toHaveLength(7); expect(last.songs.hasMore).toBe(false);
  });
  it('paginates artist songs rather than repeating the same top-ten snapshot', async () => {
    const f = fixture(), a = await f.provider.getCollection('artists', '599452', 0, 10), b = await f.provider.getCollection('artists', '599452', 1, 10);
    expect(a.resource.name).toBe('Imagine Dragons'); expect(a.songs).toMatchObject({ total: 1191, hasMore: true });
    expect(a.songs.results.some(x => b.songs.results.some(y => y.id === x.id))).toBe(false);
  });
  it('adapts arbitrary app page sizes across fixed ten-song artist pages', async () => {
    const f = fixture(), a = await f.provider.getCollection('artists', '599452', 0, 7), b = await f.provider.getCollection('artists', '599452', 1, 7);
    expect(a.songs.results).toHaveLength(7); expect(b.songs.results).toHaveLength(7);
    expect(b.songs.results.map(s => s.id)).toEqual([...captured.artistFirst.songs, ...captured.artistNext.songs].slice(7, 14).map(s => s.id));
  });
  it('returns actual album metadata and rejects collection identity substitution', async () => {
    const f = fixture(); expect((await f.provider.getCollection('albums', '13435951')).songs.results).toHaveLength(12);
    await expect(f.provider.getCollection('albums', 'wrong-id')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('preserves old UUIDs and saved references across the V3-to-compatible-host switch and restart', async () => {
    const f = await service(), old = new JioSaavnV3MusicProviderService({ apiBaseUrl: 'https://old.example.invalid' });
    const ref = { provider: old.providerId, kind: 'song' as const, externalId: 'BeXBcbVK' }, id = await f.identities.remember(ref);
    expect((await f.catalog.page({ query: 'Believer', first: 10 })).nodes[0]!.id).toBe(id);
    expect(await f.catalog.track(id)).toMatchObject({ id, title: 'Believer' });
    expect((await f.catalog.media([id], 'AUDIO'))[0]).toMatchObject({ trackId: id, url: 'https://media.example.invalid/test-only/320kbps', expiresAt: null, refreshAfterSeconds: 120 });
    expect(f.provider.providerId).toBe(old.providerId);
    const restarted = new ProviderCatalogService(f.provider, new FileProviderIdentityRepository(join(f.dir, 'identities')));
    expect(await restarted.track(id)).toMatchObject({ id, title: 'Believer' });
  });
  it('exposes albums, artists and playlists through authenticated GraphQL with the existing canonical song/media contract', async () => {
    const f = await service(), app = Fastify();
    await app.register(mercurius, { schema: GRAPHQL_SCHEMA_STRING, resolvers: new CatalogGraphQLController(f.catalog, true).buildResolvers(), context: async () => ({ userId: 'unit-test-auth-context' }) });
    try {
      const response = await app.inject({ method: 'POST', url: '/graphql', payload: { query: 'query {catalogPage(input:{query:"Believer",first:10}){nodes{id title} endCursor hasNextPage} catalogProviderInfo{resourceKinds remotePagination videoSupported recognitionSupported}}' } });
      const body = response.json(); expect(body.errors).toBeUndefined(); expect(body.data.catalogPage.nodes[0].title).toBe('Believer');
      expect(body.data.catalogProviderInfo).toMatchObject({ resourceKinds: ['albums', 'artists', 'playlists'], remotePagination: true, videoSupported: false, recognitionSupported: false });
      const second = await app.inject({ method: 'POST', url: '/graphql', payload: { query: 'query($id:ID!){catalogMedia(ids:[$id],kind:AUDIO){trackId url expiresAt refreshAfterSeconds}}', variables: { id: body.data.catalogPage.nodes[0].id } } });
      expect(second.json().errors).toBeUndefined(); expect(second.json().data.catalogMedia[0].url).toContain('/320kbps');
    } finally { await app.close(); }
  });
});
