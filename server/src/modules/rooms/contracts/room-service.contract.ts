import {
  ControllerTransferReason,
  ControlRequestStatus,
  PauseReason,
  PlaybackMode,
  PlaybackSyncPayload,
  RoomAccess,
  RoomChatMessageDto,
  RoomChatPolicy,
  RoomControlRequestDto,
  RoomDto,
  RoomParticipantDto,
  RoomQueueItemDto,
} from '@aadat/contracts';

export interface ICreateRoomInput {
  name: string;
  access?: RoomAccess;
  passcode?: string;
  chatPolicy?: RoomChatPolicy;
}

export interface IInitialSyncResult {
  room: RoomDto;
  participants: RoomParticipantDto[];
  currentPlayback: PlaybackSyncPayload | null;
  queue: RoomQueueItemDto[];
  recentEphemeralChat: RoomChatMessageDto[];
  requiresConsentPrompt: boolean;
}

export interface ILeaveRoomResult {
  roomId: string;
  userId: string;
  transferredController?: {
    newActiveControllerId: string;
    previousControllerId: string;
    originalControllerId: string | null;
    reason: ControllerTransferReason;
  };
  takeoverPromptStarted?: {
    departedControllerId: string;
    promptTimeoutMs: number;
    expiresAtServerTimestamp: number;
  };
}

export interface IDisconnectResult {
  roomId: string;
  participantLeft: { userId: string; reason: string };
  transferredController?: {
    newActiveControllerId: string;
    previousControllerId: string;
    originalControllerId: string | null;
    reason: ControllerTransferReason;
  };
  takeoverPromptStarted?: {
    departedControllerId: string;
    promptTimeoutMs: number;
    expiresAtServerTimestamp: number;
  };
}

export interface IRoomService {
  createRoom(userId: string, input: ICreateRoomInput): Promise<RoomDto>;
  getPublicRooms(): Promise<RoomDto[]>;
  getRoom(roomId: string): Promise<RoomDto | null>;
  joinRoom(
    userId: string,
    socketId: string,
    input: { roomId: string; passcode?: string }
  ): Promise<IInitialSyncResult>;
  leaveRoom(userId: string, roomId: string): Promise<ILeaveRoomResult>;
  handleDisconnect(userId: string, socketId: string): Promise<IDisconnectResult[]>;
  handleHeartbeat(roomId: string, userId: string, clientTimestamp: number): Promise<void>;
  sendMessage(
    userId: string,
    userDisplayName: string,
    input: { roomId: string; content: string }
  ): Promise<RoomChatMessageDto>;
  updateChatConsent(
    userId: string,
    roomId: string,
    grantPersistentConsent: boolean
  ): Promise<void>;
  handleCommandPlay(
    userId: string,
    roomId: string,
    positionSeconds: number,
    trackId?: string
  ): Promise<PlaybackSyncPayload>;
  handleCommandPause(
    userId: string,
    roomId: string,
    positionSeconds: number
  ): Promise<{ payload: PlaybackSyncPayload; pauseReason: PauseReason }>;
  handleCommandSeek(
    userId: string,
    roomId: string,
    targetPositionSeconds: number
  ): Promise<PlaybackSyncPayload>;
  handleCommandNext(userId: string, roomId: string): Promise<PlaybackSyncPayload | null>;
  handleCommandPrevious(userId: string, roomId: string): Promise<PlaybackSyncPayload | null>;
  handleToggleMode(
    userId: string,
    roomId: string,
    mode: PlaybackMode
  ): Promise<PlaybackSyncPayload>;
  requestControl(
    requesterId: string,
    roomId: string
  ): Promise<{ activeControllerId: string; request: RoomControlRequestDto }>;
  respondControlRequest(
    activeControllerId: string,
    input: { roomId: string; requestId: string; decision: 'APPROVE' | 'REJECT' }
  ): Promise<{
    transferred: boolean;
    requesterId: string;
    newControllerId?: string;
    originalControllerId: string | null;
    status: ControlRequestStatus;
  }>;
  claimTakeover(
    claimantUserId: string,
    roomId: string
  ): Promise<{
    claimed: boolean;
    activeControllerId: string;
    previousControllerId: string | null;
    originalControllerId: string | null;
  }>;
  addToQueue(userId: string, roomId: string, trackId: string): Promise<RoomQueueItemDto[]>;
  reorderQueue(
    userId: string,
    roomId: string,
    queueItemId: string,
    newOrderIndex: number
  ): Promise<RoomQueueItemDto[]>;
  removeFromQueue(
    userId: string,
    roomId: string,
    queueItemId: string
  ): Promise<RoomQueueItemDto[]>;
  inviteUser(
    inviterUserId: string,
    roomId: string,
    targetUserId: string
  ): Promise<{ roomName: string; invitedBy: { id: string; displayName: string } }>;
}
