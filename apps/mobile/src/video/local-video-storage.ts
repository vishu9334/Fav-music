import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import type { VideoItem } from './video.contract';
import { VIDEO_ITEMS } from './video-catalog';

const SUPPORTED_VIDEO_EXTENSIONS = new Set(['.mp4', '.m4v', '.webm', '.mov', '.mkv', '.3gp']);

export function cleanVideoTitle(filename: string): string {
  const base = filename.split('?')[0]?.split('#')[0] ?? filename;
  return base
    .replace(/\.[^/.]+$/, '') // remove extension
    .replace(/[\[\(].*?(pagalworld|bolly4u|hd|720p|1080p|4k|web-dl|dual audio).*?[\]\)]/gi, '') // remove common rip tags
    .replace(/-(pagalworld|bolly4u)\S*/gi, '')
    .replace(/\.video\b/gi, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeLocalVideoUri(pathOrUri: string): string {
  const trimmed = pathOrUri.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('file://') || trimmed.startsWith('content://') || trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) {
    return `file://${trimmed}`;
  }
  return `file://${trimmed}`;
}

export function createLocalVideoItem(pathOrUri: string, customTitle?: string, posterUri?: string): VideoItem {
  const uri = normalizeLocalVideoUri(pathOrUri);
  const rawName = uri.split('/').pop() || 'local_video.mp4';
  const cleanName = cleanVideoTitle(rawName);
  return {
    id: `local-custom-${uri}`,
    title: customTitle?.trim() || cleanName || 'Local Video',
    description: 'Device storage video',
    poster: posterUri ? { uri: posterUri } : undefined,
    source: {
      kind: 'local',
      uri,
      attribution: 'Local device storage',
      resolution: 'Local file',
    },
  };
}

function safeAssetRequire(loader: () => number, fallback: number): number {
  try {
    return loader();
  } catch {
    return fallback;
  }
}

/**
 * Scans and automatically fetches local downloaded videos from device storage.
 * Uses Android native MediaStore & public directories first, falling back to app storage.
 */
export async function getLocalStorageVideos(): Promise<readonly VideoItem[]> {
  const results: VideoItem[] = [];
  const seenUris = new Set<string>();

  // Request Android runtime media permission if needed
  if (Platform.OS === 'android') {
    try {
      const version = Number(Platform.Version) || 0;
      const perm = version >= 33
        ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO
        : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
      if (perm) {
        const has = await PermissionsAndroid.check(perm);
        if (!has) {
          await PermissionsAndroid.request(perm, {
            title: 'Fav Music Video Access',
            message: 'Fav Music needs access to your downloaded videos to play them offline.',
            buttonPositive: 'Allow',
            buttonNegative: 'Cancel',
          });
        }
      }
    } catch (e) {
      console.warn('[VideoStorage] Permission request issue:', e);
    }
  }

  // 1. Automatic Native MediaStore & Downloads detection on Android
  try {
    const aadatMedia = NativeModules.AadatMedia;
    if (aadatMedia && typeof aadatMedia.getLocalVideos === 'function') {
      const nativeItems: Array<{
        id: string;
        title: string;
        filename: string;
        uri: string;
        filePath?: string;
        duration?: number;
        size?: number;
        description?: string;
        thumbnailUri?: string;
      }> = await aadatMedia.getLocalVideos();

      for (const item of nativeItems) {
        if (item.uri && !seenUris.has(item.uri)) {
          seenUris.add(item.uri);
          if (item.filePath) seenUris.add(item.filePath);
          const poster = item.thumbnailUri ? { uri: item.thumbnailUri } : undefined;
          results.push({
            id: item.id || `native-${item.uri}`,
            title: cleanVideoTitle(item.title || item.filename || 'Downloaded Video'),
            description: item.description || 'Downloaded video',
            poster,
            source: {
              kind: 'local',
              uri: item.uri,
              attribution: 'My files',
              resolution: item.description ? item.description.split(' · ')[0] : 'Local',
            },
          });
        }
      }
    }
  } catch {
    // Native module unavailable or failed
  }

  // 2. If native module found real user device videos, return them directly
  if (results.length > 0) {
    return results;
  }

  // 3. Fallback: Scan internal app document storage (useful for tests and emulators without media)
  try {
    const fs = await import('expo-file-system');

    const scanDir = async (dirUri: string, dirLabel: string) => {
      try {
        const info = await fs.getInfoAsync(dirUri);
        if (!info.exists || !info.isDirectory) return;
        const files = await fs.readDirectoryAsync(dirUri);
        for (const file of files) {
          const ext = file.slice(file.lastIndexOf('.')).toLowerCase();
          if (SUPPORTED_VIDEO_EXTENSIONS.has(ext)) {
            const uri = `${dirUri.endsWith('/') ? dirUri : dirUri + '/'}${file}`;
            if (!seenUris.has(uri)) {
              seenUris.add(uri);
              results.push({
                id: `local-file-${file}`,
                title: cleanVideoTitle(file),
                description: dirLabel,
                source: {
                  kind: 'local',
                  uri,
                  attribution: 'My files',
                },
              });
            }
          }
        }
      } catch {}
    };

    if (fs.documentDirectory) {
      const videosSubdir = `${fs.documentDirectory}videos/`;
      try {
        const subInfo = await fs.getInfoAsync(videosSubdir);
        if (!subInfo.exists) {
          await fs.makeDirectoryAsync(videosSubdir, { intermediates: true }).catch(() => {});
        }
        // If no user videos found yet, unpack bundled sample clips to app storage
        if (results.length === 0) {
          try {
            const { Asset } = await import('expo-asset');
            const bundled = [
              { name: 'colour-test.mp4', mod: safeAssetRequire(() => require('../../assets/video/colour-test.mp4'), 1) },
              { name: 'motion-test.mp4', mod: safeAssetRequire(() => require('../../assets/video/motion-test.mp4'), 2) },
            ];
            for (const b of bundled) {
              try {
                const destFile = `${videosSubdir}${b.name}`;
                const check = await fs.getInfoAsync(destFile);
                if (!check.exists) {
                  const asset = Asset.fromModule(b.mod);
                  await asset.downloadAsync();
                  if (asset.localUri) {
                    await fs.copyAsync({ from: asset.localUri, to: destFile });
                  }
                }
              } catch {}
            }
          } catch {}
        }
      } catch {}
      await scanDir(videosSubdir, 'Local app storage');
      await scanDir(fs.documentDirectory, 'App document storage');
    }

    if (fs.cacheDirectory) {
      await scanDir(`${fs.cacheDirectory}videos/`, 'Cached local video');
    }
  } catch {}

  return results;
}

/**
 * Combines all available videos:
 * Returns ONLY downloaded / device local storage videos (as requested: "not online video dowloaded video my file that video only").
 */
export function getAllAvailableVideos(
  catalogVideos: readonly VideoItem[] = [],
  localStorageVideos: readonly VideoItem[] = [],
  paramVideo?: VideoItem | null,
  includeBundled = false,
): readonly VideoItem[] {
  const result: VideoItem[] = [];
  const seenIds = new Set<string>();
  const seenUris = new Set<string>();

  const add = (item: VideoItem) => {
    const uri = item.source.kind === 'local' || item.source.kind === 'https' ? item.source.uri : undefined;
    if (seenIds.has(item.id)) return;
    if (uri && seenUris.has(uri)) return;
    seenIds.add(item.id);
    if (uri) seenUris.add(uri);
    result.push(item);
  };

  if (paramVideo) {
    add(paramVideo);
  }

  // Add local device videos
  for (const item of localStorageVideos) {
    add(item);
  }

  // Add catalog videos if provided
  for (const item of catalogVideos) {
    add(item);
  }

  // Include bundled test items if explicitly requested
  if (includeBundled) {
    for (const item of VIDEO_ITEMS) {
      add(item);
    }
  }

  return result;
}

export interface AudioTrackInfo {
  index: number;
  id: string;
  language: string;
  label: string;
  selected: boolean;
}

export async function setNativeScreenBrightness(brightness: number): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const aadatMedia = NativeModules.AadatMedia;
    if (aadatMedia && typeof aadatMedia.setScreenBrightness === 'function') {
      return await aadatMedia.setScreenBrightness(brightness);
    }
  } catch {}
  return false;
}

export async function getNativeScreenBrightness(): Promise<number> {
  if (Platform.OS !== 'android') return 0.5;
  try {
    const aadatMedia = NativeModules.AadatMedia;
    if (aadatMedia && typeof aadatMedia.getScreenBrightness === 'function') {
      return await aadatMedia.getScreenBrightness();
    }
  } catch {}
  return 0.5;
}

export async function setNativeSystemVolume(volumeFraction: number): Promise<number> {
  if (Platform.OS !== 'android') return volumeFraction;
  try {
    const aadatMedia = NativeModules.AadatMedia;
    if (aadatMedia && typeof aadatMedia.setSystemVolume === 'function') {
      return await aadatMedia.setSystemVolume(volumeFraction);
    }
  } catch {}
  return volumeFraction;
}

export async function getNativeSystemVolume(): Promise<number> {
  if (Platform.OS !== 'android') return 0.5;
  try {
    const aadatMedia = NativeModules.AadatMedia;
    if (aadatMedia && typeof aadatMedia.getSystemVolume === 'function') {
      return await aadatMedia.getSystemVolume();
    }
  } catch {}
  return 0.5;
}

export async function getVideoAudioTracks(uri: string): Promise<AudioTrackInfo[]> {
  if (Platform.OS !== 'android') return [];
  try {
    const aadatMedia = NativeModules.AadatMedia;
    if (aadatMedia && typeof aadatMedia.getVideoAudioTracks === 'function') {
      return await aadatMedia.getVideoAudioTracks(uri);
    }
  } catch {}
  return [];
}

export async function switchVideoAudioTrack(language: string, index: number): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const aadatMedia = NativeModules.AadatMedia;
    if (aadatMedia && typeof aadatMedia.switchAudioTrack === 'function') {
      return await aadatMedia.switchAudioTrack(language, index);
    }
  } catch {}
  return false;
}

export async function getVideoThumbnail(uri: string): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const aadatMedia = NativeModules.AadatMedia;
    if (aadatMedia && typeof aadatMedia.getVideoThumbnail === 'function') {
      return await aadatMedia.getVideoThumbnail(uri);
    }
  } catch {}
  return null;
}
