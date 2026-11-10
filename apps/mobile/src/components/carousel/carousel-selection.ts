import { carouselIndex } from '../../design/playback-geometry';

/** Only a completed human gesture may request a track; animated sync is presentation. */
export class CarouselSelection {
  private phase: 'idle' | 'dragging' | 'coasting' | 'momentum' = 'idle';
  private revision = 0;
  public cancel(): void { this.phase = 'idle'; }
  public beginDrag(revision = 0): void { this.phase = 'dragging'; this.revision = revision; }
  public beginMomentum(): void { if (this.phase === 'coasting') this.phase = 'momentum'; }
  public endDrag(offset: number, velocity: number, width: number, length: number, active: number, revision = 0): number | null {
    if (revision !== this.revision) { this.cancel(); return null; }
    if (this.phase !== 'dragging') return null;
    if (Math.abs(velocity) >= .01) { this.phase = 'coasting'; return null; }
    this.phase = 'idle'; return this.choose(offset, width, length, active);
  }
  public endMomentum(offset: number, width: number, length: number, active: number, revision = 0): number | null {
    if (revision !== this.revision) { this.cancel(); return null; }
    if (this.phase !== 'momentum') return null;
    this.phase = 'idle'; return this.choose(offset, width, length, active);
  }
  private choose(offset: number, width: number, length: number, active: number): number | null {
    if (!length) return null;
    const index = carouselIndex(offset, width, length);
    return index === active ? null : index;
  }
}
