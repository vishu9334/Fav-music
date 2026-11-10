import { createStore } from 'zustand/vanilla';
import { PlaybackState } from '@aadat/contracts';
import { MediaPlaybackCoordinator } from '../services/playback/MediaPlaybackCoordinator';
import { IVideoEngine, VideoItem, VideoPlayerState } from './video.contract';

/** Queue semantics mirror audio; a single engine is reused for all carousel items. */
export class VideoPlaybackService {
  public readonly state = createStore<VideoPlayerState>(() => ({ index: 0, playbackState: PlaybackState.IDLE,
    position: 0, duration: 0, buffered: 0, error: null, busy: false }));
  private pending: Promise<void> = Promise.resolve();
  private disposed = false;
  private loaded = -1;
  private intent = 0;
  private desiredPlaying = false;
  private commands = 0;
  private unsubscribe: () => void;
  private detach: () => void;
  public constructor(private readonly engine: IVideoEngine, public readonly items: readonly VideoItem[],
    private readonly coordinator: MediaPlaybackCoordinator, private readonly pauseAudio: () => Promise<void>) {
    this.detach = coordinator.registerVideo(this, () => engine.pauseAndConfirm());
    this.unsubscribe = engine.subscribe(() => this.synchronize());
  }
  private synchronize(): void {
    if (this.disposed) return;
    const value = this.engine.snapshot();
    if (this.commands === 0) this.desiredPlaying = value.playing;
    const finite = (n: number) => Number.isFinite(n) && n >= 0 ? n : 0;
    this.state.setState({ playbackState: value.status === 'error' ? PlaybackState.ERROR : value.status === 'loading'
      ? (value.position > 0 ? PlaybackState.BUFFERING : PlaybackState.LOADING) : value.playing ? PlaybackState.PLAYING
      : value.status === 'idle' ? PlaybackState.IDLE : value.ended ? PlaybackState.STOPPED : PlaybackState.PAUSED,
      position: finite(value.position), duration: finite(value.duration), buffered: finite(value.buffered),
      error: value.status === 'error' ? 'Video could not be played. Please try again.' : null });
  }
  private command(action: () => Promise<void>): Promise<void> {
    this.commands++;
    const result = this.pending.then(async () => {
      if (this.disposed) { this.commands--; return; }
      this.state.setState({ busy: true, error: null });
      try { await action(); if (!this.disposed) this.synchronize(); }
      catch (e) { if (!this.disposed) this.state.setState({ playbackState: PlaybackState.ERROR, error: e instanceof Error ? e.message.replace(/https?:\/\/\S+/g, '[video source]') : 'Video playback is unavailable.' }); }
      finally { this.commands--; if (!this.disposed) { if (this.commands === 0) this.desiredPlaying = this.engine.snapshot().playing; this.state.setState({ busy: this.commands > 0 }); } }
    });
    this.pending = result.catch(() => {}); return result;
  }
  private async prepare(index: number, reload = false): Promise<void> {
    const item = this.items[index]; if (!item) throw new Error('This video item is unavailable.');
    if (reload || this.loaded !== index) {
      await this.engine.pauseAndConfirm();
      if (this.disposed) return;
      this.state.setState({ index, position: 0, duration: 0, buffered: 0, playbackState: PlaybackState.LOADING });
      await this.engine.load(item.source); this.loaded = index;
    }
  }
  private async start(intent: number): Promise<void> {
    await this.coordinator.video(this, intent, this.pauseAudio, async () => { if (!this.disposed) await this.engine.play(); });
  }
  public select(index: number, autoplay = false): Promise<void> {
    this.desiredPlaying = autoplay;
    if (!autoplay) this.coordinator.cancelVideoIntent(this.intent);
    const intent = autoplay ? (this.intent = this.coordinator.videoIntent()) : 0;
    return this.command(async () => {
      if (!Number.isInteger(index) || index < 0 || index >= this.items.length) throw new Error('This video item is unavailable.');
      await this.prepare(index); if (autoplay && !this.disposed) await this.start(intent);
    });
  }
  public toggle(): Promise<void> {
    const play = !this.desiredPlaying; this.desiredPlaying = play;
    if (!play) this.coordinator.cancelVideoIntent(this.intent);
    const intent = play ? (this.intent = this.coordinator.videoIntent()) : 0;
    return this.command(async () => {
      if (!play) await this.engine.pauseAndConfirm();
      else { await this.prepare(this.state.getState().index, this.engine.snapshot().status === 'error'); if (!this.disposed) await this.start(intent); }
    });
  }
  public pause(): Promise<void> { this.desiredPlaying = false; this.coordinator.cancelVideoIntent(this.intent); return this.command(() => this.engine.pauseAndConfirm()); }
  /** Explicit error recovery, not a play/pause toggle; coalesce repeat taps before native work starts. */
  public retry(): Promise<void> {
    const state = this.state.getState();
    if (this.disposed || this.commands > 0 || state.playbackState !== PlaybackState.ERROR || !state.error) return Promise.resolve();
    this.desiredPlaying = true;
    const intent = this.intent = this.coordinator.videoIntent();
    return this.command(async () => { await this.prepare(this.state.getState().index, true); if (!this.disposed) await this.start(intent); });
  }
  public next(): Promise<void> {
    const playing = this.desiredPlaying || this.engine.snapshot().playing;
    const intent = this.intent = this.coordinator.videoIntent();
    return this.command(async () => { const index = (this.state.getState().index + 1) % this.items.length; if (index === this.loaded) await this.engine.seek(0); await this.prepare(index); if (playing && !this.disposed) await this.start(intent); });
  }
  public previous(): Promise<void> {
    const playing = this.desiredPlaying || this.engine.snapshot().playing;
    const intent = this.intent = this.coordinator.videoIntent();
    return this.command(async () => {
      if (this.engine.snapshot().position > 3) await this.engine.seek(0);
      else { await this.prepare((this.state.getState().index - 1 + this.items.length) % this.items.length); if (playing && !this.disposed) await this.start(intent); }
    });
  }
  public seek(seconds: number): Promise<void> {
    return this.command(async () => {
      const duration = this.engine.snapshot().duration;
      if (!Number.isFinite(seconds) || !Number.isFinite(duration) || duration <= 0) throw new Error('Video seeking is not available yet.');
      await this.engine.seek(Math.max(0, Math.min(duration, seconds)));
    });
  }
  public seekRelative(seconds: number): Promise<void> {
    const current = this.engine.snapshot().position;
    return this.seek(current + seconds);
  }
  public setPlaybackRate(rate: number): void {
    if (typeof this.engine.setPlaybackRate === 'function') {
      this.engine.setPlaybackRate(rate);
    }
  }
  public setVolume(volume: number): void {
    if (typeof this.engine.setVolume === 'function') {
      this.engine.setVolume(volume);
    }
  }
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.coordinator.cancelVideoIntent(this.intent); this.unsubscribe(); this.engine.dispose(); this.detach();
  }
}
