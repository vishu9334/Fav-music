import { describe, expect, it } from 'vitest';
import { PlaybackState } from '@aadat/contracts';
import { canRetryVideo, VideoPosterGate } from '../video-presentation';
describe('video poster and error presentation',()=>{
  it('keeps already revealed video visible through buffering, errors and recovery without poster flashes',()=>{
    const gate=new VideoPosterGate();expect(gate.visible('one',PlaybackState.LOADING)).toBe(true);expect(gate.visible('one',PlaybackState.PLAYING)).toBe(false);
    for(const state of [PlaybackState.BUFFERING,PlaybackState.ERROR,PlaybackState.LOADING,PlaybackState.PAUSED,PlaybackState.STOPPED])expect(gate.visible('one',state)).toBe(false);
    expect(gate.visible('two',PlaybackState.LOADING)).toBe(true);expect(gate.visible('two',PlaybackState.PAUSED)).toBe(false);expect(gate.visible('two',PlaybackState.BUFFERING)).toBe(false);
  });
  it('shows Try again only for an actual idle error, never normal states or an in-flight retry',()=>{
    for(const state of [PlaybackState.IDLE,PlaybackState.LOADING,PlaybackState.BUFFERING,PlaybackState.PLAYING,PlaybackState.PAUSED,PlaybackState.STOPPED])expect(canRetryVideo(state,'Stale error',false)).toBe(false);
    expect(canRetryVideo(PlaybackState.ERROR,null,false)).toBe(false);expect(canRetryVideo(PlaybackState.ERROR,'Failed',true)).toBe(false);expect(canRetryVideo(PlaybackState.ERROR,'Failed',false)).toBe(true);
  });
});
