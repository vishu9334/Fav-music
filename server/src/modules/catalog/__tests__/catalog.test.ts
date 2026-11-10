import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import mercurius from 'mercurius';
import { GRAPHQL_SCHEMA_STRING } from '@aadat/contracts';
import { CatalogEntity, ICatalogRepository } from '../contracts/catalog.contract.js';
import { CatalogService } from '../services/catalog.service.js';
import { CatalogGraphQLController } from '../controllers/catalog-graphql.controller.js';
import { GraphQLErrorFormatter } from '../../../shared/graphql/graphql-error-formatter.js';
import { PrismaCatalogRepository } from '../repositories/prisma-catalog.repository.js';
import type { IDatabaseService } from '../../../infrastructure/database/contracts/database.contract.js';
import type { IS3StorageService } from '../../../infrastructure/storage/contracts/storage.contract.js';
import { PrismaTrackMediaRepository } from '../../media/repositories/prisma-track-media.repository.js';

const id = '00000000-0000-4000-8000-000000000001', second = '00000000-0000-4000-8000-000000000002';
const now = new Date('2026-11-06T00:00:00Z');
function song(patch: Partial<CatalogEntity> = {}): CatalogEntity {
  return { id, title: 'Fixture song', artistName: 'Fixture artist', albumName: null, durationSeconds: 120, releaseYear: 2010,
    attribution: 'Unit fixture rights credit', hasVideo: true, moods: ['Calm'], timeAffinities: ['MORNING'], seasonAffinities: ['WINTER'],
    weatherAffinities: [], energyScore: 0.3, tempoBpm: null, audioKey: 'tracks/audio/fixture.mp3', videoKey: 'tracks/video/fixture.mp4', artworkKey: 'tracks/art/fixture.jpg',
    publishStatus: 'PUBLISHED', publicStreamingAllowed: true, licenseReference: 'private-agreement-fixture', licenseVerifiedAt: new Date('2026-01-01'), licenseExpiresAt: null, ...patch };
}
function fixture(rows: readonly CatalogEntity[] = [song()]) {
  const repo: ICatalogRepository = { page: vi.fn(async () => rows), find: vi.fn(async (key) => rows.find((row) => row.id === key) ?? null),
    findMany: vi.fn(async (keys) => rows.filter((row) => keys.includes(row.id))) };
  const storage = { getPresignedDownloadUrl: vi.fn(async (key: string) => `https://media.example.test/${key}?signature=fixture`),
    getPresignedUploadUrl: vi.fn(async () => { throw new Error('No writes'); }), getPresignedPostData: vi.fn(async () => { throw new Error('No writes'); }),
    headObject: vi.fn(async () => null), getObjectBytes: vi.fn(async () => new Uint8Array()), deleteObject: vi.fn(async () => { throw new Error('No writes'); }), copyObject: vi.fn(async () => { throw new Error('No writes'); }) };
  return { repo, storage, service: new CatalogService(repo, storage as IS3StorageService, true, () => now) };
}
describe('Read-only, licensed catalog service', () => {
  it('stays disabled by default without reading a database or signing', async () => {
    const f = fixture(), disabled = new CatalogService(f.repo, f.storage); await expect(disabled.page({})).rejects.toMatchObject({ code: 'CATALOG_UNAVAILABLE' });
    expect(f.repo.page).not.toHaveBeenCalled(); expect(f.storage.getPresignedDownloadUrl).not.toHaveBeenCalled();
  });
  it('returns real repository metadata without private licensing evidence, keys or signed URLs', async () => {
    const f = fixture(), page = await f.service.page({}); expect(page.nodes[0]).toMatchObject({ id, releaseYear: 2010, artistName: 'Fixture artist', albumName: null });
    const text = JSON.stringify(page); expect(text).not.toContain('private-agreement'); expect(text).not.toContain('tracks/audio'); expect(text).not.toContain('signature');
    expect(f.storage.getPresignedDownloadUrl).not.toHaveBeenCalled();
  });
  it.each([{ publishStatus: 'DRAFT' }, { publicStreamingAllowed: false }, { licenseReference: null }, { attribution: '' },
    { licenseVerifiedAt: null }, { licenseVerifiedAt: new Date('2027-01-01') }, { licenseExpiresAt: new Date('2026-01-01') }])('denies unapproved content %j before signing', async (patch) => {
      const f = fixture([song(patch)]); expect(await f.service.track(id)).toBeNull(); await expect(f.service.media([id], 'AUDIO')).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(f.storage.getPresignedDownloadUrl).not.toHaveBeenCalled();
    });
  it('uses scoped keyset cursors and rejects cross-filter/replayed cursors without another query', async () => {
    const f = fixture([song(), song({ id: second })]); const page = await f.service.page({ query: ' Fixture ', first: 1 });
    expect(page.hasNextPage).toBe(true); await f.service.page({ query: 'Fixture', first: 1, after: page.endCursor! });
    expect(f.repo.page).toHaveBeenLastCalledWith(expect.objectContaining({ lastId: id }), now);
    await expect(f.service.page({ query: 'different', after: page.endCursor! })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
  it.each([{ first: 51 }, { first: 0 }, { query: 'x'.repeat(161) }, { yearFrom: 2021, yearTo: 2010 }, { mood: 'Invented AI mood' }, { after: 'bad cursor' }, { undated: true, yearFrom: 1990 }])('rejects invalid filters %j before persistence', async (query) => {
    const f = fixture(); await expect(f.service.page(query)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' }); expect(f.repo.page).not.toHaveBeenCalled();
  });
  it('batch-authorizes IDs and signs only trusted media keys with a bounded license-aware expiry', async () => {
    const f = fixture([song({ licenseExpiresAt: new Date(now.getTime() + 90_000) })]);
    const leases = await f.service.media([id, id], 'VIDEO'); expect(f.repo.findMany).toHaveBeenCalledTimes(1); expect(f.storage.getPresignedDownloadUrl).toHaveBeenCalledWith('tracks/video/fixture.mp4', 90);
    expect(leases[0]).toMatchObject({ trackId: id, kind: 'VIDEO', expiresInSeconds: 90 });
    expect(f.storage.copyObject).not.toHaveBeenCalled(); expect(f.storage.deleteObject).not.toHaveBeenCalled(); expect(f.storage.getPresignedUploadUrl).not.toHaveBeenCalled();
  });
  it('refuses traversal keys and insecure signing results without leaking underlying errors', async () => {
    const f = fixture([song({ audioKey: 'tracks/audio/../secret' })]); await expect(f.service.media([id], 'AUDIO')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const good = fixture(); good.storage.getPresignedDownloadUrl.mockResolvedValue('http://insecure.example.test/audio');
    await expect(good.service.media([id], 'AUDIO')).rejects.toThrow('Secure media signing is unavailable');
  });
  it('bounds and validates media ID batches', async () => {
    const f = fixture(); await expect(f.service.media(Array(51).fill(id), 'AUDIO')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(f.service.media(['tracks/audio/arbitrary.mp3'], 'AUDIO')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' }); expect(f.repo.findMany).not.toHaveBeenCalled();
  });
});

describe('Catalog GraphQL transport and repository boundaries', () => {
  it('serves paginated metadata and explicit media leases through the actual schema', async () => {
    const f = fixture(), app = Fastify(); await app.register(mercurius, { schema: GRAPHQL_SCHEMA_STRING, resolvers: new CatalogGraphQLController(f.service).buildResolvers(), errorFormatter: GraphQLErrorFormatter.format });
    const response = await app.inject({ method: 'POST', url: '/graphql', payload: { query: `query { catalogPage(input:{first:1}) { nodes { id title artistName albumName releaseYear attribution hasVideo } hasNextPage } catalogMedia(ids:["${id}"],kind:AUDIO) { trackId kind expiresInSeconds url } }` } });
    const data = response.json(); expect(data.errors).toBeUndefined(); expect(data.data.catalogPage.nodes[0].id).toBe(id); expect(data.data.catalogMedia[0].expiresInSeconds).toBe(300); await app.close();
  });
  it('rejects excessive alias work using a shared request budget', async () => {
    const f = fixture(), resolvers = new CatalogGraphQLController(f.service).buildResolvers();
    const query = resolvers.Query as Record<string, (parent: unknown, args: unknown, context: object) => unknown>, context = {};
    for (let i = 0; i < 4; i++) await query.catalogPage!(null, { input: { first: 50 } }, context);
    expect(() => query.catalogPage!(null, { input: { first: 1 } }, context)).toThrow('budget');
  });
  it('builds Prisma read queries with publication, clearance, explicit public streaming and stable pagination filters', async () => {
    const f = fixture(), row = song(); const findMany = vi.fn(async () => [{ ...row, moodTags: row.moods, licenseAttribution: row.attribution }]);
    const database = { getClient: () => ({ track: { findMany } }) } as unknown as IDatabaseService;
    const repo = new PrismaCatalogRepository(database); await repo.page({ first: 20, query: 'Fixture artist', lastId: id, yearFrom: 2000, yearTo: 2010 }, now);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 21, orderBy: { id: 'asc' }, where: { AND: expect.arrayContaining([expect.objectContaining({ publishStatus: 'PUBLISHED', publicStreamingAllowed: true }), { id: { gt: id } }, { releaseYear: { gte: 2000, lte: 2010 } }]) } }));
    expect(f.storage.getPresignedDownloadUrl).not.toHaveBeenCalled();
  });
  it('applies the same public licensing gate to legacy media lookups, including an explicit attribution check', async () => {
    const row = song(), findFirst = vi.fn().mockResolvedValueOnce({ ...row, licenseAttribution: row.attribution }).mockResolvedValueOnce({ ...row, licenseAttribution: '' });
    const repo = new PrismaTrackMediaRepository({ getClient: () => ({ track: { findFirst } }) } as unknown as IDatabaseService);
    expect(await repo.findById(id)).toMatchObject({ id, audioKey: row.audioKey });
    expect(findFirst).toHaveBeenLastCalledWith({ where: expect.objectContaining({ id, publishStatus: 'PUBLISHED', publicStreamingAllowed: true, licenseVerifiedAt: { lte: expect.any(Date) } }) });
    expect(await repo.findByAudioKey(row.audioKey)).toBeNull();
    expect(findFirst).toHaveBeenLastCalledWith({ where: expect.objectContaining({ audioKey: row.audioKey, publicStreamingAllowed: true }) });
  });
});
