import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ICacheService } from '../../../infrastructure/cache/contracts/cache.contract.js';
import { SessionService } from '../services/session.service.js';

describe('SessionService (Redis Session Family & Atomic Rotation)', () => {
  let memoryStore: Map<string, string>;
  let mockCacheService: ICacheService;
  let sessionService: SessionService;

  beforeEach(() => {
    memoryStore = new Map<string, string>();

    mockCacheService = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      isConnected: vi.fn().mockReturnValue(true),
      ping: vi.fn().mockResolvedValue('PONG'),

      get: vi.fn(async (key: string) => memoryStore.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        memoryStore.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        memoryStore.delete(key);
      }),
      exists: vi.fn(async (key: string) => memoryStore.has(key)),

      // Exact emulation of Redis Lua script for hermetic testing
      eval: vi.fn(async (_script: string, _numKeys: number, ...args: (string | number)[]) => {
        const oldSessionKey = args[0] as string;
        const consumedKey = args[1] as string;
        const newSessionKey = args[2] as string;
        const newSessionId = args[4] as string;
        const rotatedAt = args[5] as string;

        const sessionData = memoryStore.get(oldSessionKey);
        if (sessionData) {
          const session = JSON.parse(sessionData);
          if (!memoryStore.has('aadat:sess_active:' + session.sessionId)
            || memoryStore.has('aadat:family_revoked:' + session.familyId)) {
            memoryStore.delete(oldSessionKey);
            return ['INVALID'];
          }
          memoryStore.delete(oldSessionKey);
          if (session.sessionId) {
            memoryStore.delete('aadat:sess_active:' + session.sessionId);
          }

          const consumed = {
            userId: session.userId,
            familyId: session.familyId,
            newSessionId,
            rotatedAt: Number(rotatedAt),
          };
          memoryStore.set(consumedKey, JSON.stringify(consumed));

          const newSession = {
            userId: session.userId,
            familyId: session.familyId,
            sessionId: newSessionId,
            createdAt: Number(rotatedAt),
          };
          memoryStore.set(newSessionKey, JSON.stringify(newSession));
          memoryStore.set('aadat:sess_active:' + newSessionId, session.familyId);

          return ['SUCCESS', JSON.stringify(newSession)];
        }

        const consumedData = memoryStore.get(consumedKey);
        if (consumedData) {
          return ['REUSE_DETECTED', consumedData];
        }

        return ['INVALID'];
      }),
    };

    sessionService = new SessionService(mockCacheService, {
      refreshTokenExpirationDays: 7,
      concurrentGracePeriodMs: 10000,
    });
  });

  it('creates session and stores ONLY cryptographic SHA-256 hash in Redis', async () => {
    const userId = 'user-uuid-1';
    const session = await sessionService.createSession(userId);

    expect(session.rawRefreshToken).toBeDefined();
    expect(session.rawRefreshToken.length).toBe(64); // 32 bytes hex
    expect(session.familyId).toBeDefined();
    expect(session.sessionId).toBeDefined();

    // Verify raw refresh token was NEVER written to Redis keys or values
    for (const [key, value] of memoryStore.entries()) {
      expect(key).not.toContain(session.rawRefreshToken);
      expect(value).not.toContain(session.rawRefreshToken);
    }

    // Verify SHA-256 hash was stored
    const expectedHash = sessionService.hashToken(session.rawRefreshToken);
    const storedSession = memoryStore.get('aadat:session:' + expectedHash);
    expect(storedSession).toBeDefined();
    const parsed = JSON.parse(storedSession!);
    expect(parsed.userId).toBe(userId);
    expect(parsed.familyId).toBe(session.familyId);
    expect(parsed.sessionId).toBe(session.sessionId);

    // Verify active session was registered
    expect(await sessionService.isSessionActive(session.sessionId)).toBe(true);
  });

  it('rotates refresh token atomically via Redis Lua script', async () => {
    const session1 = await sessionService.createSession('user-uuid-1');

    // Rotate token
    const session2 = await sessionService.rotateRefreshToken(session1.rawRefreshToken);

    expect(session2.rawRefreshToken).not.toBe(session1.rawRefreshToken);
    expect(session2.familyId).toBe(session1.familyId); // Same family preserved
    expect(session2.sessionId).not.toBe(session1.sessionId); // New session ID
    expect(session2.userId).toBe('user-uuid-1');

    // Old token session key is deleted from active sessions
    const oldHash = sessionService.hashToken(session1.rawRefreshToken);
    expect(memoryStore.has('aadat:session:' + oldHash)).toBe(false);

    // Old session ID is no longer active
    expect(await sessionService.isSessionActive(session1.sessionId)).toBe(false);

    // New session ID is active
    expect(await sessionService.isSessionActive(session2.sessionId)).toBe(true);
  });

  it('safely handles concurrent refresh requests within grace window', async () => {
    const session = await sessionService.createSession('user-uuid-1');

    // Rotate token first time
    await sessionService.rotateRefreshToken(session.rawRefreshToken);

    // Immediately present the old token again within grace window (e.g., in-flight packet retry)
    await expect(
      sessionService.rotateRefreshToken(session.rawRefreshToken)
    ).rejects.toThrow('Concurrent refresh request detected within grace period');

    // Family should NOT be revoked during grace period
    const isFamilyRevoked = memoryStore.has('aadat:family_revoked:' + session.familyId);
    expect(isFamilyRevoked).toBe(false);
  });

  it('detects replay attack outside grace window and revokes the ENTIRE session family', async () => {
    const session = await sessionService.createSession('user-uuid-1');

    // Rotate token
    const rotated = await sessionService.rotateRefreshToken(session.rawRefreshToken);

    // Fast-forward timestamp in consumed key beyond grace period (10s)
    const oldHash = sessionService.hashToken(session.rawRefreshToken);
    const consumedJson = memoryStore.get('aadat:consumed:' + oldHash);
    const consumed = JSON.parse(consumedJson!);
    consumed.rotatedAt = Date.now() - 30000; // 30 seconds ago
    memoryStore.set('aadat:consumed:' + oldHash, JSON.stringify(consumed));

    // Attacker tries to replay the stolen consumed token
    await expect(
      sessionService.rotateRefreshToken(session.rawRefreshToken)
    ).rejects.toThrow('Refresh token reuse detected. All sessions in this family have been revoked.');

    // Verify entire family is revoked
    expect(memoryStore.has('aadat:family_revoked:' + session.familyId)).toBe(true);

    // Even the legitimately rotated session is now marked inactive!
    expect(await sessionService.isSessionActive(rotated.sessionId)).toBe(false);
  });

  it('revokes active session on explicit logout', async () => {
    const session = await sessionService.createSession('user-uuid-1');
    expect(await sessionService.isSessionActive(session.sessionId)).toBe(true);

    // Logout via raw refresh token
    await sessionService.revokeSession(session.rawRefreshToken);

    expect(await sessionService.isSessionActive(session.sessionId)).toBe(false);
  });
  it('does not refresh a session revoked by its access-token session ID', async () => {
    const session = await sessionService.createSession('user-1');
    await sessionService.revokeSessionById(session.sessionId);
    await expect(sessionService.rotateRefreshToken(session.rawRefreshToken)).rejects.toThrow();
  });

  it('logout with a consumed refresh token revokes the rotated descendants', async () => {
    const session = await sessionService.createSession('user-1');
    const rotated = await sessionService.rotateRefreshToken(session.rawRefreshToken);
    await sessionService.revokeSession(session.rawRefreshToken);
    expect(await sessionService.isSessionActive(rotated.sessionId)).toBe(false);
    await expect(sessionService.rotateRefreshToken(rotated.rawRefreshToken)).rejects.toThrow();
  });

});
