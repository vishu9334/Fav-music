import crypto from 'crypto';
import {
  ChatRetentionPreference,
  ControllerTransferReason,
  ControlRequestStatus,
  MAX_ROOM_PARTICIPANTS,
  PauseReason,
  PlaybackMode,
  PlaybackState,
  PlaybackSyncPayload,
  RoomAccess,
  RoomChatMessageDto,
  RoomChatPolicy,
  RoomControlRequestDto,
  RoomDto,
  RoomParticipantDto,
  RoomQueueItemDto,
  TAKEOVER_PROMPT_TIMEOUT_MS,
  TrackDto,
  UserDto,
} from '@aadat/contracts';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationFailedError,
} from '../../../shared/errors/domain.error.js';
import { IRoomRepository } from '../contracts/room-repository.contract.js';
import { IRoomCacheRepository } from '../contracts/room-cache.contract.js';
import {
  ICreateRoomInput,
  IDisconnectResult,
  IInitialSyncResult,
  ILeaveRoomResult,
  IRoomService,
} from '../contracts/room-service.contract.js';

export interface IRoomServiceDependencies {
  readonly roomRepository: IRoomRepository;
  readonly roomCacheRepository: IRoomCacheRepository;
}

export class RoomService implements IRoomService {
  private readonly roomRepository: IRoomRepository;
  private readonly roomCache: IRoomCacheRepository;

  public constructor(dependencies: IRoomServiceDependencies) {
    this.roomRepository = dependencies.roomRepository;
    this.roomCache = dependencies.roomCacheRepository;
  }

  private toUserDto(user: any, fallbackId: string, fallbackName: string): UserDto {
    return {
      id: user?.id ?? fallbackId,
      email: user?.email ?? '',
      displayName: user?.displayName ?? fallbackName,
      avatarKey: user?.avatarKey ?? null,
      avatarUrl: null,
      chatRetentionPreference:
        (user?.chatRetentionPreference as ChatRetentionPreference) ??
        ChatRetentionPreference.EPHEMERAL_SESSION_ONLY,
      createdAt:
        user?.createdAt instanceof Date
          ? user.createdAt.toISOString()
          : new Date().toISOString(),
    };
  }

  private toTrackDto(track: any, trackId: string, addedAt?: Date): TrackDto {
    return {
      id: track?.id ?? trackId,
      title: track?.title ?? 'Track',
      artistName: track?.artistName ?? 'Artist',
      albumName: track?.albumName ?? null,
      durationSeconds: track?.durationSeconds ?? 180,
      audioKey: track?.audioKey ?? '',
      videoKey: null,
      artworkKey: track?.artworkKey ?? '',
      timeAffinities: [],
      weatherAffinities: [],
      seasonAffinities: [],
      energyScore: 0.5,
      tempoBpm: null,
      createdAt: addedAt instanceof Date ? addedAt.toISOString() : new Date().toISOString(),
    };
  }

  private toQueueItemDto(q: any): RoomQueueItemDto {
    return {
      id: q.id,
      roomId: q.roomId,
      trackId: q.trackId,
      track: this.toTrackDto(q.track, q.trackId, q.addedAt),
      suggestedBy: this.toUserDto(
        q.suggestedBy,
        typeof q.suggestedBy === 'string' ? q.suggestedBy : 'user',
        'Participant'
      ),
      orderIndex: q.orderIndex,
      addedAt: q.addedAt instanceof Date ? q.addedAt.toISOString() : new Date().toISOString(),
    };
  }

  public async createRoom(userId: string, input: ICreateRoomInput): Promise<RoomDto> {
    const name = (input.name || '').trim();
    if (!name || name.length > 80) {
      throw new ValidationFailedError('Room name must be between 1 and 80 characters');
    }

    const access = input.access ?? RoomAccess.PUBLIC;
    const chatPolicy = input.chatPolicy ?? RoomChatPolicy.EPHEMERAL_SESSION_ONLY;

    let passcodeHash: string | null = null;
    if (access === RoomAccess.PRIVATE) {
      const passcode = (input.passcode || '').trim();
      if (!passcode || passcode.length < 4) {
        throw new ValidationFailedError('Private rooms require a passcode of at least 4 characters');
      }
      passcodeHash = crypto.createHash('sha256').update(passcode).digest('hex');
    }

    const created = await this.roomRepository.createRoom({
      name,
      access,
      chatPolicy,
      passcodeHash,
      hostUserId: userId,
      originalControllerId: userId,
      activeControllerId: userId,
    });

    // Synchronize initial active controller in Redis
    await this.roomCache.setActiveController(created.id, userId);

    return {
      id: created.id,
      name: created.name,
      access: created.access,
      chatPolicy: created.chatPolicy,
      hostUserId: created.hostUserId,
      originalControllerId: created.originalControllerId,
      activeControllerId: created.activeControllerId,
      currentTrackId: null,
      participantCount: 1,
      maxParticipants: MAX_ROOM_PARTICIPANTS,
      createdAt: created.createdAt.toISOString(),
    };
  }

  public async getPublicRooms(): Promise<RoomDto[]> {
    const rooms = await this.roomRepository.findPublicRooms();
    const result: RoomDto[] = [];

    for (const r of rooms) {
      const count = await this.roomRepository.getParticipantCount(r.id);
      const activeController = (await this.roomCache.getActiveController(r.id)) ?? r.activeControllerId;
      const playback = await this.roomCache.getPlaybackSync(r.id);

      result.push({
        id: r.id,
        name: r.name,
        access: r.access,
        chatPolicy: r.chatPolicy,
        hostUserId: r.hostUserId,
        originalControllerId: r.originalControllerId,
        activeControllerId: activeController,
        currentTrackId: playback?.trackId ?? null,
        participantCount: count,
        maxParticipants: MAX_ROOM_PARTICIPANTS,
        createdAt: r.createdAt.toISOString(),
      });
    }

    return result;
  }

  public async getRoom(roomId: string): Promise<RoomDto | null> {
    const room = await this.roomRepository.findRoomById(roomId);
    if (!room) return null;

    const count = await this.roomRepository.getParticipantCount(room.id);
    const activeController = (await this.roomCache.getActiveController(room.id)) ?? room.activeControllerId;
    const playback = await this.roomCache.getPlaybackSync(room.id);

    return {
      id: room.id,
      name: room.name,
      access: room.access,
      chatPolicy: room.chatPolicy,
      hostUserId: room.hostUserId,
      originalControllerId: room.originalControllerId,
      activeControllerId: activeController,
      currentTrackId: playback?.trackId ?? null,
      participantCount: count,
      maxParticipants: MAX_ROOM_PARTICIPANTS,
      createdAt: room.createdAt.toISOString(),
    };
  }

  public async joinRoom(
    userId: string,
    socketId: string,
    input: { roomId: string; passcode?: string }
  ): Promise<IInitialSyncResult> {
    const room = await this.roomRepository.findRoomById(input.roomId);
    if (!room) {
      throw new NotFoundError(`Room with ID "${input.roomId}" not found`);
    }

    // Passcode check for private rooms
    if (room.access === RoomAccess.PRIVATE && room.hostUserId !== userId) {
      const inputPasscode = (input.passcode || '').trim();
      const hash = crypto.createHash('sha256').update(inputPasscode).digest('hex');
      if (hash !== room.passcodeHash) {
        throw new ForbiddenError('Incorrect room passcode');
      }
    }

    // Participant capacity check (strictly max 10)
    const currentParticipant = await this.roomRepository.getParticipant(room.id, userId);
    if (!currentParticipant) {
      const count = await this.roomRepository.getParticipantCount(room.id);
      if (count >= MAX_ROOM_PARTICIPANTS) {
        throw new ConflictError(
          `Room has reached maximum capacity of ${MAX_ROOM_PARTICIPANTS} participants`
        );
      }
    }

    // Register active participant in PostgreSQL & Redis
    const participant = await this.roomRepository.addParticipant(
      room.id,
      userId,
      currentParticipant?.hasConsented ?? false
    );
    await this.roomCache.addPresence(room.id, userId, socketId);

    // Dynamic Controller check: if activeController in Redis is missing, restore or initialize
    let activeControllerId = await this.roomCache.getActiveController(room.id);
    if (!activeControllerId) {
      activeControllerId = room.activeControllerId ?? room.hostUserId;
      await this.roomCache.setActiveController(room.id, activeControllerId);
    }

    // Playback snapshot & drift adjustment for late joiners
    const playback = await this.roomCache.getPlaybackSync(room.id);
    let currentPlayback: PlaybackSyncPayload | null = null;
    if (playback) {
      let positionSeconds = playback.positionSeconds;
      if (playback.playbackState === PlaybackState.PLAYING) {
        const elapsed = (Date.now() - playback.serverTimestamp) / 1000;
        positionSeconds = Math.max(0, playback.positionSeconds + elapsed);
      }
      currentPlayback = {
        ...playback,
        positionSeconds,
        serverTimestamp: Date.now(),
        activeControllerId,
      };
    }

    // Fetch participants list
    const participantsList = await this.roomRepository.getParticipants(room.id);

    const participantsDto: RoomParticipantDto[] = participantsList.map((p) => ({
      userId: p.userId,
      user: this.toUserDto(p.user, p.userId, 'Participant'),
      isHost: p.userId === room.hostUserId,
      isOriginalController: p.userId === room.originalControllerId,
      isActiveController: p.userId === activeControllerId,
      hasConsentedToPersistentChat: p.hasConsented,
      joinedAt: p.joinedAt.toISOString(),
    }));

    // Queue snapshot
    const queueList = await this.roomRepository.getQueue(room.id);
    const queueDto: RoomQueueItemDto[] = queueList.map((q) => this.toQueueItemDto(q));

    // Chat snapshot: Persistent messages or recent ephemeral
    let chatSnapshot: RoomChatMessageDto[] = [];
    if (room.chatPolicy === RoomChatPolicy.PERSISTENT_LOG) {
      const persisted = await this.roomRepository.getPersistentMessages(room.id, 50);
      chatSnapshot = persisted.map((m) => ({
        id: m.id,
        roomId: m.roomId,
        senderId: m.senderId,
        sender: this.toUserDto(m.sender, m.senderId, 'User'),
        content: m.content,
        isEphemeral: false,
        timestamp: m.createdAt.getTime(),
      }));
    } else {
      chatSnapshot = await this.roomCache.getRecentEphemeralMessages(room.id, 50);
    }

    // Check if user requires consent prompt
    const userPrefersEphemeral =
      participant.user?.chatRetentionPreference === 'EPHEMERAL_SESSION_ONLY';
    const requiresConsentPrompt =
      room.chatPolicy === RoomChatPolicy.PERSISTENT_LOG &&
      userPrefersEphemeral &&
      !participant.hasConsented;

    const roomDto: RoomDto = {
      id: room.id,
      name: room.name,
      access: room.access,
      chatPolicy: room.chatPolicy,
      hostUserId: room.hostUserId,
      originalControllerId: room.originalControllerId,
      activeControllerId,
      currentTrackId: currentPlayback?.trackId ?? null,
      participantCount: participantsList.length,
      maxParticipants: MAX_ROOM_PARTICIPANTS,
      createdAt: room.createdAt.toISOString(),
    };

    return {
      room: roomDto,
      participants: participantsDto,
      currentPlayback,
      queue: queueDto,
      recentEphemeralChat: chatSnapshot,
      requiresConsentPrompt,
    };
  }

  public async leaveRoom(userId: string, roomId: string): Promise<ILeaveRoomResult> {
    await this.roomCache.removePresence(roomId, userId);
    await this.roomRepository.removeParticipant(roomId, userId);

    const activeController = await this.roomCache.getActiveController(roomId);
    if (activeController !== userId) {
      return { roomId, userId };
    }

    // Active controller has departed -> Run Controller Fallback & Transfer Protocol
    const remainingPresence = await this.roomCache.getActivePresenceUsers(roomId);
    const room = await this.roomRepository.findRoomById(roomId);
    const originalControllerId = room?.originalControllerId ?? null;

    if (remainingPresence.length === 0) {
      // 0 participants remaining -> pause & clean active controller
      await this.roomCache.setActiveController(roomId, '');
      return { roomId, userId };
    }

    if (remainingPresence.length === 1) {
      // 1 Participant Remaining -> Transfer automatically & immediately
      const soleRemainingUserId = remainingPresence[0]!;
      await this.roomCache.setActiveController(roomId, soleRemainingUserId);
      await this.roomRepository.updateRoomControllers(roomId, {
        activeControllerId: soleRemainingUserId,
      });

      return {
        roomId,
        userId,
        transferredController: {
          newActiveControllerId: soleRemainingUserId,
          previousControllerId: userId,
          originalControllerId,
          reason: ControllerTransferReason.CONTROLLER_LEFT_SOLO_REMAINDER,
        },
      };
    }

    // >1 Participants Remaining
    if (originalControllerId && remainingPresence.includes(originalControllerId)) {
      // Original controller is present -> Revert immediately
      await this.roomCache.setActiveController(roomId, originalControllerId);
      await this.roomRepository.updateRoomControllers(roomId, {
        activeControllerId: originalControllerId,
      });

      return {
        roomId,
        userId,
        transferredController: {
          newActiveControllerId: originalControllerId,
          previousControllerId: userId,
          originalControllerId,
          reason: ControllerTransferReason.CONTROLLER_LEFT_ORIGINAL_CREATOR_FALLBACK,
        },
      };
    }

    // >1 Participants & Original Controller Absent -> Start 15.0s takeover prompt
    await this.roomCache.startTakeoverPrompt(roomId, userId, TAKEOVER_PROMPT_TIMEOUT_MS);

    return {
      roomId,
      userId,
      takeoverPromptStarted: {
        departedControllerId: userId,
        promptTimeoutMs: TAKEOVER_PROMPT_TIMEOUT_MS,
        expiresAtServerTimestamp: Date.now() + TAKEOVER_PROMPT_TIMEOUT_MS,
      },
    };
  }

  public async handleDisconnect(userId: string, _socketId: string): Promise<IDisconnectResult[]> {
    // Find all public/active rooms where this user was in presence
    const publicRooms = await this.roomRepository.findPublicRooms(50);
    const results: IDisconnectResult[] = [];

    for (const r of publicRooms) {
      const presence = await this.roomCache.getActivePresenceUsers(r.id);
      if (presence.includes(userId)) {
        const leaveRes = await this.leaveRoom(userId, r.id);
        results.push({
          roomId: r.id,
          participantLeft: { userId, reason: 'DISCONNECTED' },
          transferredController: leaveRes.transferredController,
          takeoverPromptStarted: leaveRes.takeoverPromptStarted,
        });
      }
    }

    return results;
  }

  public async handleHeartbeat(roomId: string, userId: string, _clientTimestamp: number): Promise<void> {
    await this.roomCache.refreshHeartbeat(roomId, userId);
  }

  public async sendMessage(
    userId: string,
    userDisplayName: string,
    input: { roomId: string; content: string }
  ): Promise<RoomChatMessageDto> {
    const content = (input.content || '').trim();
    if (!content || content.length > 1000) {
      throw new ValidationFailedError('Chat message must be between 1 and 1000 characters');
    }

    // Rate limiting: 10 messages per 5 seconds per user in room
    const rateLimitKey = `msg:${input.roomId}:${userId}`;
    const allowed = await this.roomCache.checkRateLimit(rateLimitKey, 10, 5);
    if (!allowed) {
      throw new ConflictError('Rate limit exceeded: please slow down your messages');
    }

    const room = await this.roomRepository.findRoomById(input.roomId);
    if (!room) {
      throw new NotFoundError('Room not found');
    }

    const participant = await this.roomRepository.getParticipant(room.id, userId);
    if (!participant) {
      throw new ForbiddenError('You must join the room before sending messages');
    }

    const now = Date.now();
    const shouldPersist =
      room.chatPolicy === RoomChatPolicy.PERSISTENT_LOG &&
      (participant.hasConsented ||
        participant.user?.chatRetentionPreference === 'PERSISTENT_HISTORY');

    if (shouldPersist) {
      const saved = await this.roomRepository.savePersistentMessage({
        roomId: room.id,
        senderId: userId,
        content,
      });

      return {
        id: saved.id,
        roomId: room.id,
        senderId: userId,
        sender: this.toUserDto(participant.user, userId, userDisplayName),
        content,
        isEphemeral: false,
        timestamp: saved.createdAt.getTime(),
      };
    } else {
      // Ephemeral buffer strictly in Redis
      const messageDto: RoomChatMessageDto = {
        id: crypto.randomUUID(),
        roomId: room.id,
        senderId: userId,
        sender: this.toUserDto(participant.user, userId, userDisplayName),
        content,
        isEphemeral: true,
        timestamp: now,
      };

      await this.roomCache.pushEphemeralMessage(room.id, messageDto);
      return messageDto;
    }
  }

  public async updateChatConsent(
    userId: string,
    roomId: string,
    grantPersistentConsent: boolean
  ): Promise<void> {
    await this.roomRepository.updateParticipantConsent(roomId, userId, grantPersistentConsent);
  }

  private async assertActiveController(userId: string, roomId: string): Promise<string> {
    let activeController = await this.roomCache.getActiveController(roomId);
    if (!activeController || activeController !== userId) {
      const room = await this.roomRepository.findRoomById(roomId);
      if (room) {
        const participantCount = await this.roomRepository.getParticipantCount(roomId);
        if (
          room.hostUserId === userId ||
          room.originalControllerId === userId ||
          room.activeControllerId === userId ||
          participantCount <= 1
        ) {
          activeController = userId;
          await this.roomCache.setActiveController(roomId, userId);
          return activeController;
        }
      }
      throw new ForbiddenError('Only the active room controller can command playback');
    }
    return activeController;
  }

  public async handleCommandPlay(
    userId: string,
    roomId: string,
    positionSeconds: number,
    optionalTrackId?: string
  ): Promise<PlaybackSyncPayload> {
    await this.assertActiveController(userId, roomId);
    const existing = await this.roomCache.getPlaybackSync(roomId);

    let trackId = optionalTrackId || existing?.trackId || '';
    if (!trackId) {
      const queue = await this.roomRepository.getQueue(roomId);
      if (queue.length > 0 && queue[0]) {
        trackId = queue[0].trackId;
      } else {
        trackId = 'sample-track-1';
      }
    }

    const payload: PlaybackSyncPayload = {
      roomId,
      trackId,
      playbackMode: existing?.playbackMode ?? PlaybackMode.AUDIO,
      playbackState: PlaybackState.PLAYING,
      positionSeconds: Math.max(0, positionSeconds),
      serverTimestamp: Date.now(),
      activeControllerId: userId,
      playbackRate: 1.0,
    };

    await this.roomCache.setPlaybackSync(roomId, payload);
    return payload;
  }

  public async handleCommandPause(
    userId: string,
    roomId: string,
    positionSeconds: number
  ): Promise<{ payload: PlaybackSyncPayload; pauseReason: PauseReason }> {
    await this.assertActiveController(userId, roomId);
    const existing = await this.roomCache.getPlaybackSync(roomId);

    const payload: PlaybackSyncPayload = {
      roomId,
      trackId: existing?.trackId ?? '',
      playbackMode: existing?.playbackMode ?? PlaybackMode.AUDIO,
      playbackState: PlaybackState.PAUSED,
      positionSeconds: Math.max(0, positionSeconds),
      serverTimestamp: Date.now(),
      activeControllerId: userId,
      playbackRate: 1.0,
    };

    await this.roomCache.setPlaybackSync(roomId, payload);
    return { payload, pauseReason: PauseReason.USER_COMMAND };
  }

  public async handleCommandSeek(
    userId: string,
    roomId: string,
    targetPositionSeconds: number
  ): Promise<PlaybackSyncPayload> {
    await this.assertActiveController(userId, roomId);
    const existing = await this.roomCache.getPlaybackSync(roomId);

    const payload: PlaybackSyncPayload = {
      roomId,
      trackId: existing?.trackId ?? '',
      playbackMode: existing?.playbackMode ?? PlaybackMode.AUDIO,
      playbackState: existing?.playbackState ?? PlaybackState.PLAYING,
      positionSeconds: Math.max(0, targetPositionSeconds),
      serverTimestamp: Date.now(),
      activeControllerId: userId,
      playbackRate: 1.0,
    };

    await this.roomCache.setPlaybackSync(roomId, payload);
    return payload;
  }

  public async handleCommandNext(
    userId: string,
    roomId: string
  ): Promise<PlaybackSyncPayload | null> {
    await this.assertActiveController(userId, roomId);
    const queue = await this.roomRepository.getQueue(roomId);
    if (queue.length === 0) return null;

    const nextTrack = queue[0]!;
    const payload: PlaybackSyncPayload = {
      roomId,
      trackId: nextTrack.trackId,
      playbackMode: PlaybackMode.AUDIO,
      playbackState: PlaybackState.PLAYING,
      positionSeconds: 0,
      serverTimestamp: Date.now(),
      activeControllerId: userId,
      playbackRate: 1.0,
    };

    await this.roomCache.setPlaybackSync(roomId, payload);
    return payload;
  }

  public async handleCommandPrevious(
    userId: string,
    roomId: string
  ): Promise<PlaybackSyncPayload | null> {
    await this.assertActiveController(userId, roomId);
    const existing = await this.roomCache.getPlaybackSync(roomId);
    if (!existing) return null;

    const payload: PlaybackSyncPayload = {
      ...existing,
      positionSeconds: 0,
      serverTimestamp: Date.now(),
      playbackState: PlaybackState.PLAYING,
    };

    await this.roomCache.setPlaybackSync(roomId, payload);
    return payload;
  }

  public async handleToggleMode(
    userId: string,
    roomId: string,
    mode: PlaybackMode
  ): Promise<PlaybackSyncPayload> {
    await this.assertActiveController(userId, roomId);
    const existing = await this.roomCache.getPlaybackSync(roomId);

    const payload: PlaybackSyncPayload = {
      roomId,
      trackId: existing?.trackId ?? '',
      playbackMode: mode,
      playbackState: existing?.playbackState ?? PlaybackState.PAUSED,
      positionSeconds: existing?.positionSeconds ?? 0,
      serverTimestamp: Date.now(),
      activeControllerId: userId,
      playbackRate: 1.0,
    };

    await this.roomCache.setPlaybackSync(roomId, payload);
    return payload;
  }

  public async requestControl(
    requesterId: string,
    roomId: string
  ): Promise<{ activeControllerId: string; request: RoomControlRequestDto }> {
    const room = await this.roomRepository.findRoomById(roomId);
    if (!room) throw new NotFoundError('Room not found');

    const participant = await this.roomRepository.getParticipant(roomId, requesterId);
    if (!participant) throw new ForbiddenError('You must be a member of the room to request control');

    const activeControllerId =
      (await this.roomCache.getActiveController(roomId)) ?? room.activeControllerId ?? room.hostUserId;

    if (activeControllerId === requesterId) {
      throw new ConflictError('You are already the active controller of this room');
    }

    // Rate limiting: 1 control request per 10 seconds per user
    const rateLimitKey = `req_ctrl:${roomId}:${requesterId}`;
    const allowed = await this.roomCache.checkRateLimit(rateLimitKey, 1, 10);
    if (!allowed) {
      throw new ConflictError('Please wait before requesting control again');
    }

    const created = await this.roomRepository.createControlRequest(roomId, requesterId);

    return {
      activeControllerId,
      request: {
        id: created.id,
        roomId: created.roomId,
        requesterId: created.requesterId,
        requester: this.toUserDto(created.requester, requesterId, 'Participant'),
        status: created.status,
        createdAt: created.createdAt.toISOString(),
      },
    };
  }

  public async respondControlRequest(
    activeControllerId: string,
    input: { roomId: string; requestId: string; decision: 'APPROVE' | 'REJECT' }
  ): Promise<{
    transferred: boolean;
    requesterId: string;
    newControllerId?: string;
    originalControllerId: string | null;
    status: ControlRequestStatus;
  }> {
    const currentController = await this.roomCache.getActiveController(input.roomId);
    if (currentController !== activeControllerId) {
      throw new ForbiddenError('Only the active controller can respond to control requests');
    }

    const req = await this.roomRepository.findControlRequest(input.requestId);
    if (!req || req.roomId !== input.roomId) {
      throw new NotFoundError('Control request not found');
    }

    if (req.status !== ControlRequestStatus.PENDING) {
      throw new ConflictError('Control request has already been resolved');
    }

    const room = await this.roomRepository.findRoomById(input.roomId);
    const originalControllerId = room?.originalControllerId ?? null;

    if (input.decision === 'REJECT') {
      await this.roomRepository.updateControlRequest(req.id, ControlRequestStatus.REJECTED);
      return {
        transferred: false,
        requesterId: req.requesterId,
        originalControllerId,
        status: ControlRequestStatus.REJECTED,
      };
    }

    // Decision === 'APPROVE': Compare-and-Swap in Redis
    const casSuccess = await this.roomCache.compareAndSwapController(
      input.roomId,
      activeControllerId,
      req.requesterId
    );

    if (!casSuccess) {
      await this.roomCache.setActiveController(input.roomId, req.requesterId);
    }

    await this.roomRepository.updateRoomControllers(input.roomId, {
      activeControllerId: req.requesterId,
    });
    await this.roomRepository.updateControlRequest(req.id, ControlRequestStatus.APPROVED);

    return {
      transferred: true,
      requesterId: req.requesterId,
      newControllerId: req.requesterId,
      originalControllerId,
      status: ControlRequestStatus.APPROVED,
    };
  }

  public async claimTakeover(
    claimantUserId: string,
    roomId: string
  ): Promise<{
    claimed: boolean;
    activeControllerId: string;
    previousControllerId: string | null;
    originalControllerId: string | null;
  }> {
    const participant = await this.roomRepository.getParticipant(roomId, claimantUserId);
    if (!participant) {
      throw new ForbiddenError('Only current participants can claim room control');
    }

    const claimResult = await this.roomCache.claimTakeover(roomId, claimantUserId);
    if (!claimResult.claimed) {
      const winner = claimResult.winnerUserId ?? '';
      throw new ConflictError(
        winner ? `Control has already been claimed by another user` : 'Takeover window has expired'
      );
    }

    const previousController = await this.roomCache.getActiveController(roomId);
    await this.roomCache.setActiveController(roomId, claimantUserId);
    await this.roomRepository.updateRoomControllers(roomId, {
      activeControllerId: claimantUserId,
    });
    await this.roomCache.clearTakeover(roomId);

    const room = await this.roomRepository.findRoomById(roomId);

    return {
      claimed: true,
      activeControllerId: claimantUserId,
      previousControllerId: previousController,
      originalControllerId: room?.originalControllerId ?? null,
    };
  }

  public async addToQueue(
    userId: string,
    roomId: string,
    trackId: string
  ): Promise<RoomQueueItemDto[]> {
    const participant = await this.roomRepository.getParticipant(roomId, userId);
    if (!participant) throw new ForbiddenError('Must be a room member to modify queue');

    await this.roomRepository.addToQueue(roomId, trackId, userId);
    const queueList = await this.roomRepository.getQueue(roomId);

    return queueList.map((q) => this.toQueueItemDto(q));
  }

  public async reorderQueue(
    userId: string,
    roomId: string,
    queueItemId: string,
    newOrderIndex: number
  ): Promise<RoomQueueItemDto[]> {
    await this.assertActiveController(userId, roomId);
    await this.roomRepository.reorderQueue(roomId, queueItemId, newOrderIndex);
    const queueList = await this.roomRepository.getQueue(roomId);

    return queueList.map((q) => this.toQueueItemDto(q));
  }

  public async removeFromQueue(
    userId: string,
    roomId: string,
    queueItemId: string
  ): Promise<RoomQueueItemDto[]> {
    await this.assertActiveController(userId, roomId);
    await this.roomRepository.removeFromQueue(queueItemId);
    const queueList = await this.roomRepository.getQueue(roomId);

    return queueList.map((q) => this.toQueueItemDto(q));
  }

  public async inviteUser(
    inviterUserId: string,
    roomId: string,
    targetUserId: string
  ): Promise<{ roomName: string; invitedBy: { id: string; displayName: string } }> {
    if (!targetUserId || !targetUserId.trim()) {
      throw new ValidationFailedError('Target user ID is required for invitation');
    }

    const inviter = await this.roomRepository.getParticipant(roomId, inviterUserId);
    if (!inviter) throw new ForbiddenError('You must be in the room to send invitations');

    const room = await this.roomRepository.findRoomById(roomId);
    if (!room) throw new NotFoundError('Room not found');

    return {
      roomName: room.name,
      invitedBy: {
        id: inviterUserId,
        displayName: inviter.user?.displayName ?? 'Friend',
      },
    };
  }
}
