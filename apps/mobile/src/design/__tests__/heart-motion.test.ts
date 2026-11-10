import { describe, expect, it } from 'vitest';
import { heartMotion, heartPath } from '../heart-motion';
describe('bounded morphing heart geometry and accessibility', () => {
  it('morphs continuously with the same path topology at every frame', () => {
    const frames = Array.from({ length: 21 }, (_, i) => heartPath(i / 20));
    expect(new Set(frames).size).toBe(21);
    for (const frame of frames) {
      expect(frame.match(/[A-Z]/g)).toEqual(['M', 'C', 'C', 'C', 'C', 'Z']);
      expect(frame).not.toMatch(/NaN|Infinity|undefined/);
      const values = frame.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
      expect(values.every(value => value >= 0 && value <= 24)).toBe(true);
    }
  });
  it('clamps overshoot and has a bounded scale with no animation for reduced motion', () => {
    expect(heartPath(-1)).toBe(heartPath(0));expect(heartPath(2)).toBe(heartPath(1));
    expect(heartMotion(false)).toEqual({duration:220,peakScale:1.08});
    expect(heartMotion(true)).toEqual({duration:0,peakScale:1});
  });
});
