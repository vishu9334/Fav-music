import { create } from 'zustand';
import {
  PlaybackMode,
  PlaybackState,
  PlaybackSyncPayload,
  RoomChatMessageDto,
  RoomControlRequestDto,
  RoomDto,
  RoomParticipantDto,
  RoomQueueItemDto,
} from '@aadat/contracts';

export interface RoomInvitation { roomId: string; roomName: string; invitedBy: { id: string; displayName: string } }
export interface RoomState {
  invitations: RoomInvitation[];
  addInvitation: (invitation: RoomInvitation) => void;
  dismissInvitation: (roomId: string) => void;
  clearInvitations: () => void;
  currentRoom: RoomDto | null;
  participants: RoomParticipantDto[];
  activeControllerId: string | null;
  isController: boolean;
  currentPlayback: PlaybackSyncPayload | null;
  queue: RoomQueueItemDto[];
  chatMessages: RoomChatMessageDto[];
  typingUserIds: string[];
  takeoverPrompt: { departedControllerId: string; expiresAt: number } | null;
  requiresConsentPrompt: boolean;
  isRoomActive: boolean;
  pendingControlRequests: RoomControlRequestDto[];
  socketConnected: boolean;

  setInitialSync: (
    payload: {
      room: RoomDto;
      participants: RoomParticipantDto[];
      currentPlayback: PlaybackSyncPayload | null;
      queue: RoomQueueItemDto[];
      recentEphemeralChat: RoomChatMessageDto[];
      requiresConsentPrompt: boolean;
    },
    currentUserId: string
  ) => void;
  addParticipant: (participant: RoomParticipantDto) => void;
  removeParticipant: (userId: string) => void;
  addChatMessage: (message: RoomChatMessageDto) => void;
  setUserTyping: (userId: string, isTyping: boolean) => void;
  setConsentUpdated: (userId: string, hasConsented: boolean) => void;
  updatePlaybackSync: (sync: PlaybackSyncPayload, currentUserId: string) => void;
  setPlaybackPaused: (positionSeconds: number) => void;
  setController: (newControllerId: string, currentUserId: string) => void;
  startTakeover: (departedControllerId: string, expiresAt: number) => void;
  clearTakeover: () => void;
  setQueue: (queue: RoomQueueItemDto[]) => void;
  setCurrentTrack: (trackId: string) => void;
  addControlRequest: (request: RoomControlRequestDto) => void;
  removeControlRequest: (requestId: string) => void;
  setSocketConnected: (connected: boolean) => void;
  leaveRoom: () => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  invitations: [],
  addInvitation: invitation => set(state => ({ invitations: [invitation, ...state.invitations.filter(item => item.roomId !== invitation.roomId)].slice(0, 5) })),
  dismissInvitation: roomId => set(state => ({ invitations: state.invitations.filter(item => item.roomId !== roomId) })),
  clearInvitations: () => set({ invitations: [] }),
  currentRoom: null,
  participants: [],
  activeControllerId: null,
  isController: false,
  currentPlayback: null,
  queue: [],
  chatMessages: [],
  typingUserIds: [],
  takeoverPrompt: null,
  requiresConsentPrompt: false,
  isRoomActive: false,
  pendingControlRequests: [],
  socketConnected: false,

  setInitialSync: (payload, currentUserId) => {
    const isExplicitController = payload.room.activeControllerId === currentUserId;
    const isHost = payload.room.hostUserId === currentUserId;
    const isController = isExplicitController || (isHost && (!payload.room.activeControllerId || payload.room.activeControllerId === currentUserId));
    return set({
      currentRoom: payload.room,
      participants: payload.participants,
      activeControllerId: payload.room.activeControllerId ?? (isHost ? currentUserId : null),
      isController,
      currentPlayback: payload.currentPlayback,
      queue: payload.queue,
      chatMessages: payload.recentEphemeralChat,
      requiresConsentPrompt: payload.requiresConsentPrompt,
      isRoomActive: true,
      takeoverPrompt: null,
      pendingControlRequests: [],
    });
  },

  addParticipant: (participant) =>
    set((state) => ({
      participants: [
        ...state.participants.filter((p) => p.userId !== participant.userId),
        participant,
      ],
    })),

  removeParticipant: (userId) =>
    set((state) => ({
      participants: state.participants.filter((p) => p.userId !== userId),
      typingUserIds: state.typingUserIds.filter((id) => id !== userId),
    })),

  addChatMessage: (message) =>
    set((state) => ({
      chatMessages: [...state.chatMessages.slice(-49), message],
    })),

  setUserTyping: (userId, isTyping) =>
    set((state) => ({
      typingUserIds: isTyping
        ? [...new Set([...state.typingUserIds, userId])]
        : state.typingUserIds.filter((id) => id !== userId),
    })),

  setConsentUpdated: (userId, hasConsented) =>
    set((state) => ({
      participants: state.participants.map((p) =>
        p.userId === userId ? { ...p, hasConsentedToPersistentChat: hasConsented } : p
      ),
      requiresConsentPrompt: false,
    })),

  updatePlaybackSync: (sync, currentUserId) =>
    set({
      currentPlayback: sync,
      activeControllerId: sync.activeControllerId,
      isController: sync.activeControllerId === currentUserId,
    }),

  setPlaybackPaused: (positionSeconds) =>
    set((state) => ({
      currentPlayback: state.currentPlayback
        ? {
            ...state.currentPlayback,
            positionSeconds,
            playbackState: PlaybackState.PAUSED,
          }
        : state.currentRoom?.currentTrackId
        ? {
            roomId: state.currentRoom.id,
            trackId: state.currentRoom.currentTrackId,
            playbackMode: PlaybackMode.AUDIO,
            playbackState: PlaybackState.PAUSED,
            positionSeconds,
            serverTimestamp: Date.now(),
            activeControllerId: state.activeControllerId ?? '',
            playbackRate: 1.0,
          }
        : null,
    })),

  setController: (newControllerId, currentUserId) =>
    set((state) => ({
      activeControllerId: newControllerId,
      isController: newControllerId === currentUserId,
      participants: state.participants.map((p) => ({
        ...p,
        isActiveController: p.userId === newControllerId,
      })),
      takeoverPrompt: null,
    })),

  startTakeover: (departedControllerId, expiresAt) =>
    set({
      takeoverPrompt: { departedControllerId, expiresAt },
    }),

  clearTakeover: () =>
    set({
      takeoverPrompt: null,
    }),

  setQueue: (queue) =>
    set({
      queue,
    }),

  setCurrentTrack: (trackId) =>
    set((state) => ({
      currentRoom: state.currentRoom
        ? {
            ...state.currentRoom,
            currentTrackId: trackId,
          }
        : null,
      currentPlayback: state.currentPlayback
        ? {
            ...state.currentPlayback,
            trackId,
          }
        : null,
    })),

  addControlRequest: (request) =>
    set((state) => ({
      pendingControlRequests: [
        ...state.pendingControlRequests.filter((r) => r.id !== request.id),
        request,
      ],
    })),

  removeControlRequest: (requestId) =>
    set((state) => ({
      pendingControlRequests: state.pendingControlRequests.filter((r) => r.id !== requestId),
    })),

  setSocketConnected: (socketConnected) =>
    set({ socketConnected }),

  leaveRoom: () =>
    set({
      currentRoom: null,
      participants: [],
      activeControllerId: null,
      isController: false,
      currentPlayback: null,
      queue: [],
      chatMessages: [],
      typingUserIds: [],
      takeoverPrompt: null,
      requiresConsentPrompt: false,
      isRoomActive: false,
      pendingControlRequests: [],
    }),
}));

