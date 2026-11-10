import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoomAccess, RoomChatPolicy } from '@aadat/contracts';
import { RoomApiClient } from '../room-api.client';

vi.mock('../../../auth/auth.module', () => ({
  AuthModule: {
    getSession: () => ({
      withAccessToken: vi.fn(async (_userId: string, cb: (token: string) => Promise<any>) =>
        cb('test-bearer-token')
      ),
    }),
  },
}));

describe('RoomApiClient — Mobile REST Room Operations', () => {
  let mockTransport: ReturnType<typeof vi.fn>;
  let client: RoomApiClient;

  beforeEach(() => {
    mockTransport = vi.fn();
    client = new RoomApiClient(mockTransport as any);
  });

  it('fetches public rooms list from GET /api/v1/rooms', async () => {
    const mockRooms = [
      {
        id: 'room-1',
        name: 'Chill Lounge',
        access: RoomAccess.PUBLIC,
        chatPolicy: RoomChatPolicy.EPHEMERAL_SESSION_ONLY,
        hostUserId: 'user-1',
        originalControllerId: 'user-1',
        activeControllerId: 'user-1',
        currentTrackId: null,
        participantCount: 3,
        maxParticipants: 10,
        createdAt: new Date().toISOString(),
      },
    ];

    mockTransport.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ rooms: mockRooms }),
    });

    const rooms = await client.getPublicRooms();
    expect(mockTransport).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/rooms'),
      expect.objectContaining({ method: 'GET' })
    );
    expect(rooms).toHaveLength(1);
    expect(rooms[0]?.name).toBe('Chill Lounge');
  });

  it('fetches single room details from GET /api/v1/rooms/:roomId', async () => {
    const mockRoom = {
      id: 'room-123',
      name: 'Electronic Sessions',
      access: RoomAccess.PUBLIC,
      chatPolicy: RoomChatPolicy.EPHEMERAL_SESSION_ONLY,
      hostUserId: 'user-1',
      originalControllerId: 'user-1',
      activeControllerId: 'user-1',
      currentTrackId: null,
      participantCount: 1,
      maxParticipants: 10,
      createdAt: new Date().toISOString(),
    };

    mockTransport.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockRoom,
    });

    const room = await client.getRoomDetails('room-123');
    expect(mockTransport).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/rooms/room-123'),
      expect.objectContaining({ method: 'GET' })
    );
    expect(room?.id).toBe('room-123');
  });

  it('returns null when room details return 404', async () => {
    mockTransport.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const room = await client.getRoomDetails('non-existent');
    expect(room).toBeNull();
  });

  it('creates a room with POST /api/v1/rooms with authorization header', async () => {
    const createdRoom = {
      id: 'room-new',
      name: 'Late Night Study',
      access: RoomAccess.PRIVATE,
      chatPolicy: RoomChatPolicy.EPHEMERAL_SESSION_ONLY,
      hostUserId: 'user-123',
      originalControllerId: 'user-123',
      activeControllerId: 'user-123',
      currentTrackId: null,
      participantCount: 1,
      maxParticipants: 10,
      createdAt: new Date().toISOString(),
    };

    mockTransport.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => createdRoom,
    });

    const room = await client.createRoom('user-123', {
      name: 'Late Night Study',
      access: RoomAccess.PRIVATE,
      passcode: 'pass123',
    });

    expect(mockTransport).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/rooms'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-bearer-token',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          name: 'Late Night Study',
          access: RoomAccess.PRIVATE,
          passcode: 'pass123',
        }),
      })
    );
    expect(room.id).toBe('room-new');
  });
});

