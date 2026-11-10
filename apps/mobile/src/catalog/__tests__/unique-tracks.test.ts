import { describe, expect, it } from 'vitest';
import { uniqueTracks } from '../unique-tracks';
import type { IPlayableTrack } from '../../data/sample-tracks';

const song = (id: string, title = 'Aadat', artist = 'Ninja'): IPlayableTrack => ({ id, title, artist, url: '', artwork: '', duration: 180 });
describe('distinct songs in lists and playback queues', () => {
  it('keeps the first provider recording and preserves remixes and different artists', () => {
    const first = song('one'), remix = song('remix', 'Aadat (Remix)'), cover = song('cover', 'Aadat', 'Other artist');
    expect(uniqueTracks([first, song('duplicate', ' AADAT ', 'NINJA'), first, remix, cover])).toEqual([first, remix, cover]);
  });
  it('normalizes Unicode and punctuation while retaining the original array when already unique', () => {
    const tracks = [song('one', 'Ａａｄａｔ'), song('two', 'Another song')];
    expect(uniqueTracks(tracks)).toBe(tracks);
    expect(uniqueTracks([tracks[0]!, song('duplicate', 'Aadat')])).toEqual([tracks[0]]);
  });
});
