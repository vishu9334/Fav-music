import { seedDemoFixture } from '../../catalog/__tests__/demo-fixture';
import { describe, expect, it, vi } from 'vitest';
import { demoCatalog } from '../../catalog/demo-catalog';
import { normalizeReelUrl } from '../../discovery/instagram-link';
import { ShareLinkService } from '../share-link.service';

function fixture() { const gateway = { share: vi.fn(async (_title: string, _message: string) => {}) }; return { gateway, links: new ShareLinkService(demoCatalog, gateway) }; }
function payload(link: string): string { return decodeURIComponent(link.split('?payload=')[1]!); }
const base = { v: 1, catalog: 'aadat-demo-v1' };

describe('Validated Aadat custom-scheme sharing', () => {
  it('round-trips catalog references without stream URLs, local playlist IDs or identity', () => {
    const { links } = fixture();
    expect(links.parse(payload(links.trackLink('sample-track-1')))).toEqual({ ...base, type: 'track', id: 'sample-track-1' });
    const link = links.playlistLink({ id: 'private-local-playlist', name: 'Rain & sun 🎵', trackIds: ['sample-track-3', 'sample-track-1'] });
    expect(links.parse(payload(link))).toEqual({ ...base, type: 'playlist', name: 'Rain & sun 🎵', ids: ['sample-track-3', 'sample-track-1'] });
    expect(link).not.toContain('private-local-playlist'); expect(link).not.toContain('soundhelix.com');
  });
  it.each([undefined, ['{}'], 'bad JSON', 'null', 'x'.repeat(6001), JSON.stringify({ ...base, v: 2, type: 'track', id: 'sample-track-1' }),
    JSON.stringify({ ...base, catalog: 'other', type: 'track', id: 'sample-track-1' }), JSON.stringify({ ...base, type: 'track', id: 'https://evil.example/music.mp3' }),
    JSON.stringify({ ...base, type: 'playlist', name: 'Mix', ids: [] }), JSON.stringify({ ...base, type: 'playlist', name: 'Mix', ids: Array(101).fill('a') }),
    JSON.stringify({ ...base, type: 'playlist', name: '\u0000', ids: ['a'] })])('rejects malformed or unsupported payload %s', (input) => {
      expect(() => fixture().links.parse(input)).toThrow();
    });
  it('retains unavailable reference IDs for honest review and deduplicates without fetching arbitrary media', () => {
    const { links, gateway } = fixture();
    expect(links.parse(JSON.stringify({ ...base, type: 'playlist', name: 'Future', ids: ['unavailable', 'sample-track-1', 'sample-track-1'], url: 'https://evil.example' })))
      .toEqual({ ...base, type: 'playlist', name: 'Future', ids: ['unavailable', 'sample-track-1'] });
    expect(gateway.share).not.toHaveBeenCalled();
  });
  it('shares native text only on request, coalesces concurrent taps and retries after cancellation/failure', async () => {
    const { links, gateway } = fixture(); let release!: () => void;
    gateway.share.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const playlist = { id: 'local-only', name: 'Shared mix', trackIds: ['sample-track-1'] };
    const first = links.sharePlaylist(playlist), duplicate = links.sharePlaylist(playlist);
    await vi.waitFor(() => expect(gateway.share).toHaveBeenCalledTimes(1));
    expect(first).toBe(duplicate); expect(gateway.share).toHaveBeenCalledTimes(1); release(); await first;
    gateway.share.mockRejectedValueOnce(new Error('Unavailable')); await expect(links.sharePlaylist(playlist)).rejects.toThrow('Unavailable');
    await links.sharePlaylist(playlist); expect(gateway.share).toHaveBeenCalledTimes(3);
    expect(gateway.share.mock.calls[0]?.[1]).toContain('aadatmusic:///shared?payload=');
  });
  it('refuses sharing unknown tracks and empty playlists', () => {
    const { links, gateway } = fixture(); expect(() => links.trackLink('unknown')).toThrow('unavailable');
    expect(() => links.playlistLink({ id: 'one', name: 'Empty', trackIds: [] })).toThrow();
    expect(gateway.share).not.toHaveBeenCalled();
  });
});

describe('Instagram reel links with React Native-compatible validation', () => {
  it('normalizes permitted hosts, strips tracking and creates a prefilled discovery link', () => {
    const canonical = 'https://www.instagram.com/reel/Ab-12_/';
    expect(normalizeReelUrl(' https://instagram.com/reel/Ab-12_/?igsh=tracking#fragment ')).toBe(canonical);
    expect(normalizeReelUrl('https://m.instagram.com/reels/Ab-12_')).toBe(canonical);
    expect(fixture().links.reelLink(canonical)).toBe(`aadatmusic:///instamus?reel=${encodeURIComponent(canonical)}`);
  });
  it.each(['http://instagram.com/reel/a/', 'https://instagram.com.evil.example/reel/a/', 'https://instagram.com@evil.example/reel/a/',
    'https://user:password@instagram.com/reel/a/', 'https://instagram.com:443/reel/a/', 'https://instagram.com/p/a/',
    'https://instagram.com/reel/a/extra', 'file:///reel/a/', 'javascript:alert(1)', 'https://instagram.com/reel/a/\u0000', 'x'.repeat(2049)])('rejects unsafe or unsupported URL %s', (url) => {
      expect(() => normalizeReelUrl(url)).toThrow();
    });
});

seedDemoFixture();
