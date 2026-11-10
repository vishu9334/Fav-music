# Bycom development provider switch — bounded stream access PASS

6 November 2026. The user authorized evaluation and switching if actual audio bytes were accessible. **The local development provider is now `https://saavn.bycomsolutions.com/api`, using `MUSIC_PROVIDER=jiosaavn-development`.** This reuses `JioSaavnMusicProviderService` behind the existing `IMusicProviderService` interface and authenticated catalog GraphQL APIs. The failed V3 adapter and all its stream-handling fixes remain available and unchanged.

**PASS applies to live HTTP metadata/audio access and local software verification. Android audible playback, decoding, seek, notification controls and background playback have not been tested with this provider.** No APK was built, installed or launched. No Git command, database operation, S3 operation or cloud infrastructure change was performed.

## Exact live audio evidence

These are the exact HTTPS `downloadUrl[].url` values returned by the evaluated API; no hostname, path, quality suffix, signature or encoding was reconstructed. Each request used `Range: bytes=0-1023`, a timeout and no redirect following. All nine responses were **206**, `Content-Type: audio/mp4`, and `Content-Range: bytes 0-1023/<file size>`. Each first chunk was exactly 1,024 bytes; all bodies were cancelled. All contained the ISO-BMFF `ftyp` header. **9,216 bytes inspected in total, zero audio files saved.** This verifies access to the audio-file body/container, not full-file integrity or successful decoding.

| Real returned song | Native ID | 96 kbps | 160 kbps | 320 kbps |
| --- | --- | --- | --- | --- |
| Believer — Imagine Dragons | BeXBcbVK | 206 / 1,024 bytes | 206 / 1,024 bytes | 206 / 1,024 bytes |
| Levitating — Dua Lipa | 3IoDK8qI | 206 / 1,024 bytes | 206 / 1,024 bytes | 206 / 1,024 bytes |
| Enemy (from the series Arcane League of Legends) — Jid, Imagine Dragons, Arcane, League of Legends | drvhW8ob | 206 / 1,024 bytes | 206 / 1,024 bytes | 206 / 1,024 bytes |

[Exact statuses, content ranges, container headers and URL SHA-256 fingerprints](evidence/jiosaavn-bycom/audio.json). Public evidence omits opaque source URLs; original metadata is retained under `/tmp/aadat-provider-eval/` in mode-0600 files. No stream is called audibly verified.

## Actual endpoint and catalog coverage

The [service identifies itself as an unofficial API](https://saavn.bycomsolutions.com/). Its live `/swagger` returned OpenAPI 3.1 definitions. Ordinary JSON requests succeeded without credentials or access-control workarounds. The earlier Cloudflare denial and V3 failures are historical results and are retained in their reports.

| Operation | Observed response | Status |
| --- | --- | --- |
| Exact supplied `/api/search/songs?query=Believer&page=0&limit=10` | 200; 10 songs; provider total 13,263; invalid negative start -9 | Metadata PASS; use corrected one-based search paging below |
| Exact supplied `/api/songs?ids=3IoDK8qI,4IoDK8qI,5IoDK8qI` | 200; **one** song, Levitating (3IoDK8qI) | Partial: 4IoDK8qI and 5IoDK8qI absent; no replacements invented |
| Exact supplied `/api/songs/yDeAS8Eh/suggestions?limit=10` | 200; 10 songs, including Enemy | Metadata PASS; only Enemy's audio was probed |
| Album search / Believer | 200; 10 results | PASS |
| Album detail / 13435951 | 200; Evolve, 12 songs | PASS |
| Artist search / Imagine Dragons | 200; 10 results; provider total 27 | PASS |
| Artist detail / 599452 | 200; Imagine Dragons and top songs | PASS |
| Artist songs / 599452, pages 0 and 1 | 200; ten songs per page, no overlapping IDs; provider total 1,191 | PASS for tested windows |
| Artist albums / 599452 | 200; ten albums, provider total 21 | Metadata PASS; dedicated artist-album browsing is not exposed separately by the current app interface |
| Playlist search / Believer | 200; zero results | Valid empty result |
| Playlist search / Workout | 200; ten results, provider total 69 | PASS |
| Playlist / 156710699 | 200; Bollywood Rock - Workout Mix; pages 1/2/3 return 10/10/7 songs; first two pages have distinct IDs | PASS; corrected pagination reaches final seven songs |
| Playlist / 82914609 | 200; Best of Indie - English; pages 0 and 1 repeat, page 2 continues | PASS with one-based paging; reported songCount is only current page length |
| Single song /api/songs/BeXBcbVK | 200; matching Believer identity | PASS |
| Real adapter → canonical catalog projection | Believer, Happy, Rain: ten songs each; subsequent Believer page distinct; album/artist/playlist browsing succeeds | PASS |
| Canonical catalog → refreshed AUDIO lease | Believer URI equals exact returned 320-kbps URI; fingerprint matches successful bounded probe | PASS |

This is sampled accessible coverage, **not a bulk export, complete JioSaavn inventory or availability guarantee**. Search totals and release years are provider-reported. Thirty normalized songs are retained as metadata-only test fixtures. Six canonical IDs overlap the earlier V3 captured windows without changing identity. Playback was bounded-probed only for the three named songs at three qualities, not every returned track or artwork image.

Swagger also lists global search, artist lookup by query parameters and other resource routes. Unprobed operations are documented capabilities, not verified working endpoints. No video or music recognition capability is advertised by Aadat for this provider.

[Initial endpoint checks](evidence/jiosaavn-bycom/http.json), [collection checks](evidence/jiosaavn-bycom/extra-http.json), [paging checks](evidence/jiosaavn-bycom/paging-http.json), [final playlist checks](evidence/jiosaavn-bycom/end-http.json), [live adapter/catalog results](evidence/jiosaavn-bycom/adapter.json).

## Implemented changes and preservation

- Updated only two public settings in `server/.env` (root `.env` is its existing symlink): API base URL and adapter mode. Kept the existing discovery query. A reverse-change SHA-256 comparison confirms every other environment byte is unchanged. Added the development adapter flag to both `.env.example` files. Neither authentication nor mobile catalog safety gates were enabled.
- Normalized zero-based app search/resource cursors to the server's one-based search pages. Corrected last-page detection to avoid treating the one-based `start` as a zero-based offset.
- Normalized playlist pages similarly. Kept playlist total `null`, because observed `songCount` equals current page size; continue full pages and stop on short/empty pages. The actual 27-song playlist now reaches its last seven tracks.
- Replaced artist top-ten-only collection lookup with the documented zero-based ten-song `/artists/{id}/songs` endpoint. Translated app page sizes up to 50 across those fixed windows, with bounded sequential requests and existing cache/retry controls.
- Reject album/artist/playlist identity mismatches. Preserve exact validated source URLs, highest returned quality selection, 96-kbps fallback, renewal coalescing, generation ordering, HTTP access-denial handling, timeouts and bounded caching. Expiry remains unknown (`expiresAt:null`); 120 seconds is the explicit client renewal policy, not a claimed CDN lifetime.
- Kept provider namespace `jiosaavn` and native IDs unchanged. UUID derivation excludes API hostname, so the host switch does not rewrite favourites, playlists, Warehouse, sharing or history references. Unavailable saved songs remain unavailable references rather than being reassigned by title. Real user identity files and collection documents were not edited or reset; verification identity files were isolated in `/tmp`.
- Reused the existing mobile catalog registry, media leases, player and collection services. No parallel catalog, playback, auth or collection system was added. Recommendations use the existing transparent title/album keyword rules and release years. The upstream suggestions endpoint was checked, but the app's recommendation engine remains its existing rule-based engine. InstaMus continues manual catalog matching; automatic recognition is unavailable.

[Preservation evidence](evidence/jiosaavn-bycom/preservation.json) confirms unchanged V3 adapter, Prisma schema, library/store/runtime, mobile environment, icons, Expo configs, entry point, Metro configs and lockfile. No new native dependency was added.

## Verification

| Check | Actual outcome |
| --- | --- |
| `pnpm run typecheck` | PASS, all four workspaces |
| Server TypeScript compilation | PASS; used compiled adapter directly, without starting backend/database clients |
| `TEST_LIVE_CONNECTIVITY=false pnpm test` | **599 passed, 3 live-database tests skipped**; all 584 previous passing cases retained |
| New regressions | Eight provider/GraphQL cases, five added personal-feature cases with new real metadata, two native-mock queue cases |
| Production Android Metro export | PASS; 2,932 modules, 29 assets |
| Hermes bytecode | PASS; 5,670,172 bytes; one registerComponent definition, two name occurrences including its closure reference; canonical InitializeCore/entry tail preserved |
| Bundle content | No SoundHelix demo URL or new test-fixture notice bundled |
| Native Android acceptance | **NOT RUN**; no build/install/launch authorization in this task |

Regression coverage includes search/playlist/artist pagination, final-page boundaries, identity substitution rejection, UUID preservation and identity-journal restart, authenticated GraphQL contracts, highest-quality media leases, likes/favourites/bookmarks, playlist add/remove/restart persistence, Warehouse archive/restore, decade filters, keyword recommendations/recent avoidance, sharing/history, manual InstaMus linking, Play/Pause/Next/Previous/Seek, RemoteStop and empty native queue recovery. HTTP transports, authentication contexts and native playback in these automated cases are explicitly test-only; they do not assert real OAuth login, cloud persistence or audible Android playback.

The production export enabled catalog code and disabled auth only in the export process with dotenv loading disabled; it did not alter mobile settings or bypass runtime authentication. Existing React DOM accessibility-prop and Node colour warnings appeared in tests/export without failures. Live database tests remained skipped.

[Machine-readable verification](JIOSAAVN_BYCOM_VERIFICATION.json), [test summary](evidence/jiosaavn-bycom/tests-summary.txt), [TypeScript output](evidence/jiosaavn-bycom/typecheck.log).

## Changed files in this task

Runtime/configuration:

- `server/src/infrastructure/music-provider/implementations/jiosaavn-music-provider.service.ts`
- `server/.env` and its root `.env` symlink target (two public keys only; no secret values listed)
- `.env.example`
- `server/.env.example`

Regression tests/metadata:

- `server/src/infrastructure/music-provider/__tests__/bycom-provider.test.ts`
- `server/src/infrastructure/music-provider/__tests__/fixtures/bycom-metadata.json` (actual metadata; URLs replaced with explicit example.invalid test values)
- `apps/mobile/src/catalog/__tests__/real-provider-features.test.ts`
- `apps/mobile/src/catalog/__tests__/bycom-player.test.ts`
- `apps/mobile/src/catalog/__tests__/fixtures/bycom-captured-metadata.json` (actual normalized metadata; no media URLs)

Documentation/evidence: this report, `JIOSAAVN_BYCOM_VERIFICATION.json`, current-status notes in the earlier integration report and Android checklist, and `docs/evidence/jiosaavn-bycom/`.

## Remaining blockers and scope limits

1. **Android acceptance:** audible decode, quality/network transitions, URL expiry recovery during real playback, seek, notifications and background playback require a separately approved APK/native acceptance run. No current provider device PASS exists. Earlier manually confirmed seek behavior is historical evidence only.
2. **App access prerequisites:** authenticated GraphQL transport still requires the existing real account/session prerequisites, approved schema availability, a device-verified HTTPS backend endpoint and explicit configuration enablement. Those holds were not bypassed. This task changed backend provider configuration, not live deployment or an installed binary; a running old backend process requires a restart to load it. No backend process was started or restarted during these isolated checks.
3. **Provider stability and rights:** this unofficial development API offers no verified commercial distribution licence, uptime SLA, complete metadata/tag coverage or documented source expiry. A successful bounded response does not establish rights, long-term availability or every-track playability. Production distribution remains blocked by licensing/provider arrangements.
4. **Unavailable integrations:** verified remote video, automatic Instagram/music recognition and bulk export are not supplied by this integration. No protected access, stream decryption, scraping or inferred media URLs were used.
5. **Cloud/S3:** own-media S3 streaming remains separate; no JioSaavn objects were copied/uploaded and no S3 rights were assumed. Live account persistence/synchronization and Neon migration approval remain independent blockers. No cloud, database or build approval was requested or consumed here.

The provider-switch work is complete locally, with bounded stream accessibility PASS. The application is not declared production-ready or Android-accepted.
