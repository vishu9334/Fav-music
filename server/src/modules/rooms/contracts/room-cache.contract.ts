import {
  PlaybackSyncPayload,
  RoomChatMessageDto,
} from '@aadat/contracts';

export interface IRoomCacheRepository {
  // Playback Synchronization
  getPlaybackSync(roomId: string): Promise<PlaybackSyncPayload | null>;
  setPlaybackSync(roomId: string, payload: PlaybackSyncPayload, ttlSeconds?: number): Promise<void>;

  // Active Controller Authority (CAS)
  getActiveController(roomId: string): Promise<string | null>;
  setActiveController(roomId: string, controllerId: string): Promise<void>;
  compareAndSwapController(
    roomId: string,
    expectedCurrent: string | null,
    newController: string
  ): Promise<boolean>;

  // Active Presence & Heartbeats
  addPresence(roomId: string, userId: string, socketId: string): Promise<void>;
  removePresence(roomId: string, userId: string): Promise<void>;
  getActivePresenceUsers(roomId: string): Promise<string[]>;
  getUserSocketId(userId: string): Promise<string | null>;
  setUserSocketId(userId: string, socketId: string): Promise<void>;
  removeUserSocketId(userId: string): Promise<void>;
  refreshHeartbeat(roomId: string, userId: string): Promise<void>;

  // Dynamic Takeover Protocol
  startTakeoverPrompt(roomId: string, departedControllerId: string, timeoutMs: number): Promise<boolean>;
  claimTakeover(roomId: string, claimantUserId: string): Promise<{ claimed: boolean; winnerUserId?: string }>;
  clearTakeover(roomId: string): Promise<void>;

  // Ephemeral Chat Buffer
  pushEphemeralMessage(roomId: string, message: RoomChatMessageDto, ttlSeconds?: number): Promise<void>;
  getRecentEphemeralMessages(roomId: string, limit?: number): Promise<RoomChatMessageDto[]>;

  // Socket Rate Limiting
  checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}

