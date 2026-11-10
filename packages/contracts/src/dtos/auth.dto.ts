import { ChatRetentionPreference } from '../enums/room.enums.js';

export interface UserDto {
  id: string;
  email: string;
  displayName: string;
  avatarKey: string | null;
  avatarUrl?: string | null; // Ephemeral presigned URL resolved at presentation layer
  chatRetentionPreference: ChatRetentionPreference;
  createdAt: string;
}

export interface GoogleAuthRequestDto {
  idToken: string;
}

export interface AuthSessionDto {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
}

export interface RefreshTokenRequestDto {
  refreshToken: string;
}

export interface LogoutRequestDto {
  refreshToken?: string;
}


