/** Send a typing pulse at most once per 1.5 seconds, then one idle/stop event. */
export class RoomTypingSignal {
  private active = false;
  private announcedAt = 0;
  private timer?: ReturnType<typeof setTimeout>;
  public constructor(private readonly send: (typing: boolean) => void) {}
  public update(text: string): void {
    if (!text.trim()) { this.stop(); return; }
    const now = Date.now();
    if (!this.active || now - this.announcedAt >= 1500) {
      this.send(true); this.announcedAt = now; this.active = true;
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.stop(), 2000);
  }
  public stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.active) this.send(false);
    this.active = false;
  }
}
