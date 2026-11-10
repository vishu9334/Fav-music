import {SAMPLE_TRACKS} from '../../../data/sample-tracks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaybackState } from '@aadat/contracts';
import type { NativeMock } from './track-player.mock';
import type { AudioPlaybackService } from '../AudioPlaybackService';

vi.mock('react-native-track-player', async () => (await import('./track-player.mock')).trackPlayerModule);
let native: NativeMock, service: AudioPlaybackService;
beforeEach(async () => { vi.resetModules(); native = (await import('react-native-track-player')).default as unknown as NativeMock; native.__reset(); service = (await import('../AudioPlaybackService')).AudioPlaybackService.getInstance(); service.configureInitialQueue(SAMPLE_TRACKS); });
afterEach(async () => { await service.destroy(); });
describe('Audio screen and notification commands participate in video handoff', () => {
  it('pauses video before remote Play, preserving audio queue, selection and seek', async () => {
    await service.initialize(); await service.skipToIndex(2); await service.seekTo(23); await service.play();
    const coordinator = (await import('../MediaPlaybackCoordinator')).mediaPlaybackCoordinator;
    let videoPlaying = false; const key = {};
    const pauseVideo = vi.fn(async () => { videoPlaying = false; }); const detach = coordinator.registerVideo(key, pauseVideo);
    await coordinator.video(key, coordinator.videoIntent(), () => service.pause(), async () => { videoPlaying = true; });
    expect((await native.getPlaybackState()).state).toBe('paused'); expect(videoPlaying).toBe(true);
    await (await import('../playback-service')).playbackService(); await native.__emit('remote-play');
    expect(videoPlaying).toBe(false); expect(service.getPlaybackState()).toBe(PlaybackState.PLAYING);
    expect(await native.getActiveTrackIndex()).toBe(2); expect((await native.getProgress()).position).toBe(23); expect(await native.getQueue()).toHaveLength(3);
    expect(native.reset).not.toHaveBeenCalled(); detach();
  });
  it('keeps focus return from restarting audio while video owns playback or after it exits', async () => {
    await service.initialize(); await service.play(); await (await import('../playback-service')).playbackService();
    const coordinator = (await import('../MediaPlaybackCoordinator')).mediaPlaybackCoordinator, key = {}, detach = coordinator.registerVideo(key, async () => {});
    await coordinator.video(key, coordinator.videoIntent(), () => service.pause(), async () => {});
    await native.__emit('remote-duck', { permanent: false, paused: false }); expect(service.getPlaybackState()).toBe(PlaybackState.PAUSED);
    detach(); await native.__emit('remote-duck', { permanent: false, paused: false }); expect(service.getPlaybackState()).toBe(PlaybackState.PAUSED);
    await service.togglePlayPause(); expect(service.getPlaybackState()).toBe(PlaybackState.PLAYING);
  });
  it('does not start audio if native video pause fails and allows a later retry', async () => {
    const coordinator = (await import('../MediaPlaybackCoordinator')).mediaPlaybackCoordinator;
    const pause = vi.fn().mockRejectedValueOnce(new Error('Video pause unconfirmed')).mockResolvedValue(undefined), detach = coordinator.registerVideo({}, pause);
    await service.play(); expect(native.play).not.toHaveBeenCalled(); expect(service.getPlaybackState()).toBe(PlaybackState.ERROR);
    await service.play(); expect(service.getPlaybackState()).toBe(PlaybackState.PLAYING); detach();
  });
  it('does not deadlock when audio start and video ownership are requested concurrently', async () => {
    const coordinator = (await import('../MediaPlaybackCoordinator')).mediaPlaybackCoordinator, key = {}, detach = coordinator.registerVideo(key, async () => {});
    const audio = service.play(), video = coordinator.video(key, coordinator.videoIntent(), () => service.pause(), async () => {});
    await Promise.all([audio, video]); expect(service.getPlaybackState()).toBe(PlaybackState.PAUSED); expect(coordinator.owner).toBe('video'); detach();
  });
});
