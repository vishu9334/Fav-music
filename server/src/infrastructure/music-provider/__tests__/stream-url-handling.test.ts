import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { JioSaavnV3MusicProviderService } from '../implementations/jiosaavn-v3-music-provider.service.js';

// Actual captured song metadata. URI vectors below are test-only and are never fetched.
const metadata = JSON.parse(await readFile(new URL('./fixtures/v3-song-metadata.json', import.meta.url), 'utf8')) as Record<string, unknown>;
const endpoint = 'https://api.example.invalid';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const record = (uri: string) => ({ ...metadata, media_urls: { '320_KBPS': uri } });

describe('documented v3 source fields and opaque URL handling', () => {
  it('uses a returned 96-kbps source when it is the only supplied quality', async () => {
    const uri = 'https://cdn.example.invalid/unit-test-only-96.aac';
    const transport = vi.fn(async () => json({ ...metadata, media_urls: { '96_KBPS': uri } }));
    const song = await new JioSaavnV3MusicProviderService({ apiBaseUrl: endpoint }, transport).getSongById(String(metadata.id));
    expect(song?.audioUrl).toBe(uri);
  });
  it.each([
    [{ '320_KBPS': 'https://cdn.example.invalid/unit-320', '160_KBPS': 'https://cdn.example.invalid/unit-160', '96_KBPS': 'https://cdn.example.invalid/unit-96' }, undefined, 'https://cdn.example.invalid/unit-320'],
    [{ '320_KBPS': 'http://cdn.example.invalid/unit-320', '160_KBPS': 'https://cdn.example.invalid/unit-160' }, undefined, 'https://cdn.example.invalid/unit-160'],
    [{}, 'https://cdn.example.invalid/unit-default', 'https://cdn.example.invalid/unit-default'],
  ])('chooses only a provider-supplied, validated HTTPS source', async (qualities, fallback, expected) => {
    const provider = new JioSaavnV3MusicProviderService({ apiBaseUrl: endpoint }, vi.fn(async () => json({ ...metadata, media_urls: qualities, media_url: fallback })));
    expect((await provider.getSongById(String(metadata.id)))?.audioUrl).toBe(expected);
  });
  it('preserves provider bytes and query encoding instead of rebuilding an opaque URI', async () => {
    const uri = 'https://CDN.example.invalid:443/unit%2ftrack.aac?signature=A%2Fb+Z&opaque=%2f';
    const provider = new JioSaavnV3MusicProviderService({ apiBaseUrl: endpoint }, vi.fn(async () => json(record(uri))));
    expect((await provider.getSongById(String(metadata.id)))?.audioUrl).toBe(uri);
  });
  it.each([
    'https://cdn.example.invalid/unit\ntrack.aac',
    'https://cdn.example.invalid/unit\\track.aac',
    'https://cdn.example.invalid/unit%ZZtrack.aac',
    'https://user:password@cdn.example.invalid/track.aac',
    'http://cdn.example.invalid/track.aac',
  ])('does not repair an unsafe source into a seemingly playable URI: %s', async (uri) => {
    const provider = new JioSaavnV3MusicProviderService({ apiBaseUrl: endpoint }, vi.fn(async () => json(record(uri))));
    expect((await provider.getSongById(String(metadata.id)))?.audioUrl).toBeUndefined();
  });
});

describe('forced media renewal and ordinary metadata request ordering', () => {
  it('issues a separate revalidated request and prevents the older response overwriting renewed cache data', async () => {
    let ordinaryReply!: (response: Response) => void, freshReply!: (response: Response) => void;
    const transport = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { ordinaryReply = resolve; }))
      .mockImplementationOnce(() => new Promise<Response>(resolve => { freshReply = resolve; }));
    const provider = new JioSaavnV3MusicProviderService({ apiBaseUrl: endpoint }, transport);
    const ordinary = provider.getSongById(String(metadata.id));
    const renewed = provider.getSongById(String(metadata.id), true);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[0]![1].headers).not.toHaveProperty('Cache-Control');
    expect(transport.mock.calls[1]![1]).toMatchObject({ headers: { 'Cache-Control': 'no-cache' }, redirect: 'error' });
    const freshUri = 'https://cdn.example.invalid/unit-renewed';
    freshReply(json(record(freshUri))); expect((await renewed)?.audioUrl).toBe(freshUri);
    ordinaryReply(json(record('https://cdn.example.invalid/unit-old'))); await ordinary;
    expect((await provider.getSongById(String(metadata.id)))?.audioUrl).toBe(freshUri);
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it('coalesces simultaneous forced requests and lets later ordinary reads join the renewal', async () => {
    let reply!: (response: Response) => void;
    const transport = vi.fn(() => new Promise<Response>(resolve => { reply = resolve; }));
    const provider = new JioSaavnV3MusicProviderService({ apiBaseUrl: endpoint }, transport);
    const first = provider.getSongById(String(metadata.id), true), second = provider.getSongById(String(metadata.id), true), ordinary = provider.getSongById(String(metadata.id));
    expect(transport).toHaveBeenCalledTimes(1);
    reply(json(record('https://cdn.example.invalid/unit-renewed')));
    const results = await Promise.all([first, second, ordinary]); expect(results.every(song => song?.audioUrl === results[0]?.audioUrl)).toBe(true);
  });
  it('does not silently return an old source when the forced refresh fails upstream', async () => {
    const transport = vi.fn().mockResolvedValueOnce(json(record('https://cdn.example.invalid/unit-old'))).mockResolvedValueOnce(json({ message: 'upstream failure' }, 500));
    const provider = new JioSaavnV3MusicProviderService({ apiBaseUrl: endpoint, maxRetries: 0 }, transport);
    await provider.getSongById(String(metadata.id));
    await expect(provider.getSongById(String(metadata.id), true)).rejects.toMatchObject({ code: 'UNAVAILABLE', status: 500 });
  });
});
