import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('react-native-track-player', async () =>
  (await import('../../playback/__tests__/track-player.mock')).trackPlayerModule
);

const mockSocketHandlers: Record<string, Function> = {};
const mockSocket = {
  connected: false,
  on: vi.fn((event: string, handler: Function) => {
    mockSocketHandlers[event] = handler;
  }),
  emit: vi.fn(),
  disconnect: vi.fn(() => {
    mockSocket.connected = false;
  }),
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => {
    mockSocket.connected = true;
    return mockSocket;
  }),
}));

vi.mock('../../../auth/auth.module', () => ({
  AuthModule: {
    getSession: () => ({
      withAccessToken: vi.fn(async (_userId: string, cb: (token: string) => Promise<void>) => {
        await cb('test-jwt-token');
      }),
    }),
  },
}));

import { RoomSocketClient } from '../room-socket.client';
import { RoomPlaybackBridge } from '../room-playback-bridge';
import { useRoomStore } from '../../../store/useRoomStore';

describe('RoomSocketClient — Lifecycle & Event Handling', () => {
  let client: RoomSocketClient;
  const userId = 'user-test-1';
  const roomId = 'room-123';

  beforeEach(() => {
    vi.clearAllMocks();
    useRoomStore.getState().leaveRoom();
    client = new RoomSocketClient();
  });

  async function connectClient(c: RoomSocketClient, uid: string) {
    const p = c.connect(uid);
    mockSocketHandlers['connect']?.();
    return p;
  }

  it('attaches RoomPlaybackBridge on connect and automatically re-joins room upon reconnection', async () => {
    const attachSpy = vi.spyOn(RoomPlaybackBridge.getInstance(), 'attach');
    await connectClient(client, userId);
    expect(attachSpy).toHaveBeenCalledWith(client, userId);

    // Join room
    client.joinRoom(roomId);
    expect(mockSocket.emit).toHaveBeenCalledWith('room:join', { roomId, passcode: undefined });

    // Simulate reconnection event
    mockSocket.emit.mockClear();
    mockSocketHandlers['connect']!();

    // Must automatically re-join the active room to restore presence
    expect(mockSocket.emit).toHaveBeenCalledWith('room:join', { roomId });
  });
  it('normalizes short room codes before joining and rejoining', async () => {
    await connectClient(client, userId);
    client.joinRoom(' viku42 ');
    expect(mockSocket.emit).toHaveBeenCalledWith('room:join', { roomId: 'VIKU42', passcode: undefined });
    expect(client.getCurrentRoomId()).toBe('VIKU42');
    mockSocket.emit.mockClear(); mockSocketHandlers['connect']!();
    expect(mockSocket.emit).toHaveBeenCalledWith('room:join', { roomId: 'VIKU42' });
  });
  it('shares an in-flight connection and keeps a private room passcode only for reconnection', async () => {
    const first = client.connect(userId); mockSocket.connected = false;
    expect(client.connect(userId)).toBe(first);
    mockSocket.connected = true; mockSocketHandlers['connect']!(); await first;
    client.joinRoom(roomId, 'private-fixture'); mockSocket.emit.mockClear();
    mockSocketHandlers['connect']!();
    expect(mockSocket.emit).toHaveBeenCalledExactlyOnceWith('room:join', { roomId, passcode: 'private-fixture' });
    client.leaveRoom(roomId); mockSocket.emit.mockClear(); mockSocketHandlers['connect']!();
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });
  it('replaces a connected socket rather than reusing the previous account credentials', async () => {
    await connectClient(client, userId); mockSocket.disconnect.mockClear();
    const next = client.connect('different-user'); mockSocketHandlers['connect']!(); await next;
    expect(mockSocket.disconnect).toHaveBeenCalledOnce();
  });
  it('retains incoming invitations for the UI and clears them on account disconnect', async () => {
    await connectClient(client, userId);
    const invitation = { roomId, roomName: 'Friend room', invitedBy: { id: 'friend', displayName: 'Friend' } };
    mockSocketHandlers['room:invitation_received']!(invitation);
    expect(useRoomStore.getState().invitations[0]).toEqual(invitation);
    mockSocketHandlers['room:invitation_received']!(invitation);
    expect(useRoomStore.getState().invitations).toHaveLength(1);
    client.disconnect(); expect(useRoomStore.getState().invitations).toEqual([]);
  });

  it('cleans up RoomPlaybackBridge and room store on leaveRoom', async () => {
    await connectClient(client, userId);
    const leaveSpy = vi.spyOn(RoomPlaybackBridge.getInstance(), 'onRoomLeft');
    client.joinRoom(roomId);

    client.leaveRoom(roomId);

    expect(mockSocket.emit).toHaveBeenCalledWith('room:leave', { roomId });
    expect(leaveSpy).toHaveBeenCalled();
    expect(useRoomStore.getState().isRoomActive).toBe(false);
  });

  it('forwards player:track_changed to RoomPlaybackBridge and listener', async () => {
    const trackChangedSpy = vi.spyOn(RoomPlaybackBridge.getInstance(), 'onServerTrackChanged');
    const listenerCallback = vi.fn();
    client.setListener({ onTrackChanged: listenerCallback });

    await connectClient(client, userId);

    const trackPayload = {
      track: {
        id: 'track-999',
        title: 'New Track',
        artistName: 'Artist',
        albumName: null,
        durationSeconds: 200,
        audioKey: 'tracks/audio/999.mp3',
        videoKey: null,
        artworkKey: 'tracks/artwork/999.jpg',
        timeAffinities: [],
        weatherAffinities: [],
        seasonAffinities: [],
        energyScore: 0.8,
        tempoBpm: 120,
        createdAt: new Date().toISOString(),
      },
      positionSeconds: 0,
      serverTimestamp: Date.now(),
    };

    mockSocketHandlers['player:track_changed']!(trackPayload);

    expect(trackChangedSpy).toHaveBeenCalledWith(trackPayload);
    expect(listenerCallback).toHaveBeenCalledWith(trackPayload);
  });

  it('applies server queue confirmations to the room store', async () => {
    await connectClient(client, userId);
    const queue = [{ id: 'queue-item', trackId: 'track-1' }] as any;
    mockSocketHandlers['queue:updated']!({ queue });
    expect(useRoomStore.getState().queue).toEqual(queue);
  });

  it('cleans up room state and detaches bridge on disconnect', async () => {
    await connectClient(client, userId);
    const detachSpy = vi.spyOn(RoomPlaybackBridge.getInstance(), 'detach');
    const leaveSpy = vi.spyOn(RoomPlaybackBridge.getInstance(), 'onRoomLeft');

    client.joinRoom(roomId);
    client.disconnect();

    expect(mockSocket.disconnect).toHaveBeenCalled();
    expect(leaveSpy).toHaveBeenCalled();
    expect(detachSpy).toHaveBeenCalled();
    expect(useRoomStore.getState().isRoomActive).toBe(false);
  });
});
