import { ICacheService } from '../../../infrastructure/cache/contracts/cache.contract.js';
import {
  IPlaybackSession,
  IPlaybackSessionRepository,
  PlaybackClientState,
} from '../contracts/playback-session.contract.js';
import {
  SessionNotFoundError,
  UnauthorizedSessionAccessError,
} from '../errors/analytics.errors.js';

export class RedisPlaybackSessionRepository implements IPlaybackSessionRepository {
  private readonly cacheService: ICacheService;
  private static readonly SESSION_PREFIX = 'aadat:playback:session:';

  /**
   * Atomic Lua Script for Progression Validation & Concurrency Safety
   */
  private static readonly UPDATE_HEARTBEAT_LUA = `
    local sessionData = redis.call('GET', KEYS[1])
    if not sessionData then
      return {'NOT_FOUND'}
    end

    local session = cjson.decode(sessionData)
    if session['userId'] ~= ARGV[1] then
      return {'FORBIDDEN'}
    end

    local clientPos = tonumber(ARGV[2]) or 0
    local newState = ARGV[3]
    local clientSpeed = tonumber(ARGV[4]) or 1.0
    local serverNowMs = tonumber(ARGV[5])
    local ttlSec = tonumber(ARGV[6])
    local jitterTolSec = tonumber(ARGV[7]) or 2.0
    local maxIdleSec = tonumber(ARGV[8]) or 120.0

    -- Clamp speed to safe envelope [0.5, 2.0]
    if clientSpeed < 0.5 or clientSpeed > 2.0 then
      clientSpeed = 1.0
    end

    local lastHeartbeatAt = tonumber(session['lastHeartbeatAt'] or serverNowMs)
    local deltaWallSec = (serverNowMs - lastHeartbeatAt) / 1000.0
    if deltaWallSec < 0 then
      deltaWallSec = 0
    end
    if deltaWallSec > maxIdleSec then
      deltaWallSec = maxIdleSec
    end

    local lastPos = tonumber(session['lastPositionSec'] or 0)
    local currentAccum = tonumber(session['accumulatedListenSec'] or 0)
    local trackDuration = tonumber(session['durationSeconds'] or 0)
    local prevState = session['state'] or 'PLAYING'

    local deltaCredit = 0

    if prevState == 'PLAYING' then
      local deltaPos = clientPos - lastPos
      local maxAllowed = (deltaWallSec * clientSpeed) + jitterTolSec

      if deltaPos >= 0 and deltaPos <= maxAllowed then
        -- Normal continuous playback progression
        deltaCredit = deltaPos
      elseif deltaPos > maxAllowed then
        -- Scrub forward / teleportation detected: credit only wall-clock playback duration
        local wallCredit = deltaWallSec * clientSpeed
        if wallCredit < deltaPos then
          deltaCredit = wallCredit
        else
          deltaCredit = deltaPos
        end
      else
        -- Seek backward (rewind): no negative listening time, but zero advancement credit
        deltaCredit = 0
      end
    else
      -- Previous state was PAUSED or BUFFERING: zero listening advancement credit
      deltaCredit = 0
    end

    local newAccum = math.min(currentAccum + deltaCredit, trackDuration)
    local clampedPos = math.min(math.max(0, clientPos), trackDuration)

    session['lastPositionSec'] = clampedPos
    session['accumulatedListenSec'] = newAccum
    session['state'] = newState
    session['playbackSpeed'] = clientSpeed
    session['lastHeartbeatAt'] = serverNowMs
    session['heartbeatCount'] = (tonumber(session['heartbeatCount']) or 0) + 1

    local updatedJson = cjson.encode(session)
    redis.call('SET', KEYS[1], updatedJson, 'EX', ttlSec)

    return {'UPDATED', updatedJson}
  `;

  public constructor(cacheService: ICacheService) {
    this.cacheService = cacheService;
  }

  public async createSession(session: IPlaybackSession, ttlSeconds: number): Promise<void> {
    const key = `${RedisPlaybackSessionRepository.SESSION_PREFIX}${session.sessionId}`;
    await this.cacheService.set(key, JSON.stringify(session), ttlSeconds);
  }

  public async getSession(sessionId: string): Promise<IPlaybackSession | null> {
    const key = `${RedisPlaybackSessionRepository.SESSION_PREFIX}${sessionId}`;
    const raw = await this.cacheService.get(key);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as IPlaybackSession;
    } catch {
      return null;
    }
  }

  public async updateSessionHeartbeat(
    sessionId: string,
    userId: string,
    update: {
      positionSec: number;
      state: PlaybackClientState;
      playbackSpeed: number;
      serverNowMs: number;
      jitterToleranceSec: number;
      maxIdleTimeoutSec: number;
    },
    ttlSeconds: number
  ): Promise<IPlaybackSession> {
    const key = `${RedisPlaybackSessionRepository.SESSION_PREFIX}${sessionId}`;

    const rawResult = await this.cacheService.eval(
      RedisPlaybackSessionRepository.UPDATE_HEARTBEAT_LUA,
      1,
      key,
      userId,
      update.positionSec,
      update.state,
      update.playbackSpeed,
      update.serverNowMs,
      ttlSeconds,
      update.jitterToleranceSec,
      update.maxIdleTimeoutSec
    );

    const result = rawResult as [string, string?];
    const status = result[0];

    if (status === 'NOT_FOUND') {
      throw new SessionNotFoundError(`Playback session ${sessionId} not found or expired.`);
    }

    if (status === 'FORBIDDEN') {
      throw new UnauthorizedSessionAccessError(
        `User ${userId} is not authorized to update playback session ${sessionId}.`
      );
    }

    if (status === 'UPDATED' && result[1]) {
      return JSON.parse(result[1]) as IPlaybackSession;
    }

    throw new Error(`Unexpected Redis heartbeat update status: ${status}`);
  }

  public async deleteSession(sessionId: string): Promise<void> {
    const key = `${RedisPlaybackSessionRepository.SESSION_PREFIX}${sessionId}`;
    await this.cacheService.delete(key);
  }
}

