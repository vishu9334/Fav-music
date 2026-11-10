import { io, Socket } from 'socket.io-client';
import {
  ClientToServerEvents,
  PlaybackMode,
  PlaybackSyncPayload,
  RoomChatMessageDto,
  RoomControlRequestDto,
  RoomDto,
  RoomParticipantDto,
  RoomQueueItemDto,
  ServerToClientEvents,
  TrackDto,
} from '@aadat/contracts';
import { AuthModule } from '../../auth/auth.module';
import { RoomPlaybackBridge } from './room-playback-bridge';
import { useRoomStore } from '../../store/useRoomStore';

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface RoomSocketListener {
  onInitialSync?: (payload: {
    room: RoomDto;
    participants: RoomParticipantDto[];
    currentPlayback: PlaybackSyncPayload | null;
    queue: RoomQueueItemDto[];
    recentEphemeralChat: RoomChatMessageDto[];
    requiresConsentPrompt: boolean;
  }) => void;
  onParticipantJoined?: (participant: RoomParticipantDto) => void;
  onParticipantLeft?: (payload: { userId: string; reason: string }) => void;
  onMessageBroadcast?: (message: RoomChatMessageDto) => void;
  onUserTyping?: (payload: { roomId: string; userId: string; isTyping: boolean }) => void;
  onConsentUpdated?: (payload: { userId: string; hasConsented: boolean }) => void;
  onPlaybackSync?: (payload: PlaybackSyncPayload) => void;
  onPlaybackPaused?: (payload: { roomId: string; positionSeconds: number; reason: string }) => void;
  onTrackChanged?: (payload: { track: TrackDto; positionSeconds: number; serverTimestamp: number }) => void;
  onControlRequestReceived?: (request: RoomControlRequestDto) => void;
  onControlRequestResolved?: (payload: { requestId: string; requesterId: string; status: string }) => void;
  onControlTransferred?: (payload: {
    roomId: string;
    newActiveControllerId: string;
    previousControllerId: string | null;
    originalControllerId: string | null;
    reason: string;
  }) => void;
  onTakeoverPromptStarted?: (payload: {
    roomId: string;
    departedControllerId: string;
    promptTimeoutMs: number;
    expiresAtServerTimestamp: number;
  }) => void;
  onInvitationReceived?: (payload: {
    roomId: string;
    roomName: string;
    invitedBy: { id: string; displayName: string };
  }) => void;
  onError?: (error: { code: string; message: string }) => void;
}

export class RoomSocketClient {
  private static instance: RoomSocketClient | null = null;
  private socket: TypedSocket | null = null;
  private currentRoomId: string | null = null;
  private currentUserId: string | null = null;
  private currentPasscode: string | undefined;
  private connecting: Promise<TypedSocket> | null = null;
  private cancelConnection: (() => void) | null = null;
  private listener: RoomSocketListener = {};

  public constructor(listener: RoomSocketListener = {}) {
    this.listener = listener;
  }

  public static getInstance(): RoomSocketClient {
    if (!RoomSocketClient.instance) {
      RoomSocketClient.instance = new RoomSocketClient();
    }
    return RoomSocketClient.instance;
  }

  public setListener(listener: RoomSocketListener): void {
    this.listener = listener;
  }

  public getSocket(): TypedSocket | null {
    return this.socket;
  }

  public getCurrentRoomId(): string | null {
    return this.currentRoomId;
  }

  public isConnected(): boolean {
    return !!(this.socket && this.socket.connected);
  }

  public connect(userId: string): Promise<TypedSocket> {
    if (this.currentUserId && this.currentUserId !== userId) this.disconnect();
    if (this.socket && this.socket.connected) {
      useRoomStore.getState().setSocketConnected(true);
      return Promise.resolve(this.socket);
    }
    if (this.connecting) return this.connecting;
    if (this.socket) { this.socket.removeAllListeners?.(); this.socket.disconnect(); this.socket = null; }

    this.currentUserId = userId;
    const socketEndpoint =
      process.env.EXPO_PUBLIC_SOCKET_ENDPOINT ||
      'http://10.0.2.2:4000';

    const pending = new Promise<TypedSocket>((resolve, reject) => {
      this.cancelConnection = () => reject(new Error('Room connection cancelled.'));
      AuthModule.getSession()
        .withAccessToken(userId, async (token) => {
          if (this.currentUserId !== userId) { reject(new Error('Room account changed.')); return; }
          const socket = io(socketEndpoint, {
            auth: { token },
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
          }) as TypedSocket;
          this.socket = socket;

          this.bindSocketEvents(this.socket);

          this.socket.on('connect', () => {
            if (this.socket !== socket || this.currentUserId !== userId) return;
            useRoomStore.getState().setSocketConnected(true);
            RoomPlaybackBridge.getInstance().attach(this, userId);
            // Reconnection: automatically re-join the active room to restore presence and state
            if (this.currentRoomId) {
              this.socket?.emit('room:join', { roomId: this.currentRoomId, ...(this.currentPasscode ? { passcode: this.currentPasscode } : {}) });
            }
            resolve(this.socket!);
          });

          this.socket.on('disconnect', () => {
            useRoomStore.getState().setSocketConnected(false);
          });

          this.socket.on('connect_error', (err) => {
            useRoomStore.getState().setSocketConnected(false);
            reject(err);
          });
        })
        .catch(reject);
    });
    this.connecting = pending;
    void pending.finally(() => { if (this.connecting === pending) { this.connecting = null; this.cancelConnection = null; } }).catch(() => {});
    return pending;
  }

  public disconnect(): void {
    this.cancelConnection?.(); this.cancelConnection = null; this.connecting = null;
    useRoomStore.getState().clearInvitations();
    if (this.currentRoomId) {
      void RoomPlaybackBridge.getInstance().onRoomLeft().catch(() => {
        this.listener.onError?.({ code: 'ROOM_AUDIO_UNAVAILABLE', message: 'Room audio could not load. Retry Play or choose another song.' });
      });
      useRoomStore.getState().leaveRoom();
    }
    useRoomStore.getState().setSocketConnected(false);
    RoomPlaybackBridge.getInstance().detach();
    if (this.socket) {
      this.socket.removeAllListeners?.();
      this.socket.disconnect();
      this.socket = null;
    }
    this.currentRoomId = null;
    this.currentUserId = null;
    this.currentPasscode = undefined;
  }

  public joinRoom(roomId: string, passcode?: string): void {
    const trimmed = roomId.trim();
    const normalized = /^[a-z]{4}\d{2}$/i.test(trimmed) ? trimmed.toUpperCase() : trimmed;
    this.currentRoomId = normalized;
    this.currentPasscode = passcode;
    this.socket?.emit('room:join', { roomId: normalized, passcode });
  }

  public leaveRoom(roomId: string): void {
    if (this.currentRoomId === roomId) {
      this.socket?.emit('room:leave', { roomId });
      this.currentRoomId = null;
      this.currentPasscode = undefined;
      void RoomPlaybackBridge.getInstance().onRoomLeft().catch(() => {
        this.listener.onError?.({ code: 'ROOM_AUDIO_UNAVAILABLE', message: 'Room audio could not load. Retry Play or choose another song.' });
      });
      useRoomStore.getState().leaveRoom();
    }
  }

  public sendHeartbeat(roomId: string): void {
    this.socket?.emit('room:heartbeat', {
      roomId,
      clientTimestamp: Date.now(),
    });
  }

  public sendMessage(roomId: string, content: string): void {
    this.socket?.emit('chat:send_message', { roomId, content });
  }

  public sendTyping(roomId: string, isTyping: boolean): void {
    this.socket?.emit('chat:typing', { roomId, isTyping });
  }

  public sendConsentResponse(roomId: string, grantPersistentConsent: boolean): void {
    this.socket?.emit('chat:consent_response', {
      roomId,
      grantPersistentConsent,
    });
  }

  public commandPlay(roomId: string, positionSeconds: number, trackId?: string): void {
    this.socket?.emit('player:command_play', { roomId, positionSeconds, trackId });
  }

  public commandPause(roomId: string, positionSeconds: number): void {
    this.socket?.emit('player:command_pause', { roomId, positionSeconds });
  }

  public commandSeek(roomId: string, targetPositionSeconds: number): void {
    this.socket?.emit('player:command_seek', { roomId, targetPositionSeconds });
  }

  public commandNext(roomId: string): void {
    this.socket?.emit('player:command_next', { roomId });
  }

  public commandPrevious(roomId: string): void {
    this.socket?.emit('player:command_previous', { roomId });
  }

  public toggleMode(roomId: string, mode: PlaybackMode): void {
    this.socket?.emit('player:toggle_mode', { roomId, mode });
  }

  public requestControl(roomId: string): void {
    this.socket?.emit('control:request', { roomId });
  }

  public respondRequest(roomId: string, requestId: string, decision: 'APPROVE' | 'REJECT'): void {
    this.socket?.emit('control:respond_request', { roomId, requestId, decision });
  }

  public claimTakeover(roomId: string): void {
    this.socket?.emit('control:claim_takeover', { roomId });
  }

  public inviteUser(roomId: string, targetUserId: string): void {
    this.socket?.emit('room:invite_user', { roomId, targetUserId });
  }

  public addQueueTrack(roomId: string, trackId: string): void {
    this.socket?.emit('queue:add_track', { roomId, trackId });
  }

  public reorderQueue(roomId: string, queueItemId: string, newOrderIndex: number): void {
    this.socket?.emit('queue:reorder', { roomId, queueItemId, newOrderIndex });
  }

  public removeQueueItem(roomId: string, queueItemId: string): void {
    this.socket?.emit('queue:remove', { roomId, queueItemId });
  }

  private bindSocketEvents(socket: TypedSocket): void {
    socket.on('room:initial_sync', (payload) => {
      this.currentRoomId = payload.room.id;
      useRoomStore.getState().setInitialSync(payload, this.currentUserId ?? '');
      useRoomStore.getState().dismissInvitation(payload.room.id);
      void RoomPlaybackBridge.getInstance().onRoomJoined(payload).catch(() => {
        this.listener.onError?.({ code: 'ROOM_AUDIO_UNAVAILABLE', message: 'Room audio could not load. Retry Play or choose another song.' });
      });
      this.listener.onInitialSync?.(payload);
    });

    socket.on('room:participant_joined', (payload) => {
      useRoomStore.getState().addParticipant(payload.participant);
      this.listener.onParticipantJoined?.(payload.participant);
    });

    socket.on('room:participant_left', (payload) => {
      useRoomStore.getState().removeParticipant(payload.userId);
      this.listener.onParticipantLeft?.(payload);
    });

    socket.on('queue:updated', ({ queue }) => {
      useRoomStore.getState().setQueue(queue);
    });

    socket.on('chat:message_broadcast', (message) => {
      useRoomStore.getState().addChatMessage(message);
      this.listener.onMessageBroadcast?.(message);
    });

    socket.on('chat:user_typing', (payload) => {
      useRoomStore.getState().setUserTyping(payload.userId, payload.isTyping);
      this.listener.onUserTyping?.(payload);
    });

    socket.on('chat:consent_updated', (payload) => {
      useRoomStore.getState().setConsentUpdated(payload.userId, payload.hasConsented);
      this.listener.onConsentUpdated?.(payload);
    });

    socket.on('player:sync_playback', (payload) => {
      void RoomPlaybackBridge.getInstance().onServerPlaybackSync(payload).catch(() => {
        this.listener.onError?.({ code: 'ROOM_AUDIO_UNAVAILABLE', message: 'Room audio could not load. Retry Play or choose another song.' });
      });
      this.listener.onPlaybackSync?.(payload);
    });

    socket.on('player:playback_paused', (payload) => {
      void RoomPlaybackBridge.getInstance().onServerPlaybackPaused(payload).catch(() => {
        this.listener.onError?.({ code: 'ROOM_AUDIO_UNAVAILABLE', message: 'Room audio could not load. Retry Play or choose another song.' });
      });
      this.listener.onPlaybackPaused?.(payload);
    });

    socket.on('player:track_changed', (payload) => {
      void RoomPlaybackBridge.getInstance().onServerTrackChanged(payload).catch(() => {
        this.listener.onError?.({ code: 'ROOM_AUDIO_UNAVAILABLE', message: 'Room audio could not load. Retry Play or choose another song.' });
      });
      this.listener.onTrackChanged?.(payload);
    });

    socket.on('control:request_received', (payload) => {
      useRoomStore.getState().addControlRequest(payload);
      this.listener.onControlRequestReceived?.(payload);
    });

    socket.on('control:request_resolved', (payload) => {
      useRoomStore.getState().removeControlRequest(payload.requestId);
      this.listener.onControlRequestResolved?.(payload);
    });

    socket.on('control:transferred', (payload) => {
      useRoomStore.getState().setController(payload.newActiveControllerId, this.currentUserId ?? '');
      this.listener.onControlTransferred?.(payload);
    });

    socket.on('control:takeover_prompt_started', (payload) => {
      useRoomStore.getState().startTakeover(payload.departedControllerId, payload.expiresAtServerTimestamp);
      this.listener.onTakeoverPromptStarted?.(payload);
    });

    socket.on('room:invitation_received', (payload) => {
      useRoomStore.getState().addInvitation(payload);
      this.listener.onInvitationReceived?.(payload);
    });

    socket.on('room:error', (error) => {
      this.listener.onError?.(error);
    });
  }
}

export const roomSocketClient = RoomSocketClient.getInstance();
