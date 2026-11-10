import { createVideoPlayer, VideoPlayer } from 'expo-video';
import { mediaPlaybackCoordinator } from '../services/playback/MediaPlaybackCoordinator';
import { authorizedStream, AuthorizedVideoSource, IVideoEngine, VideoSnapshot } from './video.contract';
import { mediaLeases } from '../catalog/catalog-runtime';

/** Imported only after the route verifies the real ExpoVideo native module exists. */
export class ExpoVideoEngine implements IVideoEngine {
  public readonly player: VideoPlayer;
  private disposed = false;
  private loading = false;
  private sourceAcknowledged = false;
  private observedLoad = false;
  private ended = false;
  private position = 0;
  private buffered = 0;
  private readonly listeners = new Set<() => void>();
  private readonly waits = new Set<(error?: Error) => void>();
  private readonly subscriptions: Array<{ remove(): void }>;
  private readonly pollTimer: ReturnType<typeof setInterval>;
  public constructor() {
    this.player = createVideoPlayer(null);
    try {
    this.player.muted = true;
    this.player.loop = false;
    this.player.audioMixingMode = 'doNotMix';
    this.player.staysActiveInBackground = false;
    this.player.showNowPlayingNotification = false;
    this.player.timeUpdateEventInterval = 0.5;
    this.player.bufferOptions = { preferredForwardBufferDuration: 6, minBufferForPlayback: 1.5, maxBufferBytes: 6 * 1024 * 1024, prioritizeTimeOverSizeThreshold: false };
    const update = () => this.emit();
    this.subscriptions = [this.player.addListener('statusChange', ({ status }) => {
      if (status === 'loading' || status === 'idle') this.observedLoad = true;
      this.emit();
    }),
      this.player.addListener('timeUpdate', ({ currentTime, bufferedPosition }) => { this.position = currentTime; this.buffered = bufferedPosition; this.emit(); }),
      this.player.addListener('mutedChange', update), this.player.addListener('playToEnd', () => { this.ended = true; this.emit(); }),
      this.player.addListener('sourceChange', () => { this.sourceAcknowledged = true; this.emit(); }),
      this.player.addListener('playingChange', ({ isPlaying }) => {
        if (isPlaying && mediaPlaybackCoordinator.owner !== 'video') { this.player.muted = true; this.player.pause(); }
        this.emit();
      })];
    this.pollTimer = setInterval(() => {
      if (this.disposed) {
        clearInterval(this.pollTimer);
        return;
      }
      if (this.player.playing) {
        const cur = this.player.currentTime;
        if (typeof cur === 'number' && Number.isFinite(cur) && cur > 0) {
          this.position = cur;
          this.buffered = this.player.bufferedPosition;
          this.emit();
        }
      }
    }, 250);
    } catch (error) { this.player.release(); throw error; }
  }
  private emit(): void { if (!this.disposed) for (const listener of this.listeners) listener(); }
  public snapshot(): VideoSnapshot {
    if (this.disposed) return { status: 'idle', playing: false, position: 0, duration: 0, buffered: 0 };
    return { status: this.loading ? 'loading' : this.player.status === 'readyToPlay' ? 'ready' : this.player.status,
      playing: this.player.playing, position: this.position, duration: this.player.duration, buffered: this.buffered, ended: this.ended };
  }
  public subscribe(changed: () => void): () => void { this.listeners.add(changed); return () => this.listeners.delete(changed); }
  private until(ready: () => boolean, timeout: number, allowError = false): Promise<void> {
    return new Promise((resolve, reject) => {
      let unsubscribe = () => {}, timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (error?: Error) => { unsubscribe(); if (timer !== undefined) clearTimeout(timer); this.waits.delete(finish); error ? reject(error) : resolve(); };
      const check = () => {
        if (this.disposed) finish(new Error('This video session is closed.'));
        else if (!allowError && this.player.status === 'error') finish(new Error('Video could not be loaded. Please try again.'));
        else if (ready()) finish();
      };
      this.waits.add(finish); unsubscribe = this.subscribe(check);
      timer = setTimeout(() => finish(new Error('Video did not respond in time. Please retry.')), timeout); check();
    });
  }
  public async load(source: AuthorizedVideoSource): Promise<void> {
    await this.pauseAndConfirm();
    if (source.kind === 'catalog') {
      const leases = await mediaLeases.resolve([source.trackId], 'VIDEO', this.player.status === 'error');
      source = authorizedStream(leases.get(source.trackId)!, source.attribution);
    }
    if (source.kind === 'https') authorizedStream(source.uri, source.attribution);
    this.loading = true; this.ended = false; this.sourceAcknowledged = false; this.observedLoad = false; this.position = 0; this.buffered = 0; this.emit();
    try {
      this.player.replace(source.kind === 'asset' ? source.asset : { uri: source.uri });
      await this.until(() => (this.sourceAcknowledged || this.observedLoad) && (this.player.status === 'readyToPlay' || this.player.status === 'error'), 20_000, true);
      if (this.player.status === 'error' && source.kind === 'local' && source.uri.startsWith('file://')) {
        try {
          const fs = await import('expo-file-system');
          if (fs.cacheDirectory) {
            const fname = source.uri.split('/').pop() || 'temp_vid.mp4';
            const cacheCopy = `${fs.cacheDirectory}cached_${fname}`;
            await fs.copyAsync({ from: source.uri, to: cacheCopy });
            this.player.replace({ uri: cacheCopy });
            await this.until(() => (this.sourceAcknowledged || this.observedLoad) && (this.player.status === 'readyToPlay' || this.player.status === 'error'), 20_000, true);
          }
        } catch {}
      }
      if (this.player.status === 'error') throw new Error('Video could not be loaded. Please try again.');
    } finally { this.loading = false; this.emit(); }
  }
  public async play(): Promise<void> {
    try {
      this.ended = false;
      if (this.player.duration > 0 && this.player.currentTime >= this.player.duration - 0.1) this.player.currentTime = 0;
      this.player.muted = false; this.player.play(); await this.until(() => this.player.playing, 5_000);
    } catch (error) { if (!this.disposed) { this.player.muted = true; this.player.pause(); } throw error; }
  }
  public async pauseAndConfirm(): Promise<void> {
    if (this.disposed) return;
    this.player.muted = true; this.player.pause();
    await this.until(() => !this.player.playing && this.player.muted, 2_500, true);
  }
  public async seek(seconds: number): Promise<void> { this.ended = false; this.player.currentTime = seconds; this.emit(); }
  public setPlaybackRate(rate: number): void {
    if (this.disposed || !Number.isFinite(rate) || rate <= 0) return;
    this.player.playbackRate = rate;
    this.emit();
  }
  public setVolume(volume: number): void {
    if (this.disposed || !Number.isFinite(volume)) return;
    this.player.volume = Math.max(0, Math.min(1.0, volume));
    this.emit();
  }
  public dispose(): void {
    if (this.disposed) return;
    clearInterval(this.pollTimer);
    this.player.muted = true; this.player.pause(); this.disposed = true;
    for (const finish of [...this.waits]) finish(new Error('This video session is closed.'));
    for (const subscription of this.subscriptions) subscription.remove();
    this.listeners.clear(); this.player.release();
  }
}
