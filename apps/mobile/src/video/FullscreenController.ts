export interface IOrientationAdapter { current(): Promise<number>; landscape(): Promise<void>; restore(lock: number): Promise<void> }

/** Serialize rapid fullscreen taps and restore the original policy on every exit path. */
export class FullscreenController {
  private previous: number | null = null;
  private pending: Promise<void> = Promise.resolve();
  private closed = false;
  public constructor(private readonly orientation: IOrientationAdapter, private readonly changed: (fullscreen: boolean) => void) {}
  private command(action: () => Promise<void>): Promise<void> {
    const result = this.pending.then(action); this.pending = result.catch(() => {}); return result;
  }
  public enter(): Promise<void> {
    return this.command(async () => {
      if (this.closed || this.previous !== null) return;
      const previous = await this.orientation.current();
      this.previous = previous;
      try { await this.orientation.landscape(); if (!this.closed) this.changed(true); }
      catch (e) { await this.orientation.restore(previous); this.previous = null; throw e; }
    });
  }
  public exit(): Promise<void> {
    return this.command(async () => {
      if (this.previous === null) return;
      const previous = this.previous;
      await this.orientation.restore(previous); this.previous = null; this.changed(false);
    });
  }
  public dispose(): Promise<void> { this.closed = true; return this.exit().catch(() => this.exit()); }
}
