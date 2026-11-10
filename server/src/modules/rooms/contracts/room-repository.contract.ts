import {
  RoomAccess,
  RoomChatPolicy,
  ControlRequestStatus,
} from '@aadat/contracts';

export interface IRoomEntity {
  id: string;
  name: string;
  passcodeHash: string | null;
  access: RoomAccess;
  chatPolicy: RoomChatPolicy;
  hostUserId: string;
  originalControllerId: string | null;
  activeControllerId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRoomParticipantEntity {
  id: string;
  roomId: string;
  userId: string;
  hasConsented: boolean;
  joinedAt: Date;
  user?: {
    id: string;
    displayName: string;
    email: string;
    avatarKey: string | null;
    chatRetentionPreference: string;
  };
}

export interface IRoomControlRequestEntity {
  id: string;
  roomId: string;
  requesterId: string;
  status: ControlRequestStatus;
  createdAt: Date;
  updatedAt: Date;
  requester?: {
    id: string;
    displayName: string;
    email: string;
    avatarKey: string | null;
  };
}

export interface IPersistentMessageEntity {
  id: string;
  roomId: string;
  senderId: string;
  content: string;
  createdAt: Date;
  sender?: {
    id: string;
    displayName: string;
    email: string;
    avatarKey: string | null;
  };
}

export interface IRoomQueueEntity {
  id: string;
  roomId: string;
  trackId: string;
  suggestedBy: string;
  orderIndex: number;
  addedAt: Date;
  track?: {
    id: string;
    title: string;
    artistName: string;
    albumName: string | null;
    durationSeconds: number;
    artworkKey: string;
    audioKey: string;
  };
}

export interface ICreateRoomData {
  name: string;
  passcodeHash?: string | null;
  access: RoomAccess;
  chatPolicy: RoomChatPolicy;
  hostUserId: string;
  originalControllerId: string;
  activeControllerId: string;
}

export interface IRoomRepository {
  createRoom(data: ICreateRoomData): Promise<IRoomEntity>;
  findRoomById(roomId: string): Promise<IRoomEntity | null>;
  findPublicRooms(limit?: number): Promise<IRoomEntity[]>;
  addParticipant(roomId: string, userId: string, hasConsented: boolean): Promise<IRoomParticipantEntity>;
  removeParticipant(roomId: string, userId: string): Promise<void>;
  getParticipants(roomId: string): Promise<IRoomParticipantEntity[]>;
  getParticipant(roomId: string, userId: string): Promise<IRoomParticipantEntity | null>;
  getParticipantCount(roomId: string): Promise<number>;
  updateParticipantConsent(roomId: string, userId: string, hasConsented: boolean): Promise<void>;
  updateRoomControllers(
    roomId: string,
    updates: { originalControllerId?: string | null; activeControllerId?: string | null }
  ): Promise<void>;
  createControlRequest(roomId: string, requesterId: string): Promise<IRoomControlRequestEntity>;
  updateControlRequest(requestId: string, status: ControlRequestStatus): Promise<void>;
  findControlRequest(requestId: string): Promise<IRoomControlRequestEntity | null>;
  savePersistentMessage(data: {
    roomId: string;
    senderId: string;
    content: string;
  }): Promise<IPersistentMessageEntity>;
  getPersistentMessages(roomId: string, limit?: number): Promise<IPersistentMessageEntity[]>;
  getQueue(roomId: string): Promise<IRoomQueueEntity[]>;
  addToQueue(roomId: string, trackId: string, suggestedBy: string): Promise<IRoomQueueEntity>;
  removeFromQueue(queueItemId: string): Promise<void>;
  reorderQueue(roomId: string, queueItemId: string, newOrderIndex: number): Promise<void>;
}

