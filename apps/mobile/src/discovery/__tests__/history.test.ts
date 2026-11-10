import { describe, expect, it, vi } from 'vitest';
import { HistoryRepository } from '../history.repository';
import { HistoryService } from '../history.service';
import { ListeningHistory, PlayedTrack } from '../discovery.types';
import { PlaybackHistoryObserver, PlaybackSnapshot } from '../playback-history.observer';

function documents() {
  const files = new Map<string, string>();
  return { files, read: async (name: string) => files.get(name) ?? null,
    write: vi.fn(async (name: string, value: string) => { files.set(name, value); }) };
}
describe('Durable listening history independent from the library', () => {
  it('upserts unique songs and preserves latest-play order after a device-clock correction', async () => {
    const storage = documents(); let entries: readonly PlayedTrack[] = [], time = 100;
    const service = new HistoryService(new HistoryRepository(storage), (value) => { entries = value; }, () => time--);
    await service.record('sample-track-1'); await service.record('sample-track-1');
    await service.record('sample-track-2'); await service.record('sample-track-1');
    expect(entries.map((e) => e.trackId)).toEqual(['sample-track-1', 'sample-track-2']);
    expect(storage.write).toHaveBeenCalledTimes(3);
    const loaded = await new HistoryRepository(storage).load(); expect(loaded).toEqual({ version: 1, entries });
    let reloaded: readonly PlayedTrack[] = [];
    await new HistoryService(new HistoryRepository(storage), (value) => { reloaded = value; }).initialize();
    expect(reloaded).toEqual(entries);
    expect([...storage.files.keys()].every((name) => name.startsWith('aadat-history-'))).toBe(true);
  });
  it('shares hydration, serializes early events and retains unavailable catalog references', async () => {
    let release!: (value: unknown) => void; let entries: readonly PlayedTrack[] = [];
    const repo = { load: vi.fn(() => new Promise<unknown>((resolve) => { release = resolve; })), save: vi.fn(async () => {}) };
    const service = new HistoryService(repo, (value) => { entries = value; }, () => 200);
    const first = service.initialize(); expect(service.initialize()).toBe(first);
    const records = [service.record('sample-track-1'), service.record('sample-track-2')];
    release({ version: 1, entries: [{ trackId: 'no-longer-in-catalog', playedAt: 100 }] });
    await first; await Promise.all(records);
    expect(repo.load).toHaveBeenCalledTimes(1);
    expect(entries.map((e) => e.trackId)).toEqual(['sample-track-2', 'sample-track-1', 'no-longer-in-catalog']);
  });
  it('uses the existing 200-song account limit and removes malformed metadata without dropping newer history', async () => {
    let entries: readonly PlayedTrack[] = [];
    const source = Array.from({ length: 220 }, (_, i) => ({ trackId: `track-${i}`, playedAt: 1000 - i }));
    const service = new HistoryService({ load: async () => ({ version: 1, entries: [null, { trackId: 'bad/id', playedAt: 1 }, ...source] }), save: async () => {} }, (value) => { entries = value; });
    await service.initialize(); expect(entries).toHaveLength(200); expect(entries[0]?.trackId).toBe('track-0');
    await service.record('new'); expect(entries).toHaveLength(200); expect(entries[0]?.trackId).toBe('new');
  });
  it('retains this-session history on failed saving and can durably retry the same episode', async () => {
    let entries: readonly PlayedTrack[] = [];
    const repo = { load: async () => null, save: vi.fn().mockRejectedValueOnce(new Error('Disk full')).mockResolvedValue(undefined) };
    const service = new HistoryService(repo, (value) => { entries = value; }, () => 100);
    await expect(service.record('one')).rejects.toThrow('Disk full'); expect(entries).toEqual([{ trackId: 'one', playedAt: 100 }]);
    await service.record('one'); expect(repo.save).toHaveBeenCalledTimes(2); expect(entries).toHaveLength(1);
  });
  it('fails closed for unreadable/unsupported history without overwriting it', async () => {
    const repo = { load: async () => ({ version: 2, entries: [] }), save: vi.fn() };
    const service = new HistoryService(repo, vi.fn()); await expect(service.record('one')).rejects.toThrow('unsupported');
    await expect(service.flush()).rejects.toThrow('unsupported'); expect(repo.save).not.toHaveBeenCalled();
  });
  it('recovers the last good snapshot after an interrupted write', async () => {
    const storage = documents(), repo = new HistoryRepository(storage); await repo.load();
    const first: ListeningHistory = { version: 1, entries: [{ trackId: 'one', playedAt: 1 }] }; await repo.save(first);
    storage.write.mockImplementationOnce(async (name) => { storage.files.set(name, '{partial'); throw new Error('Interrupted'); });
    await expect(repo.save({ version: 1, entries: [] })).rejects.toThrow('Interrupted');
    expect(await new HistoryRepository(storage).load()).toEqual(first);
    storage.files.set('aadat-history-v1-0.json', 'null'); await expect(new HistoryRepository(storage).load()).rejects.toThrow('preserved');
  });
});

describe('Native-confirmed playback observation', () => {
  it('ignores paused selections, coalesces changes and records one episode across repeated playing notifications', async () => {
    let notify!: () => void, snapshot: PlaybackSnapshot = { playing: false, trackId: 'selected-only' };
    const remove = vi.fn(), record = vi.fn(async () => {}), read = vi.fn(async () => snapshot);
    const observer = new PlaybackHistoryObserver({ subscribe: (callback) => { notify = callback; return remove; }, snapshot: read }, record);
    observer.start(); await vi.waitFor(() => expect(read).toHaveBeenCalled()); expect(record).not.toHaveBeenCalled();
    snapshot = { playing: true, trackId: 'one' }; notify(); notify();
    await vi.waitFor(() => expect(record).toHaveBeenCalledWith('one')); const previousReads = read.mock.calls.length; notify();
    await vi.waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(previousReads)); expect(record).toHaveBeenCalledTimes(1);
    snapshot = { playing: false, trackId: 'one' }; notify(); await Promise.resolve();
    snapshot = { playing: true, trackId: 'one' }; notify();
    await vi.waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(previousReads + 1)); expect(record).toHaveBeenCalledTimes(1);
    observer.stop(); expect(remove).toHaveBeenCalledTimes(1);
  });
  it('discards an obsolete native snapshot and stops pending work on unmount', async () => {
    let notify!: () => void, release!: (value: PlaybackSnapshot) => void;
    const source = { subscribe: (callback: () => void) => { notify = callback; return vi.fn(); },
      snapshot: vi.fn().mockImplementationOnce(() => new Promise<PlaybackSnapshot>((resolve) => { release = resolve; })).mockResolvedValue({ playing: true, trackId: 'latest' }) };
    const record = vi.fn(async () => {}), observer = new PlaybackHistoryObserver(source, record);
    observer.start(); notify(); release({ playing: true, trackId: 'obsolete' });
    await vi.waitFor(() => expect(record).toHaveBeenCalledWith('latest')); expect(record).not.toHaveBeenCalledWith('obsolete');
    observer.stop(); observer.refresh(); expect(record).toHaveBeenCalledTimes(1);
  });
  it('does not record a native read that completes after the observer is stopped', async () => {
    let release!: (value: PlaybackSnapshot) => void;
    const pending = new Promise<PlaybackSnapshot>((resolve) => { release = resolve; });
    const record = vi.fn(async () => {});
    const observer = new PlaybackHistoryObserver({ subscribe: () => vi.fn(), snapshot: () => pending }, record);
    observer.start(); observer.stop(); release({ playing: true, trackId: 'cancelled' });
    await pending; await Promise.resolve(); expect(record).not.toHaveBeenCalled();
  });
});

describe('Stage 14 Listening History: Deduplication, updates and ordering', () => {
  it('stores exactly one entry per canonical song ID and updates timestamp without duplicates', async () => {
    let entries: readonly PlayedTrack[] = [];
    let currentTime = 1000;
    const repo = { load: async () => null, save: vi.fn(async () => {}) };
    const service = new HistoryService(repo, (val) => { entries = val; }, () => currentTime);

    // Initial play of Song A
    await service.record('song-a');
    expect(entries).toEqual([{ trackId: 'song-a', playedAt: 1000 }]);

    // Play Song B
    currentTime = 2000;
    await service.record('song-b');
    expect(entries).toEqual([
      { trackId: 'song-b', playedAt: 2000 },
      { trackId: 'song-a', playedAt: 1000 },
    ]);

    // Play Song C
    currentTime = 3000;
    await service.record('song-c');
    expect(entries).toEqual([
      { trackId: 'song-c', playedAt: 3000 },
      { trackId: 'song-b', playedAt: 2000 },
      { trackId: 'song-a', playedAt: 1000 },
    ]);

    // Replay Song A -> updates its timestamp to 4000 and moves it to top, preserving Song B and C
    currentTime = 4000;
    await service.record('song-a');
    expect(entries).toHaveLength(3);
    expect(entries).toEqual([
      { trackId: 'song-a', playedAt: 4000 },
      { trackId: 'song-c', playedAt: 3000 },
      { trackId: 'song-b', playedAt: 2000 },
    ]);

    // Replay Song B -> updates timestamp to 5000 and moves to top, preserving Song A and C
    currentTime = 5000;
    await service.record('song-b');
    expect(entries).toHaveLength(3);
    expect(entries).toEqual([
      { trackId: 'song-b', playedAt: 5000 },
      { trackId: 'song-a', playedAt: 4000 },
      { trackId: 'song-c', playedAt: 3000 },
    ]);
  });

  it('normalizes UUIDs case-insensitively to prevent duplicates from mixed-case IDs', async () => {
    let entries: readonly PlayedTrack[] = [];
    const repo = { load: async () => null, save: vi.fn(async () => {}) };
    let time = 100;
    const service = new HistoryService(repo, (val) => { entries = val; }, () => time++);
    const uuidUpper = 'F5E75856-4598-8A85-8509-3E90DEB1AFE4';
    const uuidLower = 'f5e75856-4598-8a85-8509-3e90deb1afe4';

    await service.record(uuidUpper);
    await service.record(uuidLower);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.trackId).toBe(uuidLower);
  });

  it('coalesces rapid concurrent record calls for the same song', async () => {
    let entries: readonly PlayedTrack[] = [];
    const repo = { load: async () => null, save: vi.fn(async () => {}) };
    const service = new HistoryService(repo, (val) => { entries = val; }, () => 1000);

    await Promise.all([
      service.record('song-fast'),
      service.record('song-fast'),
      service.record('song-fast'),
    ]);
    expect(entries).toEqual([{ trackId: 'song-fast', playedAt: 1000 }]);
    expect(repo.save).toHaveBeenCalledTimes(1);
  });
});

describe('Stage 14: AccountHistoryRepository isolation and persistence', () => {
  it('throws if accessing history while unauthenticated or scope version mismatched', async () => {
    const { AccountHistoryRepository } = await import('../account-history.repository');
    const repo = new AccountHistoryRepository('00000000-0000-0000-0000-000000000001', 9999);
    await expect(repo.load()).rejects.toThrow('Sign in to open your listening history.');
    await expect(repo.save({ version: 1, entries: [] })).rejects.toThrow('Sign in to open your listening history.');
  });

  it('historyRows returns stable key matching canonical song ID and excludes duplicates', async () => {
    const { historyRows } = await import('../../components/lists/history-rows');
    const input = [
      { trackId: 'song-1', playedAt: 5000 },
      { trackId: 'song-2', playedAt: 4000 },
      { trackId: 'song-1', playedAt: 1000 },
    ];
    const rows = historyRows(input);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ trackId: 'song-1', playedAt: 5000, key: 'song-1' });
    expect(rows[1]).toEqual({ trackId: 'song-2', playedAt: 4000, key: 'song-2' });
  });
});
