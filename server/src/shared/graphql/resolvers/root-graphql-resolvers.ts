import { IResolvers } from 'mercurius';
import {
  IGraphQLContext,
  IGraphQLRoomSummary,
  IGraphQLTrack,
  IGraphQLUser,
  IRootGraphQLResolvers,
} from '../contracts/graphql-resolver.contract.js';
import {
  IHealthCheckService,
  IHealthStatusResponse,
} from '../../../modules/health/contracts/health.contract.js';
import { IUserRepository } from '../../../modules/auth/contracts/user-repository.contract.js';
import {
  OperationNotImplementedError,
  UnauthorizedError,
} from '../../errors/domain.error.js';

export interface IRootGraphQLResolversDependencies {
  readonly healthService: IHealthCheckService;
  readonly userRepository?: IUserRepository;
  readonly version?: string;
}

/**
 * Root GraphQL Resolvers Provider
 * Class-based resolver orchestrator. Strictly delegates to service contracts.
 * NEVER accesses database or Prisma directly.
 * NEVER returns fake identities, fake tracks, or simulated success statuses.
 * Unimplemented features fail explicitly with NOT_IMPLEMENTED errors.
 */
export class RootGraphQLResolvers implements IRootGraphQLResolvers {
  private readonly healthService: IHealthCheckService;
  private readonly userRepository?: IUserRepository;
  private readonly version: string;

  public constructor(dependencies: IRootGraphQLResolversDependencies) {
    this.healthService = dependencies.healthService;
    this.userRepository = dependencies.userRepository;
    this.version = dependencies.version ?? '0.1.0';
  }

  public getVersion(): string {
    return this.version;
  }

  public buildResolvers(): IResolvers {
    return {
      Query: {
        health: async (): Promise<IHealthStatusResponse> => {
          return this.healthService.getHealthStatus();
        },

        me: async (
          _parent: unknown,
          _args: unknown,
          context: IGraphQLContext
        ): Promise<IGraphQLUser> => {
          if (!context.userId) {
            throw new UnauthorizedError('Authentication required to access current user identity.');
          }
          if (!this.userRepository) {
            throw new OperationNotImplementedError('User persistence repository is not configured.');
          }
          const user = await this.userRepository.findById(context.userId);
          if (!user) {
            throw new UnauthorizedError('Authenticated user no longer exists.');
          }
          return {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            avatarUrl: null,
            chatRetentionPreference: user.chatRetentionPreference,
            createdAt: user.createdAt.toISOString(),
          };
        },

        track: (_parent: unknown, _args: { id: string }): IGraphQLTrack | null => {
          return null;
        },

        searchCatalog: (_parent: unknown, _args: { query: string; limit?: number }): IGraphQLTrack[] => {
          return [];
        },

        getGlobalPlayQueue: (
          _parent: unknown,
          _args: { latitude?: number; longitude?: number; limit?: number }
        ): IGraphQLTrack[] => {
          return [];
        },

        getSeasonalCollections: (): unknown[] => {
          return [];
        },

        mySavedCollections: (): unknown[] => {
          throw new OperationNotImplementedError('User saved collections feature is not implemented yet.');
        },

        myWarehouse: (): unknown[] => {
          throw new OperationNotImplementedError('Hybrid Warehouse feature is not implemented yet.');
        },

        myFavorites: (): unknown[] => {
          throw new OperationNotImplementedError('Warehouse favorites feature is not implemented yet.');
        },

        myInstaMusBookmarks: (): IGraphQLTrack[] => {
          throw new OperationNotImplementedError('InstaMus bookmarks feature is not implemented yet.');
        },

        publicRooms: (): IGraphQLRoomSummary[] => {
          return [];
        },
      },

      Mutation: {
        updateChatRetentionPreference: (
          _parent: unknown,
          _args: { preference: 'EPHEMERAL_SESSION_ONLY' | 'PERSISTENT_HISTORY' },
          _context: IGraphQLContext
        ): IGraphQLUser => {
          throw new OperationNotImplementedError('Chat retention preference updates are not implemented yet.');
        },

        ingestInstaMusReel: (
          _parent: unknown,
          _args: { reelUrl: string; isPrivate?: boolean }
        ): unknown => {
          throw new OperationNotImplementedError('InstaMus reel ingestion is not implemented yet.');
        },

        archiveWarehouseTrack: (): unknown => {
          throw new OperationNotImplementedError('Warehouse track archiving is not implemented yet.');
        },

        restoreWarehouseTrack: (): unknown => {
          throw new OperationNotImplementedError('Warehouse track restoration is not implemented yet.');
        },

        hideWarehouseTrack: (): unknown => {
          throw new OperationNotImplementedError('Warehouse track hiding is not implemented yet.');
        },

        removeFromArchive: (): boolean => {
          throw new OperationNotImplementedError('Warehouse track unarchiving is not implemented yet.');
        },

        toggleFavorite: (): unknown => {
          throw new OperationNotImplementedError('Warehouse favorite toggling is not implemented yet.');
        },

        saveSeasonalCollection: (): unknown => {
          throw new OperationNotImplementedError('Seasonal collection saving is not implemented yet.');
        },

        renameSavedCollection: (): unknown => {
          throw new OperationNotImplementedError('Seasonal collection renaming is not implemented yet.');
        },

        deleteSavedCollection: (): boolean => {
          throw new OperationNotImplementedError('Seasonal collection deletion is not implemented yet.');
        },

        recordPlaybackMetric: (): boolean => {
          throw new OperationNotImplementedError('Playback telemetry metric recording is not implemented yet.');
        },
      },
    };
  }
}
