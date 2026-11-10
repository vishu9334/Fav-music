import { describe, expect, it } from 'vitest';
import { allowsNativeBlur } from '../glass-policy';
import { useFlowingTransport, videoControlsInline } from '../layout-policy';
import { colors } from '../theme';
import { normalTextContrast } from '../layout-policy';
describe('bounded native effects and accessible screen policy', () => {
  it('enables only small modern native captures and disables unsupported/legacy capture', () => {
    expect(allowsNativeBlur('android',31,66,66,true,false)).toBe(true);
    for (const api of [24,28,30]) expect(allowsNativeBlur('android',api,66,66,true,false)).toBe(false);
    expect(allowsNativeBlur('ios',18,66,66,true,false)).toBe(true);
    expect(allowsNativeBlur('web',0,66,66,true,false)).toBe(false);
    for (const [w,h] of [[0,66],[NaN,66],[300,300],[1000,1000]]) expect(allowsNativeBlur('android',35,w!,h!,true,false)).toBe(false);
  });
  it('suspends capture in background and for reduced accessibility effects', () => {
    expect(allowsNativeBlur('android',35,66,66,false,false)).toBe(false);
    expect(allowsNativeBlur('android',35,66,66,true,true)).toBe(false);
  });
  it.each([[320,568],[360,640],[640,360],[568,320],[240,320]])('puts all diagnostic content in scroll flow for %ix%i', (w,h) => {
    expect(useFlowingTransport(w,h,1)).toBe(true);
    expect(useFlowingTransport(w,h,2)).toBe(true);
  });
  it('uses scroll flow at large font scale even on a tall display', () => {
    expect(useFlowingTransport(412,915,2)).toBe(true);
    expect(useFlowingTransport(412,915,1)).toBe(false);
  });
  it('removes fullscreen overlay collisions on short windows, errors and larger text', () => {
    for (const h of [240,296,320,360,480,599]) expect(videoControlsInline(h,1,false)).toBe(true);
    expect(videoControlsInline(900,2,false)).toBe(true);
    expect(videoControlsInline(900,1,true)).toBe(true);
    expect(videoControlsInline(900,1,false)).toBe(false);
  });
  it('keeps privacy-caption color above the normal-text AA threshold', () => {
    expect(normalTextContrast(colors.muted, colors.bg)).toBeGreaterThanOrEqual(4.5);
    expect(normalTextContrast('#71717A',colors.bg)).toBeLessThan(4.5);
  });
});
