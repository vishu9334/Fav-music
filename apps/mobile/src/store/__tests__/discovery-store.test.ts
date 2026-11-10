import { seedDemoFixture } from '../../catalog/__tests__/demo-fixture';
import { describe, expect, it, vi } from 'vitest';
import { createDiscoveryStore } from '../createDiscoveryStore';
import { demoCatalog } from '../../catalog/demo-catalog';
import { RecommendationService } from '../../discovery/recommendation.service';
import type { IPlayableTrack } from '../../data/sample-tracks';

function fixture() {
  let now = new Date(2026, 10, 6, 6);
  const repo = { load: vi.fn(async (): Promise<unknown | null> => null), save: vi.fn(async () => {}) };
  const player = { currentId: vi.fn((): string | undefined => undefined), play: vi.fn(async (_tracks: readonly IPlayableTrack[], _id: string, _label: string) => true), prepare: vi.fn(async () => true) };
  const store = createDiscoveryStore(repo, new RecommendationService(demoCatalog, () => 0), player, () => [], () => now);
  return { repo, player, store, time: (date: Date) => { now = date; } };
}
describe('Discovery queue orchestration', () => {
  it('clears all discovery filters in one update and ignores repeated active selections', () => {
    const f = fixture();f.store.getState().setMood('Energy');f.store.getState().setSeason('Monsoon');f.store.getState().setDecade('90s');
    const changed=vi.fn();const unsubscribe=f.store.subscribe(changed);
    f.store.getState().setMood('Energy');f.store.getState().setSeason('Monsoon');f.store.getState().setDecade('90s');expect(changed).not.toHaveBeenCalled();
    f.store.getState().clearFilters();expect(changed).toHaveBeenCalledOnce();expect(f.store.getState()).toMatchObject({mood:null,season:'',decade:''});unsubscribe();
  });
  it('rechecks local time on press and passes an existing-catalog queue to the player', async () => {
    const f = fixture(); expect(f.store.getState().period).toBe('Morning'); f.time(new Date(2026, 10, 6, 18));
    expect(await f.store.getState().playRandom()).toBe('sample-track-3');
    expect(f.store.getState().period).toBe('Evening');
    expect(f.player.play.mock.calls[0]?.[0]).toBeDefined();
    expect(f.store.getState().history).toEqual([]); expect(f.repo.save).not.toHaveBeenCalled();
  });
  it('shares pending random requests instead of initializing duplicate queues', async () => {
    const f = fixture(); let release!: (value: boolean) => void;
    f.player.play.mockImplementationOnce(() => new Promise<boolean>((resolve) => { release = resolve; }));
    const first = f.store.getState().playRandom(), second = f.store.getState().playRandom(); expect(first).toBe(second);
    await vi.waitFor(() => expect(f.player.play).toHaveBeenCalledTimes(1)); release(true); await first;
    expect(f.store.getState().busy).toBe(false);
  });
  it('keeps explicit empty categories empty without requesting playback', async () => {
    const f = fixture(); f.store.getState().setDecade('90s'); expect(await f.store.getState().playRandom()).toBeNull();
    expect(f.player.play).not.toHaveBeenCalled(); expect(f.store.getState().message).toContain('No loaded tracks match');
    f.store.getState().setDecade(''); f.store.getState().setMood('Energy'); f.store.getState().setSeason('Winter');
    expect(await f.store.getState().playRandom()).toBeNull();
  });
  it('loads preserved history before choosing and avoids recently played songs', async () => {
    const f = fixture(); f.repo.load.mockResolvedValueOnce({ version: 1, entries: [{ trackId: 'sample-track-1', playedAt: 1 }] });
    expect(await f.store.getState().playRandom()).toBe('sample-track-2'); expect(f.store.getState().history).toHaveLength(1);
  });
  it('blocks automatic discovery on an unreadable history/library instead of overwriting saved preferences', async () => {
    const f = fixture(); f.repo.load.mockRejectedValueOnce(new Error('Read failed')); expect(await f.store.getState().playRandom()).toBeNull();
    expect(f.player.play).not.toHaveBeenCalled(); expect(f.repo.save).not.toHaveBeenCalled();
    f.player.prepare.mockResolvedValueOnce(false); expect(await f.store.getState().playRandom()).toBeNull(); expect(f.player.play).not.toHaveBeenCalled();
  });
  it('reports native playback failure and storage failure without fabricating successful history', async () => {
    const f = fixture(); f.player.play.mockResolvedValueOnce(false); expect(await f.store.getState().playRandom()).toBeNull();
    expect(f.store.getState().history).toEqual([]); expect(f.store.getState().message).toContain('did not start');
    f.repo.save.mockRejectedValueOnce(new Error('Disk full')); await f.store.getState().recordPlayed('sample-track-1');
    expect(f.store.getState().history[0]?.trackId).toBe('sample-track-1'); expect(f.store.getState().historyError).toContain('Disk full');
    await f.store.getState().retryHistory(); expect(f.store.getState().historyError).toBeNull();
  });
  it('ignores a prior account’s delayed history failure and clears errors after a successful retry', async () => {
    const f = fixture(); let reject!: (error: Error) => void;
    f.repo.load.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const old = f.store.getState().initializeHistory();
    await vi.waitFor(() => expect(reject).toBeTypeOf('function'));
    f.store.getState().resetForAccount();
    expect(await f.store.getState().initializeHistory()).toBe(true);
    reject(new Error('previous account disk failure')); await old;
    expect(f.store.getState().historyError).toBeNull();
    f.store.getState().resetForAccount();
    f.repo.load.mockRejectedValueOnce(new Error('temporary failure'));
    expect(await f.store.getState().initializeHistory()).toBe(false);
    expect(await f.store.getState().initializeHistory()).toBe(true);
    expect(f.store.getState().historyError).toBeNull();
  });
  it('does not continue an old account’s random request after switching accounts', async () => {
    const f = fixture(); let finish!: (value: boolean) => void;
    f.player.prepare.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.store.getState().playRandom();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    f.store.getState().resetForAccount(); finish(false); await pending;
    expect(f.store.getState().message).toBeNull(); expect(f.player.play).not.toHaveBeenCalled();
  });
});

seedDemoFixture();
