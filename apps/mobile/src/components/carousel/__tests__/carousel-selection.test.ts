import { describe, expect, it } from 'vitest';
import { CarouselSelection } from '../carousel-selection';
describe('artwork scroll does not become playback input', () => {
  it('ignores all programmatic scroll-end events, including old animation destinations', () => {
    const selection = new CarouselSelection();
    for (const offset of [100, 200, 100, 0, 200]) expect(selection.endMomentum(offset, 100, 3, 2)).toBeNull();
  });
  it('accepts one completed swipe and ignores its duplicate end events', () => {
    const selection = new CarouselSelection(); selection.beginDrag();
    expect(selection.endDrag(120, 2, 100, 3, 0)).toBeNull(); selection.beginMomentum();
    expect(selection.endMomentum(200, 100, 3, 0)).toBe(2);
    expect(selection.endMomentum(200, 100, 3, 0)).toBeNull();
  });
  it('handles a drag without momentum exactly once', () => {
    const selection = new CarouselSelection(); selection.beginDrag();
    expect(selection.endDrag(100, 0, 100, 3, 0)).toBe(1);
    expect(selection.endMomentum(100, 100, 3, 0)).toBeNull();
  });
  it('cancels an older swipe when external Next or queue/layout synchronization wins', () => {
    const selection = new CarouselSelection(); selection.beginDrag(); selection.endDrag(100, 3, 100, 3, 0); selection.beginMomentum(); selection.cancel();
    expect(selection.endMomentum(100, 100, 3, 2)).toBeNull();
  });
  it('does not accept an old animation end while a new finger drag is still underway', () => {
    const selection = new CarouselSelection(); selection.beginDrag();
    expect(selection.endMomentum(200, 100, 3, 0)).toBeNull();
    expect(selection.endDrag(100, 0, 100, 3, 0)).toBe(1);
  });
  it('rejects an older gesture as soon as Next changes the intent, before React effects run', () => {
    const selection=new CarouselSelection();selection.beginDrag(4);
    selection.endDrag(100,2,100,3,0,4);selection.beginMomentum();
    expect(selection.endMomentum(100,100,3,2,5)).toBeNull();
  });

});
