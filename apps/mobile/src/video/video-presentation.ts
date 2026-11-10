import { PlaybackState } from '@aadat/contracts';

/** Once a video is ready, transient buffering must not paint its poster over decoded frames. */
export class VideoPosterGate {
  private id = '';
  private revealed = false;
  public visible(id: string, state: PlaybackState): boolean {
    if (id !== this.id) { this.id = id; this.revealed = false; }
    if (state === PlaybackState.PLAYING || state === PlaybackState.PAUSED || state === PlaybackState.STOPPED) this.revealed = true;
    return !this.revealed && (state === PlaybackState.IDLE || state === PlaybackState.LOADING || state === PlaybackState.BUFFERING);
  }
}
export function canRetryVideo(state: PlaybackState, error: string | null, busy: boolean): boolean {
  return state === PlaybackState.ERROR && !!error && !busy;
}
