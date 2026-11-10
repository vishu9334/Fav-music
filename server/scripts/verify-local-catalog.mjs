import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { LocalAccountFiles } from './local-account-files.mjs';
import { PrismaDatabaseService } from '../dist/infrastructure/database/implementations/prisma-database.service.js';
import { JioSaavnMusicProviderService } from '../dist/infrastructure/music-provider/implementations/jiosaavn-music-provider.service.js';
import { FileProviderIdentityRepository } from '../dist/infrastructure/music-provider/implementations/file-provider-identity.repository.js';
import { ProviderCatalogService } from '../dist/modules/catalog/services/provider-catalog.service.js';
import { PrismaAccountLibraryRepository } from '../dist/modules/account-library/prisma-account-library.repository.js';
import { AccountLibraryService } from '../dist/modules/account-library/account-library.service.js';
import { emptyAccountLibrary } from '../dist/modules/account-library/account-library.contract.js';

/** Real provider metadata + real Prisma reference integration, confined to aadat_verify. No audio bodies or fabricated login. */
export class LocalCatalogVerification {
  async run() {
    const { root, target } = LocalAccountFiles.load();
    const env = dotenv.parse(fs.readFileSync(new URL('../.env', import.meta.url)));
    if (env.MUSIC_PROVIDER !== 'jiosaavn-development' || env.JIOSAAVN_API_BASE_URL?.replace(/\/$/, '') !== 'https://saavn.bycomsolutions.com/api') throw new Error('Unapproved provider');
    const catalog = new ProviderCatalogService(new JioSaavnMusicProviderService({ apiBaseUrl: env.JIOSAAVN_API_BASE_URL }), new FileProviderIdentityRepository(path.join(root, 'verification-provider-identities')));
    const songs = [];
    for (const [query, artist] of [['Believer', 'Imagine Dragons'], ['Levitating', 'Dua Lipa'], ['Enemy', 'Imagine Dragons']]) {
      const page = await catalog.page({ query, first: 10 });
      const song = page.nodes.find(song => song.title.toLowerCase().startsWith(query.toLowerCase()) && song.artistName.includes(artist));
      assert.ok(song, 'Expected real artist/track was not returned');
      const [lease] = await catalog.media([song.id], 'AUDIO');
      assert.equal(new URL(lease.url).protocol, 'https:');
      songs.push({ id: song.id, title: song.title, artist: song.artistName, releaseYear: song.releaseYear, durationSeconds: song.durationSeconds, httpsAudioReturned: true });
    }
    const database = new PrismaDatabaseService({ connectionString: LocalAccountFiles.url('aadat_verify'), connectionTimeoutMillis: 5000 });
    let owner;
    try {
      await database.connect();
      const [id] = await database.getClient().$queryRawUnsafe('SELECT current_database() AS name, inet_server_port() AS port');
      assert.equal(id.name, target.verificationDatabase); assert.equal(id.port, target.port);
      const user = await database.getClient().user.create({ data: { email: `catalog-fixture-${crypto.randomUUID()}@example.invalid`, displayName: 'Isolated catalog integration fixture' } }); owner = user.id;
      const service = new AccountLibraryService(new PrismaAccountLibraryRepository(database, catalog), true), ids = songs.map(song => song.id);
      const data = { ...emptyAccountLibrary(), likes: ids, favourites: ids, bookmarks: ids, warehouse: ids, playlists: [{ id: crypto.randomUUID(), name: 'Real catalog reference verification', trackIds: ids }], warehouseStates: ids.map(trackId => ({ trackId, status: 'ACTIVE' })) };
      await service.commit(owner, { expectedRevision: 0, mutationId: crypto.randomUUID(), data });
      assert.deepEqual((await service.read(owner)).data, data);
      const restored = new AccountLibraryService(new PrismaAccountLibraryRepository(database, catalog), true);
      assert.deepEqual((await restored.read(owner)).data.playlists[0].trackIds, ids);
      console.log(JSON.stringify({ provider: 'saavn.bycomsolutions.com', songs, actualProviderMetadata: true, databaseReferencesRoundTrip: true, audioBodiesRequested: false, googleLoginTested: false, fixtureDatabase: 'aadat_verify', appAccountWritten: false, neonContacted: false }));
    } finally {
      if (owner) {
        await database.getClient().libraryMutationReceipt.deleteMany({ where: { userId: owner } });
        await database.getClient().accountLibrary.deleteMany({ where: { userId: owner } });
        await database.getClient().user.deleteMany({ where: { id: owner } });
      }
      await database.disconnect();
    }
  }
}
if (process.argv[2] !== '--isolated-fixtures') throw new Error('Use --isolated-fixtures');
new LocalCatalogVerification().run().catch(error => { console.error(JSON.stringify({ catalogVerificationFailed: true, name: error.name, code: error.code ?? null })); process.exitCode = 1; });
