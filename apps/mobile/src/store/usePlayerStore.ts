import { create } from 'zustand';
import { PlaybackState } from '@aadat/contracts';
import { AudioPlaybackService } from '../services/playback/AudioPlaybackService';
import type { RepeatCycleMode } from '../services/playback/types';
import type { IPlayableTrack } from '../data/sample-tracks';

export interface PlayerStoreState {
  tracks: readonly IPlayableTrack[];
  activeTrackIndex: number;
  playbackState: PlaybackState;
  position: number;
  duration: number;
  buffered: number;
  errorMessage: string | null;
  isReducedMotion: boolean;
  repeatMode: RepeatCycleMode;
  repeatCount: number | 'infinite';

  // Actions
  resetForAccount: () => Promise<void>;
  initializePlayer: () => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  togglePlayPause: () => Promise<void>;
  seekTo: (seconds: number) => Promise<void>;
  skipToNext: () => Promise<void>;
  skipToPrevious: () => Promise<void>;
  skipToIndex: (index: number) => Promise<void>;
  toggleRepeat: () => Promise<void>;
  setRepeatMode: (mode: RepeatCycleMode) => Promise<void>;
  queueLabel: string;
  playQueue: (tracks: readonly IPlayableTrack[], startId: string, label: string) => Promise<void>;
  setProgress: (position: number, duration: number, buffered: number) => void;
  setReducedMotion: (enabled: boolean) => void;
  selectionVersion: () => number;
}

const playbackService = AudioPlaybackService.getInstance();
let initialization: Promise<void> | null = null;
let subscribed = false;
let requestedQueue: { tracks: readonly IPlayableTrack[]; label: string } | null = null;
let accountEpoch = 0;

export const usePlayerStore = create<PlayerStoreState>((set, get) => ({
  tracks: [],
  activeTrackIndex: 0,
  playbackState: PlaybackState.IDLE,
  position: 0,
  duration: 0,
  buffered: 0,
  errorMessage: null,
  isReducedMotion: false,
  repeatMode: 'off',
  repeatCount: 0,
  selectionVersion: () => playbackService.selectionGeneration(),
  queueLabel: 'Music',

  resetForAccount: async () => {
    ++accountEpoch; requestedQueue = null;
    await playbackService.setRepeatCycleMode('off');
    set({tracks:[],activeTrackIndex:0,position:0,duration:0,buffered:0,queueLabel:'Music',playbackState:PlaybackState.IDLE,errorMessage:null,repeatMode:'off',repeatCount:0});
    await playbackService.loadQueue([]);
  },
  initializePlayer: () => {
    if (initialization) return initialization;
    if (!subscribed) {
      playbackService.onStateChange((state) => {
        set({
          playbackState: state,
          errorMessage: state === PlaybackState.ERROR ? get().errorMessage : null,
        });
      });
      playbackService.onTrackChange((index) => {
        const tracks = playbackService.getTracks();
        const changed = get().tracks[get().activeTrackIndex]?.id !== tracks[index]?.id;
        const requested = requestedQueue;
        const matching = requested && requested.tracks.length === tracks.length && requested.tracks.every((track, i) => track.id === tracks[i]?.id);
        set({ tracks, activeTrackIndex: index, duration: tracks[index]?.duration ?? 0,
          ...(matching ? { queueLabel: requested.label } : {}),
          ...(changed ? { position: 0, buffered: 0 } : {}),
        });
      });
      playbackService.onProgress((progress) => {
        set({
          position: progress.position,
          duration: progress.duration > 0
            ? progress.duration : get().tracks[get().activeTrackIndex]?.duration ?? 0,
          buffered: progress.buffered,
        });
      });
      playbackService.onError((error) => {
        set({ playbackState: PlaybackState.ERROR, errorMessage: error.message });
      });
      playbackService.onRepeatChange((mode, remaining) => {
        set({
          repeatMode: mode,
          repeatCount: mode === 'infinite' ? 'infinite' : remaining,
        });
      });
      subscribed = true;
    }
    initialization = playbackService.initialize().catch((error: unknown) => {
      set({
        playbackState: PlaybackState.ERROR,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }).finally(() => {
      initialization = null;
    });
    return initialization;
  },

  play: async () => {
    await playbackService.play();
  },

  pause: async () => {
    await playbackService.pause();
  },

  togglePlayPause: async () => {
    await playbackService.togglePlayPause();
  },

  seekTo: async (seconds: number) => {
    await playbackService.seekTo(seconds);
  },

  skipToNext: async () => {
    const { tracks, activeTrackIndex } = get();
    if (tracks.length > 1) {
      set({ activeTrackIndex: (activeTrackIndex + 1) % tracks.length });
    }
    await playbackService.skipToNext();
  },

  skipToPrevious: async () => {
    const { tracks, activeTrackIndex, position } = get();
    if (tracks.length > 1 && position <= 3) {
      set({ activeTrackIndex: (activeTrackIndex - 1 + tracks.length) % tracks.length });
    }
    await playbackService.skipToPrevious();
  },

  skipToIndex: async (index: number) => {
    const { tracks } = get();
    if (index >= 0 && index < tracks.length) {
      set({ activeTrackIndex: index });
    }
    await playbackService.skipToIndex(index);
  },

  toggleRepeat: async () => {
    await playbackService.toggleRepeatCycle();
  },

  setRepeatMode: async (mode: RepeatCycleMode) => {
    await playbackService.setRepeatCycleMode(mode);
  },

  playQueue: async (requested, startId, label) => {
    const tracks = [...requested], index = tracks.findIndex(track => track.id === startId);
    if (index < 0 || new Set(tracks.map(track => track.id)).size !== tracks.length) {
      set({ errorMessage: 'Choose an available track to play.' }); return;
    }
    const epoch = accountEpoch, selection = { tracks, label };
    requestedQueue = selection;
    // Attach once, then let the service own source resolution, selection and autoplay.
    const initialized = get().initializePlayer();
    try {
      await Promise.all([initialized, playbackService.playQueue(tracks, index)]);
    } catch {
      if (epoch === accountEpoch && requestedQueue === selection) {
        set({ errorMessage: 'Authorized media could not be loaded. Retry when the catalog is available.', playbackState: PlaybackState.ERROR });
      }
    }
  },

  setProgress: (position: number, duration: number, buffered: number) => {
    set({ position, duration, buffered });
  },

  setReducedMotion: (enabled: boolean) => {
    set({ isReducedMotion: enabled });
  },
}));

