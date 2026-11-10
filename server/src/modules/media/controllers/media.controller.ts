import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { IMediaService } from '../contracts/media.contract.js';
import { IAuthGuard } from '../../../shared/guards/contracts/auth-guard.contract.js';
import { MediaType } from '../contracts/upload-ticket-repository.contract.js';

export interface IMediaControllerDependencies {
  readonly mediaService: IMediaService;
  readonly authGuard: IAuthGuard;
}

interface IUploadTicketRequestBody {
  readonly mediaType: MediaType;
  readonly contentType: string;
  readonly contentLength?: number;
}

interface IConfirmUploadRequestBody {
  readonly ticketId: string;
}

interface ITrackStreamParams {
  readonly trackId: string;
}

interface IUserAvatarParams {
  readonly userId: string;
}

interface IPlaybackQuery {
  readonly expiresInSeconds?: string;
}

/**
 * Media REST Controller
 * Handles HTTP request/response parsing, authentication guard enforcement,
 * and delegates all business logic to IMediaService.
 * Adheres strictly to OOP and SOLID principles.
 */
export class MediaController {
  private readonly mediaService: IMediaService;
  private readonly authGuard: IAuthGuard;

  public constructor(dependencies: IMediaControllerDependencies) {
    this.mediaService = dependencies.mediaService;
    this.authGuard = dependencies.authGuard;
  }

  public registerRoutes(fastify: FastifyInstance): void {
    // 1. Request Upload Ticket (Presigned POST with enforced content-length-range)
    fastify.post(
      '/api/v1/media/upload-ticket',
      async (
        request: FastifyRequest<{ Body: IUploadTicketRequestBody }>,
        reply: FastifyReply
      ) => {
        const user = await this.authGuard.validateToken(request.headers.authorization);
        const result = await this.mediaService.createUploadTicket(
          user.userId,
          request.body,
          user.role
        );
        reply.status(201).send(result);
      }
    );

    // 2. Confirm Upload (Atomic CAS lock, ETag validation, promotion to permanent key)
    fastify.post(
      '/api/v1/media/confirm-upload',
      async (
        request: FastifyRequest<{ Body: IConfirmUploadRequestBody }>,
        reply: FastifyReply
      ) => {
        const user = await this.authGuard.validateToken(request.headers.authorization);
        const result = await this.mediaService.confirmUpload(user.userId, request.body);
        reply.status(200).send(result);
      }
    );

    // 3. Get Catalog Track Stream URL (Resolves from trusted database Track row)
    fastify.get(
      '/api/v1/media/tracks/:trackId/stream',
      async (
        request: FastifyRequest<{
          Params: ITrackStreamParams;
          Querystring: IPlaybackQuery;
        }>,
        reply: FastifyReply
      ) => {
        const user = await this.authGuard.validateToken(request.headers.authorization);
        const query = request.query;
        const parsedExpiry = query.expiresInSeconds
          ? Number.parseInt(query.expiresInSeconds, 10)
          : undefined;

        const result = await this.mediaService.getTrackPlaybackUrl(user.userId, {
          trackId: request.params.trackId,
          expiresInSeconds: parsedExpiry,
        });

        reply.status(200).send(result);
      }
    );

    // 4. Get User Avatar URL (Resolves from trusted database User row)
    fastify.get(
      '/api/v1/media/users/:userId/avatar',
      async (
        request: FastifyRequest<{
          Params: IUserAvatarParams;
          Querystring: IPlaybackQuery;
        }>,
        reply: FastifyReply
      ) => {
        const user = await this.authGuard.validateToken(request.headers.authorization);
        const query = request.query;
        const parsedExpiry = query.expiresInSeconds
          ? Number.parseInt(query.expiresInSeconds, 10)
          : undefined;

        const result = await this.mediaService.getUserAvatarUrl(user.userId, {
          targetUserId: request.params.userId,
          expiresInSeconds: parsedExpiry,
        });

        reply.status(200).send(result);
      }
    );

    // 5. Remove User Avatar (Purges S3 object and nulls database avatarKey)
    fastify.delete(
      '/api/v1/media/users/:userId/avatar',
      async (
        request: FastifyRequest<{
          Params: IUserAvatarParams;
        }>,
        reply: FastifyReply
      ) => {
        const user = await this.authGuard.validateToken(request.headers.authorization);
        const result = await this.mediaService.removeUserAvatar(
          user.userId,
          request.params.userId,
          user.role
        );
        reply.status(200).send(result);
      }
    );
  }
}
