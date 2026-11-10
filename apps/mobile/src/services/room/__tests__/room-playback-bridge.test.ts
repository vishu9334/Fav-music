import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('react-native-track-player', async () =>
  (await import('../../playback/__tests__/track-player.mock')).trackPlayerModule
);

import { SAMPLE_TRACKS } from '../../../data/sample-tracks';
import { RoomPlaybackBridge, mapTrackDtoToPlayable } from '../room-playback-bridge';
import {
  PlaybackMode,
  PlaybackState,
  PlaybackSyncPayload,
  RoomAccess,
  RoomChatPolicy,
  TrackDto,
} from '@aadat/contracts';
import { IAudioPlaybackService } from '../../playback/types';
import { useRoomStore } from '../../../store/useRoomStore';
import { RoomSocketClient } from '../room-socket.client';

describe('RoomPlaybackBridge — Socket.IO to Native AudioPlayer Integration', () => {
  let bridge: RoomPlaybackBridge;
  let mockAudioService: IAudioPlaybackService;
  let mockSocketClient: RoomSocketClient;

  const currentUserId = 'user-listener-1';
  const controllerUserId = 'user-controller-2';
  const roomId = 'room-test-123';

  let currentPosition = 10;
  let currentState: PlaybackState = PlaybackState.IDLE;

  const sampleTrackDto: TrackDto = {
    id: 'track-456',
    title: 'Collaborative Sunset',
    artistName: 'Ambient Unit',
    albumName: 'Late Waves',
    durationSeconds: 240,
    audioKey: 'tracks/audio/sunset.mp3',
    audioPlaybackUrl: 'https://media.example.test/sunset.mp3',
    videoKey: null,
    artworkKey: 'tracks/artwork/sunset.jpg',
    timeAffinities: [],
    weatherAffinities: [],
    seasonAffinities: [],
    energyScore: 0.5,
    tempoBpm: 90,
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    currentPosition = 10;
    currentState = PlaybackState.IDLE;

    mockAudioService = {
      initialize: vi.fn(async () => {}),
      loadQueue: vi.fn(async () => {}),
      playQueue: vi.fn(async () => {}),
      getTracks: vi.fn(() => []),
      play: vi.fn(async () => {
        currentState = PlaybackState.PLAYING;
      }),
      pause: vi.fn(async () => {
        currentState = PlaybackState.PAUSED;
      }),
      stop: vi.fn(async () => {
        currentState = PlaybackState.STOPPED;
      }),
      togglePlayPause: vi.fn(async () => {}),
      seekTo: vi.fn(async (pos: number) => {
        currentPosition = pos;
      }),
      skipToNext: vi.fn(async () => {}),
      skipToPrevious: vi.fn(async () => {}),
      skipToIndex: vi.fn(async () => {}),
      getPlaybackState: vi.fn(() => currentState),
      onStateChange: vi.fn(() => () => {}),
      onTrackChange: vi.fn(() => () => {}),
      onProgress: vi.fn(() => () => {}),
      onError: vi.fn(() => () => {}),
      destroy: vi.fn(async () => {}),
      getRepeatMode: vi.fn(() => 'off' as const),
      getRepeatCountRemaining: vi.fn(() => 0),
      onRepeatChange: vi.fn(() => () => {}),
      setRepeatCycleMode: vi.fn(async () => {}),
      toggleRepeatCycle: vi.fn(async () => 'off' as const),
    };

    mockSocketClient = {
      commandPlay: vi.fn(),
      commandPause: vi.fn(),
      commandSeek: vi.fn(),
      commandNext: vi.fn(),
      commandPrevious: vi.fn(),
    } as unknown as RoomSocketClient;

    bridge = new RoomPlaybackBridge(mockAudioService, () => currentPosition);
    bridge.attach(mockSocketClient, currentUserId);

    // Initialize room store as active room with user as listener
    useRoomStore.getState().setInitialSync(
      {
        room: {
          id: roomId,
          name: 'Collab Room',
          access: RoomAccess.PUBLIC,
          chatPolicy: RoomChatPolicy.EPHEMERAL_SESSION_ONLY,
          hostUserId: controllerUserId,
          originalControllerId: controllerUserId,
          activeControllerId: controllerUserId,
          currentTrackId: 'track-1',
          currentTrack: { ...sampleTrackDto, id: 'track-1' },
          participantCount: 2,
          maxParticipants: 10,
          createdAt: new Date().toISOString(),
        },
        participants: [],
        currentPlayback: null,
        queue: [],
        recentEphemeralChat: [],
        requiresConsentPrompt: false,
      },
      currentUserId
    );
  });

  describe('Drift Correction & Unintended Autoplay Prevention', () => {
    it('performs hard seek and starts playback when clock drift exceeds 0.25s threshold and state is PLAYING', async () => {
      currentPosition = 10;
      const sync: PlaybackSyncPayload = {
        roomId,
        trackId: 'track-1',
        playbackMode: PlaybackMode.AUDIO,
        playbackState: PlaybackState.PLAYING,
        positionSeconds: 15,
        serverTimestamp: Date.now(),
        activeControllerId: controllerUserId,
        playbackRate: 1.0,
      };

      await bridge.onServerPlaybackSync(sync);

      expect(mockAudioService.seekTo).toHaveBeenCalledWith(expect.closeTo(15, 0.1));
      expect(mockAudioService.play).toHaveBeenCalled();
    });

    it('bypasses seek when clock drift is within 50ms tolerance threshold (prevents audio jitter)', async () => {
      currentPosition = 10.0;
      currentState = PlaybackState.PLAYING;

      const sync: PlaybackSyncPayload = {
        roomId,
        trackId: 'track-1',
        playbackMode: PlaybackMode.AUDIO,
        playbackState: PlaybackState.PLAYING,
        positionSeconds: 10.02,
        serverTimestamp: Date.now(),
        activeControllerId: controllerUserId,
        playbackRate: 1.0,
      };

      await bridge.onServerPlaybackSync(sync);

      expect(mockAudioService.seekTo).not.toHaveBeenCalled();
    });

    it('never triggers autoplay when server state is PAUSED, even with large position offset', async () => {
      currentState = PlaybackState.IDLE;
      currentPosition = 0;

      const sync: PlaybackSyncPayload = {
        roomId,
        trackId: 'track-1',
        playbackMode: PlaybackMode.AUDIO,
        playbackState: PlaybackState.PAUSED,
        positionSeconds: 85,
        serverTimestamp: Date.now(),
        activeControllerId: controllerUserId,
        playbackRate: 1.0,
      };

      await bridge.onServerPlaybackSync(sync);

      expect(mockAudioService.pause).toHaveBeenCalled();
      expect(mockAudioService.seekTo).toHaveBeenCalledWith(85);
      expect(mockAudioService.play).not.toHaveBeenCalled();
      expect(mockAudioService.getPlaybackState()).not.toBe(PlaybackState.PLAYING);
    });

    it('pauses native audio player upon receiving onServerPlaybackPaused', async () => {
      currentState = PlaybackState.PLAYING;
      useRoomStore.getState().updatePlaybackSync(
        {
          roomId,
          trackId: 'track-1',
          playbackMode: PlaybackMode.AUDIO,
          playbackState: PlaybackState.PLAYING,
          positionSeconds: 60,
          serverTimestamp: Date.now(),
          activeControllerId: controllerUserId,
          playbackRate: 1.0,
        },
        currentUserId
      );

      await bridge.onServerPlaybackPaused({
        roomId,
        positionSeconds: 62.5,
        reason: 'USER_COMMAND',
        serverTimestamp: Date.now(),
      });

      expect(mockAudioService.pause).toHaveBeenCalled();
      expect(mockAudioService.seekTo).toHaveBeenCalledWith(62.5);
      expect(useRoomStore.getState().currentPlayback?.playbackState).toBe(PlaybackState.PAUSED);
    });
  });

  describe('Queue Synchronization & Track Transitions', () => {
    it('synchronizes initial room track and playback on room join', async () => {
      await bridge.onRoomJoined({
        room: {
          id: roomId,
          name: 'Collab Room',
          access: RoomAccess.PUBLIC,
          chatPolicy: RoomChatPolicy.EPHEMERAL_SESSION_ONLY,
          hostUserId: controllerUserId,
          originalControllerId: controllerUserId,
          activeControllerId: controllerUserId,
          currentTrackId: sampleTrackDto.id,
          participantCount: 2,
          maxParticipants: 10,
          createdAt: new Date().toISOString(),
        },
        currentPlayback: {
          roomId,
          trackId: sampleTrackDto.id,
          playbackMode: PlaybackMode.AUDIO,
          playbackState: PlaybackState.PAUSED,
          positionSeconds: 42,
          serverTimestamp: Date.now(),
          activeControllerId: controllerUserId,
          playbackRate: 1.0,
        },
        queue: [
          {
            id: 'queue-1',
            roomId,
            trackId: sampleTrackDto.id,
            track: sampleTrackDto,
            suggestedBy: {} as any,
            orderIndex: 0,
            addedAt: new Date().toISOString(),
          },
        ],
      });

      expect(mockAudioService.loadQueue).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            id: sampleTrackDto.id,
            title: sampleTrackDto.title,
            artist: sampleTrackDto.artistName,
          }),
        ],
        0
      );
      expect(mockAudioService.seekTo).toHaveBeenCalledWith(42);
      expect(mockAudioService.pause).toHaveBeenCalled();
      expect(mockAudioService.play).not.toHaveBeenCalled();
      expect(bridge.getCurrentTrackId()).toBe(sampleTrackDto.id);
    });

    it('handles authoritative track changes and seeks to initial position without unintended autoplay', async () => {
      await bridge.onServerTrackChanged({
        track: sampleTrackDto,
        positionSeconds: 0,
        serverTimestamp: Date.now(),
      });

      expect(mockAudioService.loadQueue).toHaveBeenCalledWith(
        [expect.objectContaining({ id: sampleTrackDto.id })],
        0
      );
      expect(bridge.getCurrentTrackId()).toBe(sampleTrackDto.id);
      expect(useRoomStore.getState().currentRoom?.currentTrackId).toBe(sampleTrackDto.id);
      // Room store had PAUSED state; must not trigger play
      expect(mockAudioService.play).not.toHaveBeenCalled();
    });

    it('cleans up native player and clears queue when leaving room', async () => {
      await bridge.onRoomLeft();

      expect(mockAudioService.pause).toHaveBeenCalled();
      expect(mockAudioService.loadQueue).toHaveBeenCalledWith([]);
      expect(bridge.getCurrentTrackId()).toBeNull();
      expect(bridge.getLastProcessedTimestamp()).toBe(0);
    });
  });

  describe('Stale Event Rejection & Ordering', () => {
    it('discards stale playback sync packets with older timestamps', async () => {
      const now = Date.now();
      const freshSync: PlaybackSyncPayload = {
        roomId,
        trackId: 'track-1',
        playbackMode: PlaybackMode.AUDIO,
        playbackState: PlaybackState.PAUSED,
        positionSeconds: 50,
        serverTimestamp: now,
        activeControllerId: controllerUserId,
        playbackRate: 1.0,
      };

      await bridge.onServerPlaybackSync(freshSync);
      expect(mockAudioService.seekTo).toHaveBeenCalledWith(50);
      vi.clearAllMocks();

      // Older out-of-order packet arriving late
      const staleSync: PlaybackSyncPayload = {
        roomId,
        trackId: 'track-1',
        playbackMode: PlaybackMode.AUDIO,
        playbackState: PlaybackState.PLAYING,
        positionSeconds: 30,
        serverTimestamp: now - 5000,
        activeControllerId: controllerUserId,
        playbackRate: 1.0,
      };

      await bridge.onServerPlaybackSync(staleSync);

      // Must be completely discarded
      expect(mockAudioService.seekTo).not.toHaveBeenCalled();
      expect(mockAudioService.play).not.toHaveBeenCalled();
    });

    it('controller pause sets local timestamp so delayed server packets do not override paused state', async () => {
      useRoomStore.getState().setController(currentUserId, currentUserId);
      expect(useRoomStore.getState().isController).toBe(true);

      const beforePause = Date.now() - 100;
      await bridge.commandPause(roomId);

      expect(mockAudioService.pause).toHaveBeenCalled();
      expect(bridge.getLastProcessedTimestamp()).toBeGreaterThanOrEqual(beforePause);

      // Delayed packet from before pause
      const delayedSync: PlaybackSyncPayload = {
        roomId,
        trackId: 'track-1',
        playbackMode: PlaybackMode.AUDIO,
        playbackState: PlaybackState.PLAYING,
        positionSeconds: 20,
        serverTimestamp: beforePause,
        activeControllerId: controllerUserId,
        playbackRate: 1.0,
      };

      await bridge.onServerPlaybackSync(delayedSync);
      expect(mockAudioService.play).not.toHaveBeenCalled();
    });
  });

  describe('Room playback regressions', () => {
    it('loads a known demo as a stream and sends its exact ID without a second queue reset', async () => {
      useRoomStore.setState(state => ({ currentRoom: { ...state.currentRoom!, currentTrackId: null, currentTrack: undefined }, currentPlayback: null }));
      useRoomStore.getState().setController(currentUserId, currentUserId);
      await bridge.commandPlay(roomId);
      expect(mockAudioService.loadQueue).toHaveBeenCalledExactlyOnceWith([SAMPLE_TRACKS[0]], 0);
      expect(mockSocketClient.commandPlay).toHaveBeenCalledWith(roomId, 0, SAMPLE_TRACKS[0]!.id);
      expect(mockAudioService.play).toHaveBeenCalledOnce();
      expect(SAMPLE_TRACKS[0]!.catalogSource).not.toBe('local');
    });

    it('starts the new native queue for a controller when Next arrives as a server sync', async () => {
      useRoomStore.getState().setController(currentUserId, currentUserId);
      await bridge.onServerPlaybackSync({ roomId, trackId: 'track-1', playbackMode: PlaybackMode.AUDIO,
        playbackState: PlaybackState.PLAYING, positionSeconds: 0, serverTimestamp: Date.now(), activeControllerId: currentUserId, playbackRate: 1 });
      expect(mockAudioService.loadQueue).toHaveBeenCalledOnce();
      expect(mockAudioService.play).toHaveBeenCalledOnce();
    });

    it('resolves only the requested catalog song instead of substituting demo audio', () => {
      const playable = mapTrackDtoToPlayable({ ...sampleTrackDto, audioPlaybackUrl: undefined });
      expect(playable.url).toBe('');
      expect(playable.catalogSource).toBe('catalog');
    });

    it('rejects listener immediate-play attempts and does not replace the room queue', async () => {
      expect(await bridge.playTrackImmediately(roomId, SAMPLE_TRACKS[0]!)).toBe(false);
      expect(mockAudioService.loadQueue).not.toHaveBeenCalled();
      expect(mockSocketClient.commandPlay).not.toHaveBeenCalled();
    });

    it('cancels a pending Play when Pause arrives while audio is loading', async () => {
      useRoomStore.getState().setController(currentUserId, currentUserId);
      let finish!: () => void;
      vi.mocked(mockAudioService.loadQueue).mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
      const playing = bridge.playTrackImmediately(roomId, SAMPLE_TRACKS[0]!);
      await Promise.resolve();
      await bridge.commandPause(roomId);
      finish();
      expect(await playing).toBe(false);
      expect(mockAudioService.play).not.toHaveBeenCalled();
      expect(mockSocketClient.commandPlay).not.toHaveBeenCalled();
    });
  });

  describe('Controller Permissions & Command Authorization', () => {
    it('does not seek local player when active controller receives their own broadcast for an already loaded track', async () => {
      useRoomStore.getState().setController(currentUserId, currentUserId);
      expect(useRoomStore.getState().isController).toBe(true);

      await bridge.onServerTrackChanged({ track: { ...sampleTrackDto, id: 'track-1' }, positionSeconds: 0, serverTimestamp: Date.now() });
      currentState = PlaybackState.PLAYING;
      vi.clearAllMocks();

      const sync: PlaybackSyncPayload = {
        roomId,
        trackId: 'track-1',
        playbackMode: PlaybackMode.AUDIO,
        playbackState: PlaybackState.PLAYING,
        positionSeconds: 30,
        serverTimestamp: Date.now(),
        activeControllerId: currentUserId,
        playbackRate: 1.0,
      };

      await bridge.onServerPlaybackSync(sync);

      expect(mockAudioService.seekTo).not.toHaveBeenCalled();
      expect(mockAudioService.play).not.toHaveBeenCalled();
    });

    it('allows active controller to command play, pause, seek, next and previous', async () => {
      useRoomStore.getState().setController(currentUserId, currentUserId);
      currentPosition = 25;

      expect(await bridge.commandPlay(roomId)).toBe(true);
      expect(mockSocketClient.commandPlay).toHaveBeenCalledWith(roomId, 0, 'track-1');
      expect(mockAudioService.play).toHaveBeenCalled();

      expect(await bridge.commandPause(roomId)).toBe(true);
      expect(mockSocketClient.commandPause).toHaveBeenCalledWith(roomId, 25);
      expect(mockAudioService.pause).toHaveBeenCalled();

      expect(await bridge.commandSeek(roomId, 75)).toBe(true);
      expect(mockSocketClient.commandSeek).toHaveBeenCalledWith(roomId, 75);
      expect(mockAudioService.seekTo).toHaveBeenCalledWith(75);

      expect(await bridge.commandNext(roomId)).toBe(true);
      expect(mockSocketClient.commandNext).toHaveBeenCalledWith(roomId);

      expect(await bridge.commandPrevious(roomId)).toBe(true);
      expect(mockSocketClient.commandPrevious).toHaveBeenCalledWith(roomId);
    });

    it('rejects listener attempting to command playback, refusing socket emission and player command', async () => {
      expect(useRoomStore.getState().isController).toBe(false);

      expect(await bridge.commandPlay(roomId)).toBe(false);
      expect(mockSocketClient.commandPlay).not.toHaveBeenCalled();
      expect(mockAudioService.play).not.toHaveBeenCalled();

      expect(await bridge.commandPause(roomId)).toBe(false);
      expect(mockSocketClient.commandPause).not.toHaveBeenCalled();
      expect(mockAudioService.pause).not.toHaveBeenCalled();

      expect(await bridge.commandSeek(roomId, 50)).toBe(false);
      expect(mockSocketClient.commandSeek).not.toHaveBeenCalled();
      expect(mockAudioService.seekTo).not.toHaveBeenCalled();

      expect(await bridge.commandNext(roomId)).toBe(false);
      expect(mockSocketClient.commandNext).not.toHaveBeenCalled();

      expect(await bridge.commandPrevious(roomId)).toBe(false);
      expect(mockSocketClient.commandPrevious).not.toHaveBeenCalled();
    });
  });
});
