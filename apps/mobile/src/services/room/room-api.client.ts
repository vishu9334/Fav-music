import { RoomAccess, RoomChatPolicy, RoomDto } from '@aadat/contracts';
import { AuthModule } from '../../auth/auth.module';
import { AuthConfig } from '../../auth/services/auth-config';
import { AuthTransport, nativeAuthTransport } from '../../auth/adapters/native-auth.transport';

export interface CreateRoomInput {
  name: string;
  access?: RoomAccess;
  passcode?: string;
  chatPolicy?: RoomChatPolicy;
}

export class RoomApiError extends Error {
  public constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'RoomApiError';
  }
}

export class RoomApiClient {
  private static instance: RoomApiClient | null = null;

  public constructor(
    private readonly transport: AuthTransport = nativeAuthTransport,
    private readonly config = new AuthConfig()
  ) {}

  public static getInstance(): RoomApiClient {
    if (!RoomApiClient.instance) {
      RoomApiClient.instance = new RoomApiClient();
    }
    return RoomApiClient.instance;
  }

  private getBaseUrl(): string {
    try {
      return this.config.apiBaseUrl();
    } catch {
      const socketEp = process.env.EXPO_PUBLIC_SOCKET_ENDPOINT;
      if (socketEp) return socketEp.replace(/\/$/, '');
      const gqlEp = process.env.EXPO_PUBLIC_GRAPHQL_ENDPOINT;
      if (gqlEp) return gqlEp.replace(/\/graphql\/?$/, '');
      return 'http://10.0.2.2:4000';
    }
  }

  public async getPublicRooms(): Promise<RoomDto[]> {
    const base = this.getBaseUrl();
    const endpoint = `${base}/api/v1/rooms`;

    const response = await this.transport(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new RoomApiError('ROOMS_FETCH_FAILED', 'Failed to retrieve listening rooms.');
    }

    const data = (await response.json()) as { rooms?: RoomDto[] };
    return data.rooms ?? [];
  }

  public async getRoomDetails(roomId: string): Promise<RoomDto | null> {
    const base = this.getBaseUrl();
    const endpoint = `${base}/api/v1/rooms/${encodeURIComponent(roomId)}`;

    const response = await this.transport(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new RoomApiError('ROOM_DETAILS_FAILED', 'Failed to retrieve room details.');
    }

    return (await response.json()) as RoomDto;
  }

  public async createRoom(userId: string, input: CreateRoomInput): Promise<RoomDto> {
    const base = this.getBaseUrl();
    const endpoint = `${base}/api/v1/rooms`;

    return AuthModule.getSession().withAccessToken(userId, async (token) => {
      const response = await this.transport(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message = (errorData as { message?: string }).message ?? 'Failed to create listening room.';
        throw new RoomApiError('ROOM_CREATION_FAILED', message);
      }

      return (await response.json()) as RoomDto;
    });
  }
}

export const roomApiClient = RoomApiClient.getInstance();

