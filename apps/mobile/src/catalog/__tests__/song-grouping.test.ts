import { describe, it, expect } from 'vitest';
import { groupTracksByVersion, normalizeSongTitle, unlistDuplicateVersions } from '../song-grouping';
import type { IPlayableTrack } from '../../data/sample-tracks';

describe('song-grouping', () => {
  it('normalizes song titles correctly', () => {
    expect(normalizeSongTitle('Aadat')).toBe('Aadat');
    expect(normalizeSongTitle('Aadat (Hard Rock Version)')).toBe('Aadat');
    expect(normalizeSongTitle('Aadat (Remix)')).toBe('Aadat');
    expect(normalizeSongTitle('Aadat (Reimagined)')).toBe('Aadat');
    expect(normalizeSongTitle('Tu Mil Jaaye (From "KING")')).toBe('Tu Mil Jaaye');
  });

  it('groups multiple versions of same song together', () => {
    const t1: IPlayableTrack = { id: '1', title: 'Aadat', artist: 'Atif Aslam', duration: 200, url: '', artwork: '' };
    const t2: IPlayableTrack = { id: '2', title: 'Aadat (Remix)', artist: 'Atif Aslam', duration: 210, url: '', artwork: '' };
    const t3: IPlayableTrack = { id: '3', title: 'Believer', artist: 'Imagine Dragons', duration: 204, url: '', artwork: '' };

    const groups = groupTracksByVersion([t1, t2, t3]);
    expect(groups).toHaveLength(2);

    const aadatGroup = groups.find((g) => g.baseTitle === 'Aadat');
    expect(aadatGroup).toBeDefined();
    expect(aadatGroup?.versionCount).toBe(2);
    expect(aadatGroup?.primaryTrack.id).toBe('1');
    expect(aadatGroup?.versions).toHaveLength(2);

    const believerGroup = groups.find((g) => g.baseTitle === 'Believer');
    expect(believerGroup).toBeDefined();
    expect(believerGroup?.versionCount).toBe(1);
  });

  it('unlists multiple duplicate versions keeping only the single primary song', () => {
    const t1: IPlayableTrack = { id: '1', title: 'Aadat', artist: 'Ninja', duration: 247, url: '', artwork: '' };
    const t2: IPlayableTrack = { id: '2', title: 'Aadat (Remix)', artist: 'Ninja', duration: 210, url: '', artwork: '' };
    const t3: IPlayableTrack = { id: '3', title: 'Aadat (Rock Version)', artist: 'Ninja', duration: 260, url: '', artwork: '' };
    const t4: IPlayableTrack = { id: '4', title: 'Aadat Se Majboor', artist: 'Salim-Sulaiman', duration: 277, url: '', artwork: '' };

    const unlisted = unlistDuplicateVersions([t1, t2, t3, t4]);
    expect(unlisted).toHaveLength(2);
    expect(unlisted[0]?.id).toBe('1');
    expect(unlisted[0]?.title).toBe('Aadat');
    expect(unlisted[1]?.id).toBe('4');
    expect(unlisted[1]?.title).toBe('Aadat Se Majboor');
  });
});

