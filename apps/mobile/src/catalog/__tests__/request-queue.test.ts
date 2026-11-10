import { describe, expect, it, vi } from 'vitest';
import { RequestQueue } from '../request-queue';

describe('bounded catalog request queue', () => {
  it('limits concurrent calls and releases waiting work after success and failure', async () => {
    const queue = new RequestQueue(2), releases: Array<() => void> = [];
    let active = 0, peak = 0;
    const work = vi.fn(async () => {
      active++; peak = Math.max(peak, active);
      try { await new Promise<void>(resolve => releases.push(resolve)); }
      finally { active--; }
    });
    const first = queue.run(work), failed = queue.run(async () => { await work(); throw new Error('Offline'); });
    const failure = expect(failed).rejects.toThrow('Offline');
    const third = queue.run(work);
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases[1]!(); await failure;
    await vi.waitFor(() => expect(releases).toHaveLength(3));
    releases[0]!(); releases[2]!(); await Promise.all([first, third]);
    expect(peak).toBe(2); expect(active).toBe(0);
  });

  it('does not contact the provider for cancelled queued work and bounds the backlog', async () => {
    const queue = new RequestQueue(1, 1), controller = new AbortController();
    let release!: () => void;
    const first = queue.run(() => new Promise<void>(resolve => { release = resolve; }));
    const operation = vi.fn(async () => 'not requested');
    const waiting = queue.run(operation, controller.signal);
    const cancelled = expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    await expect(queue.run(operation)).rejects.toThrow('busy');
    controller.abort(); await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    release(); await first; await cancelled; expect(operation).not.toHaveBeenCalled();
    await expect(queue.run(async () => 'recovered')).resolves.toBe('recovered');
  });
});
