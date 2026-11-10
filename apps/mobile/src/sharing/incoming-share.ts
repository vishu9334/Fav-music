import {normalizeReelUrl} from '../discovery/instagram-link';

export interface IncomingReelShare {
  reelUrl: string;
  metadata?: string;
}

/**
 * Validates and extracts an Instagram Reel URL and any accompanying shared metadata.
 * - Extracts HTTPS instagram.com/reel/<id>/ canonical link.
 * - Extracts clean song title, artist, or note up to 160 chars from shared text.
 * - Rejects arbitrary links, credential leaks, and oversized input.
 */
export function incomingReelShare(text: unknown): IncomingReelShare | null {
  if (typeof text !== 'string' || text.length > 4096) return null;
  const links = text.match(/https:\/\/(?:www\.|m\.)?instagram\.com\/reels?\/[A-Za-z0-9_-]+\/?(?:\?[^\s<>]*)?/gi) ?? [];
  if (links.length !== 1) return null;
  try {
    const reelUrl = normalizeReelUrl(links[0]!);
    const rawRemainder = text.replace(links[0]!, '').trim();
    if (/https?:\/\//i.test(rawRemainder)) return null;

    const cleaned = rawRemainder
      .replace(/^(?:watch|listen to|check out|see)?\s*(?:this)?\s*(?:reel|video|post)?\s*(?:by|from)?\s*[:\-]?\s*/i, '')
      .replace(/[#@][A-Za-z0-9_.]+/g, '')
      .replace(/^[\s:\-]+|[\s:\-]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const metadata = cleaned.length > 0 && cleaned.length <= 160 ? cleaned : undefined;
    return { reelUrl, metadata };
  } catch {
    return null;
  }
}

/** No extraction, automatic save or credential-bearing arbitrary URL navigation. */
export function incomingReel(text:unknown):string|null{
  const share = incomingReelShare(text);
  return share ? share.reelUrl : null;
}

/** Accept one exact track reference from a text share; never navigate a supplied URL. */
export function incomingTrackPayload(text: unknown, parse: (payload: string) => { type: string }): string | null {
  if (typeof text !== 'string' || text.length > 8192) return null;
  const links = text.match(/aadatmusic:\/\/\/shared\?payload=[^\s<>"']+/g) ?? [];
  if (links.length !== 1) return null;
  try {
    const payload = decodeURIComponent(links[0]!.split('?payload=')[1]!);
    return parse(payload).type === 'track' ? payload : null;
  } catch { return null; }
}
