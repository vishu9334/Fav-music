import { IPlayableTrack } from '../data/sample-tracks';
import { nativeAudioAssetUri } from './native-audio-asset';
export const OFFLINE_TRACKS: readonly IPlayableTrack[] = [
  { id: 'local-audio-motion', title: 'Offline motion tone', artist: 'Aadat test media', album: 'Original technical samples', duration: 8, artwork: '', url: '', catalogSource: 'local' },
  { id: 'local-audio-colour', title: 'Offline colour tone', artist: 'Aadat test media', album: 'Original technical samples', duration: 6, artwork: '', url: '', catalogSource: 'local' },
];
export async function resolveOfflineTrack(track: IPlayableTrack): Promise<IPlayableTrack> {
  const { Image, Platform } = await import('react-native');
  if (track.id === 'local-audio-motion') return { ...track, url: nativeAudioAssetUri(Image.resolveAssetSource(require('../../assets/audio/motion-tone.m4a')).uri, Platform.OS), artwork: Image.resolveAssetSource(require('../../assets/video/motion-test.jpg')).uri };
  if (track.id === 'local-audio-colour') return { ...track, url: nativeAudioAssetUri(Image.resolveAssetSource(require('../../assets/audio/colour-tone.m4a')).uri, Platform.OS), artwork: Image.resolveAssetSource(require('../../assets/video/colour-test.jpg')).uri };
  throw new Error('This local sample is unavailable.');
}
