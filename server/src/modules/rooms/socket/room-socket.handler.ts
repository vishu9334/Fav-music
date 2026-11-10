import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import {
  ClientToServerEvents,
  ControllerTransferReason,
  ServerToClientEvents,
} from '@aadat/contracts';
import { IAuthGuard } from '../../../shared/guards/contracts/auth-guard.contract.js';
import { IRoomService } from '../contracts/room-service.contract.js';
import { IRoomCacheRepository } from '../contracts/room-cache.contract.js';

export interface IRoomSocketHandlerDependencies {
  readonly roomService: IRoomService;
  readonly roomCache: IRoomCacheRepository;
  readonly authGuard: IAuthGuard;
  readonly corsOrigins?: string[];
}

export class RoomSocketHandler {
  private io: SocketIOServer<ClientToServerEvents, ServerToClientEvents> | null = null;
  private readonly roomService: IRoomService;
  private readonly roomCache: IRoomCacheRepository;
  private readonly authGuard: IAuthGuard;
  private readonly corsOrigins: string[];

  public constructor(dependencies: IRoomSocketHandlerDependencies) {
    this.roomService = dependencies.roomService;
    this.roomCache = dependencies.roomCache;
    this.authGuard = dependencies.authGuard;
    this.corsOrigins = dependencies.corsOrigins ?? ['*'];
  }

  public initialize(server: HttpServer): SocketIOServer<ClientToServerEvents, ServerToClientEvents> {
    this.io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(server, {
      cors: {
        origin: this.corsOrigins.includes('*') ? '*' : this.corsOrigins,
        methods: ['GET', 'POST'],
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 10000,
      pingInterval: 5000,
    });

    // Connection Authentication Guard
    this.io.use(async (socket, next) => {
      try {
        const token =
          socket.handshake.auth?.token ||
          socket.handshake.headers?.authorization;

        if (!token) {
          return next(new Error('Authentication required'));
        }

        const formattedToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
        const userContext = await this.authGuard.validateToken(formattedToken);

        socket.data.userId = userContext.userId;
        socket.data.email = userContext.email;
        socket.data.displayName = userContext.email?.split('@')[0] ?? 'User';

        await this.roomCache.setUserSocketId(userContext.userId, socket.id);
        next();
      } catch (error: any) {
        next(new Error(error?.message || 'Unauthorized'));
      }
    });

    this.io.on('connection', (socket: Socket) => {
      this.handleConnection(socket);
    });

    return this.io;
  }

  private handleConnection(socket: Socket) {
    const userId: string = socket.data.userId;
    const displayName: string = socket.data.displayName;

    // Disconnect
    socket.on('disconnect', async () => {
      try {
        await this.roomCache.removeUserSocketId(userId);
        const results = await this.roomService.handleDisconnect(userId, socket.id);

        for (const res of results) {
          const roomChannel = `room:${res.roomId}`;
          this.io?.to(roomChannel).emit('room:participant_left', res.participantLeft);

          if (res.transferredController) {
            this.io?.to(roomChannel).emit('control:transferred', {
              roomId: res.roomId,
              newActiveControllerId: res.transferredController.newActiveControllerId,
              previousControllerId: res.transferredController.previousControllerId,
              originalControllerId: res.transferredController.originalControllerId,
              reason: res.transferredController.reason,
              serverTimestamp: Date.now(),
            });
          }

          if (res.takeoverPromptStarted) {
            this.io?.to(roomChannel).emit('control:takeover_prompt_started', {
              roomId: res.roomId,
              departedControllerId: res.takeoverPromptStarted.departedControllerId,
              promptTimeoutMs: res.takeoverPromptStarted.promptTimeoutMs,
              expiresAtServerTimestamp: res.takeoverPromptStarted.expiresAtServerTimestamp,
            });
          }
        }
      } catch (err: any) {
        socket.emit('room:error', { code: 'DISCONNECT_ERROR', message: err?.message });
      }
    });

    // 1. Room Join
    socket.on('room:join', async (payload: { roomId: string; passcode?: string }) => {
      try {
        const sync = await this.roomService.joinRoom(userId, socket.id, payload);
        const roomChannel = `room:${sync.room.id}`;
        socket.join(roomChannel);

        socket.emit('room:initial_sync', sync);

        const currentParticipant = sync.participants.find((p) => p.userId === userId);
        if (currentParticipant) {
          socket.to(roomChannel).emit('room:participant_joined', { participant: currentParticipant });
        }
      } catch (err: any) {
        socket.emit('room:error', { code: 'JOIN_ERROR', message: err?.message || 'Could not join room' });
      }
    });

    // 2. Room Leave
    socket.on('room:leave', async (payload: { roomId: string }) => {
      try {
        const roomChannel = `room:${payload.roomId}`;
        socket.leave(roomChannel);
        const res = await this.roomService.leaveRoom(userId, payload.roomId);

        this.io?.to(roomChannel).emit('room:participant_left', { userId, reason: 'LEFT' });

        if (res.transferredController) {
          this.io?.to(roomChannel).emit('control:transferred', {
            roomId: res.roomId,
            newActiveControllerId: res.transferredController.newActiveControllerId,
            previousControllerId: res.transferredController.previousControllerId,
            originalControllerId: res.transferredController.originalControllerId,
            reason: res.transferredController.reason,
            serverTimestamp: Date.now(),
          });
        }

        if (res.takeoverPromptStarted) {
          this.io?.to(roomChannel).emit('control:takeover_prompt_started', {
            roomId: res.roomId,
            departedControllerId: res.takeoverPromptStarted.departedControllerId,
            promptTimeoutMs: res.takeoverPromptStarted.promptTimeoutMs,
            expiresAtServerTimestamp: res.takeoverPromptStarted.expiresAtServerTimestamp,
          });
        }
      } catch (err: any) {
        socket.emit('room:error', { code: 'LEAVE_ERROR', message: err?.message });
      }
    });

    // 3. Heartbeat
    socket.on('room:heartbeat', async (payload: { roomId: string; clientTimestamp: number }) => {
      await this.roomService.handleHeartbeat(payload.roomId, userId, payload.clientTimestamp);
    });

    // 4. Chat Messages
    socket.on('chat:send_message', async (payload: { roomId: string; content: string }) => {
      try {
        const messageDto = await this.roomService.sendMessage(userId, displayName, payload);
        this.io?.to(`room:${payload.roomId}`).emit('chat:message_broadcast', messageDto);
      } catch (err: any) {
        socket.emit('room:error', { code: 'CHAT_ERROR', message: err?.message });
      }
    });

    // 5. Chat Typing Indicator
    socket.on('chat:typing', (payload: { roomId: string; isTyping: boolean }) => {
      socket.to(`room:${payload.roomId}`).emit('chat:user_typing', {
        roomId: payload.roomId,
        userId,
        isTyping: payload.isTyping,
      });
    });

    // 6. Chat Consent Response
    socket.on('chat:consent_response', async (payload: { roomId: string; grantPersistentConsent: boolean }) => {
      try {
        await this.roomService.updateChatConsent(userId, payload.roomId, payload.grantPersistentConsent);
        this.io?.to(`room:${payload.roomId}`).emit('chat:consent_updated', {
          userId,
          hasConsented: payload.grantPersistentConsent,
        });
      } catch (err: any) {
        socket.emit('room:error', { code: 'CONSENT_ERROR', message: err?.message });
      }
    });

    // 7. Authoritative Playback Commands
    socket.on('player:command_play', async (payload: { roomId: string; positionSeconds: number; trackId?: string }) => {
      try {
        const sync = await this.roomService.handleCommandPlay(userId, payload.roomId, payload.positionSeconds, payload.trackId);
        this.io?.to(`room:${payload.roomId}`).emit('player:sync_playback', sync);
      } catch (err: any) {
        socket.emit('room:error', { code: 'PLAYBACK_COMMAND_ERROR', message: err?.message });
      }
    });

    socket.on('player:command_pause', async (payload: { roomId: string; positionSeconds: number }) => {
      try {
        const { payload: sync, pauseReason } = await this.roomService.handleCommandPause(
          userId,
          payload.roomId,
          payload.positionSeconds
        );
        this.io?.to(`room:${payload.roomId}`).emit('player:playback_paused', {
          roomId: payload.roomId,
          positionSeconds: sync.positionSeconds,
          reason: pauseReason,
          serverTimestamp: Date.now(),
        });
      } catch (err: any) {
        socket.emit('room:error', { code: 'PLAYBACK_COMMAND_ERROR', message: err?.message });
      }
    });

    socket.on('player:command_seek', async (payload: { roomId: string; targetPositionSeconds: number }) => {
      try {
        const sync = await this.roomService.handleCommandSeek(
          userId,
          payload.roomId,
          payload.targetPositionSeconds
        );
        this.io?.to(`room:${payload.roomId}`).emit('player:sync_playback', sync);
      } catch (err: any) {
        socket.emit('room:error', { code: 'PLAYBACK_COMMAND_ERROR', message: err?.message });
      }
    });

    socket.on('player:command_next', async (payload: { roomId: string }) => {
      try {
        const sync = await this.roomService.handleCommandNext(userId, payload.roomId);
        if (sync) {
          this.io?.to(`room:${payload.roomId}`).emit('player:sync_playback', sync);
        }
      } catch (err: any) {
        socket.emit('room:error', { code: 'PLAYBACK_COMMAND_ERROR', message: err?.message });
      }
    });

    socket.on('player:command_previous', async (payload: { roomId: string }) => {
      try {
        const sync = await this.roomService.handleCommandPrevious(userId, payload.roomId);
        if (sync) {
          this.io?.to(`room:${payload.roomId}`).emit('player:sync_playback', sync);
        }
      } catch (err: any) {
        socket.emit('room:error', { code: 'PLAYBACK_COMMAND_ERROR', message: err?.message });
      }
    });

    // 8. Dynamic Controller Protocol
    socket.on('control:request', async (payload: { roomId: string }) => {
      try {
        const { activeControllerId, request } = await this.roomService.requestControl(userId, payload.roomId);
        const controllerSocketId = await this.roomCache.getUserSocketId(activeControllerId);
        if (controllerSocketId) {
          this.io?.to(controllerSocketId).emit('control:request_received', request);
        }
      } catch (err: any) {
        socket.emit('room:error', { code: 'CONTROL_REQUEST_ERROR', message: err?.message });
      }
    });

    socket.on(
      'control:respond_request',
      async (payload: { roomId: string; requestId: string; decision: 'APPROVE' | 'REJECT' }) => {
        try {
          const res = await this.roomService.respondControlRequest(userId, payload);
          const roomChannel = `room:${payload.roomId}`;

          this.io?.to(roomChannel).emit('control:request_resolved', {
            requestId: payload.requestId,
            requesterId: res.requesterId,
            status: res.status,
          });

          if (res.transferred && res.newControllerId) {
            this.io?.to(roomChannel).emit('control:transferred', {
              roomId: payload.roomId,
              newActiveControllerId: res.newControllerId,
              previousControllerId: userId,
              originalControllerId: res.originalControllerId,
              reason: ControllerTransferReason.REQUEST_APPROVED,
              serverTimestamp: Date.now(),
            });
          }
        } catch (err: any) {
          socket.emit('room:error', { code: 'CONTROL_RESPONSE_ERROR', message: err?.message });
        }
      }
    );

    socket.on('control:claim_takeover', async (payload: { roomId: string }) => {
      try {
        const res = await this.roomService.claimTakeover(userId, payload.roomId);
        if (res.claimed) {
          this.io?.to(`room:${payload.roomId}`).emit('control:transferred', {
            roomId: payload.roomId,
            newActiveControllerId: res.activeControllerId,
            previousControllerId: res.previousControllerId,
            originalControllerId: res.originalControllerId,
            reason: ControllerTransferReason.TAKEOVER_CLAIMED,
            serverTimestamp: Date.now(),
          });
        }
      } catch (err: any) {
        socket.emit('room:error', { code: 'TAKEOVER_ERROR', message: err?.message });
      }
    });

    // 9. Invitations
    socket.on('room:invite_user', async (payload: { roomId: string; targetUserId: string }) => {
      try {
        const { roomName, invitedBy } = await this.roomService.inviteUser(
          userId,
          payload.roomId,
          payload.targetUserId
        );
        const targetSocketId = await this.roomCache.getUserSocketId(payload.targetUserId);
        if (targetSocketId) {
          this.io?.to(targetSocketId).emit('room:invitation_received', {
            roomId: payload.roomId,
            roomName,
            invitedBy,
          });
        }
      } catch (err: any) {
        socket.emit('room:error', { code: 'INVITE_ERROR', message: err?.message });
      }
    });

    // 10. Queue Operations
    socket.on('queue:add_track', async (payload: { roomId: string; trackId: string }) => {
      try {
        const queue = await this.roomService.addToQueue(userId, payload.roomId, payload.trackId);
        this.io?.to(`room:${payload.roomId}`).emit('queue:updated', { queue });
      } catch (err: any) {
        socket.emit('room:error', { code: 'QUEUE_ERROR', message: err?.message });
      }
    });

    socket.on(
      'queue:reorder',
      async (payload: { roomId: string; queueItemId: string; newOrderIndex: number }) => {
        try {
          const queue = await this.roomService.reorderQueue(
            userId,
            payload.roomId,
            payload.queueItemId,
            payload.newOrderIndex
          );
          this.io?.to(`room:${payload.roomId}`).emit('queue:updated', { queue });
        } catch (err: any) {
          socket.emit('room:error', { code: 'QUEUE_ERROR', message: err?.message });
        }
      }
    );

    socket.on('queue:remove', async (payload: { roomId: string; queueItemId: string }) => {
      try {
        const queue = await this.roomService.removeFromQueue(userId, payload.roomId, payload.queueItemId);
        this.io?.to(`room:${payload.roomId}`).emit('queue:updated', { queue });
      } catch (err: any) {
        socket.emit('room:error', { code: 'QUEUE_ERROR', message: err?.message });
      }
    });
  }

  public getIO(): SocketIOServer<ClientToServerEvents, ServerToClientEvents> | null {
    return this.io;
  }
}
