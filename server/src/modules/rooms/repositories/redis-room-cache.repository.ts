import { ICacheService } from '../../../infrastructure/cache/contracts/cache.contract.js';
import { IRoomCacheRepository } from '../contracts/room-cache.contract.js';
import {
  PlaybackSyncPayload,
  RoomChatMessageDto,
} from '@aadat/contracts';

export class RedisRoomCacheRepository implements IRoomCacheRepository {
  private static readonly PLAYBACK_PREFIX = 'aadat:room:playback:';
  private static readonly CONTROLLER_PREFIX = 'aadat:room:controller:';
  private static readonly PRESENCE_PREFIX = 'aadat:room:presence:';
  private static readonly USER_SOCKET_PREFIX = 'aadat:user:socket:';
  private static readonly HEARTBEAT_PREFIX = 'aadat:room:heartbeat:';
  private static readonly TAKEOVER_PREFIX = 'aadat:room:takeover:';
  private static readonly EPHEMERAL_CHAT_PREFIX = 'aadat:room:chat:ephemeral:';
  private static readonly RATELIMIT_PREFIX = 'aadat:room:ratelimit:';

  private static readonly CAS_CONTROLLER_LUA = `
    local current = redis.call('GET', KEYS[1])
    local expected = ARGV[1]
    local newController = ARGV[2]

    if (not current and expected == 'null') or (current == expected) then
      redis.call('SET', KEYS[1], newController)
      return 1
    else
      return 0
    end
  `;

  private static readonly CLAIM_TAKEOVER_LUA = `
    local promptData = redis.call('GET', KEYS[1])
    if not promptData then
      return {'EXPIRED'}
    end

    local prompt = cjson.decode(promptData)
    if prompt['status'] ~= 'PROMPT_ACTIVE' then
      return {'ALREADY_CLAIMED', prompt['winnerUserId']}
    end

    local now = tonumber(ARGV[2])
    if now > tonumber(prompt['expiresAt']) then
      return {'EXPIRED'}
    end

    prompt['status'] = 'CLAIMED'
    prompt['winnerUserId'] = ARGV[1]
    redis.call('SET', KEYS[1], cjson.encode(prompt), 'EX', 60)
    return {'ACQUIRED', ARGV[1]}
  `;

  public constructor(private readonly cacheService: ICacheService) {}

  public async getPlaybackSync(roomId: string): Promise<PlaybackSyncPayload | null> {
    const key = `${RedisRoomCacheRepository.PLAYBACK_PREFIX}${roomId}`;
    const raw = await this.cacheService.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PlaybackSyncPayload;
    } catch {
      return null;
    }
  }

  public async setPlaybackSync(
    roomId: string,
    payload: PlaybackSyncPayload,
    ttlSeconds: number = 86400
  ): Promise<void> {
    const key = `${RedisRoomCacheRepository.PLAYBACK_PREFIX}${roomId}`;
    await this.cacheService.set(key, JSON.stringify(payload), ttlSeconds);
  }

  public async getActiveController(roomId: string): Promise<string | null> {
    const key = `${RedisRoomCacheRepository.CONTROLLER_PREFIX}${roomId}`;
    return this.cacheService.get(key);
  }

  public async setActiveController(roomId: string, controllerId: string): Promise<void> {
    const key = `${RedisRoomCacheRepository.CONTROLLER_PREFIX}${roomId}`;
    await this.cacheService.set(key, controllerId, 86400);
  }

  public async compareAndSwapController(
    roomId: string,
    expectedCurrent: string | null,
    newController: string
  ): Promise<boolean> {
    const key = `${RedisRoomCacheRepository.CONTROLLER_PREFIX}${roomId}`;
    const result = await this.cacheService.eval(
      RedisRoomCacheRepository.CAS_CONTROLLER_LUA,
      1,
      key,
      expectedCurrent ?? 'null',
      newController
    );
    return Number(result) === 1;
  }

  public async addPresence(roomId: string, userId: string, socketId: string): Promise<void> {
    const presenceKey = `${RedisRoomCacheRepository.PRESENCE_PREFIX}${roomId}`;
    await this.cacheService.eval("return redis.call('SADD', KEYS[1], ARGV[1])", 1, presenceKey, userId);
    await this.setUserSocketId(userId, socketId);
    await this.refreshHeartbeat(roomId, userId);
  }

  public async removePresence(roomId: string, userId: string): Promise<void> {
    const presenceKey = `${RedisRoomCacheRepository.PRESENCE_PREFIX}${roomId}`;
    await this.cacheService.eval("return redis.call('SREM', KEYS[1], ARGV[1])", 1, presenceKey, userId);
    const heartbeatKey = `${RedisRoomCacheRepository.HEARTBEAT_PREFIX}${roomId}:${userId}`;
    await this.cacheService.delete(heartbeatKey);
    await this.removeUserSocketId(userId);
  }

  public async getActivePresenceUsers(roomId: string): Promise<string[]> {
    const presenceKey = `${RedisRoomCacheRepository.PRESENCE_PREFIX}${roomId}`;
    const result = await this.cacheService.eval("return redis.call('SMEMBERS', KEYS[1])", 1, presenceKey);
    return Array.isArray(result) ? result.map(String) : [];
  }

  public async getUserSocketId(userId: string): Promise<string | null> {
    const key = `${RedisRoomCacheRepository.USER_SOCKET_PREFIX}${userId}`;
    return this.cacheService.get(key);
  }

  public async setUserSocketId(userId: string, socketId: string): Promise<void> {
    const key = `${RedisRoomCacheRepository.USER_SOCKET_PREFIX}${userId}`;
    await this.cacheService.set(key, socketId, 86400);
  }

  public async removeUserSocketId(userId: string): Promise<void> {
    const key = `${RedisRoomCacheRepository.USER_SOCKET_PREFIX}${userId}`;
    await this.cacheService.delete(key);
  }

  public async refreshHeartbeat(roomId: string, userId: string): Promise<void> {
    const key = `${RedisRoomCacheRepository.HEARTBEAT_PREFIX}${roomId}:${userId}`;
    // 9 seconds heartbeat TTL in Redis
    await this.cacheService.set(key, '1', 9);
  }

  public async startTakeoverPrompt(
    roomId: string,
    departedControllerId: string,
    timeoutMs: number
  ): Promise<boolean> {
    const key = `${RedisRoomCacheRepository.TAKEOVER_PREFIX}${roomId}`;
    const now = Date.now();
    const expiresAt = now + timeoutMs;
    const payload = JSON.stringify({
      roomId,
      departedControllerId,
      status: 'PROMPT_ACTIVE',
      expiresAt,
    });
    // Set with timeout in seconds + 5s buffer
    const ttlSeconds = Math.ceil((timeoutMs + 5000) / 1000);
    await this.cacheService.set(key, payload, ttlSeconds);
    return true;
  }

  public async claimTakeover(
    roomId: string,
    claimantUserId: string
  ): Promise<{ claimed: boolean; winnerUserId?: string }> {
    const key = `${RedisRoomCacheRepository.TAKEOVER_PREFIX}${roomId}`;
    const now = Date.now();
    const result = await this.cacheService.eval(
      RedisRoomCacheRepository.CLAIM_TAKEOVER_LUA,
      1,
      key,
      claimantUserId,
      now
    );

    if (!Array.isArray(result) || result.length === 0) {
      return { claimed: false };
    }

    const status = String(result[0]);
    if (status === 'ACQUIRED') {
      return { claimed: true, winnerUserId: claimantUserId };
    }
    if (status === 'ALREADY_CLAIMED') {
      return { claimed: false, winnerUserId: String(result[1]) };
    }
    return { claimed: false };
  }

  public async clearTakeover(roomId: string): Promise<void> {
    const key = `${RedisRoomCacheRepository.TAKEOVER_PREFIX}${roomId}`;
    await this.cacheService.delete(key);
  }

  public async pushEphemeralMessage(
    roomId: string,
    message: RoomChatMessageDto,
    ttlSeconds: number = 7200
  ): Promise<void> {
    const key = `${RedisRoomCacheRepository.EPHEMERAL_CHAT_PREFIX}${roomId}`;
    await this.cacheService.eval(
      "redis.call('RPUSH', KEYS[1], ARGV[1]); redis.call('LTRIM', KEYS[1], -50, -1); redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))",
      1,
      key,
      JSON.stringify(message),
      ttlSeconds
    );
  }

  public async getRecentEphemeralMessages(
    roomId: string,
    limit: number = 50
  ): Promise<RoomChatMessageDto[]> {
    const key = `${RedisRoomCacheRepository.EPHEMERAL_CHAT_PREFIX}${roomId}`;
    const items = await this.cacheService.eval(
      "return redis.call('LRANGE', KEYS[1], -tonumber(ARGV[1]), -1)",
      1,
      key,
      limit
    );
    if (!Array.isArray(items)) return [];
    return items.map((i: any) => JSON.parse(String(i)));
  }

  public async checkRateLimit(
    key: string,
    limit: number,
    windowSeconds: number
  ): Promise<boolean> {
    const fullKey = `${RedisRoomCacheRepository.RATELIMIT_PREFIX}${key}`;
    const result = await this.cacheService.eval(
      "local c = redis.call('INCR', KEYS[1]); if c == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1])) end; return c",
      1,
      fullKey,
      windowSeconds
    );
    return Number(result) <= limit;
  }
}
