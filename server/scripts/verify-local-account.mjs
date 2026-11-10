import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { LocalAccountFiles } from './local-account-files.mjs';
import { PrismaDatabaseService } from '../dist/infrastructure/database/implementations/prisma-database.service.js';
import { RedisCacheService } from '../dist/infrastructure/cache/implementations/redis-cache.service.js';
import { PrismaUserRepository } from '../dist/modules/auth/repositories/prisma-user.repository.js';
import { PrismaAccountLibraryRepository } from '../dist/modules/account-library/prisma-account-library.repository.js';
import { AccountLibraryService } from '../dist/modules/account-library/account-library.service.js';
import { emptyAccountLibrary } from '../dist/modules/account-library/account-library.contract.js';
import { SessionService } from '../dist/modules/auth/services/session.service.js';

/** Real adapter integration fixtures, confined to aadat_verify / private Redis DB1. No login or JWT is fabricated. */
export class LocalAccountVerification {
  async run() {
    const { target, secrets } = LocalAccountFiles.load();
    const database = new PrismaDatabaseService({ connectionString: LocalAccountFiles.url('aadat_verify'), connectionTimeoutMillis: 5000 });
    const cache = new RedisCacheService({ url: `redis://:${secrets.redisPassword}@127.0.0.1:${target.redisPort}/1` });
    const ids = [], keys = [];
    try {
      await database.connect(); await cache.connect();
      const [identity] = await database.getClient().$queryRawUnsafe("SELECT current_database() AS database, current_user AS role, host(inet_server_addr()) AS host, inet_server_port() AS port");
      assert.deepEqual(identity, { database: 'aadat_verify', role: 'aadat_app', host: '127.0.0.1', port: target.port });
      assert.equal(await cache.ping(), 'PONG');
      const users = new PrismaUserRepository(database), repository = new PrismaAccountLibraryRepository(database), service = new AccountLibraryService(repository, true);
      const prefix = crypto.randomUUID();
      const a = await users.create({ email: `fixture-a-${prefix}@example.invalid`, displayName: 'Integration fixture A', googleSub: `fixture-a-${prefix}` }); ids.push(a.id);
      const b = await users.create({ email: `fixture-b-${prefix}@example.invalid`, displayName: 'Integration fixture B', googleSub: `fixture-b-${prefix}` }); ids.push(b.id);
      assert.equal((await users.findByGoogleSub(`fixture-a-${prefix}`)).id, a.id);
      await users.updateProfile(a.id, { displayName: 'Updated integration fixture', chatRetentionPreference: 'EPHEMERAL_SESSION_ONLY' });
      assert.equal((await users.findById(a.id)).displayName, 'Updated integration fixture');
      const data = { ...emptyAccountLibrary(), playlists: [{ id: crypto.randomUUID(), name: 'Isolated verification', trackIds: [] }] };
      const command = { expectedRevision: 0, mutationId: crypto.randomUUID(), data };
      const receipt = await service.commit(a.id, command);
      assert.equal(receipt.appliedRevision, 1);
      assert.deepEqual((await service.read(a.id)).data, data);
      assert.equal((await service.read(b.id)).data.playlists.length, 0);
      assert.equal((await service.commit(a.id, command)).appliedRevision, 1);
      await assert.rejects(service.commit(a.id, { ...command, mutationId: crypto.randomUUID() }), { code: 'CONFLICT' });
      assert.throws(() => service.read(), { code: 'UNAUTHORIZED' });
      await assert.rejects(service.commit(a.id, { expectedRevision: 1, mutationId: crypto.randomUUID(), data: { ...data, likes: [crypto.randomUUID()] } }), { code: 'VALIDATION_FAILED' });
      const session = new SessionService(cache), initial = await session.createSession(a.id);
      keys.push('aadat:session:' + session.hashToken(initial.rawRefreshToken), 'aadat:consumed:' + session.hashToken(initial.rawRefreshToken), 'aadat:sess_active:' + initial.sessionId, 'aadat:family_revoked:' + initial.familyId);
      const stored = await cache.get(keys[0]); assert.ok(stored && !stored.includes(initial.rawRefreshToken));
      const attempts = await Promise.allSettled([session.rotateRefreshToken(initial.rawRefreshToken), session.rotateRefreshToken(initial.rawRefreshToken)]);
      assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
      const rotated = attempts.find(result => result.status === 'fulfilled').value;
      keys.push('aadat:session:' + session.hashToken(rotated.rawRefreshToken), 'aadat:sess_active:' + rotated.sessionId);
      assert.equal(await session.isSessionActive(initial.sessionId), false);
      assert.equal(await session.isSessionActive(rotated.sessionId), true);
      await session.revokeSession(initial.rawRefreshToken);
      assert.equal(await session.isSessionActive(rotated.sessionId), false);
      await assert.rejects(session.rotateRefreshToken(rotated.rawRefreshToken), { code: 'UNAUTHORIZED' });
      console.log(JSON.stringify({ postgresPrisma: 'PASS', userRepository: 'PASS', profilePersistence: 'PASS', accountIsolation: 'PASS', idempotentCommit: 'PASS', staleRevisionRejected: 'PASS', unknownTrackRejected: 'PASS', redisLuaRotation: 'PASS', rotatedLogoutRevocation: 'PASS', googleLogin: 'NOT TESTED; no identity token supplied', fixtureDatabase: 'aadat_verify', fixtureRedis: 1, neonContacted: false }));
    } finally {
      for (const id of ids) {
        await database.getClient().libraryMutationReceipt.deleteMany({ where: { userId: id } });
        await database.getClient().accountLibrary.deleteMany({ where: { userId: id } });
        await database.getClient().user.deleteMany({ where: { id } });
      }
      for (const key of keys) await cache.delete(key);
      await database.disconnect(); await cache.disconnect();
    }
  }
}
if (process.argv[2] !== '--isolated-fixtures') throw new Error('Use --isolated-fixtures; the app database is never a fixture target');
new LocalAccountVerification().run().catch(error => { console.error(JSON.stringify({ localVerificationFailed: true, name: error.name, code: error.code ?? null, assertion: error.operator ?? null })); process.exitCode = 1; });
