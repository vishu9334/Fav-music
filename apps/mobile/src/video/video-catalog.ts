import { VideoItem } from './video.contract';

function loadAsset(loader: () => number, fallback: number): number {
  try {
    return loader();
  } catch {
    return fallback;
  }
}

// Original generated test patterns and synthetic tones; no third-party footage/music.
export const VIDEO_ITEMS: readonly VideoItem[] = [
  { id: 'motion-test', title: 'Motion & sound test', description: 'Original 8-second moving test pattern · synthetic 440 Hz tone · local sample',
    source: { kind: 'asset', asset: loadAsset(() => require('../../assets/video/motion-test.mp4'), 1) },
    poster: loadAsset(() => require('../../assets/video/motion-test.jpg'), 2) },
  { id: 'colour-test', title: 'Colour & sound test', description: 'Original 6-second colour bars · synthetic 660 Hz tone · local sample',
    source: { kind: 'asset', asset: loadAsset(() => require('../../assets/video/colour-test.mp4'), 3) },
    poster: loadAsset(() => require('../../assets/video/colour-test.jpg'), 4) },
];
