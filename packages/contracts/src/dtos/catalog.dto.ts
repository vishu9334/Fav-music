import { SeasonAffinity, TimeAffinity, WeatherAffinity } from '../enums/catalog.enums.js';

export interface TrackDto {
  id: string;
  title: string;
  artistName: string;
  albumName: string | null;
  durationSeconds: number;
  
  // Storage Keys
  audioKey: string;
  videoKey: string | null;
  artworkKey: string;
  
  // Transient Presigned URLs (generated on demand, never persisted)
  audioPlaybackUrl?: string;
  videoPlaybackUrl?: string;
  artworkUrl?: string;
  
  // Contextual Tags
  timeAffinities: TimeAffinity[];
  weatherAffinities: WeatherAffinity[];
  seasonAffinities: SeasonAffinity[];
  energyScore: number;
  tempoBpm: number | null;
  
  createdAt: string;
}

export interface SeasonalCollectionDto {
  id: string;
  name: string;
  seasonTag: SeasonAffinity;
  weatherTag: WeatherAffinity | null;
  tracks: TrackDto[];
  isCustomized: boolean;
}

