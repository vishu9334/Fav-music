import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ControllerTransferReason,
  ControlRequestStatus,
  MAX_ROOM_PARTICIPANTS,
  PauseReason,
  PlaybackMode,
  PlaybackState,
  RoomAccess,
  RoomChatPolicy,
} from '@aadat/contracts';
import { RoomService } from '../services/room.service.js';
import {
  ICreateRoomData,
  IPersistentMessageEntity,
  IRoomControlRequestEntity,
  IRoomEntity,
  IRoomParticipantEntity,
  IRoomQueueEntity,
  IRoomRepository,
} from '../contracts/room-repository.contract.js';
import { IRoomCacheRepository } from '../contracts/room-cache.contract.js';

describe('Real-Time Collaborative Listening Rooms (Stage 16)', () => {
  let mockRoomRepository: IRoomRepository;
  let mockRoomCache: IRoomCacheRepository;
  let roomService: RoomService;

  // In-memory persistent state
  const roomsTable = new Map<string, IRoomEntity>();
  const participantsTable = new Map<string, IRoomParticipantEntity>();
  const controlRequestsTable = new Map<string, IRoomControlRequestEntity>();
  const persistentMessagesTable = new Map<string, IPersistentMessageEntity>();
  const queueTable = new Map<string, IRoomQueueEntity>();

  // In-memory Redis transient state
  const redisCache = new Map<string, string>();
  const redisSets = new Map<string, Set<string>>();

  const hostUser = {
    id: 'user-host',
    displayName: 'Host User',
    email: 'host@test.com',
    avatarKey: null,
    chatRetentionPreference: 'EPHEMERAL_SESSION_ONLY',
  };

  const participant2 = {
    id: 'user-2',
    displayName: 'Listener Two',
    email: 'two@test.com',
    avatarKey: null,
    chatRetentionPreference: 'EPHEMERAL_SESSION_ONLY',
  };

  const participant3 = {
    id: 'user-3',
    displayName: 'Listener Three',
    email: 'three@test.com',
    avatarKey: null,
    chatRetentionPreference: 'PERSISTENT_HISTORY',
  };

  beforeEach(() => {
    roomsTable.clear();
    participantsTable.clear();
    controlRequestsTable.clear();
    persistentMessagesTable.clear();
    queueTable.clear();
    redisCache.clear();
    redisSets.clear();

    mockRoomRepository = {
      createRoom: vi.fn(async (data: ICreateRoomData) => {
        const entity: IRoomEntity = {
          id: `room-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          name: data.name,
          passcodeHash: data.passcodeHash ?? null,
          access: data.access,
          chatPolicy: data.chatPolicy,
          hostUserId: data.hostUserId,
          originalControllerId: data.originalControllerId,
          activeControllerId: data.activeControllerId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        roomsTable.set(entity.id, entity);
        return entity;
      }),
      findRoomById: vi.fn(async (roomId: string) => roomsTable.get(roomId) ?? null),
      findPublicRooms: vi.fn(async () =>
        Array.from(roomsTable.values()).filter((r) => r.access === RoomAccess.PUBLIC)
      ),
      addParticipant: vi.fn(async (roomId: string, userId: string, hasConsented: boolean) => {
        const key = `${roomId}_${userId}`;
        const userObj =
          userId === hostUser.id
            ? hostUser
            : userId === participant2.id
            ? participant2
            : userId === participant3.id
            ? participant3
            : {
                id: userId,
                displayName: `User ${userId}`,
                email: `${userId}@test.com`,
                avatarKey: null,
                chatRetentionPreference: 'EPHEMERAL_SESSION_ONLY',
              };

        const entity: IRoomParticipantEntity = {
          id: `p-${key}`,
          roomId,
          userId,
          hasConsented,
          joinedAt: new Date(),
          user: userObj,
        };
        participantsTable.set(key, entity);
        return entity;
      }),
      removeParticipant: vi.fn(async (roomId: string, userId: string) => {
        participantsTable.delete(`${roomId}_${userId}`);
      }),
      getParticipants: vi.fn(async (roomId: string) =>
        Array.from(participantsTable.values()).filter((p) => p.roomId === roomId)
      ),
      getParticipant: vi.fn(async (roomId: string, userId: string) =>
        participantsTable.get(`${roomId}_${userId}`) ?? null
      ),
      getParticipantCount: vi.fn(async (roomId: string) =>
        Array.from(participantsTable.values()).filter((p) => p.roomId === roomId).length
      ),
      updateParticipantConsent: vi.fn(async (roomId: string, userId: string, hasConsented: boolean) => {
        const p = participantsTable.get(`${roomId}_${userId}`);
        if (p) p.hasConsented = hasConsented;
      }),
      updateRoomControllers: vi.fn(async (roomId: string, updates) => {
        const r = roomsTable.get(roomId);
        if (r) {
          if (updates.activeControllerId !== undefined) r.activeControllerId = updates.activeControllerId;
          if (updates.originalControllerId !== undefined) r.originalControllerId = updates.originalControllerId;
        }
      }),
      createControlRequest: vi.fn(async (roomId: string, requesterId: string) => {
        const entity: IRoomControlRequestEntity = {
          id: `req-${Date.now()}`,
          roomId,
          requesterId,
          status: ControlRequestStatus.PENDING,
          createdAt: new Date(),
          updatedAt: new Date(),
          requester: {
            id: requesterId,
            displayName: `User ${requesterId}`,
            email: `${requesterId}@test.com`,
            avatarKey: null,
          },
        };
        controlRequestsTable.set(entity.id, entity);
        return entity;
      }),
      updateControlRequest: vi.fn(async (requestId: string, status: ControlRequestStatus) => {
        const req = controlRequestsTable.get(requestId);
        if (req) req.status = status;
      }),
      findControlRequest: vi.fn(async (requestId: string) => controlRequestsTable.get(requestId) ?? null),
      savePersistentMessage: vi.fn(async (data) => {
        const entity: IPersistentMessageEntity = {
          id: `msg-${Date.now()}`,
          roomId: data.roomId,
          senderId: data.senderId,
          content: data.content,
          createdAt: new Date(),
          sender: {
            id: data.senderId,
            displayName: `User ${data.senderId}`,
            email: `${data.senderId}@test.com`,
            avatarKey: null,
          },
        };
        persistentMessagesTable.set(entity.id, entity);
        return entity;
      }),
      getPersistentMessages: vi.fn(async (roomId: string) =>
        Array.from(persistentMessagesTable.values()).filter((m) => m.roomId === roomId)
      ),
      getQueue: vi.fn(async (roomId: string) =>
        Array.from(queueTable.values()).filter((q) => q.roomId === roomId)
      ),
      addToQueue: vi.fn(async (roomId: string, trackId: string, suggestedBy: string) => {
        const entity: IRoomQueueEntity = {
          id: `q-${Date.now()}`,
          roomId,
          trackId,
          suggestedBy,
          orderIndex: queueTable.size,
          addedAt: new Date(),
          track: {
            id: trackId,
            title: `Track ${trackId}`,
            artistName: 'Artist',
            albumName: null,
            durationSeconds: 200,
            artworkKey: 'art.jpg',
            audioKey: 'audio.mp3',
          },
        };
        queueTable.set(entity.id, entity);
        return entity;
      }),
      removeFromQueue: vi.fn(async (queueItemId: string) => {
        queueTable.delete(queueItemId);
      }),
      reorderQueue: vi.fn(async (_roomId: string, queueItemId: string, newOrderIndex: number) => {
        const q = queueTable.get(queueItemId);
        if (q) q.orderIndex = newOrderIndex;
      }),
    };

    mockRoomCache = {
      getPlaybackSync: vi.fn(async (roomId: string) => {
        const raw = redisCache.get(`playback:${roomId}`);
        return raw ? JSON.parse(raw) : null;
      }),
      setPlaybackSync: vi.fn(async (roomId: string, payload) => {
        redisCache.set(`playback:${roomId}`, JSON.stringify(payload));
      }),
      getActiveController: vi.fn(async (roomId: string) => redisCache.get(`controller:${roomId}`) ?? null),
      setActiveController: vi.fn(async (roomId: string, controllerId: string) => {
        redisCache.set(`controller:${roomId}`, controllerId);
      }),
      compareAndSwapController: vi.fn(
        async (roomId: string, expectedCurrent: string | null, newController: string) => {
          const current = redisCache.get(`controller:${roomId}`) ?? null;
          if (current === expectedCurrent) {
            redisCache.set(`controller:${roomId}`, newController);
            return true;
          }
          return false;
        }
      ),
      addPresence: vi.fn(async (roomId: string, userId: string) => {
        let set = redisSets.get(`presence:${roomId}`);
        if (!set) {
          set = new Set();
          redisSets.set(`presence:${roomId}`, set);
        }
        set.add(userId);
      }),
      removePresence: vi.fn(async (roomId: string, userId: string) => {
        const set = redisSets.get(`presence:${roomId}`);
        set?.delete(userId);
      }),
      getActivePresenceUsers: vi.fn(async (roomId: string) => {
        const set = redisSets.get(`presence:${roomId}`);
        return set ? Array.from(set) : [];
      }),
      getUserSocketId: vi.fn(async (userId: string) => redisCache.get(`socket:${userId}`) ?? null),
      setUserSocketId: vi.fn(async (userId: string, socketId: string) => {
        redisCache.set(`socket:${userId}`, socketId);
      }),
      removeUserSocketId: vi.fn(async (userId: string) => {
        redisCache.delete(`socket:${userId}`);
      }),
      refreshHeartbeat: vi.fn(async () => {}),
      startTakeoverPrompt: vi.fn(async (roomId: string, departedControllerId: string, timeoutMs: number) => {
        redisCache.set(
          `takeover:${roomId}`,
          JSON.stringify({
            status: 'PROMPT_ACTIVE',
            departedControllerId,
            expiresAt: Date.now() + timeoutMs,
          })
        );
        return true;
      }),
      claimTakeover: vi.fn(async (roomId: string, claimantUserId: string) => {
        const raw = redisCache.get(`takeover:${roomId}`);
        if (!raw) return { claimed: false };
        const data = JSON.parse(raw);
        if (data.status !== 'PROMPT_ACTIVE') {
          return { claimed: false, winnerUserId: data.winnerUserId };
        }
        data.status = 'CLAIMED';
        data.winnerUserId = claimantUserId;
        redisCache.set(`takeover:${roomId}`, JSON.stringify(data));
        return { claimed: true, winnerUserId: claimantUserId };
      }),
      clearTakeover: vi.fn(async (roomId: string) => {
        redisCache.delete(`takeover:${roomId}`);
      }),
      pushEphemeralMessage: vi.fn(async (roomId: string, message) => {
        const raw = redisCache.get(`chat:${roomId}`) || '[]';
        const list = JSON.parse(raw);
        list.push(message);
        redisCache.set(`chat:${roomId}`, JSON.stringify(list));
      }),
      getRecentEphemeralMessages: vi.fn(async (roomId: string) => {
        const raw = redisCache.get(`chat:${roomId}`);
        return raw ? JSON.parse(raw) : [];
      }),
      checkRateLimit: vi.fn(async () => true),
    };

    roomService = new RoomService({
      roomRepository: mockRoomRepository,
      roomCacheRepository: mockRoomCache,
    });
  });

  // --------------------------------------------------------------------------
  // Requirement 1 & 2: Room Creation, Access Control & Capacity
  // --------------------------------------------------------------------------
  describe('Room Creation & Capacity Protocol', () => {
    it('creates public room initializing creator as both host and authoritative controller', async () => {
      const room = await roomService.createRoom(hostUser.id, {
        name: 'Chill Beats Lounge',
        access: RoomAccess.PUBLIC,
        chatPolicy: RoomChatPolicy.EPHEMERAL_SESSION_ONLY,
      });

      expect(room.name).toBe('Chill Beats Lounge');
      expect(room.access).toBe(RoomAccess.PUBLIC);
      expect(room.hostUserId).toBe(hostUser.id);
      expect(room.originalControllerId).toBe(hostUser.id);
      expect(room.activeControllerId).toBe(hostUser.id);
      expect(room.maxParticipants).toBe(MAX_ROOM_PARTICIPANTS);

      expect(mockRoomCache.setActiveController).toHaveBeenCalledWith(room.id, hostUser.id);
    });

    it('requires passcode with at least 4 characters for private rooms', async () => {
      await expect(
        roomService.createRoom(hostUser.id, {
          name: 'Secret Session',
          access: RoomAccess.PRIVATE,
          passcode: '12',
        })
      ).rejects.toThrow('at least 4 characters');
    });

    it('rejects joining private room when passcode is incorrect', async () => {
      const room = await roomService.createRoom(hostUser.id, {
        name: 'Private Club',
        access: RoomAccess.PRIVATE,
        passcode: 'secret123',
      });

      await expect(
        roomService.joinRoom(participant2.id, 'sock-2', {
          roomId: room.id,
          passcode: 'wrong-passcode',
        })
      ).rejects.toThrow('Incorrect room passcode');
    });

    it('strictly enforces maximum 10 participants ceiling', async () => {
      const room = await roomService.createRoom(hostUser.id, { name: 'Full Room' });

      // Fill room to 10 participants
      for (let i = 1; i <= 10; i++) {
        await mockRoomRepository.addParticipant(room.id, `user-${i}`, false);
      }

      // 11th participant must be rejected
      await expect(
        roomService.joinRoom('user-11', 'sock-11', { roomId: room.id })
      ).rejects.toThrow('maximum capacity of 10 participants');
    });

    it('adjusts position for late joiners when room playback is actively playing', async () => {
      const room = await roomService.createRoom(hostUser.id, { name: 'Live Stream' });

      const startTime = Date.now() - 5000; // started 5 seconds ago
      await mockRoomCache.setPlaybackSync(room.id, {
        roomId: room.id,
        trackId: 'track-1',
        playbackMode: PlaybackMode.AUDIO,
        playbackState: PlaybackState.PLAYING,
        positionSeconds: 10,
        serverTimestamp: startTime,
        activeControllerId: hostUser.id,
        playbackRate: 1.0,
      });

      const sync = await roomService.joinRoom(participant2.id, 'sock-2', { roomId: room.id });
      // Elapsed 5 seconds added to position 10s = approximately 15s
      expect(sync.currentPlayback?.positionSeconds).toBeGreaterThanOrEqual(14.9);
      expect(sync.currentPlayback?.playbackState).toBe(PlaybackState.PLAYING);
    });
  });

  // --------------------------------------------------------------------------
  // Requirement 3 & 8: Chat Privacy & Explicit Consent Protocol
  // --------------------------------------------------------------------------
  describe('Chat Privacy & Consent Protocol', () => {
    it('buffers messages strictly in Redis for ephemeral rooms without writing to PostgreSQL', async () => {
      const room = await roomService.createRoom(hostUser.id, {
        name: 'Ephemeral Room',
        chatPolicy: RoomChatPolicy.EPHEMERAL_SESSION_ONLY,
      });
      await roomService.joinRoom(hostUser.id, 'sock-1', { roomId: room.id });

      const msg = await roomService.sendMessage(hostUser.id, hostUser.displayName, {
        roomId: room.id,
        content: 'Hello everyone!',
      });

      expect(msg.isEphemeral).toBe(true);
      expect(msg.content).toBe('Hello everyone!');
      // Must NOT be written to PostgreSQL PersistentRoomMessage
      expect(mockRoomRepository.savePersistentMessage).not.toHaveBeenCalled();
      // Must be pushed to Redis ephemeral list
      expect(mockRoomCache.pushEphemeralMessage).toHaveBeenCalledWith(room.id, msg);
    });

    it('requires consent prompt when ephemeral-preference user joins a persistent-log room', async () => {
      const room = await roomService.createRoom(hostUser.id, {
        name: 'Archive Room',
        chatPolicy: RoomChatPolicy.PERSISTENT_LOG,
      });

      // participant2 prefers EPHEMERAL_SESSION_ONLY and has not consented
      const sync = await roomService.joinRoom(participant2.id, 'sock-2', { roomId: room.id });
      expect(sync.requiresConsentPrompt).toBe(true);

      // Sending message before consenting buffers in ephemeral storage
      const unconsentedMsg = await roomService.sendMessage(participant2.id, participant2.displayName, {
        roomId: room.id,
        content: 'Unconsented message',
      });
      expect(unconsentedMsg.isEphemeral).toBe(true);
      expect(mockRoomRepository.savePersistentMessage).not.toHaveBeenCalled();

      // User grants persistent consent
      await roomService.updateChatConsent(participant2.id, room.id, true);

      // Subsequent message is persisted in PostgreSQL
      const consentedMsg = await roomService.sendMessage(participant2.id, participant2.displayName, {
        roomId: room.id,
        content: 'Consented message for archive',
      });
      expect(consentedMsg.isEphemeral).toBe(false);
      expect(mockRoomRepository.savePersistentMessage).toHaveBeenCalled();
    });

    it('automatically persists messages for users whose account preference is PERSISTENT_HISTORY', async () => {
      const room = await roomService.createRoom(hostUser.id, {
        name: 'History Room',
        chatPolicy: RoomChatPolicy.PERSISTENT_LOG,
      });

      // participant3 has PERSISTENT_HISTORY preference
      const sync = await roomService.joinRoom(participant3.id, 'sock-3', { roomId: room.id });
      expect(sync.requiresConsentPrompt).toBe(false);

      const msg = await roomService.sendMessage(participant3.id, participant3.displayName, {
        roomId: room.id,
        content: 'Preserved by default',
      });
      expect(msg.isEphemeral).toBe(false);
      expect(mockRoomRepository.savePersistentMessage).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Requirement 4 & 5: Server-Authoritative Playback Authority
  // --------------------------------------------------------------------------
  describe('Authoritative Room Playback Sync', () => {
    it('allows active controller to issue play, pause and seek commands', async () => {
      const room = await roomService.createRoom(hostUser.id, { name: 'Music Club' });
      await roomService.joinRoom(hostUser.id, 'sock-1', { roomId: room.id });

      // Play command
      const playSync = await roomService.handleCommandPlay(hostUser.id, room.id, 45);
      expect(playSync.playbackState).toBe(PlaybackState.PLAYING);
      expect(playSync.positionSeconds).toBe(45);
      expect(playSync.activeControllerId).toBe(hostUser.id);

      // Pause command
      const { payload: pauseSync, pauseReason } = await roomService.handleCommandPause(
        hostUser.id,
        room.id,
        60
      );
      expect(pauseSync.playbackState).toBe(PlaybackState.PAUSED);
      expect(pauseSync.positionSeconds).toBe(60);
      expect(pauseReason).toBe(PauseReason.USER_COMMAND);

      // Seek command
      const seekSync = await roomService.handleCommandSeek(hostUser.id, room.id, 120);
      expect(seekSync.positionSeconds).toBe(120);
    });

    it('rejects non-controller participants attempting playback commands with 403 Forbidden', async () => {
      const room = await roomService.createRoom(hostUser.id, { name: 'Strict Club' });
      await roomService.joinRoom(hostUser.id, 'sock-1', { roomId: room.id });
      await roomService.joinRoom(participant2.id, 'sock-2', { roomId: room.id });

      // participant2 is NOT the active controller
      await expect(
        roomService.handleCommandPlay(participant2.id, room.id, 10)
      ).rejects.toThrow('Only the active room controller can command playback');

      await expect(
        roomService.handleCommandPause(participant2.id, room.id, 10)
      ).rejects.toThrow('Only the active room controller can command playback');

      await expect(
        roomService.handleCommandSeek(participant2.id, room.id, 100)
      ).rejects.toThrow('Only the active room controller can command playback');
    });
  });

  // --------------------------------------------------------------------------
  // Requirement 6: Dynamic Controller Protocol & Fallback Lifecycle
  // --------------------------------------------------------------------------
  describe('Dynamic Controller Handoff & Fallback Lifecycle', () => {
    it('supports permission-based control handoff via request and approval', async () => {
      const room = await roomService.createRoom(hostUser.id, { name: 'Jam Room' });
      await roomService.joinRoom(hostUser.id, 'sock-1', { roomId: room.id });
      await roomService.joinRoom(participant2.id, 'sock-2', { roomId: room.id });

      // Participant 2 requests control
      const { activeControllerId, request } = await roomService.requestControl(
        participant2.id,
        room.id
      );
      expect(activeControllerId).toBe(hostUser.id);
      expect(request.requesterId).toBe(participant2.id);

      // Host approves request
      const response = await roomService.respondControlRequest(hostUser.id, {
        roomId: room.id,
        requestId: request.id,
        decision: 'APPROVE',
      });

      expect(response.transferred).toBe(true);
      expect(response.newControllerId).toBe(participant2.id);
      expect(response.status).toBe(ControlRequestStatus.APPROVED);

      // Participant 2 is now authoritative controller
      const currentController = await mockRoomCache.getActiveController(room.id);
      expect(currentController).toBe(participant2.id);

      // Participant 2 can now issue play command
      const playSync = await roomService.handleCommandPlay(participant2.id, room.id, 0);
      expect(playSync.activeControllerId).toBe(participant2.id);
    });

    it('transfers control immediately to sole remaining participant when controller leaves (Case 1)', async () => {
      const room = await roomService.createRoom(hostUser.id, { name: 'Duo Room' });
      await roomService.joinRoom(hostUser.id, 'sock-1', { roomId: room.id });
      await roomService.joinRoom(participant2.id, 'sock-2', { roomId: room.id });

      // Controller (host) departs
      const leaveRes = await roomService.leaveRoom(hostUser.id, room.id);

      expect(leaveRes.transferredController).toBeDefined();
      expect(leaveRes.transferredController?.newActiveControllerId).toBe(participant2.id);
      expect(leaveRes.transferredController?.reason).toBe(
        ControllerTransferReason.CONTROLLER_LEFT_SOLO_REMAINDER
      );
    });

    it('reverts immediately to originalControllerId when controller leaves and original controller is present (Case 2)', async () => {
      const room = await roomService.createRoom(hostUser.id, { name: 'Trio Room' });
      await roomService.joinRoom(hostUser.id, 'sock-1', { roomId: room.id });
      await roomService.joinRoom(participant2.id, 'sock-2', { roomId: room.id });
      await roomService.joinRoom(participant3.id, 'sock-3', { roomId: room.id });

      // Transfer control to participant 2
      await mockRoomCache.setActiveController(room.id, participant2.id);
      await mockRoomRepository.updateRoomControllers(room.id, { activeControllerId: participant2.id });

      // Controller (participant2) departs; host (original controller) is still present!
      const leaveRes = await roomService.leaveRoom(participant2.id, room.id);

      expect(leaveRes.transferredController).toBeDefined();
      expect(leaveRes.transferredController?.newActiveControllerId).toBe(hostUser.id);
      expect(leaveRes.transferredController?.reason).toBe(
        ControllerTransferReason.CONTROLLER_LEFT_ORIGINAL_CREATOR_FALLBACK
      );
    });

    it('starts 15.0s takeover prompt when controller departs and original controller is absent (Case 3)', async () => {
      const room = await roomService.createRoom(hostUser.id, { name: 'Takeover Room' });
      await roomService.joinRoom(hostUser.id, 'sock-1', { roomId: room.id });
      await roomService.joinRoom(participant2.id, 'sock-2', { roomId: room.id });
      await roomService.joinRoom(participant3.id, 'sock-3', { roomId: room.id });
      await roomService.joinRoom('user-4', 'sock-4', { roomId: room.id });

      // Original creator (host) leaves first
      await roomService.leaveRoom(hostUser.id, room.id);

      // Participant 2 claims control or was active
      await mockRoomCache.setActiveController(room.id, participant2.id);
      await mockRoomRepository.updateRoomControllers(room.id, { activeControllerId: participant2.id });

      // Now participant2 departs, leaving >1 other participants (user-3 and user-4) and original controller absent
      const leaveRes = await roomService.leaveRoom(participant2.id, room.id);

      expect(leaveRes.takeoverPromptStarted).toBeDefined();
      expect(leaveRes.takeoverPromptStarted?.departedControllerId).toBe(participant2.id);
      expect(leaveRes.takeoverPromptStarted?.promptTimeoutMs).toBe(15000);

      // Participant 3 claims takeover
      const claimRes = await roomService.claimTakeover(participant3.id, room.id);
      expect(claimRes.claimed).toBe(true);
      expect(claimRes.activeControllerId).toBe(participant3.id);

      // Second claim attempt is rejected
      await expect(
        roomService.claimTakeover('user-4', room.id)
      ).rejects.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // Requirement 9 & 10: Membership & Account Isolation
  // --------------------------------------------------------------------------
  describe('Membership Enforcement & Account Isolation', () => {
    it('prevents non-member from sending messages or modifying room queue', async () => {
      const room = await roomService.createRoom(hostUser.id, { name: 'Private Sanctum' });

      // Outsider attempts to chat without joining
      await expect(
        roomService.sendMessage('outsider-user', 'Outsider', {
          roomId: room.id,
          content: 'Spam message',
        })
      ).rejects.toThrow('You must join the room before sending messages');

      // Outsider attempts to modify queue
      await expect(
        roomService.addToQueue('outsider-user', room.id, 'track-xyz')
      ).rejects.toThrow('Must be a room member to modify queue');
    });
  });
});
