import { ReelMatchStatus } from '../enums/catalog.enums.js';
import { TrackDto } from './catalog.dto.js';

export interface IngestInstaMusRequestDto {
  reelUrl: string;
  isPrivate?: boolean;
}

export interface InstaMusIngestResponseDto {
  reelId: string;
  reelUrl: string;
  status: ReelMatchStatus;
  confidenceScore: number | null;
  matchedTrack: TrackDto | null;
  /** Fallback extracted metadata to prefill manual search modal if unmatched */
  fallbackMeta: {
    extractedTitle?: string;
    extractedArtist?: string;
    captionKeywords?: string[];
  } | null;
  errorMessage: string | null;
  requiresManualSearch: boolean;
}

