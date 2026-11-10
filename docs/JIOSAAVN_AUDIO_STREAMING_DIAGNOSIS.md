# Real JioSaavn audio diagnosis — upstream streaming FAIL

6 November 2026, Asia/Calcutta. **Verified playable tracks: none. Streaming remains FAIL.** The adapter gaps below are fixed and locally verified; no claim of audible playback or working source is made.

## Exact failure boundary

The v3 API's `media_urls.320_KBPS` value was passed through the pre-fix adapter **byte-for-byte unchanged for all three real tracks**. Direct HTTPS GETs to the raw returned strings bypassed Aadat Music, its GraphQL server, caches and TrackPlayer entirely. Every tested audio URL returned **HTTP 404**, not a redirect. This establishes the failing HTTP boundary outside our adapter/player. The upstream's internal reason for that 404 is not established; missing objects, invalid generation and opaque provider policy cannot be distinguished from these empty responses.

| Real returned track | Provider ID | Direct bounded GET 96 | GET 160/default | GET 320 | Audio bytes |
| --- | --- | --- | --- | --- | --- |
| Aadat — Ninja | iYMcgidY | 404 | 404 | 404 | 0 |
| Rain — DIVINE | 8taj1DCo | 404 | 404 | 404 | 0 |
| Happy — Karthik | 46An-G70 | 404 | 404 | 404 | 0 |
| Aadat — same ID, album endpoint's different URLs | iYMcgidY | 404 | 404 | 404 | 0 |

**12 bounded audio GET checks, 12 HTTP 404s, zero audio bytes received/inspected, no audio files saved.** Each successful body would have been limited to 1 KiB inspection and immediately cancelled; none arrived. Requests used only exact API-supplied HTTPS URLs, not constructed quality suffixes, renamed extensions, alternate CDN hosts, decryption, cookies, forged referrers or authentication workarounds.

Content-Type was application/octet-stream, no Content-Range and no Location were returned. A separate header control had Content-Length 0 and no WWW-Authenticate/expiry header. These responses cannot establish codec decoding, seek/range support or Android playback for a working file.

## Supported lookups, extraction, encoding and expiration

The current [v3 Swagger](https://jiosaavn-api-v3.vercel.app/docs/) documents `/search?query=…`, `/song?id=…&lyrics=…`, `/link?link=…&lyrics=…`, `/albumsearch?query=…`, `/album?id=…`, and `/lyrics?id=…`. It documents no separate stream endpoint or quality parameter. Its response specification does not promise source expiration. Lyrics were not fetched.

Actual song JSON contains `media_url` and `media_urls` with `96_KBPS`, `160_KBPS`, `320_KBPS`. In the observed records `media_url` equals the 160-kbps entry. Extraction uses those fields only. IDs and documented lookup parameters are encoded using URLSearchParams; returned audio URLs are not URI-component encoded, HTML-decoded, rebuilt or assigned an extension.

- Raw selected URL equals adapter-selected URL for all three tracks before and after the patch. Encoding/normalization did **not** cause the observed 404s.
- All three qualities fail direct GET, so selecting 160/96 instead of 320 cannot fix these tested sources.
- `/album` returns metadata successfully and supplies different URLs for the same Aadat song; those also fail at all three qualities.
- `/link`, using the provider's own returned permalink, returned HTTP 500 with `Cannot read properties of undefined (reading 'media_preview_url')`, cache MISS. Initial song lookups also intermittently returned 500; subsequent cache hits returned metadata. This is an upstream lookup failure, not an Aadat parse exception.
- Observed song metadata had Vercel cache HIT and Age approximately 3,400–4,400 seconds. Standard Cache-Control:no-cache requests still received aged HIT responses. A local forced refresh cannot guarantee origin regeneration when the provider does not honor revalidation.
- No explicit expiry field or expiry query parameter was provided. Expiration is **unknown**; the cache age does not prove that expiration caused the 404. The existing null expiry and separate 120-second client refresh policy remain unchanged.

See [HTTP/URL fingerprints and exact-selection comparisons](evidence/jiosaavn-streaming/trace-controls.json), [documented endpoint controls](evidence/jiosaavn-streaming/metadata-controls.json), [album-source control](evidence/jiosaavn-streaming/album-stream-control.json) and [post-fix verification](evidence/jiosaavn-streaming/post-fix.json). Exact opaque URI strings and raw responses are retained privately under `/tmp/aadat-stream-fix/` (0600 files), including `exact-raw-urls.json`; public evidence uses SHA-256 URL fingerprints rather than copying potential bearer-capability URLs.

## Verified adapter fixes

1. **Missing 96-kbps fallback:** the previous v3 parser only selected 320, 160 or media_url. A valid 96-only response produced no audioUrl. It now selects the supplied validated HTTPS sources in order 320 → 160 → 96 → default. This repairs a documented-field handling gap, not the current CDN failure. There is no live playable 96-only result being claimed.
2. **Forced renewal joining ordinary requests:** the previous pending-request map keyed only by URL, so a forced renewal could reuse an ordinary in-flight lookup. Forced and ordinary work are now separated; ordinary reads may join a forced renewal, while forced reads never join an older ordinary request.
3. **Late-response cache regression:** an older ordinary response could finish after a newer forced lookup and overwrite the refreshed source cache. Bounded request generations prevent that overwrite. Simultaneous forced lookups still coalesce, and a failed forced refresh never silently returns old source data as a successful renewal.
4. **Opaque URL and revalidation handling:** URLs are strictly validated and then preserved as supplied, instead of serializing them through URL.toString. Whitespace/backslashes, malformed percent escapes, credentials and insecure sources are rejected. Forced renewal sends standard Cache-Control:no-cache over the same approved endpoint, with redirects still rejected. This asks for revalidation; it does not bypass restrictions or promise that the remote cache complies.

No speculative TrackPlayer queue/transport rewrite or automatic rotation through broken URLs was added. The observed sources fail even without TrackPlayer. Existing playback, catalog IDs, collections, Warehouse and recommendation code remain intact.

## Changed files and verification

- [Original/shared provider adapter](../server/src/infrastructure/music-provider/implementations/jiosaavn-music-provider.service.ts): exact URI preservation, strict validation, forced-request isolation, cache-generation ordering and revalidation header.
- [v3 adapter](../server/src/infrastructure/music-provider/implementations/jiosaavn-v3-music-provider.service.ts): supplied 96-kbps fallback.
- [New regression tests](../server/src/infrastructure/music-provider/__tests__/stream-url-handling.test.ts): 13 cases for source selection, encoding, unsafe values, refresh races/coalescing and upstream failure.

**PASS:** TypeScript in four workspaces; **584 tests passed, 3 live-database tests skipped**; production Metro **2,932 modules / 29 assets**; Hermes bytecode compilation. Test URI vectors are explicitly test-only and never fetched. Unit PASS does not represent successful streaming.

Hash checks preserve library/store code, owned S3/storage code, Prisma schema, environment/configuration, all four icon assets, entry point, Metro configuration and lockfile. No database operation, cloud/S3 modification, Git command, EAS/native build, app install or app launch occurred.

## Remaining blocker and smallest safe next action

The v3 provider owner needs to return working authorized audio sources and repair the failing permalink lookup/cache behavior, or the user must approve another provider with verified source access. This task does not authorize a provider switch, media copying or infrastructure changes. The supplied track IDs, source fingerprints, HTTP results and cache headers form a concrete maintainer reproduction.

After a valid source is supplied, repeat authorized bounded checks and require actual audio bytes with a valid media signature before marking source accessibility PASS. Android audible output, seeking and background/notification acceptance require the separately approved app build/install and real account/backend prerequisites. **No track is declared playable from metadata alone.**
