import { Track as TrackPlayerTrack } from 'react-native-track-player';

/**
 * Interface representing a playable track in the mobile player
 */
export interface IPlayableTrack extends TrackPlayerTrack {
  id: string;
  url: string;
  title: string;
  artist: string;
  artwork: string;
  duration: number;
  album?: string;
  sourceLabel?:string;
  developmentOnly?:boolean;
  catalogSource?: 'catalog' | 'local';
  catalogVideo?: boolean;
  attribution?: string;
  releaseYear?: number;
}

/**
 * Curated, authorized royalty-free sample tracks for development and verification.
 * Sources: Free public domain & Creative Commons test media (archive.org & Wikimedia Commons).
 */
export const SAMPLE_TRACKS: readonly IPlayableTrack[] = [
  {
    id: 'sample-track-1',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    title: 'SoundHelix Ambience 1',
    artist: 'Aadat Studio Ensemble',
    album: 'Atmospheric Waves Vol. 1',
    artwork: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
    duration: 372,
  },
  {
    id: 'sample-track-2',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    title: 'SoundHelix Reverie 2',
    artist: 'Kobra Pulse Collective',
    album: 'Atmospheric Waves Vol. 1',
    artwork: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80',
    duration: 423,
  },
  {
    id: 'sample-track-3',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    title: 'SoundHelix Cadence 3',
    artist: 'Deep Spatial Project',
    album: 'Harmonic Horizons',
    artwork: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=800&auto=format&fit=crop&q=80',
    duration: 345,
  },
] as const;

