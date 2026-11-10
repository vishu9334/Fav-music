# Historical V3 development integration — metadata PASS, streaming FAIL

Current provider status: [Bycom development switch — bounded stream access PASS](JIOSAAVN_BYCOM_DEVELOPMENT_SWITCH.md). The V3 results below remain historical evidence.

6 November 2026, Asia/Kolkata. The user approved the v3 development provider and subsequently approved a bounded stream-body test. **This is not a production-ready or Android playback acceptance report.** No Git commands, database operations, migrations, infrastructure changes, EAS builds, app installs or app launches were performed in this integration task.

## Actual provider diagnosis and approved configuration

- Previous configuration: `JIOSAAVN_API_BASE_URL=https://saavn.bycomsolutions.com/api`. Fresh root/docs/search probes returned **HTTP 403**, Cloudflare **1010**. This is an access restriction from the tested client/network, not proof that the service is globally down. The linked upstream contract uses public routes; no API-key requirement was established for this deployment. No browser-signature spoofing, alternate IP bypass, cookies, credential guessing or DRM decryption was attempted.
- Primary references: [configured provider documentation](https://saavn.bycomsolutions.com/docs), [linked upstream routes](https://github.com/sumitkolhe/jiosaavn-api/tree/main/src/modules), and [Cloudflare's explanation of 1010](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010/).
- Researched `saavn.sumit.co` and `saavn.me`: access denied. `saavn.dev` and the separately documented `jio.shnwaz.dev` candidate: DNS lookup failures from this environment. These are point-in-time results, not global uptime claims.
- Working replacement **approved by the user before switching**: `https://jiosaavn-api-v3.vercel.app`, with [published Swagger](https://jiosaavn-api-v3.vercel.app/docs/). Song/album metadata requests require no credential in the tested public flow. This is an unofficial development service; public access is not a music distribution licence or an uptime guarantee.
- Only three public server settings were changed in the existing environment files: `JIOSAAVN_API_BASE_URL=https://jiosaavn-api-v3.vercel.app`, `MUSIC_PROVIDER=jiosaavn-v3-development`, `MUSIC_DISCOVERY_QUERY=Aadat`. Private credential values were not printed or changed. Mobile environment and authentication/HTTPS approval gates remain unchanged. Development mode is rejected when `NODE_ENV=production`.

## Verified accessible coverage

| Actual operation | Evidence | Result |
| --- | --- | --- |
| Song search + real detail hydration: Aadat | 10 unique songs, two local five-item windows | PASS |
| Song search + real detail hydration: Rain | 10 unique songs, two local five-item windows | PASS |
| Song search + real detail hydration: Happy | 10 unique songs, two local five-item windows | PASS |
| Combined search metadata | 30 distinct canonical song IDs; all 30 include provider-reported release years | PASS |
| Album search: Aadat | 5 album results; provider total unavailable | PASS |
| All five returned album details | 1 song each; contents already included in the same 30 unique songs | PASS |
| Artwork availability | Three actual artwork URLs: HEAD 200, image/jpeg | PASS for HTTP availability; Android rendering untested |
| Audio URL responses | API supplies 96/160/320-kbps URLs | Response fields verified; playability not implied |
| Audio HEAD checks | Three songs × three variants = 9 HTTP 404 responses | FAIL |
| Approved bounded audio GET | Three exact API-returned 320-kbps URLs, `Range: bytes=0-1023`: all HTTP 404, zero audio bytes received | FAIL |

These are **all returned items in the tested search windows**, not all JioSaavn songs. The v3 Swagger has no documented remote search pagination, artist browsing, playlist browsing, video or recognition endpoint. No undocumented endpoints, generated song IDs, guessed media URLs or bulk-export claims were substituted. Local pagination slices the actual returned snapshot; totals stay null. Provider-reported dates are not independently verified original-release dates.

Exact tested failures: “Aadat” / Ninja (`iYMcgidY`), “Rain” / DIVINE (`8taj1DCo`), “Happy” / Karthik (`46An-G70`) returned fresh API metadata, but the selected CDN URLs returned GET 404 from `aac.saavncdn.com`. No media body was available. This isolates the observed streaming failure to the provider-returned sources before Android playback. Whether those URLs are incorrectly generated, removed or otherwise invalid internally is **not established**. The app cannot repair them by retrying indefinitely, inventing URLs or copying music into S3. The smallest external fix is for the provider owner to return working authorized sources, or for the user to approve another verified provider.

## Implemented architecture and feature matrix

`JioSaavn REST → IMusicProviderService → ProviderCatalogService → authenticated GraphQL → existing mobile catalog/player/library`

The original adapter remains separate from `JioSaavnV3MusicProviderService`; no automatic fallback changes provider hosts. A future licensed provider implements the same contract. Owned S3 media remains a separate catalog strategy.

| Feature | Status | Evidence boundary |
| --- | --- | --- |
| Real song/album metadata | VERIFIED WORKING — host API | Live JSON normalized by the actual v3 adapter; no sample-track substitution |
| Artist names | VERIFIED WORKING — metadata | Provider's primary artist names; independent artist profile/search endpoints unavailable |
| Artist/provider playlist browsing | BLOCKED — unsupported v3 contract | Capability query limits browsing to albums; user-created personal playlists remain implemented |
| GraphQL discovery/search/resource/album paths | VERIFIED WORKING — local contract tests | Real SDL and captured real metadata; injected test context is not real Google authentication |
| Mobile search/browse/album navigation | Implemented, Android UNVERIFIED | Existing Kobra components and virtualized song lists reused; real account/native prerequisites remain blocked |
| Decade filters | VERIFIED WORKING — local tests with real metadata | Required ranges filter provider-reported years within loaded/query results; no exhaustive provider year index claimed |
| Mood/time/season discovery | VERIFIED WORKING — local rule tests | Explicit title/album keyword rules, marked `TITLE_ALBUM_KEYWORDS`; not provider mood facts, location inference or AI. Missing matches stay empty |
| Likes/favourites/bookmarks | VERIFIED WORKING — local tests | Actual returned UUIDs survive journal restart; authenticated ownership gate retained |
| Personal playlist add/remove/persistence | VERIFIED WORKING — local tests | Existing LibraryService and journals reused, not a second playlist system |
| Hybrid Warehouse remove/restore | VERIFIED WORKING — local tests | Existing status/union rules work with the same real song IDs; no music downloads |
| InstaMus manual matching | VERIFIED WORKING — local tests | Real catalog title search/manual selection/bookmarking; automatic Instagram/audio recognition remains unavailable |
| Sharing/history | VERIFIED WORKING — local tests | Canonical IDs only in shared payloads; ordered account-local history. Android dispatch/real listening acceptance pending |
| Stable provider-independent ID surface | VERIFIED WORKING — identity/restart tests | Opaque Aadat UUIDs separated from provider-native references and URLs; development crosswalk journal persists references |
| Cross-provider equivalence | BLOCKED — reviewed crosswalk required | New source aliases can retain a canonical UUID; titles are never automatically merged. No universal identity/ISRC mapping is invented |
| Buffering/retry/URL renewal | VERIFIED WORKING — contract tests only | Bounded REST retries/coalescing/cache, explicit forced source refresh; unknown expiry stays null with a separate refresh policy. Live expiry/playback cannot pass with current 404 sources |
| Play/Pause/Next/Previous/Seek/background/notifications | Preserved; v3 integration BLOCKED | Existing mocked-native regressions pass; no audible or physical-device acceptance for these provider sources |
| Native video | Preserved; provider video BLOCKED | v3 supplies no verified video. Audio MP4/AAC URLs and preview fields are not presented as video |
| Google/account/cloud persistence | BLOCKED — existing hold/configuration | No fake login or guest bypass; backend/mobile auth flags off, endpoint binding absent, mobile catalog flag unchanged/off, live schema writes not authorized |

### Identity and caching limits

Canonical UUIDs are stable across metadata/URL changes and switching compatible JioSaavn hosts with the same native IDs. They bootstrap from a deterministic namespaced hash and can be retained through explicit reviewed source aliases. A different licensed provider does not automatically become the same recording.

The development identity repository writes only reference metadata to two atomic local slots under `MUSIC_PROVIDER_IDENTITY_FILE` (default `.aadat-music/provider-identities`, relative to backend cwd). Preserve both slots. This is not cloud persistence; production needs a separately approved durable identity/crosswalk deployment. Verification used only `/tmp` journals. Missing/corrupt journals fail closed; saved user IDs are not reassigned.

REST pages are cached for 60 seconds (50 entries, four in-flight requests, bounded response bytes and bounded transient retry). Denied access is a visible error with a cooldown, not an empty successful search. The mobile registry/cache remains bounded at 500 metadata records; media URLs are not written into catalog/library journals. Provider expiry is unknown: `expiresAt`/`expiresInSeconds` are null and `refreshAfterSeconds=120` is explicitly a client renewal policy. S3 signed expiry semantics remain separate.

## Verification and device evidence

- Full TypeScript: PASS, all four workspaces.
- Full regression suite: **571 passed, 3 skipped**, 52 test files passed and one live-connectivity file skipped; details in `JIOSAAVN_DEVELOPMENT_VERIFICATION.json`. Three live-database tests deliberately skipped. Provider tests include access-denial semantics, bounded retry, HTTPS/redirect rules, real captured metadata parsing, unsupported endpoints, identity mismatch/restart/corruption, actual SDL serialization, HTTP/GraphQL session-expiry retry boundaries and an explicit regression ensuring source failure is never reported as native playback success.
- Local feature tests use 30 **captured real normalized records**. Fixtures omit stream URLs; synthetic test transports/contexts are explicitly test-only, not successful production requests or login.
- Production Android Metro export: PASS, 2,932 modules / 29 assets. Hermes compilation: PASS; one `registerComponent` function definition; canonical tail `__r(167); __r(0);`. No SoundHelix demo-stream strings in the bundle.
- Root/mobile Expo configuration: PASS for package `com.favmusic`, existing project ID and existing icon paths. All four asset hashes, entry point, Metro configs, workspace topology, lockfile and Prisma schema remain unchanged in this integration task. This is not an APK/native acceptance result.
- ADB: CPH2599 connected. Package manager returned **`Unable to find package: com.favmusic`**. No app was installed/launched, no new APK was built, and no Android E2E case passed in this task. Earlier user-confirmed seek behavior is historical, not current provider acceptance.
- SDK52/RN0.76.6 pins preserved. Native compatibility, signing/OAuth registration, low-end frame/memory/buffering behavior and custom native transport require a separately approved final APK.

See [read-only S3 audit](JIOSAAVN_S3_SEPARATION_AUDIT.md), [device acceptance checklist](JIOSAAVN_ANDROID_ACCEPTANCE_CHECKLIST.md), [changed files](JIOSAAVN_DEVELOPMENT_CHANGED_FILES.md) and [sanitized evidence](evidence/jiosaavn-development/live-verification.json).

## Remaining external work

1. Provider-owner fix or another approved source with valid authorized audio URLs. Current tested GET sources fail with 404; a syntactically valid URL is insufficient.
2. Maintain existing authentication/Neon hold until separately reviewed schema/history/recovery and real session-write approval. Verify the HTTPS GraphQL endpoint and native transport before credentials are transmitted. No gates were bypassed here.
3. Production content/recognition/artist-playlist-video coverage requires an authorized provider that actually supports it; no production distribution licence is inferred from this development approval.
4. Only after dependencies are ready and build approval is granted: install a reviewed APK and execute real Google sign-in, source playback, seek/ranges, transport/background controls, account switching, playlists, Warehouse, sharing and video tests.

The first bounded audio probe was rejected by automatic approval review under the user's no-download restriction. After explicit user clarification authorizing the bounded development check, a reviewed retry ran: three GET 404 responses, zero audio bytes and no audio files. That narrow permission does not authorize full songs, redistribution, DRM bypass, database writes or builds.
