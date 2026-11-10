import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  NativeModules: {},
}));

import {
  cleanVideoTitle,
  createLocalVideoItem,
  getAllAvailableVideos,
  normalizeLocalVideoUri,
} from '../local-video-storage';
import type { VideoItem } from '../video.contract';

describe('local-video-storage', () => {
  it('cleans video titles from filenames correctly', () => {
    expect(cleanVideoTitle('my_awesome_video.mp4')).toBe('my awesome video');
    expect(cleanVideoTitle('video-clip-1080p.mkv')).toBe('video clip 1080p');
    expect(cleanVideoTitle('sample.webm')).toBe('sample');
  });

  it('normalizes local video URIs', () => {
    expect(normalizeLocalVideoUri('/sdcard/Download/song.mp4')).toBe('file:///sdcard/Download/song.mp4');
    expect(normalizeLocalVideoUri('file:///storage/emulated/0/Movies/clip.mp4')).toBe('file:///storage/emulated/0/Movies/clip.mp4');
    expect(normalizeLocalVideoUri('content://media/external/video/123')).toBe('content://media/external/video/123');
    expect(normalizeLocalVideoUri('https://example.com/video.mp4')).toBe('https://example.com/video.mp4');
    expect(normalizeLocalVideoUri('')).toBe('');
  });

  it('creates local video item from path or uri', () => {
    const item = createLocalVideoItem('/sdcard/Download/my_video.mp4');
    expect(item.id).toBe('local-custom-file:///sdcard/Download/my_video.mp4');
    expect(item.title).toBe('my video');
    expect(item.source.kind).toBe('local');
    if (item.source.kind === 'local') {
      expect(item.source.uri).toBe('file:///sdcard/Download/my_video.mp4');
    }
  });

  it('combines local storage videos, param video, catalog videos and bundled local video items', () => {
    const localVideo: VideoItem = {
      id: 'local-1',
      title: 'Local Test',
      description: 'Device storage',
      source: { kind: 'local', uri: 'file:///sdcard/test.mp4' },
    };
    const catalogVideo: VideoItem = {
      id: 'catalog-1',
      title: 'Catalog Video',
      description: 'Aadat Studio',
      source: { kind: 'catalog', trackId: '123', attribution: 'Studio' },
    };

    const all = getAllAvailableVideos([catalogVideo], [localVideo], null, true);
    // Expect local video, catalog video, and bundled VIDEO_ITEMS (motion-test, colour-test)
    expect(all.some((v) => v.id === 'local-1')).toBe(true);
    expect(all.some((v) => v.id === 'catalog-1')).toBe(true);
    expect(all.some((v) => v.id === 'motion-test')).toBe(true);
    expect(all.some((v) => v.id === 'colour-test')).toBe(true);
    expect(all.length).toBeGreaterThanOrEqual(4);
  });

  it('prioritizes param video at the front of the queue', () => {
    const paramVideo: VideoItem = {
      id: 'param-vid',
      title: 'Selected Video',
      description: 'Param description',
      source: { kind: 'local', uri: 'file:///path/to/vid.mp4' },
    };
    const all = getAllAvailableVideos([], [], paramVideo);
    expect(all[0]?.id).toBe('param-vid');
  });
});
