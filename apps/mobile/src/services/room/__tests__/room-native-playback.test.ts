import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaybackState, RoomAccess, RoomChatPolicy } from '@aadat/contracts';
import type { NativeMock } from '../../playback/__tests__/track-player.mock';
import type { AudioPlaybackService } from '../../playback/AudioPlaybackService';
import type { RoomPlaybackBridge } from '../room-playback-bridge';
import type { RoomSocketClient } from '../room-socket.client';
vi.mock('react-native-track-player', async () => (await import('../../playback/__tests__/track-player.mock')).trackPlayerModule);
let native: NativeMock, audio: AudioPlaybackService, bridge: RoomPlaybackBridge;
let store: typeof import('../../../store/useRoomStore').useRoomStore;
const commandPlay = vi.fn();
beforeEach(async () => {
  vi.resetModules();
  native = (await import('react-native-track-player')).default as unknown as NativeMock;
  native.__reset();
  audio = (await import('../../playback/AudioPlaybackService')).AudioPlaybackService.getInstance();
  store = (await import('../../../store/useRoomStore')).useRoomStore;
  store.getState().setInitialSync({ room: {
    id: 'room', name: 'Playback regression', hostUserId: 'dj', originalControllerId: 'dj', activeControllerId: 'dj',
    currentTrackId: null, access: RoomAccess.PUBLIC, chatPolicy: RoomChatPolicy.EPHEMERAL_SESSION_ONLY,
    participantCount: 1, maxParticipants: 10, createdAt: new Date().toISOString(),
  }, participants: [], currentPlayback: null, queue: [], recentEphemeralChat: [], requiresConsentPrompt: false }, 'dj');
  bridge = new (await import('../room-playback-bridge')).RoomPlaybackBridge(audio, () => 0);
  bridge.attach({ commandPlay, commandPause: vi.fn() } as unknown as RoomSocketClient, 'dj');
});
afterEach(async () => { await audio.destroy(); });
describe('room bridge with real audio service and stateful native contract', () => {
  it('restores demo streaming playback, pauses, and resumes without duplicate queue resets', async () => {
    expect(await bridge.commandPlay('room')).toBe(true);
    expect(await native.getQueue()).toEqual([expect.objectContaining({ id: 'sample-track-1', url: expect.stringContaining('SoundHelix-Song-1.mp3') })]);
    expect(audio.getPlaybackState()).toBe(PlaybackState.PLAYING);
    expect(native.add).toHaveBeenCalledTimes(1);
    expect(native.reset).not.toHaveBeenCalled();
    expect(commandPlay).toHaveBeenCalledWith('room', 0, 'sample-track-1');
    await bridge.commandPause('room');
    expect(audio.getPlaybackState()).toBe(PlaybackState.PAUSED);
    await bridge.commandPlay('room');
    expect(audio.getPlaybackState()).toBe(PlaybackState.PLAYING);
    expect(native.add).toHaveBeenCalledTimes(1);
    expect(native.reset).not.toHaveBeenCalled();
  });

  it('clears the native queue when disconnect detaches before asynchronous cleanup completes', async () => {
    await bridge.commandPlay('room');
    const left = bridge.onRoomLeft();
    bridge.detach(); store.getState().leaveRoom();
    await left;
    expect(await native.getQueue()).toEqual([]);
    expect(audio.getPlaybackState()).not.toBe(PlaybackState.PLAYING);
  });
});
