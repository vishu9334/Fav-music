export type MediaOwner = 'none' | 'audio' | 'video';

/** One handoff queue. Audio must enter it BEFORE its own native-command queue. */
export class MediaPlaybackCoordinator {
  private pending: Promise<void> = Promise.resolve();
  private readonly videos = new Map<object, () => Promise<void>>();
  private current: MediaOwner = 'none';
  private revision = 0;
  private resumeAudio = true;
  public get owner(): MediaOwner { return this.current; }
  public get intentVersion(): number { return this.revision; }
  public get mayResumeAudioFocus(): boolean { return this.resumeAudio; }
  public registerVideo(key: object, pauseAndConfirm: () => Promise<void>): () => void {
    this.videos.set(key, pauseAndConfirm);
    return () => { this.videos.delete(key); if (!this.videos.size && this.current === 'video') this.current = 'none'; };
  }
  private serialize<T>(action: () => Promise<T>): Promise<T> {
    const result = this.pending.then(action); this.pending = result.then(() => {}, () => {}); return result;
  }
  public audio<T>(action: () => Promise<T>, current: () => boolean = () => true): Promise<T | undefined> {
    this.revision++; // Invalidate a video request still loading before this audio request.
    this.resumeAudio = true;
    return this.serialize(async () => {
      if (!current()) return;
      this.current = 'audio';
      for (const pause of this.videos.values()) await pause();
      return action();
    });
  }
  public videoIntent(): number { return ++this.revision; }
  public cancelVideoIntent(intent: number): void { if (intent === this.revision) this.revision++; }
  public video(key: object, intent: number, pauseAudioAndConfirm: () => Promise<void>, action: () => Promise<void>): Promise<boolean> {
    return this.serialize(async () => {
      if (!this.videos.has(key) || intent !== this.revision) return false;
      this.current = 'video';
      this.resumeAudio = false;
      for (const [other, pause] of this.videos) if (other !== key) await pause();
      await pauseAudioAndConfirm();
      if (!this.videos.has(key) || intent !== this.revision) return false;
      await action();
      if (intent !== this.revision) { await this.videos.get(key)?.(); return false; }
      return true;
    });
  }
}
export const mediaPlaybackCoordinator = new MediaPlaybackCoordinator();
