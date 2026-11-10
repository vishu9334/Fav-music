import { FastifyInstance } from 'fastify';
import { IS3StorageService } from '../../infrastructure/storage/contracts/storage.contract.js';
import { ICacheService } from '../../infrastructure/cache/contracts/cache.contract.js';
import { IDatabaseService } from '../../infrastructure/database/contracts/database.contract.js';
import { IAuthGuard } from '../../shared/guards/contracts/auth-guard.contract.js';
import { IUserRepository } from '../auth/contracts/user-repository.contract.js';
import { PrismaUserRepository } from '../auth/repositories/prisma-user.repository.js';
import { IUploadTicketRepository } from './contracts/upload-ticket-repository.contract.js';
import { RedisUploadTicketRepository } from './repositories/redis-upload-ticket.repository.js';
import { ITrackMediaRepository } from './contracts/track-media-repository.contract.js';
import { PrismaTrackMediaRepository } from './repositories/prisma-track-media.repository.js';
import { IMediaService } from './contracts/media.contract.js';
import { MediaService } from './services/media.service.js';
import { MediaController } from './controllers/media.controller.js';

export interface IMediaModuleDependencies {
  readonly storageService: IS3StorageService;
  readonly cacheService: ICacheService;
  readonly databaseService: IDatabaseService;
  readonly authGuard: IAuthGuard;
  readonly userRepository?: IUserRepository;
  readonly ticketRepository?: IUploadTicketRepository;
  readonly trackRepository?: ITrackMediaRepository;
  readonly mediaService?: IMediaService;
  readonly presignedUploadExpirySeconds?: number;
  readonly presignedDownloadExpirySeconds?: number;
}

/**
 * Media Feature Module Composition Root
 * Wires storage service, Redis ticket repository, media service, and REST controllers.
 * Adheres strictly to OOP, SOLID, and Dependency Injection.
 */
export class MediaModule {
  private readonly dependencies: IMediaModuleDependencies;
  private readonly storageService: IS3StorageService;
  private readonly ticketRepository: IUploadTicketRepository;
  private readonly userRepository: IUserRepository;
  private readonly trackRepository: ITrackMediaRepository;
  private readonly mediaService: IMediaService;
  private readonly mediaController: MediaController;

  public constructor(dependencies: IMediaModuleDependencies) {
    this.dependencies = dependencies;
    this.storageService = dependencies.storageService;

    this.ticketRepository =
      dependencies.ticketRepository ??
      new RedisUploadTicketRepository(dependencies.cacheService);

    this.userRepository =
      dependencies.userRepository ??
      new PrismaUserRepository(dependencies.databaseService);

    this.trackRepository =
      dependencies.trackRepository ??
      new PrismaTrackMediaRepository(dependencies.databaseService);

    this.mediaService =
      dependencies.mediaService ??
      new MediaService({
        storageService: this.storageService,
        ticketRepository: this.ticketRepository,
        userRepository: this.userRepository,
        trackRepository: this.trackRepository,
        presignedUploadExpirySeconds: dependencies.presignedUploadExpirySeconds,
        presignedDownloadExpirySeconds: dependencies.presignedDownloadExpirySeconds,
      });

    this.mediaController = new MediaController({
      mediaService: this.mediaService,
      authGuard: dependencies.authGuard,
    });
  }

  public registerRoutes(fastify: FastifyInstance): void {
    this.mediaController.registerRoutes(fastify);
  }

  public getMediaService(): IMediaService {
    return this.mediaService;
  }

  public getStorageService(): IS3StorageService {
    return this.storageService;
  }

  public getTicketRepository(): IUploadTicketRepository {
    return this.ticketRepository;
  }

  public getDependencies(): IMediaModuleDependencies {
    return this.dependencies;
  }
}

