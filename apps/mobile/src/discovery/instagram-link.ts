/** Normalize pasted reel links only. No network requests, recognition or media extraction. */
export function normalizeReelUrl(input: string): string {
  if (input.length > 2048) throw new Error('This reel link is too long.');
  if (/[\u0000-\u001f\u007f]/.test(input)) throw new Error('This reel link contains invalid characters.');
  // RN 0.76's built-in URL has unimplemented hostname/protocol accessors.
  // A deliberately narrow grammar avoids a new polyfill and ambiguous origins.
  const match = /^https:\/\/(?:www\.|m\.)?instagram\.com\/reels?\/([A-Za-z0-9_-]{1,100})\/?(?:[?#][^\s\\]*)?$/i.exec(input.trim());
  if (!match) throw new Error('Use an HTTPS instagram.com link to an individual reel.');
  return `https://www.instagram.com/reel/${match[1]}/`;
}
