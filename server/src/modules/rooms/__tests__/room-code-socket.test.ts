import { expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { RoomSocketHandler, type IRoomSocketHandlerDependencies } from '../socket/room-socket.handler.js';
const h = vi.hoisted(() => ({ connection: null as null | ((socket: unknown) => void), emit: vi.fn(), channels: [] as string[] }));
vi.mock('socket.io', () => ({ Server: class {
  use() {}
  on(_event: string, callback: (socket: unknown) => void) { h.connection = callback; }
  to(channel: string) { h.channels.push(channel); return { emit: h.emit }; }
} }));
it('joins the canonical short-code channel so chat and playback reach lowercase-code joiners', async () => {
  const callbacks = new Map<string, (payload: any) => Promise<void>>();
  const socket = { id: 'socket', data: { userId: 'listener', displayName: 'Listener' },
    on: (event: string, callback: (payload: any) => Promise<void>) => callbacks.set(event, callback),
    join: vi.fn(), emit: vi.fn(), to: vi.fn(() => ({ emit: vi.fn() })),
  };
  const sync = { room: { id: 'VIKU42' }, participants: [{ userId: 'listener' }] };
  const dependencies = { roomService: { joinRoom: vi.fn().mockResolvedValue(sync), handleCommandPlay: vi.fn().mockResolvedValue({ roomId: 'VIKU42' }) }, roomCache: {}, authGuard: {} };
  new RoomSocketHandler(dependencies as unknown as IRoomSocketHandlerDependencies).initialize({} as Server);
  h.connection!(socket);
  await callbacks.get('room:join')!({ roomId: ' viku42 ' });
  expect(socket.join).toHaveBeenCalledWith('room:VIKU42');
  expect(socket.to).toHaveBeenCalledWith('room:VIKU42');
  expect(socket.emit).toHaveBeenCalledWith('room:initial_sync', sync);
  await callbacks.get('player:command_play')!({ roomId: 'VIKU42', positionSeconds: 0 });
  expect(h.channels).toContain('room:VIKU42');
  expect(h.emit).toHaveBeenCalledWith('player:sync_playback', { roomId: 'VIKU42' });
});
