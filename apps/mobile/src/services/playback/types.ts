import { PlaybackState } from '@aadat/contracts';
import { IPlayableTrack } from '../../data/sample-tracks';

/**
 * Playback progress data
 */
export interface IPlaybackProgress {
  readonly position: number;
  readonly duration: number;
  readonly buffered: number;
}

/**
 * Audio playback listener callbacks
 */
export type StateChangeListener = (state: PlaybackState) => void;
export type TrackChangeListener = (trackIndex: number) => void;
export type ErrorListener = (error: Error) => void;
export type ProgressListener = (progress: IPlaybackProgress) => void;
export type RepeatCycleMode = 'off' | '1' | '2' | 'infinite';
export type RepeatChangeListener = (mode: RepeatCycleMode, countRemaining: number) => void;

/**
 * Core Audio Playback Service Interface (SOLID - Interface Segregation)
 */
export interface IAudioPlaybackService {
  /**
   * Initializes TrackPlayer, registers background capabilities and notifications.
   */
  initialize(): Promise<void>;

  /**
   * Replaces or populates the playback queue.
   */
  loadQueue(tracks: readonly IPlayableTrack[], startIndex?: number): Promise<void>;

  /** Atomically selects a queue and records a user Play intent. */
  playQueue(tracks: readonly IPlayableTrack[], startIndex?: number): Promise<void>;
  getTracks(): readonly IPlayableTrack[];

  /**
   * Resumes or starts audio playback.
   */
  play(): Promise<void>;

  /**
   * Pauses audio playback.
   */
  pause(): Promise<void>;

  /** Stops playback without deleting the queue. */
  stop(): Promise<void>;

  /**
   * Toggles between play and pause.
   */
  togglePlayPause(): Promise<void>;

  /**
   * Seeks to a specific timestamp in seconds.
   */
  seekTo(positionSeconds: number): Promise<void>;

  /**
   * Skips to the next track in the queue.
   */
  skipToNext(): Promise<void>;

  /**
   * Skips to the previous track or restarts the current track if >3s in.
   */
  skipToPrevious(): Promise<void>;

  /**
   * Skips directly to a specific track index in the queue.
   */
  skipToIndex(index: number): Promise<void>;

  /**
   * Retrieves current playback state synchronously or cached.
   */
  getPlaybackState(): PlaybackState;

  /**
   * Subscribes to playback state updates. Returns unsubscribe function.
   */
  onStateChange(listener: StateChangeListener): () => void;

  /**
   * Subscribes to active track changes. Returns unsubscribe function.
   */
  onTrackChange(listener: TrackChangeListener): () => void;

  /** Subscribes to confirmed native playback progress. */
  onProgress(listener: ProgressListener): () => void;

  /**
   * Subscribes to playback errors. Returns unsubscribe function.
   */
  onError(listener: ErrorListener): () => void;

  /**
   * Resets and tears down the player.
   */
  destroy(): Promise<void>;

  /**
   * Returns active repeat cycle mode ('off' | '1' | '2' | 'infinite').
   */
  getRepeatMode(): RepeatCycleMode;

  /**
   * Returns remaining extra repeats for the active track.
   */
  getRepeatCountRemaining(): number;

  /**
   * Subscribes to repeat mode updates. Returns unsubscribe function.
   */
  onRepeatChange(listener: RepeatChangeListener): () => void;

  /**
   * Explicitly sets the repeat cycle mode.
   */
  setRepeatCycleMode(mode: RepeatCycleMode): Promise<void>;

  /**
   * Cycles to the next repeat mode: off -> 1 -> 2 -> infinite -> off.
   */
  toggleRepeatCycle(): Promise<RepeatCycleMode>;
}

