import {
  PlaybackMode,
  PlaybackState,
  SYNC_DRIFT_HARD_SEEK_THRESHOLD_SEC,
} from '@aadat/contracts';

/**
 * Mobile Playback Service Contract (Interface Segregation Principle)
 */
export interface IPlaybackService {
  play(): Promise<void>;
  pause(): Promise<void>;
  seekTo(seconds: number): Promise<void>;
  getState(): PlaybackState;
  getMode(): PlaybackMode;
}

/**
 * Foundation Playback Coordinator Skeleton
 * To be integrated with React Native Track Player in Gate 2.
 */
export class MobilePlaybackCoordinator implements IPlaybackService {
  private state: PlaybackState = PlaybackState.IDLE;
  private mode: PlaybackMode = PlaybackMode.AUDIO;

  public async play(): Promise<void> {
    this.state = PlaybackState.PLAYING;
  }

  public async pause(): Promise<void> {
    this.state = PlaybackState.PAUSED;
  }

  public async seekTo(seconds: number): Promise<void> {
    if (seconds < 0) {
      throw new Error('Seek position must be non-negative');
    }
  }

  public getState(): PlaybackState {
    return this.state;
  }

  public getMode(): PlaybackMode {
    return this.mode;
  }

  public getDriftThreshold(): number {
    return SYNC_DRIFT_HARD_SEEK_THRESHOLD_SEC;
  }
}

