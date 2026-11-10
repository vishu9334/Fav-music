import { ICacheService } from '../../../infrastructure/cache/contracts/cache.contract.js';
import {
  IAcquireLockResult,
  IUploadTicket,
  IUploadTicketRepository,
  LockAcquisitionReason,
} from '../contracts/upload-ticket-repository.contract.js';

/**
 * Redis-backed Upload Ticket Repository
 * Adheres to class-based OOP, SOLID, and DI.
 * Uses atomic Lua scripts for concurrency protection, single-use ticket consumption,
 * and lock recovery.
 */
export class RedisUploadTicketRepository implements IUploadTicketRepository {
  private readonly cacheService: ICacheService;
  private static readonly TICKET_PREFIX = 'aadat:media:ticket:';

  /**
   * Atomic Lua Script for Lock Acquisition (PENDING -> PROCESSING)
   */
  private static readonly ACQUIRE_LOCK_LUA = `
    local ticketData = redis.call('GET', KEYS[1])
    if not ticketData then
      return {'NOT_FOUND'}
    end

    local ticket = cjson.decode(ticketData)
    if ticket['userId'] ~= ARGV[1] then
      return {'FORBIDDEN'}
    end

    local now = tonumber(ARGV[2])
    if now > ticket['expiresAt'] then
      return {'EXPIRED'}
    end

    if ticket['status'] == 'CONFIRMED' then
      return {'ALREADY_CONFIRMED', ticketData}
    end

    if ticket['status'] == 'REJECTED' then
      return {'REJECTED'}
    end

    if ticket['status'] == 'PROCESSING' then
      local lockUntil = tonumber(ticket['processingLockedUntil'] or 0)
      if now < lockUntil then
        return {'CONCURRENT_PROCESSING'}
      end
      -- Lock expired; allow recovery!
    end

    ticket['status'] = 'PROCESSING'
    ticket['processingLockedUntil'] = now + tonumber(ARGV[3])
    ticket['attempts'] = (ticket['attempts'] or 0) + 1

    local updatedJson = cjson.encode(ticket)
    local remainingTtl = math.max(1, math.floor((ticket['expiresAt'] - now) / 1000))
    redis.call('SET', KEYS[1], updatedJson, 'EX', remainingTtl)

    return {'ACQUIRED', updatedJson}
  `;

  /**
   * Atomic Lua Script for Confirmation (PROCESSING -> CONFIRMED)
   */
  private static readonly CONFIRM_TICKET_LUA = `
    local ticketData = redis.call('GET', KEYS[1])
    if not ticketData then
      return 0
    end

    local ticket = cjson.decode(ticketData)
    ticket['status'] = 'CONFIRMED'
    ticket['permanentKey'] = ARGV[1]
    ticket['verifiedETag'] = ARGV[2]
    ticket['processingLockedUntil'] = nil

    local now = tonumber(ARGV[3])
    local remainingTtl = math.max(1, math.floor((ticket['expiresAt'] - now) / 1000))
    redis.call('SET', KEYS[1], cjson.encode(ticket), 'EX', remainingTtl)
    return 1
  `;

  /**
   * Atomic Lua Script for Releasing Lock
   */
  private static readonly RELEASE_LOCK_LUA = `
    local ticketData = redis.call('GET', KEYS[1])
    if not ticketData then
      return 0
    end

    local ticket = cjson.decode(ticketData)
    if ARGV[1] == 'true' then
      ticket['status'] = 'REJECTED'
    else
      ticket['status'] = 'PENDING'
    end
    ticket['processingLockedUntil'] = nil

    local now = tonumber(ARGV[2])
    local remainingTtl = math.max(1, math.floor((ticket['expiresAt'] - now) / 1000))
    redis.call('SET', KEYS[1], cjson.encode(ticket), 'EX', remainingTtl)
    return 1
  `;

  public constructor(cacheService: ICacheService) {
    this.cacheService = cacheService;
  }

  public async saveTicket(ticket: IUploadTicket, ttlSeconds: number): Promise<void> {
    const key = `${RedisUploadTicketRepository.TICKET_PREFIX}${ticket.ticketId}`;
    await this.cacheService.set(key, JSON.stringify(ticket), ttlSeconds);
  }

  public async findTicket(ticketId: string): Promise<IUploadTicket | null> {
    const key = `${RedisUploadTicketRepository.TICKET_PREFIX}${ticketId}`;
    const raw = await this.cacheService.get(key);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as IUploadTicket;
    } catch {
      return null;
    }
  }

  public async acquireProcessingLock(
    ticketId: string,
    userId: string,
    lockTtlMs: number = 30000
  ): Promise<IAcquireLockResult> {
    const key = `${RedisUploadTicketRepository.TICKET_PREFIX}${ticketId}`;
    const now = Date.now();

    const rawResult = await this.cacheService.eval(
      RedisUploadTicketRepository.ACQUIRE_LOCK_LUA,
      1,
      key,
      userId,
      now,
      lockTtlMs
    );

    if (!Array.isArray(rawResult) || rawResult.length === 0) {
      return { acquired: false, reason: 'NOT_FOUND' };
    }

    const reason = rawResult[0] as LockAcquisitionReason;
    const ticketPayload = rawResult[1] as string | undefined;

    let parsedTicket: IUploadTicket | undefined;
    if (ticketPayload) {
      try {
        parsedTicket = JSON.parse(ticketPayload) as IUploadTicket;
      } catch {
        // Ignored
      }
    }

    return {
      acquired: reason === 'ACQUIRED',
      ticket: parsedTicket,
      reason,
    };
  }

  public async confirmTicket(
    ticketId: string,
    permanentKey: string,
    verifiedETag: string = ''
  ): Promise<void> {
    const key = `${RedisUploadTicketRepository.TICKET_PREFIX}${ticketId}`;
    const now = Date.now();

    await this.cacheService.eval(
      RedisUploadTicketRepository.CONFIRM_TICKET_LUA,
      1,
      key,
      permanentKey,
      verifiedETag,
      now
    );
  }

  public async releaseProcessingLock(
    ticketId: string,
    markRejected: boolean = false,
    _reason?: string
  ): Promise<void> {
    const key = `${RedisUploadTicketRepository.TICKET_PREFIX}${ticketId}`;
    const now = Date.now();

    await this.cacheService.eval(
      RedisUploadTicketRepository.RELEASE_LOCK_LUA,
      1,
      key,
      markRejected ? 'true' : 'false',
      now
    );
  }

  public async deleteTicket(ticketId: string): Promise<void> {
    const key = `${RedisUploadTicketRepository.TICKET_PREFIX}${ticketId}`;
    await this.cacheService.delete(key);
  }
}
