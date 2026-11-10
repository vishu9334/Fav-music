import type { ImageSourcePropType } from 'react-native';
import { PlaybackState } from '@aadat/contracts';

export type AuthorizedVideoSource = { readonly kind: 'asset'; readonly asset: number }
  | { readonly kind: 'https'; readonly uri: string; readonly attribution: string }
  | { readonly kind: 'catalog'; readonly trackId: string; readonly attribution: string }
  | { readonly kind: 'local'; readonly uri: string; readonly resolution?: string; readonly attribution?: string };
export interface VideoItem {
  readonly id: string; readonly title: string; readonly description: string;
  readonly source: AuthorizedVideoSource; readonly poster?: ImageSourcePropType;
}
export interface VideoSnapshot {
  readonly status: 'idle' | 'loading' | 'ready' | 'error'; readonly playing: boolean;
  readonly position: number; readonly duration: number; readonly buffered: number;
  readonly error?: string;
  readonly ended?: boolean;
}
export interface IVideoEngine {
  snapshot(): VideoSnapshot;
  subscribe(changed: () => void): () => void;
  load(source: AuthorizedVideoSource): Promise<void>;
  play(): Promise<void>;
  pauseAndConfirm(): Promise<void>;
  seek(seconds: number): Promise<void>;
  setPlaybackRate?(rate: number): void;
  setVolume?(volume: number): void;
  dispose(): void;
}
export interface VideoPlayerState {
  readonly index: number; readonly playbackState: PlaybackState;
  readonly position: number; readonly duration: number; readonly buffered: number;
  readonly error: string | null; readonly busy: boolean;
}

/** URL syntax is validated here; rights approval remains the catalog provider's responsibility. */
export function authorizedStream(uri: string, attribution: string): Extract<AuthorizedVideoSource, { kind: 'https' }> {
  if (uri.length > 8192 || /[\s\\\u0000-\u001f\u007f<>"`]/.test(uri)
    || !/^https:\/\/(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}(?::443)?\/[^\s]*$/.test(uri)
    || !attribution.trim()) throw new Error('An authorized HTTPS video source and attribution are required.');
  return { kind: 'https', uri, attribution: attribution.trim() };
}

/** Local storage video source with optional resolution (e.g. 1080p, 720p, 480p). */
export function localVideoSource(uri: string, resolution?: string, attribution = 'Local Video'): Extract<AuthorizedVideoSource, { kind: 'local' }> {
  if (!uri || !uri.trim()) throw new Error('A valid local video path or URI is required.');
  return { kind: 'local', uri: uri.trim(), resolution, attribution };
}
