import { IDatabaseService } from '../../../infrastructure/database/contracts/database.contract.js';
import {
  ICreateRoomData,
  IPersistentMessageEntity,
  IRoomControlRequestEntity,
  IRoomEntity,
  IRoomParticipantEntity,
  IRoomQueueEntity,
  IRoomRepository,
} from '../contracts/room-repository.contract.js';
import { ControlRequestStatus } from '@aadat/contracts';
import { ConflictError, NotFoundError } from '../../../shared/errors/domain.error.js';
import { normalizeRoomId, roomCodeCandidates } from '../utils/room-code.js';

export class PrismaRoomRepository implements IRoomRepository {
  public constructor(private readonly databaseService: IDatabaseService) {}

  private get prisma() {
    return this.databaseService.getClient();
  }

  public async createRoom(data: ICreateRoomData): Promise<IRoomEntity> {
    const host = await this.prisma.user.findUnique({ where: { id: data.hostUserId }, select: { displayName: true } });
    if (!host) throw new NotFoundError('Room host not found');
    const candidates = roomCodeCandidates(host.displayName);
    const existing = await this.prisma.room.findMany({ where: { id: { startsWith: candidates[0]!.slice(0, 4) } }, select: { id: true } });
    const occupied = new Set(existing.map(room => room.id));
    for (const id of candidates) {
      if (occupied.has(id)) continue;
      try {
        const created = await this.prisma.room.create({
          data: {
            id,
            name: data.name,
            passcodeHash: data.passcodeHash ?? null,
            access: data.access,
            chatPolicy: data.chatPolicy,
            hostUserId: data.hostUserId,
            originalControllerId: data.originalControllerId,
            activeControllerId: data.activeControllerId,
          },
        });
        return this.toRoomEntity(created);
      } catch (error) {
        const value = error as { code?: string; meta?: { target?: unknown } };
        const target = value.meta?.target;
        // The database remains the authority when two requests choose the same code.
        if (value.code === 'P2002' && (Array.isArray(target) ? target.length === 1 && target[0] === 'id' : target === 'Room_pkey')) continue;
        throw error;
      }
    }
    throw new ConflictError('All room codes for these initials are in use. Reuse an existing room or update your display name.');
  }

  private toRoomEntity(created: { id: string; name: string; passcodeHash: string | null; access: unknown; chatPolicy: unknown; hostUserId: string; originalControllerId: string | null; activeControllerId: string | null; createdAt: Date; updatedAt: Date }): IRoomEntity {
    return {
      id: created.id,
      name: created.name,
      passcodeHash: created.passcodeHash,
      access: created.access as any,
      chatPolicy: created.chatPolicy as any,
      hostUserId: created.hostUserId,
      originalControllerId: created.originalControllerId,
      activeControllerId: created.activeControllerId,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  public async findRoomById(roomId: string): Promise<IRoomEntity | null> {
    const room = await this.prisma.room.findUnique({
      where: { id: normalizeRoomId(roomId) },
    });
    if (!room) return null;
    return {
      id: room.id,
      name: room.name,
      passcodeHash: room.passcodeHash,
      access: room.access as any,
      chatPolicy: room.chatPolicy as any,
      hostUserId: room.hostUserId,
      originalControllerId: room.originalControllerId,
      activeControllerId: room.activeControllerId,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    };
  }

  public async findPublicRooms(limit: number = 20): Promise<IRoomEntity[]> {
    const rooms = await this.prisma.room.findMany({
      where: { access: 'PUBLIC' },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return rooms.map((r: any) => ({
      id: r.id,
      name: r.name,
      passcodeHash: r.passcodeHash,
      access: r.access,
      chatPolicy: r.chatPolicy,
      hostUserId: r.hostUserId,
      originalControllerId: r.originalControllerId,
      activeControllerId: r.activeControllerId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  public async addParticipant(
    roomId: string,
    userId: string,
    hasConsented: boolean
  ): Promise<IRoomParticipantEntity> {
    const participant = await this.prisma.roomParticipant.upsert({
      where: {
        roomId_userId: { roomId, userId },
      },
      update: {
        hasConsented,
      },
      create: {
        roomId,
        userId,
        hasConsented,
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            avatarKey: true,
            chatRetentionPreference: true,
          },
        },
      },
    });

    return {
      id: participant.id,
      roomId: participant.roomId,
      userId: participant.userId,
      hasConsented: participant.hasConsented,
      joinedAt: participant.joinedAt,
      user: participant.user
        ? {
            id: participant.user.id,
            displayName: participant.user.displayName,
            email: participant.user.email,
            avatarKey: participant.user.avatarKey,
            chatRetentionPreference: String(participant.user.chatRetentionPreference),
          }
        : undefined,
    };
  }

  public async removeParticipant(roomId: string, userId: string): Promise<void> {
    await this.prisma.roomParticipant
      .delete({
        where: { roomId_userId: { roomId, userId } },
      })
      .catch(() => {});
  }

  public async getParticipants(roomId: string): Promise<IRoomParticipantEntity[]> {
    const participants = await this.prisma.roomParticipant.findMany({
      where: { roomId },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            avatarKey: true,
            chatRetentionPreference: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return participants.map((p: any) => ({
      id: p.id,
      roomId: p.roomId,
      userId: p.userId,
      hasConsented: p.hasConsented,
      joinedAt: p.joinedAt,
      user: p.user
        ? {
            id: p.user.id,
            displayName: p.user.displayName,
            email: p.user.email,
            avatarKey: p.user.avatarKey,
            chatRetentionPreference: String(p.user.chatRetentionPreference),
          }
        : undefined,
    }));
  }

  public async getParticipant(roomId: string, userId: string): Promise<IRoomParticipantEntity | null> {
    const p = await this.prisma.roomParticipant.findUnique({
      where: { roomId_userId: { roomId, userId } },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            avatarKey: true,
            chatRetentionPreference: true,
          },
        },
      },
    });

    if (!p) return null;
    return {
      id: p.id,
      roomId: p.roomId,
      userId: p.userId,
      hasConsented: p.hasConsented,
      joinedAt: p.joinedAt,
      user: p.user
        ? {
            id: p.user.id,
            displayName: p.user.displayName,
            email: p.user.email,
            avatarKey: p.user.avatarKey,
            chatRetentionPreference: String(p.user.chatRetentionPreference),
          }
        : undefined,
    };
  }

  public async getParticipantCount(roomId: string): Promise<number> {
    return this.prisma.roomParticipant.count({
      where: { roomId },
    });
  }

  public async updateParticipantConsent(
    roomId: string,
    userId: string,
    hasConsented: boolean
  ): Promise<void> {
    await this.prisma.roomParticipant.update({
      where: { roomId_userId: { roomId, userId } },
      data: { hasConsented },
    });
  }

  public async updateRoomControllers(
    roomId: string,
    updates: { originalControllerId?: string | null; activeControllerId?: string | null }
  ): Promise<void> {
    await this.prisma.room.update({
      where: { id: roomId },
      data: updates,
    });
  }

  public async createControlRequest(
    roomId: string,
    requesterId: string
  ): Promise<IRoomControlRequestEntity> {
    const req = await this.prisma.roomControlRequest.create({
      data: {
        roomId,
        requesterId,
        status: 'PENDING',
      },
      include: {
        requester: {
          select: {
            id: true,
            displayName: true,
            email: true,
            avatarKey: true,
          },
        },
      },
    });

    return {
      id: req.id,
      roomId: req.roomId,
      requesterId: req.requesterId,
      status: req.status as any,
      createdAt: req.createdAt,
      updatedAt: req.updatedAt,
      requester: req.requester
        ? {
            id: req.requester.id,
            displayName: req.requester.displayName,
            email: req.requester.email,
            avatarKey: req.requester.avatarKey,
          }
        : undefined,
    };
  }

  public async updateControlRequest(
    requestId: string,
    status: ControlRequestStatus
  ): Promise<void> {
    await this.prisma.roomControlRequest.update({
      where: { id: requestId },
      data: { status },
    });
  }

  public async findControlRequest(requestId: string): Promise<IRoomControlRequestEntity | null> {
    const req = await this.prisma.roomControlRequest.findUnique({
      where: { id: requestId },
      include: {
        requester: {
          select: {
            id: true,
            displayName: true,
            email: true,
            avatarKey: true,
          },
        },
      },
    });

    if (!req) return null;
    return {
      id: req.id,
      roomId: req.roomId,
      requesterId: req.requesterId,
      status: req.status as any,
      createdAt: req.createdAt,
      updatedAt: req.updatedAt,
      requester: req.requester
        ? {
            id: req.requester.id,
            displayName: req.requester.displayName,
            email: req.requester.email,
            avatarKey: req.requester.avatarKey,
          }
        : undefined,
    };
  }

  public async savePersistentMessage(data: {
    roomId: string;
    senderId: string;
    content: string;
  }): Promise<IPersistentMessageEntity> {
    const msg = await this.prisma.persistentRoomMessage.create({
      data: {
        roomId: data.roomId,
        senderId: data.senderId,
        content: data.content,
      },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            email: true,
            avatarKey: true,
          },
        },
      },
    });

    return {
      id: msg.id,
      roomId: msg.roomId,
      senderId: msg.senderId,
      content: msg.content,
      createdAt: msg.createdAt,
      sender: msg.sender
        ? {
            id: msg.sender.id,
            displayName: msg.sender.displayName,
            email: msg.sender.email,
            avatarKey: msg.sender.avatarKey,
          }
        : undefined,
    };
  }

  public async getPersistentMessages(
    roomId: string,
    limit: number = 50
  ): Promise<IPersistentMessageEntity[]> {
    const messages = await this.prisma.persistentRoomMessage.findMany({
      where: { roomId },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            email: true,
            avatarKey: true,
          },
        },
      },
    });

    return messages
      .map((m: any) => ({
        id: m.id,
        roomId: m.roomId,
        senderId: m.senderId,
        content: m.content,
        createdAt: m.createdAt,
        sender: m.sender
          ? {
              id: m.sender.id,
              displayName: m.sender.displayName,
              email: m.sender.email,
              avatarKey: m.sender.avatarKey,
            }
          : undefined,
      }))
      .reverse();
  }

  public async getQueue(roomId: string): Promise<IRoomQueueEntity[]> {
    const items = await this.prisma.roomQueueItem.findMany({
      where: { roomId },
      orderBy: { orderIndex: 'asc' },
      include: {
        track: {
          select: {
            id: true,
            title: true,
            artistName: true,
            albumName: true,
            durationSeconds: true,
            artworkKey: true,
            audioKey: true,
          },
        },
      },
    });

    return items.map((i: any) => ({
      id: i.id,
      roomId: i.roomId,
      trackId: i.trackId,
      suggestedBy: i.suggestedBy,
      orderIndex: i.orderIndex,
      addedAt: i.addedAt,
      track: i.track,
    }));
  }

  public async addToQueue(
    roomId: string,
    trackId: string,
    suggestedBy: string
  ): Promise<IRoomQueueEntity> {
    const existingTrack = await this.prisma.track.findUnique({
      where: { id: trackId },
    });
    if (!existingTrack) {
      await this.prisma.track.create({
        data: {
          id: trackId,
          title: trackId.replace(/[-_]/g, ' '),
          artistName: 'Aadat Ensemble',
          durationSeconds: 210,
          audioKey: `tracks/audio/${trackId}.mp3`,
          artworkKey: `tracks/art/${trackId}.jpg`,
        },
      });
    }

    const lastItem = await this.prisma.roomQueueItem.findFirst({
      where: { roomId },
      orderBy: { orderIndex: 'desc' },
    });
    const nextOrderIndex = (lastItem?.orderIndex ?? -1) + 1;

    const item = await this.prisma.roomQueueItem.create({
      data: {
        roomId,
        trackId,
        suggestedBy,
        orderIndex: nextOrderIndex,
      },
      include: {
        track: {
          select: {
            id: true,
            title: true,
            artistName: true,
            albumName: true,
            durationSeconds: true,
            artworkKey: true,
            audioKey: true,
          },
        },
      },
    });

    return {
      id: item.id,
      roomId: item.roomId,
      trackId: item.trackId,
      suggestedBy: item.suggestedBy,
      orderIndex: item.orderIndex,
      addedAt: item.addedAt,
      track: item.track,
    };
  }

  public async removeFromQueue(queueItemId: string): Promise<void> {
    await this.prisma.roomQueueItem.delete({
      where: { id: queueItemId },
    });
  }

  public async reorderQueue(
    _roomId: string,
    queueItemId: string,
    newOrderIndex: number
  ): Promise<void> {
    await this.prisma.roomQueueItem.update({
      where: { id: queueItemId },
      data: { orderIndex: newOrderIndex },
    });
  }
}
