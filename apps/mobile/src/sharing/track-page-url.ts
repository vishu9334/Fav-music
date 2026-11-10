/** Human-readable public page only. Never share playback leases, secrets or a homepage. */
export function publicTrackPageUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\\u0000-\u001f\u007f<>"`]/.test(value) || /%(?![0-9a-f]{2})/i.test(value)) throw new Error('This song has no valid public track link.');
  const match = /^https:\/\/((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})(?::443)?(\/[^#]*)$/i.exec(value);
  if (!match) throw new Error('This song has no valid public track link.');
  const host = match[1]!.toLowerCase(), pathAndQuery = match[2]!;
  if (/\.(?:invalid|test|example|localhost|local|internal)$/.test(host)) throw new Error('This song has no public track link.');
  let decoded: string;
  try { decoded = decodeURIComponent(pathAndQuery); } catch { throw new Error('This song link is invalid.'); }
  const path = decoded.split('?')[0]!;
  if (!path.replace(/[/.]/g, '') || /(?:^|\/)\.{1,2}(?:\/|$)|\.(?:mp3|mp4|m4a|aac|ogg|wav|flac|m3u8|mpd)$/i.test(path)
    || /[\u0000-\u001f\u007f\\]/.test(decoded)
    || /[?&](?:access_token|token|key|api_key|secret|signature|sig|policy|credential|session|authorization|expires|x-amz-[^=&#]*|x-goog-[^=&#]*)=/i.test(decoded)) throw new Error('A public song page is required; playback URLs cannot be shared.');
  return value;
}
