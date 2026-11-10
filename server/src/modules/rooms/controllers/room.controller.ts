import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { IAuthGuard } from '../../../shared/guards/contracts/auth-guard.contract.js';
import { IRoomService } from '../contracts/room-service.contract.js';
import { RoomAccess, RoomChatPolicy } from '@aadat/contracts';

export interface IRoomControllerDependencies {
  readonly roomService: IRoomService;
  readonly authGuard: IAuthGuard;
}

interface ICreateRoomRequestBody {
  readonly name: string;
  readonly access?: RoomAccess;
  readonly passcode?: string;
  readonly chatPolicy?: RoomChatPolicy;
}

interface IRoomParams {
  readonly roomId: string;
}

export class RoomController {
  private readonly roomService: IRoomService;
  private readonly authGuard: IAuthGuard;

  public constructor(dependencies: IRoomControllerDependencies) {
    this.roomService = dependencies.roomService;
    this.authGuard = dependencies.authGuard;
  }

  public registerRoutes(fastify: FastifyInstance): void {
    // 1. Create Room
    fastify.post(
      '/api/v1/rooms',
      async (request: FastifyRequest<{ Body: ICreateRoomRequestBody }>, reply: FastifyReply) => {
        const user = await this.authGuard.validateToken(request.headers.authorization);
        const room = await this.roomService.createRoom(user.userId, request.body);
        reply.status(201).send(room);
      }
    );

    // 2. List Public Rooms
    fastify.get('/api/v1/rooms', async (_request: FastifyRequest, reply: FastifyReply) => {
      const rooms = await this.roomService.getPublicRooms();
      reply.status(200).send({ rooms });
    });

    // 3. Get Room Details
    fastify.get(
      '/api/v1/rooms/:roomId',
      async (request: FastifyRequest<{ Params: IRoomParams }>, reply: FastifyReply) => {
        const room = await this.roomService.getRoom(request.params.roomId);
        if (!room) {
          reply.status(404).send({ error: 'Room not found' });
          return;
        }
        reply.status(200).send(room);
      }
    );
  }
}

