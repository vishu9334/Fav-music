import {
  ControllerTransferReason,
  ControlRequestStatus,
  PauseReason,
  PlaybackMode,
  PlaybackState,
  RoomChatPolicy,
} from '../enums/index.js';
import {
  RoomChatMessageDto,
  RoomControlRequestDto,
  RoomDto,
  RoomParticipantDto,
  RoomQueueItemDto,
} from '../dtos/room.dto.js';
import { TrackDto } from '../dtos/catalog.dto.js';

/**
 * Server-authoritative playback sync payload
 */
export interface PlaybackSyncPayload {
  roomId: string;
  trackId: string;
  playbackMode: PlaybackMode;
  playbackState: PlaybackState;
  positionSeconds: number;
  serverTimestamp: number;
  activeControllerId: string;
  playbackRate: number;
}

/**
 * Client to Server Socket Events
 */
export interface ClientToServerEvents {
  // Room Connection & Presence
  'room:join': (payload: { roomId: string; passcode?: string }) => void;
  'room:leave': (payload: { roomId: string }) => void;
  'room:heartbeat': (payload: { roomId: string; clientTimestamp: number }) => void;

  // Chat & Explicit Consent
  'chat:send_message': (payload: { roomId: string; content: string }) => void;
  'chat:consent_response': (payload: { roomId: string; grantPersistentConsent: boolean }) => void;
  'chat:typing': (payload: { roomId: string; isTyping: boolean }) => void;

  // Room Invitations
  'room:invite_user': (payload: { roomId: string; targetUserId: string }) => void;

  // Authoritative Playback Commands (Active Controller Only)
  'player:command_play': (payload: { roomId: string; positionSeconds: number; trackId?: string }) => void;
  'player:command_pause': (payload: { roomId: string; positionSeconds: number }) => void;
  'player:command_seek': (payload: { roomId: string; targetPositionSeconds: number }) => void;
  'player:command_next': (payload: { roomId: string }) => void;
  'player:command_previous': (payload: { roomId: string }) => void;
  'player:toggle_mode': (payload: { roomId: string; mode: PlaybackMode }) => void;

  // Dynamic Controller Protocol
  'control:request': (payload: { roomId: string }) => void;
  'control:respond_request': (payload: {
    roomId: string;
    requestId: string;
    decision: 'APPROVE' | 'REJECT';
  }) => void;
  'control:claim_takeover': (payload: { roomId: string }) => void;

  // Queue Operations
  'queue:add_track': (payload: { roomId: string; trackId: string }) => void;
  'queue:reorder': (payload: { roomId: string; queueItemId: string; newOrderIndex: number }) => void;
  'queue:remove': (payload: { roomId: string; queueItemId: string }) => void;
}

/**
 * Server to Client Socket Events
 */
export interface ServerToClientEvents {
  // Room Snapshot on Join
  'room:initial_sync': (payload: {
    room: RoomDto;
    participants: RoomParticipantDto[];
    currentPlayback: PlaybackSyncPayload | null;
    queue: RoomQueueItemDto[];
    recentEphemeralChat: RoomChatMessageDto[];
    requiresConsentPrompt: boolean;
  }) => void;

  // Presence Updates
  'room:participant_joined': (payload: { participant: RoomParticipantDto }) => void;
  'room:participant_left': (payload: { userId: string; reason: string }) => void;
  'room:error': (payload: { code: string; message: string }) => void;

  // Chat & Consent Events
  'chat:consent_required': (payload: {
    roomId: string;
    policy: RoomChatPolicy;
    message: string;
  }) => void;
  'chat:consent_updated': (payload: { userId: string; hasConsented: boolean }) => void;
  'chat:message_broadcast': (payload: RoomChatMessageDto) => void;
  'chat:user_typing': (payload: { roomId: string; userId: string; isTyping: boolean }) => void;

  // Invitations
  'room:invitation_received': (payload: {
    roomId: string;
    roomName: string;
    invitedBy: { id: string; displayName: string };
  }) => void;

  // Authoritative Playback Sync
  'player:sync_playback': (payload: PlaybackSyncPayload) => void;
  'player:playback_paused': (payload: {
    roomId: string;
    positionSeconds: number;
    reason: PauseReason;
    serverTimestamp: number;
  }) => void;
  'player:track_changed': (payload: {
    track: TrackDto;
    positionSeconds: number;
    serverTimestamp: number;
  }) => void;

  // Dynamic Controller Lifecycle
  'control:request_received': (payload: RoomControlRequestDto) => void; // Sent only to active controller
  'control:request_resolved': (payload: {
    requestId: string;
    requesterId: string;
    status: ControlRequestStatus;
  }) => void;
  'control:transferred': (payload: {
    roomId: string;
    newActiveControllerId: string;
    previousControllerId: string | null;
    originalControllerId: string | null;
    reason: ControllerTransferReason;
    serverTimestamp: number;
  }) => void;

  // Takeover Lifecycle (15s prompt window, immediate pause on timeout, then 5s cleanup)
  'control:takeover_prompt_started': (payload: {
    roomId: string;
    departedControllerId: string;
    promptTimeoutMs: number; // 15_000 ms
    expiresAtServerTimestamp: number;
  }) => void;
  'control:takeover_failed_cleanup_started': (payload: {
    roomId: string;
    cleanupIntervalMs: number; // 5_000 ms
    scheduledCleanupServerTimestamp: number;
  }) => void;
  'control:session_cleared': (payload: {
    roomId: string;
    reason: string;
    serverTimestamp: number;
  }) => void;

  // Queue Updates
  'queue:updated': (payload: { queue: RoomQueueItemDto[] }) => void;
}

