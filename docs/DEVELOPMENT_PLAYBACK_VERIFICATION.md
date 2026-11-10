# Development real-song playback verification mode

**7 November 2026 — local implementation and scoped activation PASS. Android audible playback remains NOT VERIFIED. No EAS build submitted.**

The user explicitly approved the [reviewed development scope](real-song-preview-candidate/DEVELOPMENT_PLAYBACK_SCOPE.md). This creates an internal read-only playback diagnostic, not a signed-in account or production Guest Mode. Ordinary account/catalog guards remain intact.

## Results

| Check | Actual result and limit |
|---|---|
| Monorepo TypeScript | PASS: all four workspaces |
| Regression suite | PASS: **632 passed, 3 deliberately skipped live-connectivity tests**, 60 passing files; prior 609 tests retained |
| Backend compilation | PASS: TypeScript build |
| Separate live integration | PASS: actual mobile DevelopmentCatalogClient → GraphQLCatalogRepository → public HTTPS → existing provider; one additional live test |
| Correct/missing/wrong/expired keys | PASS: authorization precedes provider calls; live missing/wrong keys HTTP 401; expiry verified with controlled-clock regression, not two hours of live waiting |
| Account boundary | PASS: live ordinary /graphql `me` with diagnostic key HTTP 401; diagnostic account fields, mutation and VIDEO requests HTTP 400; normal account guard/controller files unchanged |
| Production guard | PASS: tests reject diagnostic activation in production and wrong build profile/provider; normal app export unchanged in mode selection |
| Search, pagination, details, leases | PASS: actual Believer, Levitating and Enemy searches, two pages of 10 results each, stable-ID detail lookups, AUDIO and ARTWORK leases |
| Actual stream bodies | PASS: all three returned HTTPS sources HTTP 206, audio/mp4, exactly 1,024 bytes received/inspected and MP4 `ftyp`; reader immediately cancelled, no media files saved |
| Android HTTPS transport | PASS on CPH2599/X4GACUMZMVEQY5XO: app's unchanged AuthHttpClient.java executed through temporary DEX; actual catalog HTTP 200 and ordinary account API HTTP 401; temporary DEX removed |
| Native contract regressions | PASS with TrackPlayer test double: queue, play/pause, next, seek, Stop/Play, externally emptied queue recovery, close/lock, pause during pending source lookup; physical decoding/output not tested |
| Normal production Metro/Hermes | PASS: 2,932 modules, 29 assets, valid 5,670,405-byte HBC, one registerComponent definition and one root registration call |
| Diagnostic production Metro/Hermes | PASS: 2,935 modules, 29 assets, valid 5,695,961-byte HBC, one registerComponent definition and one root registration call; approved public endpoint embedded, private key absent |
| Entry order | PASS: both bundles end InitializeCore `__r(167)` then entry `__r(0)`; root registration remains before protected background registration |
| Expo/native inputs | PASS: both Expo public configs preserve package/icons; no dependency or lockfile changes; root autolinking map still has 24 dependency entries (not a claim of 24 native modules) |
| Actual EAS source archive | PASS: installed NoVcs copy with absolute project root, no Git/upload; 308 files, all required helpers/workspace inputs included, no unsafe paths, backend/legacy Android/catalog journals excluded, zero private key hits |
| Fastify/Redis/Neon readiness | PASS after approved restart: local/public health and readiness HTTP 200, database up/cache up; startup's existing SELECT 1 only; no application SQL records written |
| Preservation | PASS hashes: server/.env, mobile/.env.local, Prisma schema, normal auth/catalog guards, library store, both static app configs, Metro configs, lockfile, all four icon assets unchanged |
| APK/native audible acceptance | **PENDING**: no APK built/installed/launched by this work; no audible playback, decoding, notification, focus or background PASS claim |

Full sanitized outputs: [live results](evidence/development-playback/live-results.json), [Android results](evidence/development-playback/android-results.json), [verification](evidence/development-playback/verification.json), [health](evidence/development-playback/health.json), [regressions](evidence/development-playback/tests.log), [TypeScript](evidence/development-playback/typecheck.log), [live test](evidence/development-playback/live-test.log), [archive](evidence/development-playback/archive-check.json).

## Exact real audio evidence

All sources were supplied through the new scoped API and the existing mobile lease service, not hardcoded into the player. Raw playback URLs are omitted; URL SHA-256 fingerprints are in the evidence.

| Returned track | Stable catalog ID | Content-Range | Result |
|---|---|---|---|
| Believer — Imagine Dragons | f5e75856-4598-8a85-8509-3e90deb1afe4 | bytes 0-1023/8521381 | 206, audio/mp4, 1024 bytes, ftyp |
| Levitating — Dua Lipa | b9e404d7-f40a-862c-ac0e-b899333f98d0 | bytes 0-1023/8198941 | 206, audio/mp4, 1024 bytes, ftyp |
| Enemy (from the series Arcane League of Legends) | bde2e772-bd77-8d48-b49e-0908eec87b83 | bytes 0-1023/7132056 | 206, audio/mp4, 1024 bytes, ftyp |

These samples prove accessible audio bytes, not full-length decoding, continuous delivery, licence ownership or device audio output.

## Implemented boundaries and changed files

- `server/src/modules/development-catalog/development-catalog.module.ts` and its `__tests__/development-catalog.test.ts`: isolated query-only GraphQL schema, bounded input/query cost, AUDIO/ARTWORK only, constant-time hashed key verification, hard two-hour maximum, development/provider/account-hold guards. No User type, Mutation type or synthetic user context. Existing service/provider/identity maps reused.
- `server/src/index.ts`: conditional module construction/route registration. Existing main GraphQL token verification unchanged.
- `server/scripts/local-redis-development.mjs`: explicit `--start-playback-check`; ordinary launcher clears inherited diagnostic flags. New cryptographic key in private 0700 temporary directory/0600 file, not server/.env; existing local DB15 and loopback safeguards preserved.
- `apps/mobile/src/development/development-catalog.client.ts`, `development-playback.controller.ts`, `DevelopmentPlaybackScreen.tsx` and two `__tests__/*.test.ts`: exact-endpoint secure transport, private tester-entry memory-only key, server-relative expiry, stale-request protection, actual catalog search/pagination and lease renewal, isolated memory metadata cache, existing player/notification service and Kobra controls. No normal account lifecycle or personal history/collections mounted.
- `apps/mobile/src/services/playback/AudioPlaybackService.ts`: read-only command-generation accessor so a delayed song load cannot autoplay after a newer pause/stop command; existing player implementation retained.
- `apps/mobile/index.tsx`: explicit standalone variant selected at render; canonical main/background registration order retained.
- `config/development-playback.cjs`, root/mobile `app.config.js`, `server/src/infrastructure/__tests__/development-build.test.ts`: dedicated internal-profile guard, HTTPS exact origin/path checks, private-key/public-variable rejection, normal app config preserved.
- Root/mobile `eas.json`: only new `preview-real-songs` local profile, extending existing internal preview settings. Existing preview/production profiles retained; remote EAS settings untouched.
- `.easignore`: excludes backend-local `.aadat-music/` identity journals.
- This report, updated approval-scope/profile status, and `docs/evidence/development-playback/*`: sanitized evidence. The live integration harness and Android probe sources are retained under `/tmp/aadat-dev-playback/`; they use real HTTP, while the unused account module is prevented from initializing in the host test runtime.

## Local activation and operator handling

Existing owned Fastify PID 63904 was stopped gracefully. New launcher PID **92799**, Fastify **92809**, listener **127.0.0.1:4000**. Existing Redis PID **926** and Quick Tunnel PID **72346** were retained. No new tunnel/resource or Redis Cloud change.

Public diagnostic endpoint:
`https://anyway-pdf-obligation-suggests.trycloudflare.com/development/catalog/graphql`

Normal endpoint remains `/graphql` on the same origin. Local/public readiness passed, with authenticationEnabled=false and cloudCollectionsEnabled=false. This does not open protected APIs: invalid diagnostic bearer on normal GraphQL is rejected as an invalid account token.

Private key file, for authorized local tester entry only:
`/var/folders/kn/51qtp42s3djbbb7hflzc630m0000gn/T/aadat-development-catalog-38bdc6d6-e171-4438-9cbe-c789c933c965/access.json`

Key expires **2026-11-07 04:03:42 UTC / 09:33:42 IST**. No key value is printed here or included in public variables, EAS inputs, logs, evidence or bundles. It grants catalog diagnostics only. The phone probe supplied it through stdin and HTTPS without writing it to the phone. Mobile tester entry is memory-only and cleared at close/expiry. A future APK verification window requires a valid key and a still-reachable tunnel; recheck both before any build. Do not weaken expiry to accommodate cloud build duration.

To revoke immediately, gracefully stop the owned diagnostic backend and return to the ordinary local launcher under the relevant service authorization. Deleting the private file alone does not revoke its in-memory server key. At expiry, the API denies new reads and the mobile controller closes/reset its diagnostic queue. No remote media revocation claim is made.

## Remaining restrictions and next approval

A **single `preview-real-songs` internal Android APK can now meaningfully test real catalog search and audio controls**, subject to fresh endpoint/key-window verification and explicit EAS approval. There is no production-readiness claim.

Still blocked: real user login/session/account persistence and personal playlists/Warehouse/favourites/history/cloud sync acceptance, pending actual authentication/database approvals and verified configuration. They are deliberately absent from this diagnostic screen. Existing personal data is not transferred or deleted. Licensed distribution, authorized video provider and recognition provider remain unavailable; this API reports videoSupported=false and recognitionSupported=false.

Next restricted action would be **exactly one Android EAS preview build with the local `preview-real-songs` profile**, `EAS_NO_VCS=1` and absolute project root, existing signing, no private key in build inputs. It may consume EAS quota/credits. Approval for that build does not authorize migrations, account writes, cloud resources, S3, remote environment edits or another build. EAS submission remains blocked until separately approved.

After APK approval/install, verify on CPH2599: main registration/no crash; private-key entry; three named songs audible; play/pause; next/previous; seek/progress; stop/play; empty queue recovery; buffering/retry; background/lock screen; notification controls; audio focus; expiry and close; capture fresh Logcat. Personal collection testing requires a real approved account later.
