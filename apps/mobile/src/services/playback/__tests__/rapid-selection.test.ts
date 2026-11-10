import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_TRACKS } from '../../../data/sample-tracks';
import type { IPlayableTrack } from '../../../data/sample-tracks';
import type { AudioPlaybackService } from '../AudioPlaybackService';
import type { NativeMock } from './track-player.mock';
vi.mock('react-native-track-player', async () => (await import('./track-player.mock')).trackPlayerModule);
let native: NativeMock, service: AudioPlaybackService;
beforeEach(async () => { vi.resetModules(); native = (await import('react-native-track-player')).default as unknown as NativeMock; native.__reset(); service = (await import('../AudioPlaybackService')).AudioPlaybackService.getInstance(); service.configureInitialQueue(SAMPLE_TRACKS); await service.initialize(); });
afterEach(async () => { await service.destroy(); });
const tick = () => new Promise(r => setTimeout(r, 10));
describe('latest track intent under rapid input', () => {
  it('coalesces a burst of absolute selections instead of loading every intermediate item', async () => {
    native.skip.mockClear();
    await Promise.all([service.skipToIndex(1), service.skipToIndex(2), service.skipToIndex(1)]);
    expect(native.skip.mock.calls.map(c => c[0])).toEqual([1]);
    expect(await native.getActiveTrackIndex()).toBe(1);
  });
  it('does not replay an old native index event or rewind progress', async () => {
    await service.skipToIndex(2); await service.seekTo(24);
    const changed = vi.fn(); service.onTrackChange(changed); changed.mockClear();
    await native.__emit('playback-active-track-changed', { index: 0, lastIndex: 1 });
    expect(changed).not.toHaveBeenCalledWith(0);
    expect((await native.getProgress()).position).toBe(24);
  });
  it('lets Pause finish while an older stream lookup remains pending and never starts that stale Play', async () => {
    let release!: (tracks: readonly IPlayableTrack[]) => void;
    const source = vi.fn(() => new Promise<readonly IPlayableTrack[]>(r => { release = r; })); service.configureSourceResolver(source);
    const play = service.play(); await vi.waitFor(() => expect(source).toHaveBeenCalled());
    let paused = false; const pause = service.pause().then(() => { paused = true; });
    await tick();
    try { expect(paused).toBe(true); } finally { release(SAMPLE_TRACKS); await Promise.all([play, pause]); }
    expect(native.play).not.toHaveBeenCalled(); expect((await native.getPlaybackState()).state).toBe('paused');
  });
  it('can prepare the newest queue without waiting for an obsolete stream lookup', async () => {
    let release!: (tracks: readonly IPlayableTrack[]) => void;
    const first = [SAMPLE_TRACKS[1]!], last = [SAMPLE_TRACKS[2]!];
    const source = vi.fn(async (tracks: readonly IPlayableTrack[]) => tracks);
    source.mockImplementationOnce(() => new Promise(r => { release = r; })); service.configureSourceResolver(source);
    const old = service.loadQueue(first); await vi.waitFor(() => expect(source).toHaveBeenCalledTimes(1));
    const latest = service.loadQueue(last); await tick();
    try { expect(source).toHaveBeenCalledTimes(2); } finally { release(first); await Promise.all([old, latest]); }
    expect((await native.getQueue()).map(t => t.id)).toEqual([last[0]!.id]);
    expect(native.add.mock.calls.some(([tracks]) => tracks.length === 1 && tracks[0]?.id === first[0]!.id)).toBe(false);
  });
  it('honors Pause while buffering instead of issuing another Play', async () => {
    await service.play(); native.__setState('buffering'); await tick(); const plays = native.play.mock.calls.length;
    await service.togglePlayPause();
    expect(native.play).toHaveBeenCalledTimes(plays); expect((await native.getPlaybackState()).state).toBe('paused');
  });
  it('accumulates forty Next intents but commits and publishes only the final target', async () => {
    await service.play(); native.skip.mockClear(); const playCount=native.play.mock.calls.length;
    const changed=vi.fn();service.onTrackChange(changed);changed.mockClear();
    await Promise.all(Array.from({length:40},()=>service.skipToNext()));
    expect(await native.getActiveTrackIndex()).toBe(1);
    expect(native.skip.mock.calls.map(c=>c[0])).toEqual([1]);
    expect(changed.mock.calls.map(c=>c[0])).toEqual([1]);
    expect(native.play).toHaveBeenCalledTimes(playCount+1);
    expect((await native.getPlaybackState()).state).toBe('playing');
  });
  it('computes a mixed Next/Previous burst from intended selection rather than old native events', async () => {
    await service.skipToIndex(1);native.skip.mockClear();
    await Promise.all([service.skipToNext(),service.skipToNext(),service.skipToPrevious()]);
    expect(await native.getActiveTrackIndex()).toBe(2);expect(native.skip.mock.calls.map(c=>c[0])).toEqual([2]);
    expect((await native.getPlaybackState()).state).toBe('paused');
  });
  it('restarts once for the first Previous after three seconds, then applies further Previous taps', async () => {
    await service.skipToIndex(2);native.__setPosition(15);native.skip.mockClear();
    await Promise.all([service.skipToPrevious(),service.skipToPrevious(),service.skipToPrevious()]);
    expect(await native.getActiveTrackIndex()).toBe(0);expect(native.skip.mock.calls.map(c=>c[0])).toEqual([0]);
  });
  it('does not publish a skip already crossing the bridge when a newer selection and Pause arrive', async () => {
    await service.play();const playCount=native.play.mock.calls.length;native.skip.mockClear();
    const original=native.skip.getMockImplementation()!;let release!:()=>void;
    const barrier=new Promise<void>(resolve=>{release=resolve;});
    native.skip.mockImplementationOnce(async index=>{await barrier;await original(index);});
    const changed=vi.fn();service.onTrackChange(changed);changed.mockClear();
    const old=service.skipToIndex(1);await vi.waitFor(()=>expect(native.skip).toHaveBeenCalled());
    const latest=service.skipToIndex(2),pause=service.pause();release();
    await Promise.all([old,latest,pause]);
    expect(changed.mock.calls.map(c=>c[0])).toEqual([2]);expect(await native.getActiveTrackIndex()).toBe(2);
    expect(native.play).toHaveBeenCalledTimes(playCount);expect((await native.getPlaybackState()).state).toBe('paused');
  });
  it('treats a second toggle during delayed Play as Pause without a delayed autoplay', async () => {
    let release!:(tracks:readonly IPlayableTrack[])=>void;
    const source=vi.fn(()=>new Promise<readonly IPlayableTrack[]>(r=>{release=r;}));service.configureSourceResolver(source);
    const playing=service.play();await vi.waitFor(()=>expect(source).toHaveBeenCalled());
    await service.togglePlayPause();release(SAMPLE_TRACKS);await playing;
    expect(native.play).not.toHaveBeenCalled();expect((await native.getPlaybackState()).state).toBe('paused');
  });

  it('rereads an automatic native advance that happens during a snapshot instead of publishing a mismatched index', async () => {
    const original=native.getProgress.getMockImplementation()!;let release!:()=>void;
    const barrier=new Promise<void>(resolve=>{release=resolve;});
    native.getProgress.mockImplementationOnce(async()=>{await barrier;return original();});
    const changed=vi.fn();service.onTrackChange(changed);changed.mockClear();
    const count=native.getProgress.mock.calls.length;
    native.__setState('playing');
    try { await vi.waitFor(()=>expect(native.getProgress.mock.calls.length).toBeGreaterThan(count)); await native.skip(2); } finally { release(); }
    await vi.waitFor(()=>expect(changed).toHaveBeenLastCalledWith(2));
    expect(changed.mock.calls.some(([index])=>index===0)).toBe(false);
  });

  it('ignores late state/error payloads when the real native player is still playing', async () => {
    await service.play();const errors=vi.fn();service.onError(errors);
    await native.__emitStale('playback-state',{state:'loading'});
    await native.__emitStale('playback-error',{code:'403',message:'Expired old source'});
    await tick();
    expect(service.getPlaybackState()).toBe('PLAYING');expect(errors).not.toHaveBeenCalled();
  });
  it('rejects navigation with no tracks without performing another native reset', async () => {
    await service.loadQueue([]);native.reset.mockClear();const errors=vi.fn();service.onError(errors);
    await service.skipToNext();
    expect(native.reset).not.toHaveBeenCalled();expect(errors).toHaveBeenCalledWith(expect.objectContaining({message:'No tracks are available for playback'}));
  });

  it('does not hide the latest source failure behind a later state event from the old playing track', async () => {
    await service.play();service.configureSourceResolver(async()=>{throw new Error('Latest source unavailable');});
    await expect(service.playQueue([SAMPLE_TRACKS[1]!])).rejects.toThrow('Latest source unavailable');
    await native.__emitStale('playback-state',{state:'playing'});await tick();
    expect(service.getPlaybackState()).toBe('ERROR');expect(await native.getQueue()).toHaveLength(3);
  });

  it('does not let remote Play/Next cancel a pending account queue clear or resume old audio', async () => {
    await service.play();const plays=native.play.mock.calls.length;
    await Promise.all([service.loadQueue([]),service.play(),service.skipToNext()]);
    expect(await native.getQueue()).toEqual([]);expect(service.getTracks()).toEqual([]);
    expect(native.play).toHaveBeenCalledTimes(plays);
  });

});
