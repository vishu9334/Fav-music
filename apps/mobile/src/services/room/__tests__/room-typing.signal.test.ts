import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomTypingSignal } from '../room-typing.signal';
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => vi.useRealTimers());
describe('room typing traffic', () => {
  it('coalesces rapid keystrokes, refreshes long typing, and sends one idle stop', () => {
    const send = vi.fn(), signal = new RoomTypingSignal(send);
    for (let i = 0; i < 10; i++) { signal.update('Typing '+i); vi.advanceTimersByTime(100); }
    expect(send).toHaveBeenCalledExactlyOnceWith(true);
    vi.advanceTimersByTime(500); signal.update('Still typing'); expect(send.mock.calls).toEqual([[true], [true]]);
    vi.advanceTimersByTime(2000); expect(send.mock.calls).toEqual([[true], [true], [false]]);
    signal.stop(); vi.advanceTimersByTime(5000); expect(send).toHaveBeenCalledTimes(3);
  });
  it('stops on clear, send, or unmount without leaving an idle callback behind', () => {
    const send = vi.fn(), signal = new RoomTypingSignal(send);
    signal.update('Hello'); signal.update(''); signal.update('New draft'); signal.stop();
    vi.advanceTimersByTime(5000); expect(send.mock.calls).toEqual([[true], [false], [true], [false]]);
  });
});
