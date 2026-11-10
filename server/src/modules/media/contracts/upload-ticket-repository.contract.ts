export type MediaType =
  | 'AVATAR'
  | 'TRACK_AUDIO'
  | 'TRACK_VIDEO'
  | 'TRACK_ARTWORK'
  | 'STAGING';

export type TicketStatus = 'PENDING' | 'PROCESSING' | 'CONFIRMED' | 'REJECTED';

export type LockAcquisitionReason =
  | 'ACQUIRED'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'EXPIRED'
  | 'ALREADY_CONFIRMED'
  | 'REJECTED'
  | 'CONCURRENT_PROCESSING';

export interface IAcquireLockResult {
  readonly acquired: boolean;
  readonly ticket?: IUploadTicket;
  readonly reason: LockAcquisitionReason;
}

/**
 * Upload Ticket Entity
 * Binds an authorized upload session to an authenticated user,
 * server-generated staging key, size boundary, and TTL expiry.
 */
export interface IUploadTicket {
  readonly ticketId: string;
  readonly userId: string;
  readonly stagingKey: string;
  readonly permanentKey?: string;
  readonly mediaType: MediaType;
  readonly expectedContentType: string;
  readonly maxSizeBytes: number;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly status: TicketStatus;
  readonly processingLockedUntil?: number;
  readonly attempts?: number;
  readonly verifiedETag?: string;
}

/**
 * Upload Ticket Repository Contract (SOLID - Dependency Inversion)
 * Isolates persistence of ephemeral upload tickets with atomic state transitions.
 */
export interface IUploadTicketRepository {
  saveTicket(ticket: IUploadTicket, ttlSeconds: number): Promise<void>;
  findTicket(ticketId: string): Promise<IUploadTicket | null>;

  /**
   * Atomically acquires a processing lock (PENDING -> PROCESSING).
   * Prevents concurrent confirmation races, handles idempotency, lock expiry,
   * and controlled recovery for interrupted confirmations.
   */
  acquireProcessingLock(
    ticketId: string,
    userId: string,
    lockTtlMs?: number
  ): Promise<IAcquireLockResult>;

  /**
   * Atomically finalizes the ticket (PROCESSING -> CONFIRMED) and records the permanent key.
   */
  confirmTicket(
    ticketId: string,
    permanentKey: string,
    verifiedETag?: string
  ): Promise<void>;

  /**
   * Releases an in-flight processing lock, either reverting to PENDING (for retry)
   * or marking REJECTED on terminal validation failures.
   */
  releaseProcessingLock(
    ticketId: string,
    markRejected?: boolean,
    reason?: string
  ): Promise<void>;

  deleteTicket(ticketId: string): Promise<void>;
}
