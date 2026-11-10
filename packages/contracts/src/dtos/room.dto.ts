import { RoomAccess, RoomChatPolicy, ControlRequestStatus } from '../enums/room.enums.js';
import { UserDto } from './auth.dto.js';
import { TrackDto } from './catalog.dto.js';

export interface RoomParticipantDto {
  userId: string;
  user: UserDto;
  isHost: boolean;
  isOriginalController: boolean;
  isActiveController: boolean;
  hasConsentedToPersistentChat: boolean;
  joinedAt: string;
}

export interface RoomDto {
  id: string;
  name: string;
  access: RoomAccess;
  chatPolicy: RoomChatPolicy;
  hostUserId: string;
  originalControllerId: string | null;
  activeControllerId: string | null;
  currentTrackId: string | null;
  currentTrack?: TrackDto | null;
  participantCount: number;
  maxParticipants: number;
  createdAt: string;
}

export interface RoomControlRequestDto {
  id: string;
  roomId: string;
  requesterId: string;
  requester: UserDto;
  status: ControlRequestStatus;
  createdAt: string;
}

export interface RoomQueueItemDto {
  id: string;
  roomId: string;
  trackId: string;
  track: TrackDto;
  suggestedBy: UserDto;
  orderIndex: number;
  addedAt: string;
}

export interface RoomChatMessageDto {
  id: string;
  roomId: string;
  senderId: string;
  sender: UserDto;
  content: string;
  isEphemeral: boolean;
  timestamp: number;
}

