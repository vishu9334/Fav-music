import { Server as HttpServer } from 'http';
import { FastifyInstance } from 'fastify';
import { IDatabaseService } from '../../infrastructure/database/contracts/database.contract.js';
import { ICacheService } from '../../infrastructure/cache/contracts/cache.contract.js';
import { IAuthGuard } from '../../shared/guards/contracts/auth-guard.contract.js';
import { PrismaRoomRepository } from './repositories/prisma-room.repository.js';
import { RedisRoomCacheRepository } from './repositories/redis-room-cache.repository.js';
import { RoomService } from './services/room.service.js';
import { RoomController } from './controllers/room.controller.js';
import { RoomSocketHandler } from './socket/room-socket.handler.js';
import { IRoomService } from './contracts/room-service.contract.js';

export interface IRoomsModuleDependencies {
  readonly databaseService: IDatabaseService;
  readonly cacheService: ICacheService;
  readonly authGuard: IAuthGuard;
  readonly corsOrigins?: string[];
}

/**
 * Listening Rooms Feature Module Composition Root
 */
export class RoomsModule {
  private readonly roomService: IRoomService;
  private readonly roomController: RoomController;
  private readonly socketHandler: RoomSocketHandler;

  public constructor(dependencies: IRoomsModuleDependencies) {
    const roomRepository = new PrismaRoomRepository(dependencies.databaseService);
    const roomCacheRepository = new RedisRoomCacheRepository(dependencies.cacheService);

    this.roomService = new RoomService({
      roomRepository,
      roomCacheRepository,
    });

    this.roomController = new RoomController({
      roomService: this.roomService,
      authGuard: dependencies.authGuard,
    });

    this.socketHandler = new RoomSocketHandler({
      roomService: this.roomService,
      roomCache: roomCacheRepository,
      authGuard: dependencies.authGuard,
      corsOrigins: dependencies.corsOrigins,
    });
  }

  public getService(): IRoomService {
    return this.roomService;
  }

  public getSocketHandler(): RoomSocketHandler {
    return this.socketHandler;
  }

  public registerRoutes(fastify: FastifyInstance): void {
    this.roomController.registerRoutes(fastify);
  }

  public initializeSocket(server: HttpServer) {
    return this.socketHandler.initialize(server);
  }
}
