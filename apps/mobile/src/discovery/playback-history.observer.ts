export interface PlaybackSnapshot { readonly playing: boolean; readonly trackId?: string; readonly scope?: string; readonly episode?: number; readonly reset?: boolean }
export interface IPlaybackObservationSource {
  subscribe(changed: () => void): () => void;
  snapshot(): Promise<PlaybackSnapshot>;
}

/** Coalesce edge-triggered reads; never count a requested UI selection as a confirmed play. */
export class PlaybackHistoryObserver {
  private unsubscribe: (() => void) | null = null;
  private running = false;
  private version = 0;
  private stopped = true;
  private recordedId: string | undefined;
  private recordedScope: string | undefined;
  private recordedEpisode: number | undefined;
  public constructor(private readonly source: IPlaybackObservationSource,
    private readonly record: (id: string) => Promise<void>) {}
  public start(): void {
    if (this.unsubscribe) return;
    this.stopped = false;
    this.unsubscribe = this.source.subscribe(() => this.request()); this.request();
  }
  public stop(): void { this.stopped = true; this.version++; this.unsubscribe?.(); this.unsubscribe = null; }
  public refresh(): void { if (!this.stopped) this.request(); }
  private request(): void {
    this.version++; if (this.running) return;
    this.running = true;
    let inspected = -1;
    void (async () => {
      while (!this.stopped && inspected !== this.version) {
        inspected = this.version;
        try {
          const snapshot = await this.source.snapshot();
          if (this.stopped || inspected !== this.version) continue;
          if(snapshot.reset || snapshot.scope!==this.recordedScope){this.recordedId=undefined;this.recordedEpisode=undefined;this.recordedScope=snapshot.scope;}
          if(!snapshot.playing && snapshot.trackId && snapshot.trackId!==this.recordedId){this.recordedId=undefined;this.recordedEpisode=undefined;}
          const episode=snapshot.episode??0;
          if (snapshot.playing && snapshot.trackId && (snapshot.trackId !== this.recordedId || episode!==this.recordedEpisode)) {
            this.recordedId = snapshot.trackId; this.recordedEpisode=episode; await this.record(snapshot.trackId);
          }
        } catch { /* Uninitialized/native reads or history errors must not interrupt audio. */ }
      }
    })().finally(() => { this.running = false; if (!this.stopped && inspected !== this.version) this.request(); });
  }
}
