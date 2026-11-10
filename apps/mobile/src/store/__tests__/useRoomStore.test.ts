import { describe, it, expect, beforeEach } from 'vitest';
import { useRoomStore } from '../useRoomStore';
import {
  ChatRetentionPreference,
  PlaybackMode,
  PlaybackState,
  RoomAccess,
  RoomChatPolicy,
} from '@aadat/contracts';

describe('useRoomStore — Mobile Real-Time Room State', () => {
  const currentUserId = 'user-current-123';
  const otherUserId = 'user-other-456';

  beforeEach(() => {
    useRoomStore.getState().leaveRoom();
  });

  it('initializes room snapshot and determines if current user is authoritative controller', () => {
    const store = useRoomStore.getState();
    expect(store.isRoomActive).toBe(false);
    expect(store.currentRoom).toBeNull();

    store.setInitialSync(
      {
        room: {
          id: 'room-1',
          name: 'Weekend Jam',
          access: RoomAccess.PUBLIC,
          chatPolicy: RoomChatPolicy.EPHEMERAL_SESSION_ONLY,
          hostUserId: currentUserId,
          originalControllerId: currentUserId,
          activeControllerId: currentUserId,
          currentTrackId: 'track-1',
          participantCount: 2,
          maxParticipants: 10,
          createdAt: new Date().toISOString(),
        },
        participants: [
          {
            userId: currentUserId,
            user: {
              id: currentUserId,
              email: 'current@test.com',
              displayName: 'Current User',
              avatarKey: null,
              chatRetentionPreference: ChatRetentionPreference.EPHEMERAL_SESSION_ONLY,
              createdAt: new Date().toISOString(),
            },
            isHost: true,
            isOriginalController: true,
            isActiveController: true,
            hasConsentedToPersistentChat: false,
            joinedAt: new Date().toISOString(),
          },
        ],
        currentPlayback: {
          roomId: 'room-1',
          trackId: 'track-1',
          playbackMode: PlaybackMode.AUDIO,
          playbackState: PlaybackState.PLAYING,
          positionSeconds: 15,
          serverTimestamp: Date.now(),
          activeControllerId: currentUserId,
          playbackRate: 1.0,
        },
        queue: [],
        recentEphemeralChat: [],
        requiresConsentPrompt: false,
      },
      currentUserId
    );

    const updated = useRoomStore.getState();
    expect(updated.isRoomActive).toBe(true);
    expect(updated.currentRoom?.id).toBe('room-1');
    expect(updated.isController).toBe(true);
    expect(updated.activeControllerId).toBe(currentUserId);
    expect(updated.currentPlayback?.positionSeconds).toBe(15);
  });

  it('updates participant presence dynamically on join and leave', () => {
    const store = useRoomStore.getState();

    store.addParticipant({
      userId: otherUserId,
      user: {
        id: otherUserId,
        email: 'other@test.com',
        displayName: 'Other User',
        avatarKey: null,
        chatRetentionPreference: ChatRetentionPreference.EPHEMERAL_SESSION_ONLY,
        createdAt: new Date().toISOString(),
      },
      isHost: false,
      isOriginalController: false,
      isActiveController: false,
      hasConsentedToPersistentChat: false,
      joinedAt: new Date().toISOString(),
    });

    expect(useRoomStore.getState().participants.length).toBe(1);
    expect(useRoomStore.getState().participants[0]!.userId).toBe(otherUserId);

    store.removeParticipant(otherUserId);
    expect(useRoomStore.getState().participants.length).toBe(0);
  });

  it('manages chat messages and typing indicators in real-time', () => {
    const store = useRoomStore.getState();

    store.setUserTyping(otherUserId, true);
    expect(useRoomStore.getState().typingUserIds).toContain(otherUserId);

    store.setUserTyping(otherUserId, false);
    expect(useRoomStore.getState().typingUserIds).not.toContain(otherUserId);

    store.addChatMessage({
      id: 'msg-1',
      roomId: 'room-1',
      senderId: otherUserId,
      sender: {
        id: otherUserId,
        email: 'other@test.com',
        displayName: 'Other User',
        avatarKey: null,
        chatRetentionPreference: ChatRetentionPreference.EPHEMERAL_SESSION_ONLY,
        createdAt: new Date().toISOString(),
      },
      content: 'Loving this track!',
      isEphemeral: true,
      timestamp: Date.now(),
    });

    expect(useRoomStore.getState().chatMessages.length).toBe(1);
    expect(useRoomStore.getState().chatMessages[0]!.content).toBe('Loving this track!');
  });

  it('updates authoritative controller and re-evaluates isController permission', () => {
    const store = useRoomStore.getState();

    store.setController(otherUserId, currentUserId);
    expect(useRoomStore.getState().activeControllerId).toBe(otherUserId);
    expect(useRoomStore.getState().isController).toBe(false);

    store.setController(currentUserId, currentUserId);
    expect(useRoomStore.getState().activeControllerId).toBe(currentUserId);
    expect(useRoomStore.getState().isController).toBe(true);
  });

  it('cleans up room state completely upon leaving room without affecting app lifecycle', () => {
    const store = useRoomStore.getState();
    store.addChatMessage({
      id: 'msg-1',
      roomId: 'room-1',
      senderId: 'someone',
      sender: {
        id: 'someone',
        email: 'some@test.com',
        displayName: 'Some User',
        avatarKey: null,
        chatRetentionPreference: ChatRetentionPreference.EPHEMERAL_SESSION_ONLY,
        createdAt: new Date().toISOString(),
      },
      content: 'Goodbye',
      isEphemeral: true,
      timestamp: Date.now(),
    });

    store.leaveRoom();

    const cleared = useRoomStore.getState();
    expect(cleared.isRoomActive).toBe(false);
    expect(cleared.currentRoom).toBeNull();
    expect(cleared.participants).toEqual([]);
    expect(cleared.chatMessages).toEqual([]);
    expect(cleared.activeControllerId).toBeNull();
    expect(cleared.pendingControlRequests).toEqual([]);
  });

  it('manages pending control requests and socket connection state', () => {
    const store = useRoomStore.getState();
    expect(store.socketConnected).toBe(false);

    store.setSocketConnected(true);
    expect(useRoomStore.getState().socketConnected).toBe(true);

    const req = {
      id: 'req-1',
      roomId: 'room-1',
      requesterId: otherUserId,
      requester: {
        id: otherUserId,
        email: 'other@test.com',
        displayName: 'Other User',
        avatarKey: null,
        chatRetentionPreference: ChatRetentionPreference.EPHEMERAL_SESSION_ONLY,
        createdAt: new Date().toISOString(),
      },
      status: 'PENDING' as any,
      createdAt: new Date().toISOString(),
    };

    store.addControlRequest(req);
    expect(useRoomStore.getState().pendingControlRequests).toHaveLength(1);
    expect(useRoomStore.getState().pendingControlRequests[0]?.id).toBe('req-1');

    store.removeControlRequest('req-1');
    expect(useRoomStore.getState().pendingControlRequests).toHaveLength(0);
  });
});

