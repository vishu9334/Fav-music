import {describe,it,expect} from 'vitest';
import {noSongMatchMessage,SONG_NOT_FOUND} from '../track-availability';
describe('honest missing-song feedback for InstaMus manual catalog matching',()=>{
  it('shows the requested message only after the current search finishes with no matches or further pages',()=>{
    expect(noSongMatchMessage('Believer','Believer','ready',0,false)).toBe(SONG_NOT_FOUND);
  });
  it('does not call pending, stale, failed, partial or empty-input searches a missing song',()=>{
    for(const status of ['loading','error','unavailable'])expect(noSongMatchMessage('Believer','Believer',status,0,false)).toBeNull();
    expect(noSongMatchMessage('Believer','Levitating','ready',0,false)).toBeNull();
    expect(noSongMatchMessage('Believer','Believer','ready',0,true)).toBeNull();
    expect(noSongMatchMessage('Believer','Believer','ready',1,false)).toBeNull();
    expect(noSongMatchMessage('','','ready',0,false)).toBeNull();
  });
});
