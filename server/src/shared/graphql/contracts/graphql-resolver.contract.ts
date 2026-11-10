import { MercuriusContext, IResolvers } from 'mercurius';

export interface IGraphQLUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly avatarUrl?: string | null;
  readonly chatRetentionPreference: 'EPHEMERAL_SESSION_ONLY' | 'PERSISTENT_HISTORY';
  readonly createdAt: string;
}

export interface IGraphQLTrack {
  readonly id: string;
  readonly title: string;
  readonly artistName: string;
  readonly albumName?: string | null;
  readonly durationSeconds: number;
  readonly audioKey: string;
  readonly videoKey?: string | null;
  readonly artworkKey: string;
  readonly audioPlaybackUrl: string;
  readonly videoPlaybackUrl?: string | null;
  readonly artworkUrl: string;
  readonly timeAffinities: string[];
  readonly weatherAffinities: string[];
  readonly seasonAffinities: string[];
  readonly energyScore: number;
  readonly tempoBpm?: number | null;
}

export interface IGraphQLRoomSummary {
  readonly id: string;
  readonly name: string;
  readonly access: 'PUBLIC' | 'PRIVATE';
  readonly chatPolicy: 'EPHEMERAL_SESSION_ONLY' | 'PERSISTENT_LOG';
  readonly hostUserId: string;
  readonly originalControllerId?: string | null;
  readonly activeControllerId?: string | null;
  readonly participantCount: number;
  readonly maxParticipants: number;
  readonly currentTrack?: IGraphQLTrack | null;
}

/**
 * Typed GraphQL Context
 */
export interface IGraphQLContext extends MercuriusContext {
  userId?: string;
  sessionId?: string;
  userEmail?: string;
  displayName?: string;
}

/**
 * Root GraphQL Resolvers Contract
 */
export interface IRootGraphQLResolvers {
  buildResolvers(): IResolvers;
}
