import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomAccess, RoomChatPolicy } from '@aadat/contracts';
import { PrismaRoomRepository } from '../repositories/prisma-room.repository.js';
import { roomCodeCandidates, roomCodePrefix, normalizeRoomId } from '../utils/room-code.js';
import type { IDatabaseService } from '../../../infrastructure/database/contracts/database.contract.js';

const input = { name: 'Evening music', hostUserId: 'host', originalControllerId: 'host', activeControllerId: 'host', access: RoomAccess.PRIVATE, chatPolicy: RoomChatPolicy.EPHEMERAL_SESSION_ONLY, passcodeHash: 'existing-hash' };
const prisma = { user: { findUnique: vi.fn() }, room: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn() } };
const repository = new PrismaRoomRepository({ getClient: () => prisma } as unknown as IDatabaseService);
const entity = (data: any) => ({ ...data, createdAt: new Date(), updatedAt: new Date() });
beforeEach(() => {
  vi.resetAllMocks();
  prisma.user.findUnique.mockResolvedValue({ displayName: 'Vishal Kumar' });
  prisma.room.findMany.mockResolvedValue([]);
  prisma.room.create.mockImplementation(async ({ data }) => entity(data));
});
describe('name-based six-character room IDs', () => {
  it.each([['Vishal Kumar', 'VIKU'], ['Vishal Dev Kumar', 'VIKU'], ['Li Bo', 'LIBO'], ['Vishal', 'VISH'], ['Al', 'ALXX'], ['José Núñez', 'JONU'], ['नमस्ते', 'ROOM']])('makes four readable letters for %s', (name, prefix) => {
    expect(roomCodePrefix(name)).toBe(prefix);
  });
  it('offers every two-digit suffix exactly once, including leading zeroes', () => {
    const candidates = roomCodeCandidates('Vishal Kumar');
    expect(new Set(candidates).size).toBe(100);
    expect(candidates).toEqual(expect.arrayContaining(['VIKU00', 'VIKU09', 'VIKU99']));
    expect(candidates.every(code => /^VIKU\d{2}$/.test(code))).toBe(true);
  });
  it('creates the actual persistent room ID from the verified host name, preserving access policy', async () => {
    const room = await repository.createRoom(input);
    expect(room.id).toMatch(/^VIKU\d{2}$/);
    expect(room.passcodeHash).toBe('existing-hash');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'host' }, select: { displayName: true } });
  });
  it('uses the one remaining available code without changing any existing room ID', async () => {
    prisma.room.findMany.mockResolvedValue(roomCodeCandidates('Vishal Kumar').filter(id => id !== 'VIKU42').map(id => ({ id })));
    expect((await repository.createRoom(input)).id).toBe('VIKU42');
  });
  it('retries a database primary-key collision atomically with a different suffix', async () => {
    prisma.room.create.mockRejectedValueOnce({ code: 'P2002', meta: { target: ['id'] } });
    const room = await repository.createRoom(input);
    expect(prisma.room.create).toHaveBeenCalledTimes(2);
    expect(prisma.room.create.mock.calls[0]![0].data.id).not.toBe(room.id);
  });
  it('refuses exhausted initials without overwriting a room or growing beyond six characters', async () => {
    prisma.room.findMany.mockResolvedValue(roomCodeCandidates('Vishal Kumar').map(id => ({ id })));
    await expect(repository.createRoom(input)).rejects.toThrow('All room codes for these initials are in use');
    expect(prisma.room.create).not.toHaveBeenCalled();
  });
  it('propagates unrelated database failures instead of retrying them as code collisions', async () => {
    const error = { code: 'P2002', meta: { target: ['other_field'] } };
    prisma.room.create.mockRejectedValueOnce(error);
    await expect(repository.createRoom(input)).rejects.toBe(error);
    expect(prisma.room.create).toHaveBeenCalledOnce();
  });
  it('accepts lowercase short codes and retains legacy IDs', async () => {
    prisma.room.findUnique.mockResolvedValue(entity({ ...input, id: 'VIKU42' }));
    expect((await repository.findRoomById(' viku42 '))?.id).toBe('VIKU42');
    expect(prisma.room.findUnique).toHaveBeenCalledWith({ where: { id: 'VIKU42' } });
    const legacy = '10000000-0000-4000-8000-000000000001';
    expect(normalizeRoomId(legacy)).toBe(legacy);
  });
});
