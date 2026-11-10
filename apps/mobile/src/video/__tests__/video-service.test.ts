import { describe, expect, it, vi } from 'vitest';
import { PlaybackState } from '@aadat/contracts';
import { MediaPlaybackCoordinator } from '../../services/playback/MediaPlaybackCoordinator';
import { VideoPlaybackService } from '../VideoPlaybackService';
import { authorizedStream, AuthorizedVideoSource, IVideoEngine, VideoItem, VideoSnapshot } from '../video.contract';
import { FullscreenController } from '../FullscreenController';

class Engine implements IVideoEngine {
  public value: VideoSnapshot = { status: 'idle', playing: false, position: 0, duration: 0, buffered: 0 };
  private listeners = new Set<() => void>();
  public snapshot(): VideoSnapshot { return this.value; }
  public publish(value: Partial<VideoSnapshot>): void { this.value = { ...this.value, ...value }; for (const listener of this.listeners) listener(); }
  public subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  public load = vi.fn(async (_source: AuthorizedVideoSource) => { this.publish({ status: 'ready', playing: false, duration: 8, position: 0 }); });
  public play = vi.fn(async () => { this.publish({ playing: true }); });
  public pauseAndConfirm = vi.fn(async () => { this.publish({ playing: false }); });
  public seek = vi.fn(async (position: number) => { this.publish({ position }); });
  public dispose = vi.fn(() => { this.publish({ playing: false }); this.listeners.clear(); });
}
const items: readonly VideoItem[] = [
  { id: 'one', title: 'One', description: 'Unit fixture', source: { kind: 'asset', asset: 1 } },
  { id: 'two', title: 'Two', description: 'Unit fixture', source: { kind: 'asset', asset: 2 } },
];
function fixture() {
  const engine = new Engine(), coordinator = new MediaPlaybackCoordinator(), pauseAudio = vi.fn(async () => {});
  return { engine, coordinator, pauseAudio, service: new VideoPlaybackService(engine, items, coordinator, pauseAudio) };
}
describe('Native video queue/control contract', () => {
  it('prepares a selected clip silently and waits for audio pause before playing', async () => {
    const f = fixture(); await f.service.select(0); expect(f.pauseAudio).not.toHaveBeenCalled(); expect(f.engine.play).not.toHaveBeenCalled();
    await f.service.toggle(); expect(f.service.state.getState().playbackState).toBe(PlaybackState.PLAYING);
    expect(f.pauseAudio.mock.invocationCallOrder[0]).toBeLessThan(f.engine.play.mock.invocationCallOrder[0]!);
    await f.service.toggle(); expect(f.service.state.getState().playbackState).toBe(PlaybackState.PAUSED);
  });
  it('mirrors audio Next/Previous wrap and restart-after-three-seconds behavior while preserving pause state', async () => {
    const f = fixture(); await f.service.select(0); await f.service.previous(); expect(f.service.state.getState().index).toBe(1);
    expect(f.engine.play).not.toHaveBeenCalled(); await f.service.next(); expect(f.service.state.getState().index).toBe(0);
    await f.service.toggle(); await f.service.seek(5); await f.service.previous(); expect(f.service.state.getState()).toMatchObject({ index: 0, position: 0, playbackState: PlaybackState.PLAYING });
    await f.service.next(); expect(f.service.state.getState()).toMatchObject({ index: 1, playbackState: PlaybackState.PLAYING });
  });
  it('serializes rapid selections and toggles without replaying obsolete loading requests', async () => {
    const f = fixture(); await Promise.all([f.service.select(0, true), f.service.select(1, true)]);
    expect(f.service.state.getState()).toMatchObject({ index: 1, playbackState: PlaybackState.PLAYING, busy: false }); expect(f.engine.play).toHaveBeenCalledTimes(1);
    await f.service.pause(); await Promise.all([f.service.toggle(), f.service.toggle()]);
    expect(f.service.state.getState().playbackState).toBe(PlaybackState.PAUSED);
  });
  it('preserves playback across rapid Next commands while only the latest selection plays', async () => {
    const f = fixture(); await f.service.select(0, true); const plays = f.engine.play.mock.calls.length;
    await Promise.all([f.service.next(), f.service.next()]);
    expect(f.service.state.getState()).toMatchObject({ index: 0, playbackState: PlaybackState.PLAYING });
    expect(f.engine.play.mock.calls.length - plays).toBe(1);
  });
  it('does not start video when audio pause cannot be confirmed and permits retry', async () => {
    const f = fixture(); f.pauseAudio.mockRejectedValueOnce(new Error('Audio still playing'));
    await f.service.select(0, true); expect(f.engine.play).not.toHaveBeenCalled(); expect(f.service.state.getState().error).toContain('Audio still playing');
    await f.service.toggle(); expect(f.engine.play).toHaveBeenCalledTimes(1);
  });
  it('cancels late autoplay when a newer audio request arrives during video loading', async () => {
    const f = fixture(); let release!: () => void;
    f.engine.load.mockImplementationOnce(async () => { await new Promise<void>((resolve) => { release = resolve; }); f.engine.publish({ status: 'ready', duration: 8 }); });
    const selecting = f.service.select(0, true); await vi.waitFor(() => expect(f.engine.load).toHaveBeenCalled());
    const audio = vi.fn(async () => {}); await f.coordinator.audio(audio); release(); await selecting;
    expect(audio).toHaveBeenCalledOnce(); expect(f.engine.play).not.toHaveBeenCalled();
  });
  it('cancels pending autoplay on background pause or disposal', async () => {
    const f = fixture(); let release!: () => void;
    f.engine.load.mockImplementationOnce(async () => { await new Promise<void>((resolve) => { release = resolve; }); f.engine.publish({ status: 'ready', duration: 8 }); });
    const selecting = f.service.select(0, true); await vi.waitFor(() => expect(f.engine.load).toHaveBeenCalled());
    const paused = f.service.pause(); release(); await selecting; await paused; expect(f.engine.play).not.toHaveBeenCalled();
    f.service.dispose(); f.service.dispose(); await f.service.toggle(); expect(f.engine.dispose).toHaveBeenCalledOnce();
  });
  it('reports buffering/progress/duration/errors and clamps seek without accepting NaN', async () => {
    const f = fixture(); await f.service.select(0);
    f.engine.publish({ status: 'loading', position: 2, buffered: 4 }); expect(f.service.state.getState().playbackState).toBe(PlaybackState.BUFFERING);
    f.engine.publish({ status: 'ready' }); await f.service.seek(99); expect(f.engine.seek).toHaveBeenLastCalledWith(8);
    await f.service.seek(-3); expect(f.engine.seek).toHaveBeenLastCalledWith(0);
    await f.service.seek(NaN); expect(f.service.state.getState().playbackState).toBe(PlaybackState.ERROR);
    f.engine.publish({ status: 'error' }); expect(f.service.state.getState().error).toContain('Video could not be played');
  });
  it('handles empty queues and unavailable items without any native play', async () => {
    const f = fixture(); await f.service.select(10, true); expect(f.engine.play).not.toHaveBeenCalled();
    const empty = new VideoPlaybackService(f.engine, [], f.coordinator, f.pauseAudio); await empty.next();
    expect(empty.state.getState().error).toContain('unavailable'); expect(f.engine.play).not.toHaveBeenCalled(); empty.dispose(); f.service.dispose();
  });
  it('only retries a real error, reloads the exact clip once and confirms audio pause before play', async () => {
    const f=fixture();await f.service.select(1);await f.service.retry();expect(f.engine.load).toHaveBeenCalledTimes(1);expect(f.engine.play).not.toHaveBeenCalled();
    f.engine.publish({status:'error'});await Promise.all([f.service.retry(),f.service.retry()]);
    expect(f.engine.load).toHaveBeenCalledTimes(2);expect(f.engine.load).toHaveBeenLastCalledWith(items[1]!.source);expect(f.engine.play).toHaveBeenCalledTimes(1);expect(f.pauseAudio.mock.invocationCallOrder[0]).toBeLessThan(f.engine.play.mock.invocationCallOrder[0]!);
    expect(f.service.state.getState()).toMatchObject({index:1,playbackState:PlaybackState.PLAYING,error:null,busy:false});f.service.dispose();
  });
  it('cancels retry autoplay if a newer audio request or explicit Pause arrives during reloading',async()=>{
    for(const cancel of ['audio','pause'] as const){const f=fixture();await f.service.select(0);f.engine.publish({status:'error'});let release!:()=>void;
      f.engine.load.mockImplementationOnce(async()=>{await new Promise<void>(resolve=>{release=resolve;});f.engine.publish({status:'ready',playing:false,duration:8});});
      const retry=f.service.retry();await vi.waitFor(()=>expect(release).toBeTypeOf('function'));const cancelled=cancel==='audio'?f.coordinator.audio(async()=>{}):f.service.pause();release();await retry;await cancelled;expect(f.engine.play).not.toHaveBeenCalled();f.service.dispose();
    }
  });
  it('keeps a failed retry actionable and disposal prevents any further retry or playback',async()=>{
    const f=fixture();await f.service.select(0);f.engine.publish({status:'error'});f.engine.load.mockRejectedValueOnce(new Error('This video is temporarily unavailable.'));
    await f.service.retry();expect(f.service.state.getState()).toMatchObject({playbackState:PlaybackState.ERROR,busy:false,error:'This video is temporarily unavailable.'});expect(f.engine.play).not.toHaveBeenCalled();
    const before=f.engine.load.mock.calls.length;f.service.dispose();await f.service.retry();expect(f.engine.load).toHaveBeenCalledTimes(before);expect(f.engine.dispose).toHaveBeenCalledOnce();
  });
});

describe('Exclusive media ownership', () => {
  it('waits for every video pause before audio and refuses audio if confirmation fails', async () => {
    const coordinator = new MediaPlaybackCoordinator(), video = {}, pause = vi.fn(async () => {}), playAudio = vi.fn(async () => {});
    const detach = coordinator.registerVideo(video, pause); await coordinator.audio(playAudio);
    expect(pause.mock.invocationCallOrder[0]).toBeLessThan(playAudio.mock.invocationCallOrder[0]!);
    pause.mockRejectedValueOnce(new Error('Pause failed')); await expect(coordinator.audio(playAudio)).rejects.toThrow('Pause failed');
    expect(playAudio).toHaveBeenCalledTimes(1); detach();
  });
  it('suppresses audio-focus auto-resume after video exit until an explicit audio request', async () => {
    const coordinator = new MediaPlaybackCoordinator(), key = {}, detach = coordinator.registerVideo(key, async () => {});
    expect(coordinator.mayResumeAudioFocus).toBe(true);
    await coordinator.video(key, coordinator.videoIntent(), async () => {}, async () => {});
    expect(coordinator.owner).toBe('video'); expect(coordinator.mayResumeAudioFocus).toBe(false);
    detach(); expect(coordinator.owner).toBe('none'); expect(coordinator.mayResumeAudioFocus).toBe(false);
    await coordinator.audio(async () => {}); expect(coordinator.mayResumeAudioFocus).toBe(true);
  });
});

describe('Fullscreen orientation recovery', () => {
  function fullscreen() {
    const orientation = { current: vi.fn(async () => 1), landscape: vi.fn(async () => {}), restore: vi.fn(async (_lock: number) => {}) }, changed = vi.fn();
    return { orientation, changed, controller: new FullscreenController(orientation, changed) };
  }
  it('serializes duplicate entry and restores the captured policy on exit', async () => {
    const f = fullscreen(); await Promise.all([f.controller.enter(), f.controller.enter()]); expect(f.orientation.landscape).toHaveBeenCalledOnce();
    await f.controller.exit(); expect(f.orientation.restore).toHaveBeenCalledWith(1); expect(f.changed.mock.calls).toEqual([[true], [false]]);
  });
  it('restores after a failed entry and after disposal during pending rotation', async () => {
    const f = fullscreen(); f.orientation.landscape.mockRejectedValueOnce(new Error('Unavailable')); await expect(f.controller.enter()).rejects.toThrow('Unavailable');
    expect(f.orientation.restore).toHaveBeenCalledWith(1); expect(f.changed).not.toHaveBeenCalled();
    let release!: () => void; f.orientation.landscape.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const entering = f.controller.enter(); await vi.waitFor(() => expect(f.orientation.landscape).toHaveBeenCalledTimes(2));
    const disposal = f.controller.dispose(); release(); await entering; await disposal;
    expect(f.orientation.restore).toHaveBeenCalledTimes(2); expect(f.changed).not.toHaveBeenCalledWith(true);
  });
  it('retains the original lock for retry after restoration fails, including cleanup', async () => {
    const f = fullscreen(); await f.controller.enter(); f.orientation.restore.mockRejectedValueOnce(new Error('Temporary failure'));
    await expect(f.controller.exit()).rejects.toThrow('Temporary failure'); expect(f.changed).not.toHaveBeenCalledWith(false);
    await f.controller.exit(); expect(f.orientation.restore).toHaveBeenNthCalledWith(2, 1);
    await f.controller.enter(); f.orientation.restore.mockRejectedValueOnce(new Error('Temporary failure'));
    await f.controller.dispose(); expect(f.orientation.restore).toHaveBeenCalledTimes(4); expect(f.changed).toHaveBeenLastCalledWith(false);
  });
});

describe('Authorized HTTPS streaming adapter', () => {
  it('accepts attributed HTTPS sources without fabricating any remote catalog entry', () => {
    expect(authorizedStream('https://media.example.com/authorized.mp4?token=example', 'Authorized test fixture'))
      .toMatchObject({ kind: 'https', attribution: 'Authorized test fixture' });
  });
  it.each(['http://media.example.com/a.mp4', 'https://user:secret@media.example.com/a.mp4', 'file:///a.mp4', 'javascript:alert(1)', 'https://media.example.com/a.mp4\n'])('rejects unsafe source %s', (uri) => {
    expect(() => authorizedStream(uri, 'Test fixture')).toThrow('authorized HTTPS');
  });
  it('requires explicit attribution metadata', () => { expect(() => authorizedStream('https://media.example.com/a.mp4', '')).toThrow(); });
});
