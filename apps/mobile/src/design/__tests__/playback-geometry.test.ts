import { describe, expect, it } from 'vitest';
import { carouselGeometry, carouselIndex, playbackPolygon } from '../playback-geometry';
describe('responsive carousel selection and continuous playback icon', () => {
  it.each([240, 320, 360, 412, 768, 1280])('keeps the card centered and reachable at viewport %i', width => {
    const { card, inset } = carouselGeometry(width);
    expect(card).toBeLessThanOrEqual(width); expect(card).toBeLessThanOrEqual(360);
    expect(inset * 2 + card).toBeCloseTo(width);
    for (let i = 0; i < 50; i++) expect(carouselIndex(card * i, card, 50)).toBe(i);
  });
  it('clamps overscroll and invalid measurements instead of selecting outside the queue', () => {
    expect(carouselIndex(-500, 280, 3)).toBe(0); expect(carouselIndex(99_999, 280, 3)).toBe(2);
    expect(carouselIndex(NaN, 280, 3)).toBe(0); expect(carouselIndex(200, 0, 0)).toBe(0);
    expect(carouselGeometry(NaN).card).toBeGreaterThan(0);
  });
  it('keeps the same finite polygon topology throughout play/pause and clamps reversed transitions', () => {
    for (const right of [false, true]) {
      for (let i = 0; i <= 100; i++) { const values=playbackPolygon(i / 100, right).split(/[ ,]/).map(Number); expect(values).toHaveLength(8); expect(values.every(n => Number.isFinite(n) && n >= 0 && n <= 24)).toBe(true); }
      expect(playbackPolygon(-1, right)).toBe(playbackPolygon(0, right)); expect(playbackPolygon(2, right)).toBe(playbackPolygon(1, right));
      expect(playbackPolygon(0, right)).not.toBe(playbackPolygon(1, right));
    }
  });
});
