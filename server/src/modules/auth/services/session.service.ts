import crypto from 'node:crypto';
import { ICacheService } from '../../../infrastructure/cache/contracts/cache.contract.js';
import {
  ISessionRecord,
  ISessionService,
} from '../contracts/auth-service.contract.js';
import { UnauthorizedError } from '../../../shared/errors/domain.error.js';

export interface ISessionServiceConfig {
  readonly refreshTokenExpirationDays: number;
  readonly concurrentGracePeriodMs?: number;
}

interface IConsumedSessionData {
  readonly userId: string;
  readonly familyId: string;
  readonly newSessionId: string;
  readonly rotatedAt: number;
}

/**
 * Concrete Session Service (Redis Backed)
 * Enforces strict cryptographic hashing: RAW REFRESH TOKENS ARE NEVER STORED IN REDIS.
 * Provides atomic token rotation via Redis Lua scripting, replay detection,
 * session-family revocation, and safe handling of concurrent refresh requests.
 */
export class SessionService implements ISessionService {
  private readonly cacheService: ICacheService;
  private readonly ttlSeconds: number;
  private readonly concurrentGracePeriodMs: number;

  // Prefix constants for namespacing and zero key collision
  private static readonly SESSION_PREFIX = 'aadat:session:';
  private static readonly CONSUMED_PREFIX = 'aadat:consumed:';
  private static readonly SESS_ACTIVE_PREFIX = 'aadat:sess_active:';
  private static readonly FAMILY_REVOKED_PREFIX = 'aadat:family_revoked:';

  /**
   * Atomic Lua Script for Refresh Rotation
   * KEYS[1]: aadat:session:<oldHash>
   * KEYS[2]: aadat:consumed:<oldHash>
   * KEYS[3]: aadat:session:<newHash>
   * ARGV[1]: ttlSeconds
   * ARGV[2]: newSessionId
   * ARGV[3]: rotatedAt (timestamp in ms)
   */
  private static readonly ROTATE_LUA_SCRIPT = `
    local sessionData = redis.call('GET', KEYS[1])
    if sessionData then
      local session = cjson.decode(sessionData)
      if not redis.call('GET', 'aadat:sess_active:' .. session.sessionId)
        or redis.call('EXISTS', 'aadat:family_revoked:' .. session.familyId) == 1 then
        redis.call('DEL', KEYS[1])
        return {'INVALID'}
      end
      redis.call('DEL', KEYS[1])
      if session.sessionId then
        redis.call('DEL', 'aadat:sess_active:' .. session.sessionId)
      end

      local consumed = {
        userId = session.userId,
        familyId = session.familyId,
        newSessionId = ARGV[2],
        rotatedAt = tonumber(ARGV[3])
      }
      redis.call('SET', KEYS[2], cjson.encode(consumed), 'EX', ARGV[1])

      local newSession = {
        userId = session.userId,
        familyId = session.familyId,
        sessionId = ARGV[2],
        createdAt = tonumber(ARGV[3])
      }
      redis.call('SET', KEYS[3], cjson.encode(newSession), 'EX', ARGV[1])
      redis.call('SET', 'aadat:sess_active:' .. ARGV[2], session.familyId, 'EX', ARGV[1])

      return {'SUCCESS', cjson.encode(newSession)}
    end

    local consumedData = redis.call('GET', KEYS[2])
    if consumedData then
      return {'REUSE_DETECTED', consumedData}
    end

    return {'INVALID'}
  `;

  public constructor(
    cacheService: ICacheService,
    config?: Partial<ISessionServiceConfig>
  ) {
    this.cacheService = cacheService;
    const days = config?.refreshTokenExpirationDays ?? 7;
    this.ttlSeconds = Math.max(1, days) * 86400;
    this.concurrentGracePeriodMs = config?.concurrentGracePeriodMs ?? 10000; // 10s grace window
  }

  /**
   * Computes SHA-256 hash of a raw refresh token.
   * Only this hash is ever written to or queried from Redis.
   */
  public hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  public async createSession(userId: string): Promise<{
    rawRefreshToken: string;
    familyId: string;
    sessionId: string;
  }> {
    if (!userId || userId.trim().length === 0) {
      throw new Error('userId is required to create a session');
    }

    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const familyId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const tokenHash = this.hashToken(rawRefreshToken);
    const now = Date.now();

    const sessionRecord: ISessionRecord = {
      userId,
      familyId,
      sessionId,
      createdAt: now,
    };

    // Store hashed session and active session mapping
    await this.cacheService.set(
      SessionService.SESSION_PREFIX + tokenHash,
      JSON.stringify(sessionRecord),
      this.ttlSeconds
    );

    await this.cacheService.set(
      SessionService.SESS_ACTIVE_PREFIX + sessionId,
      familyId,
      this.ttlSeconds
    );

    return {
      rawRefreshToken,
      familyId,
      sessionId,
    };
  }

  public async rotateRefreshToken(rawRefreshToken: string): Promise<{
    rawRefreshToken: string;
    familyId: string;
    sessionId: string;
    userId: string;
  }> {
    if (!rawRefreshToken || typeof rawRefreshToken !== 'string' || rawRefreshToken.trim().length === 0) {
      throw new UnauthorizedError('Refresh token is required');
    }

    const oldHash = this.hashToken(rawRefreshToken.trim());
    const newRawRefreshToken = crypto.randomBytes(32).toString('hex');
    const newHash = this.hashToken(newRawRefreshToken);
    const newSessionId = crypto.randomUUID();
    const now = Date.now();

    const oldSessionKey = SessionService.SESSION_PREFIX + oldHash;
    const consumedKey = SessionService.CONSUMED_PREFIX + oldHash;
    const newSessionKey = SessionService.SESSION_PREFIX + newHash;

    const result = (await this.cacheService.eval(
      SessionService.ROTATE_LUA_SCRIPT,
      3,
      oldSessionKey,
      consumedKey,
      newSessionKey,
      this.ttlSeconds.toString(),
      newSessionId,
      now.toString()
    )) as [string, string?];

    const status = result[0];
    const dataJson = result[1];

    if (status === 'SUCCESS' && dataJson) {
      const newSession = JSON.parse(dataJson) as ISessionRecord;

      // Verify that this session family was not revoked asynchronously
      const isFamilyRevoked = await this.cacheService.exists(
        SessionService.FAMILY_REVOKED_PREFIX + newSession.familyId
      );
      if (isFamilyRevoked) {
        // Family was revoked, invalidate this newly created rotation
        await this.revokeSessionById(newSessionId);
        await this.cacheService.delete(newSessionKey);
        throw new UnauthorizedError('Session family has been revoked');
      }

      return {
        rawRefreshToken: newRawRefreshToken,
        familyId: newSession.familyId,
        sessionId: newSession.sessionId,
        userId: newSession.userId,
      };
    }

    if (status === 'REUSE_DETECTED' && dataJson) {
      const consumed = JSON.parse(dataJson) as IConsumedSessionData;
      const elapsedMs = now - consumed.rotatedAt;

      if (elapsedMs < this.concurrentGracePeriodMs) {
        // Safe concurrent request within grace window (e.g., dual network packets from same client)
        throw new UnauthorizedError(
          'Concurrent refresh request detected within grace period. Please use the newly issued credentials.'
        );
      }

      // Replay detected outside grace window: revoking entire session family!
      await this.revokeFamily(consumed.familyId);
      throw new UnauthorizedError(
        'Refresh token reuse detected. All sessions in this family have been revoked.'
      );
    }

    throw new UnauthorizedError('Invalid, expired or unrecognized refresh token');
  }

  public async revokeSession(rawRefreshToken: string): Promise<void> {
    if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
      return;
    }
    const tokenHash = this.hashToken(rawRefreshToken.trim());
    const sessionKey = SessionService.SESSION_PREFIX + tokenHash;
    const sessionData = await this.cacheService.get(sessionKey);

    if (sessionData) {
      try {
        const session = JSON.parse(sessionData) as ISessionRecord;
        await this.cacheService.delete(SessionService.SESS_ACTIVE_PREFIX + session.sessionId);
      } catch {
        // Safe fallback
      }
      await this.cacheService.delete(sessionKey);
    }
    // A logout may arrive after rotation or a lost refresh response. Revoke descendants too.
    const consumed = await this.cacheService.get(SessionService.CONSUMED_PREFIX + tokenHash);
    if (consumed) {
      const record = JSON.parse(consumed) as IConsumedSessionData;
      await this.revokeFamily(record.familyId);
    }
  }

  public async revokeSessionById(sessionId: string): Promise<void> {
    if (!sessionId) {
      return;
    }
    await this.cacheService.delete(SessionService.SESS_ACTIVE_PREFIX + sessionId);
  }

  public async revokeFamily(familyId: string): Promise<void> {
    if (!familyId) {
      return;
    }
    // Mark family as permanently revoked for its entire potential TTL window
    await this.cacheService.set(
      SessionService.FAMILY_REVOKED_PREFIX + familyId,
      'REVOKED',
      this.ttlSeconds
    );
  }

  public async isSessionActive(sessionId: string): Promise<boolean> {
    if (!sessionId) {
      return false;
    }
    const familyId = await this.cacheService.get(SessionService.SESS_ACTIVE_PREFIX + sessionId);
    if (!familyId) {
      return false;
    }
    const isFamilyRevoked = await this.cacheService.exists(
      SessionService.FAMILY_REVOKED_PREFIX + familyId
    );
    return !isFamilyRevoked;
  }

  public getTtlSeconds(): number {
    return this.ttlSeconds;
  }
}

