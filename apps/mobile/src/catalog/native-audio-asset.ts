/** RN's Android asset resolver returns a raw resource name in a release APK. */
export function nativeAudioAssetUri(uri: string, platform: string): string {
  if (!uri) throw new Error('This bundled audio asset could not be resolved.');
  if (platform === 'android' && /^[a-z0-9_]+$/.test(uri)) return `android.resource://com.favmusic/raw/${uri}`;
  return uri; // Metro HTTPS/HTTP, file URLs and other platforms already supply a full URI.
}
