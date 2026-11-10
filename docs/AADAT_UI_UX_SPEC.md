# Fav Music — design, navigation and local account runtime

This is the consolidated screen/feature specification. It supersedes the earlier assumption that Kobra alone defined the entire app. The Vercel site defines appearance; Kobra defines interaction and glass-control references. Native acceptance remains pending for these changes.

## References actually inspected

- Primary: [Aadat Vercel reference](https://vantage-d1r6sli2m-vishal-kumars-projects-109ff935.vercel.app/). Accessible in a fresh unsigned-in Chrome session on 7 November 2026; no Vercel account or protection bypass was used.
- Captured Home, Search, Library, Warehouse, discovery, videos, InstaMus, catalog, history, Profile, full player, playlist details, album details and the Likes selection. [Reference captures](evidence/local-account-ui/).
- Interaction references: [Kobra video](https://kobra.systems/components/video), [navigation menu](https://kobra.systems/components/navigation-menu), [carousel](https://kobra.systems/components/carousel), [morphing icons](https://kobra.systems/components/morphing-icons).
- The website contains preview songs, counts, account information and simulated playback. Those are visual reference material, not Aadat production data. They are not imported into the app. The website exposes no genuine Google-login screen; the native Google screen uses its palette and typography as a functional adaptation.

## Appearance contract

| Purpose | Reference value / native use |
|---|---|
| Background | `#09090B` |
| Panel / raised panel | `#17151D` / `#211D2C` |
| Borders | `#393241`; quieter row separators `#221F27` |
| Primary text | `#FAF7FF` |
| Normal secondary text / privacy captions | `#BDB4C8`; retained for AA contrast |
| Decorative tertiary | `#8E839F`; avoid for essential normal-text captions |
| Accent / accent surface | `#D8B4FE` / `#392846` |
| Primary-button text | `#21172A` |
| Error text | `#F3CEDD` |
| Glass tint | `rgba(26,23,33,0.78)` |
| Typography | Native Android system Roboto; body 12–14sp, heading 28sp/34, section 16sp, hero 37sp/41, full-player title 22sp |
| Spacing | 18dp page inset; 8–12dp item gaps; 24–28dp section separation |
| Shapes | 14–16dp ordinary cards, 24dp hero/artwork, circular transport controls |
| Touch/accessibility | At least 44dp controls; font scaling retained; labels and selected/disabled states exposed |

Do not copy the website's decorative phone frame, fixed clock/5G indicators, keyboard shortcut badge, preview identity or fixture artwork. Android supplies actual system bars. Existing four icon assets and their Expo assignments remain unchanged.

## Navigation and screen behavior

Launch: configured native splash → secure restoration/loading → Continue with Google → authenticated Home. Cancellation returns to the sign-in screen. Network and expired-session states offer real retry/sign-out actions. No guest entry or diagnostic key is part of this flow.

The compact header contains the music mark/navigation menu, screen name, global random play, Search and the real account's initials. The grouped menu exposes the implemented secondary features. Home, Search, Library and Warehouse stay in the bottom dock on secondary screens too. The current-track mini-player has artwork, title/artist, Play/Pause, Next and progress. Full player hides the surrounding header/dock. Native video fullscreen covers them with its native modal.

| Screen / entry path | Appearance and actual behavior |
|---|---|
| Login `/login` | Dark welcome surface, lavender branding, genuine native Google button, loading/cancellation/offline/error handling. Verified login redirects to Home. No fabricated account or preview profile. |
| Home `/` | Compact heading, orbit hero, actual available-track count/artwork, compact feature grid, decade and seasonal cards, real confirmed recent plays or available catalog rows. |
| Search `/search` | Search field, catalog browse entry, year/season chips, artwork rows, real query results, pagination and retry. No website fixture replacements. |
| Audio `/player` | Queue-synchronized artwork carousel, album/year eyebrow, left-aligned title and artist, Likes/Favourites/Bookmarks, timeline and shared glass transport. Queue and actual buffering/errors remain visible. |
| Library `/library` | Three personal collection cards with real counts, playlist creation/list, saved-song rows. No fixture playlists. |
| Likes/Favourites/Bookmarks `/collection?kind=…` | Account-scoped saved IDs resolved through the same catalog; unavailable references remain saved. Track menus expose saving, playlists and sharing. |
| Playlist `/playlist?id=…` | Real name/count, Play, add/remove, smart editable naming, rename, share and explicit delete confirmation. A delayed action cannot target the next account. |
| Warehouse `/warehouse` | Account collection summary and actual sync state; Active/Removed/Hidden filters, play, hide/remove/restore, Search and InstaMus entries. Stores references; does not download or claim offline audio. |
| Discovery `/discovery` | Local morning/afternoon/evening/night, manual mood/season/year filters, random playback, confirmed history and recommendations. Explicit title/album keyword rules; no AI or inferred weather/location. |
| Decades / seasons from Home | 90s, 2000–2010, 2011–2020, 2021 onwards and Undated. Spring, Summer, Monsoon, Autumn and Winter. Missing metadata and empty categories remain honest empty states. |
| Catalog `/provider-browse` | Search available albums/artists/playlists using supported provider endpoints; source metadata, real results and pagination. No claim to enumerate the provider's complete catalog. |
| Catalog detail `/provider-collection?id=…` | Real artwork/name/year, track list, playback and additional pages when returned. |
| InstaMus `/instamus` | Instagram link and note form, original-link opening, manual catalog matching/bookmarking, saved notes and Android sharing. No scraping, music extraction or invented recognition. Automatic recognition awaits an authorized provider. |
| History `/history` | Real confirmed plays, actual dates and replay. Reset/hydration callbacks are bound to the active account. No invented earlier listening events. |
| Video `/videos` | Existing Expo native player, carousel, seek/buffering/errors and landscape fullscreen for supplied authorized video. Uses the identical audio transport component. Saavn currently returns no verified videos, so the normal screen shows a truthful empty state. Original technical clips remain internal verification assets. |
| Profile `/profile` | Genuine name/email, editable profile/privacy preference, actual collection counts/synchronization, explicit conflict review, prior-device transfer preview and logout. No website preview user copied. |
| Incoming shares `/shared` | Authentication required, review before saving/playing, preserve valid unavailable IDs, no automatic collection mutation. |

User-facing developer labels have been removed from the normal track list and the internal video-review entry is absent from the normal video screen. Provider contracts retain `developmentOnly` and licensing limitations; the source has not become a licensed commercial catalog.

## Glass, motion and responsive behavior

- Audio/video import the same `KobraPlaybackControls`: separate Previous/Play–Pause/Next glass circles and a larger center button. Native backdrop blur is limited to small supported Android surfaces; low API levels, background and reduced effects use the existing tint fallback.
- Specular/lens gradients and edge highlights approximate Kobra glass. **True optical liquid refraction is not implemented**; this is an explicit visual difference, not a shader-equivalence claim.
- Play/Pause interpolates continuous SVG geometry on the Reanimated UI thread. Artwork uses a virtualized snapping carousel; selecting/swiping stays connected to the existing native queue.
- Native safe areas protect horizontal cutouts. Large-font and short-window forms scroll; keyboard dismissal preserves submit access. The dock compacts horizontally on short landscape windows, while larger text retains the flowing layout. Video fullscreen puts controls in scroll flow when height/font/error conditions require it.
- Avoid full-screen live blur, permanent render loops, large unbounded image lists or simultaneous audio/video. Native frame rate, blur appearance, keyboard/rotation and TalkBack acceptance still require the new Android APK.

## Genuine local account services

The phone connects over the existing verified HTTPS tunnel. PostgreSQL and password-protected Redis bind only to Mac loopback. Google verification remains real and server-side. Normal GraphQL account/catalog routes still reject anonymous access. `preview-local-account` enables authentication, catalog and account persistence; its configuration contains only a public OAuth client ID, HTTPS URLs and public flags.

- Runtime data/credentials: private `~/Library/Application Support/AadatMusic/LocalBackend/`; not in the workspace or mobile archive. Credentials are generated once and not printed. Existing Neon/Redis Cloud `.env` values remain unchanged.
- PostgreSQL databases: `aadat_local` for genuine app accounts; `aadat_verify` for removable integration fixtures only. Private Redis DB0 is the app session store; DB1 is verification only. AOF is enabled. Do not delete/reinitialize the runtime to fix sign-in.
- Local initial migration: `server/development/local-account/migrations/20261107000100_initial/migration.sql`. It matches the current Prisma schema, uses one transaction, and has actual checksummed Prisma migration history. The backend role has application DML, no schema creation or migration-history writes. This migration has **not** been applied to Neon.
- Backend startup: build the server, then run `node server/scripts/local-account-development.mjs --start` from the repository root. It verifies/reuses the private daemons, or starts those same existing data directories after a Mac reboot. `--check` validates configuration without starting services. The initializer deliberately refuses to replace an existing runtime. The active Mac services and tunnel must remain available for phone access; no automatic new tunnel is provisioned.
- App access tokens stay in memory; refresh/revocation credentials use SecureStore. Redis stores refresh-token hashes, rotates atomically and revokes descendants on logout. Account-bound collection journals save before synchronization; conflicts retain both copies for explicit choice.
- Prior-device files stay quarantined until explicit transfer. Unsupported legacy song IDs are not assigned fictional catalog identities or silently discarded. Signing out locks account data; switching accounts resets personal playback/history state and rejects stale callbacks.
- Future domain/host migration must keep Google audience/signing registration correct, verify the new HTTPS endpoint, update public configuration and deliberately transfer backed-up local data. No Neon write, remote schema migration, cloud storage change or Play Store release is implied.
- Build configuration is part of verification: Expo's embedded-export command skips an explicitly requested cache reset in CI. A prior transform cache produced disabled/empty auth configuration despite enabled environment values. Both Metro roots now include a digest of public Expo values in the cache version, so switching account/diagnostic profiles invalidates compiled variables. Canonical singleton resolution and `InitializeCore` ordering remain unchanged. The actual bundle must contain the expected endpoint, public audience and enabled policy before any build is submitted.

## Acceptance evidence and remaining work

[Credential-free Android evidence](evidence/local-account-ui/android-readiness.json) verifies the current Java HTTPS transport reaches the local account backend, returns HTTP 200 readiness with real authentication/persistence enabled, and rejects anonymous profile access. It is a temporary DEX check, **not installation or login testing of the new app**.

Local integration verified actual Prisma user/profile persistence, per-account collection separation, idempotent commits, stale revisions, unknown-track rejection, Redis Lua rotation and post-rotation logout using fixtures only in the verification stores. Fixtures were removed. No user was fabricated in `aadat_local`, no Google ID token was substituted and no Neon connection was made.

Before declaring Android acceptance:

1. Obtain approval for exactly one `preview-local-account` EAS APK; retain signing and `com.favmusic`. Install with `-r`, never uninstall/clear app data.
2. Let the user choose/consent to a genuine Google account on the phone; verify backend-created local user, restart/session restoration, refresh, logout and account switching. Confirm OAuth Android package/signing registration from the actual result.
3. Test the reference layouts at small/large fonts, keyboard, portrait/landscape, safe areas and TalkBack; inspect native blur, carousel and morphing controls.
4. Test actual Saavn songs, queue recovery, seek, background/notification controls, saved collections, process restart and synchronization with recorded evidence. Earlier audible Believer verification belongs to the prior diagnostic APK, not this new account/UI candidate.
5. Supply authorized video/content before remote-video acceptance; supply an authorized recognition provider before automated InstaMus recognition. Domain/Play Store purchases are not prerequisites for the current local setup. Commercial distribution rights are still absent.

Focused verification results and source-preservation evidence: [results](evidence/local-account-ui/verification.json). One APK was explicitly approved and submitted as build `3ceccc2f-8b2e-4c4f-b316-b27028211473` (`preview-local-account`). The APK is installed on CPH2599 and its real sign-in screen renders. The user confirmed removing the previous app before installation; old-device-data preservation is therefore not testable. The user selected a Google account but returned to Login; genuine sign-in and subsequent protected-screen/playback acceptance have not passed. Production release readiness is not claimed.

## Changed implementation files

- Authentication: `apps/mobile/src/auth/services/auth.service.ts`, `controllers/auth.controller.ts`, `adapters/native-google-auth.provider.ts`, `components/auth.screen.tsx`, plus `apps/mobile/app/login.tsx`.
- Native transport: `apps/mobile/plugins/auth-transport/AuthHttpClient.java` and its JVM policy check; the existing IPv4 fix now covers the approved tunnel's real `/graphql` route too.
- Shared navigation/design: `apps/mobile/app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `src/components/app/AppHeader.tsx`, `AppTabBar.tsx`, `FeatureLinks.tsx`, `ui.tsx`, `src/design/theme.ts`, `styles.ts`, `playback-geometry.ts`, `src/components/discovery/FilterRow.tsx`.
- Screen integration: the existing Home, Search, Library, Warehouse, Player, Discovery, History, InstaMus, Playlist, Collection, catalog browse/detail, shared-content and Video screens; `NativeVideoSession.tsx`, catalog notices/rows and library sheets. Core audio/video playback services and `usePlayerStore.ts` are unchanged.
- Ownership/history: `src/library/account-library.service.ts`, `src/store/useLibraryStore.ts`, `createDiscoveryStore.ts`, `src/components/app/AppLifecycle.tsx`; focused stale-callback, unloaded-legacy-reference and account-switch tests.
- Public build configuration: `eas.json`, `apps/mobile/.env.local` (local only), both Metro configs and `config/mobile-public-environment.cjs`; dedicated cache-version regression tests.
- Local backend: `server/src/main.ts`, `src/infrastructure/config/local-account-development.config.ts`, its tests; `server/scripts/*local-account*.mjs`, `verify-local-catalog.mjs`; isolated Prisma config and initial migration under `server/development/local-account/`. Existing production `.env`, ordinary Neon Prisma configuration/schema and production migration history are unchanged.
- This specification and `docs/evidence/local-account-ui/` contain reference/evidence material only and are excluded from the mobile archive.


## Fav Music login follow-up — 7 November 2026

The confirmed display name is **Fav Music**. Both Expo names and normal in-app branding now use it. Login and the navigation header reuse the configured `assest/icon.png` directly; the four original icon files and assignments, package, project ID, URL scheme and stored-data keys are preserved. The genuine native Google button is centered, capped at 280dp and 48dp high. The rejected Google-password caption is removed, including internal layout review.

Retained Android events show the actual Google picker opening at 15:25:34 IST and returning at 15:25:36. They do not retain a native OAuth status or prove the underlying provider failure. A separately reproduced app lifecycle bug could erase an unsuccessful sign-in result when the picker resumed the activity. Foreground restoration now refreshes authenticated sessions only; initial secure restoration and authenticated renewal remain. Cancellation has a visible retry hint. Native diagnostics log allowlisted status labels only, never account details or credentials. No authentication bypass or fabricated session was added.

Local verification: 680 tests passed, three live-connectivity tests skipped; the final caption/layout and lifecycle checks passed separately (nine tests). All-workspace TypeScript and final mobile TypeScript passed. Production Metro and Hermes 96 passed, with canonical startup and one AppRegistry registerComponent implementation. The 335-file EAS source archive matches source and contains no scanned private credentials or environment files. [Concise evidence](evidence/fav-music-login/verification.json).

**Device acceptance remains blocked on a newly approved APK.** Build `3ceccc2f-8b2e-4c4f-b316-b27028211473` predates this follow-up, and its one-build approval is consumed. No additional build has been submitted. A new build needs explicit approval, then genuine Google selection, preserved error/status capture, account persistence and authenticated music checks. The underlying Google OAuth result must be established before claiming login works. No backend, Neon, cloud-resource or database changes were made in this follow-up.


## Installed follow-up APK — actual Android acceptance

The separately approved single build `e93df3dd-56f4-41d5-8133-fc63acaa12a6` finished and installed on CPH2599 on 7 November 2026. [APK](https://expo.dev/artifacts/eas/_dEH2qn4hzA7a9B0J6Fgtfc3q3VZ1XaXIczzexuvMKc.apk). Existing signing, Hermes 96, required native modules, HTTPS endpoint/audience and secret scanning passed. No Git lookup was observed. The package was absent before installation; the agent did not uninstall or clear data.

[Actual screenshot](evidence/fav-music-login/android-fav-login.png) confirms Fav Music branding, the existing logo, the centered native Google button (280 × 48dp bounds) and removal of the rejected caption. Startup did not show a fatal exception in the captured log. At **16:11:03.667 IST**, native Google sign-in returned **10 / DEVELOPER_ERROR**. Its message remains visible, confirming the lifecycle error-erasure fix. [Sanitized Logcat](evidence/fav-music-login/google-signin-logcat.txt) and [acceptance evidence](evidence/fav-music-login/android-acceptance.json).

Google login acceptance is **FAIL**; protected UI, account persistence and real-song playback in this APK are **BLOCKED**, not passed. Testing stopped at this critical failure. Google documentation identifies code 10 as application misconfiguration; the exact wrong console field cannot be established from this code alone. The Google project owner must verify the existing Web OAuth client is actually type Web and the same project has the Android client for:

- Package: `com.favmusic`.
- Installed APK SHA-1: `B5:A9:23:A7:18:57:3F:17:77:5D:95:D8:DD:D3:C1:39:36:AD:00:6A`.
- Installed APK SHA-256: `68:D7:3D:8F:18:4E:BC:07:82:5C:85:37:63:53:AB:93:E0:71:0A:1E:87:92:D7:F3:34:49:16:12:7D:A1:3E:DB`.
- Current configured public Web client ID: `558308870104-04371glm33beh2990nqba8l9c51mdvpd.apps.googleusercontent.com`.

No Google Console changes or additional build are authorized by this acceptance run. If only the Android registration needs correction and the current Web ID is valid, retest the installed APK after the owner corrects configuration; do not assume another build is necessary. If the embedded Web client ID must change, source/config verification and separate build approval are required. No Neon/S3/cloud settings, services or database were changed during this follow-up.


## Verified Web-client configuration alignment (local files only)

A user-authorized retry at **16:34:19.881 IST** returned native status 10 again. Inspection then found the existing downloaded Google OAuth JSON for project `aadt-music`. Its declared type is **Web**, with public client ID `558308870104-f9smr1ta0ict2fch5o4ce1gja5na7qfq.apps.googleusercontent.com`. This differs from the previously configured `...04371glm...` ID. The old ID's application type has not been independently verified, so the difference alone does not prove it was an Android client or the sole cause of status 10.

The public audience is now aligned to that existing Web client in exactly three local configuration fields: `server/.env` → `GOOGLE_CLIENT_ID`, `apps/mobile/.env.local` → `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, and `eas.json` → `build.preview-local-account.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. Every other backend environment value is unchanged. No Google client secret was copied, no database/cloud change ran, and no service restart or new build has been submitted. Running backend and installed APK retain their old configuration until separately approved activation.

Focused auth/token-verifier/race tests: **50 PASS**. All-workspace TypeScript, production Metro and Hermes 96 PASS. Actual bundle/Hermes contain the new ID and omit the old ID; canonical startup and one AppRegistry implementation remain. The 335-file NoVcs archive matches source, excludes environment/server files and has zero scanned private secrets, including the downloaded OAuth secret. Icons and core playback sources remain unchanged. [Evidence](evidence/fav-music-login/oauth-client-alignment.json).

Minimum conditional activation scope: after the owner confirms an Android OAuth client for `com.favmusic` with SHA-1 `B5:A9:23:A7:18:57:3F:17:77:5D:95:D8:DD:D3:C1:39:36:AD:00:6A` in project `aadt-music`, approve one graceful restart of only the existing local Fastify backend, reusing private local PostgreSQL/Redis and the existing HTTPS tunnel. Readiness may execute the existing local SELECT 1 and normal local Redis counters. After HTTPS/audience alignment passes, approve exactly one `preview-local-account` EAS APK using EAS_NO_VCS=1, explicit project root and existing signing, then installation and genuine account/music tests. Real user records would be written only to existing local PostgreSQL through genuine Google login. EAS quota/credits may apply. No daemon restart, Neon/S3 write, migration, Google Console edit, new tunnel, remote environment change or additional build is included. This is a candidate configuration correction, not a claim that Google login now passes.


## Corrected-ID activation outcome — 7 November 2026

The owner confirmed the exact Android package/SHA-1 match and approved one scoped restart plus one conditional APK. Exactly one successful graceful Fastify restart activated the downloaded Web client ID (`...f9smr1ta...`), reusing the existing private PostgreSQL/Redis and tunnel. No daemon restart ran. HTTPS health/GraphQL and credential-free Android readiness passed; anonymous personal APIs still reject access. One temporary-helper precheck failed before stopping/starting any service, was corrected, and did not consume another restart.

**APK BLOCKED:** EAS accepted the archive upload but rejected the build request because the account exhausted its monthly Free-plan Android builds; EAS reports reset on **1 December 2026**. A direct read-only Expo build-history query confirmed **zero new builds created**, so no new build ID/APK/installation exists. No billing upgrade, paid resource, retry or additional build was performed. The phone retains build `e93df3dd-56f4-41d5-8133-fc63acaa12a6` with the old client ID; do not treat a login attempt on that APK as verification of the corrected configuration. Corrected-ID Google login and authenticated music acceptance remain blocked until a build is available. The previously granted one-build approval has produced no build; do not retry until build availability is restored and the user resumes the work. No Google Console/Neon/S3 change, migration or new tunnel occurred. [Activation evidence](evidence/fav-music-login/corrected-id-activation.json).


A subsequent user request to resume EAS cloud building was checked through read-only Expo account usage APIs on 7 November 2026. The account remains on Free: **Android cloud builds 15/15 used, 0 remaining**. Billing-period end is 1 December 2026 at 05:30 IST. Android SDK/Java installation does not change this cloud allowance. No redundant upload/submission, billing change or additional build was attempted. [Current quota evidence](evidence/fav-music-login/cloud-quota-recheck.json).


## Local APK completed — 7 November 2026

After the user installed the required Android components and explicitly requested APK creation, a local `preview-local-account` release build succeeded on the Mac using Java 17 and existing EAS signing credentials. No cloud build or paid plan was used. Gradle 8.10.2 completed **1,075 tasks in 9m 32s**. One native dependency required Build Tools 34.0.0 in addition to the installed SDK/Build Tools 35; Gradle installed that required package. Local temporary worker limits were used; the actual output is a universal four-ABI APK, including CPH2599's ARM64 ABI.

APK: `/tmp/fav-local-apk/Fav-Music.apk`, **68,283,532 bytes**, SHA-256 `e0f8c61101c2a505f068dac3b470480c660574396101b80296a6c7d95a1e1dcd`. The existing signing certificate matches the registered SHA-1. Actual APK contains the corrected `...f9smr1ta...` Web client ID and omits the old ID; Google Sign-In, TrackPlayer, SecureStore, blur, video and IPv4/TLS native modules are present. Hermes 96 parses successfully with one AppRegistry registration implementation; private-secret scans returned zero hits.

The APK installed successfully on CPH2599 using `adb install -r`; the previous package was absent, as the user had reported uninstalling it. The real Login screen opens without an observed fatal startup error. Genuine Google login and authenticated music acceptance remain pending user account selection. [Local build/install evidence](evidence/fav-music-login/local-apk-build.json).

Only `.easignore` changed in this build follow-up, to exclude mutable `.idea/`, `.vscode/` and `*.iml` state. The refreshed 326-file archive excludes backend/environment/native-build files and has zero scanned private secrets. Icons and playback source were preserved. No Git command, backend restart, database change or cloud build was performed.


The installed local APK's Login opens but shows a secure-connection/offline error. Fresh investigation confirms the compiled `anyway-pdf-obligation-suggests.trycloudflare.com` hostname returns **NXDOMAIN (status 3)** from both Google and Cloudflare public DNS. The other existing port-4000 tunnel, `massachusetts-colleges-silicon-utc.trycloudflare.com`, also returns NXDOMAIN from Google DNS. Existing local backend `/health/live` returns 200. No tunnel/backend was restarted. Fresh public HTTPS readiness was missed before this local build; APK compilation success is not authentication acceptance. The corrected Web ID is verified in APK, but genuine login/music remain **BLOCKED by the unavailable HTTPS endpoint**.

A new externally exposed tunnel requires approval under the user's cloud-change rule. The complete minimal follow-up scope—one replacement tunnel, credential-free host/Android verification, development-only endpoint alignment and one locally rebuilt signed APK—is prepared at [scope](evidence/fav-music-login/replacement-tunnel-local-apk-scope.json). No new tunnel or second local APK has been started.


## Replacement HTTPS tunnel and corrected APK — actual acceptance

Exactly one approved Quick Tunnel now targets the existing backend: **https://subdivision-barn-python-pack.trycloudflare.com**. Mac and Android credential-free health/GraphQL checks passed before the development endpoint change; protected account APIs reject anonymous access. No backend/PostgreSQL/Redis restart occurred. Only the development GraphQL, verified-auth and socket URLs plus the matching `preview-local-account` public profile were updated. The Google Web ID remains the verified downloaded `...f9smr1ta...` value.

The one corrected local APK built successfully in **2m 25s (1,075 tasks)**, with existing signing and no cloud-build submission or paid plan. Artifact `/tmp/fav-tunnel-local-apk/Fav-Music.apk`, **68,283,640 bytes**, SHA-256 `c1d69d2b8a8c307843db45db59b83ff18007ba0ddfb003f2d95b928e77c5fa5b`. Signing/native-module checks passed; actual Hermes 96 contains the new HTTPS origin and Web client, omits the retired origin, has one AppRegistry registration implementation and zero scanned private secrets. The APK installed with `adb install -r` on CPH2599 without uninstall/clear-data.

**Actual device PASS:** the owner confirmed genuine Google login and audible real music. Protected Home/Search/player screens rendered actual provider tracks. Timed native-media tests verified Pause/Play, Next/Previous index `7 → 8 → 7`, ten seconds of background playback, the app's media notification, and background pause/resume (approximately **3.8s resume delay**). Playing positions in Android MediaSession are time-base estimates; actual paused positions were used to confirm the timeline. An app force-stop/relaunch preserved stored session credentials and restored the protected Profile without another Google prompt; Profile reported **Account copy is synchronized**. Finally, the user explicitly confirmed **Seek working** after the real slider gesture. The app-only captured logs showed no observed fatal startup/runtime exception. This is not a claim that every device feature is verified.

**Coverage limits:** native-media commands exercise the same remote event service as notification controls, but do not prove every on-screen glass button gesture. Player scroll/animation yielded inconsistent automation touch bounds; seek is manual evidence. The standalone seek-helper process was killed, and no permission/root bypass was attempted. No Google SDK-success marker was retained, so Google success is supported by the owner's confirmation plus actual protected-session restoration rather than a fabricated SDK log. Controlled Believer/Levitating/Enemy queries in this APK, collection editing/persistence round trips, account switching/logout and full visual/video/accessibility/landscape acceptance remain incomplete. Local integration/regression evidence is separate. [Measured device evidence](evidence/fav-music-login/android-account-playback-acceptance.json), [build/tunnel checks](evidence/fav-music-login/replacement-tunnel-local-apk.json).

The Mac backend and this temporary tunnel must stay running for phone API access. No Neon/S3/schema/Google Console change, fake account or additional cloud APK build occurred; normal genuine login/session/synchronization data uses only the existing private local stores. Production readiness is not declared.


## Stage 1 — player stability source fix

Rapid selection races were reproduced by five failing native-contract regression tests before the fix. Programmatic carousel completion fed new track selections back into playback, while FIFO source resolution, separate autoplay and stale native snapshots allowed obsolete work to override current intent. The source now coalesces rapid selection bursts, commits only the latest target, keeps network lookup outside the native-command lock, preserves Pause and audio/video ownership, and accepts carousel navigation only from completed current human gestures. Normal visible Playing/Buffering captions were removed from audio and video; accessible feedback and visible errors remain. This section supersedes earlier playback-source-preserved statements for this Stage 1 change only.

**Local PASS:** 106 focused tests across nine files, mobile TypeScript, production Metro and Hermes 96; canonical startup/singleton verification and all four icon hashes pass. These tests use native-contract mocks and captured provider fixtures. **Android INCONCLUSIVE:** six actual rapid UI taps were recorded on the old installed APK, whose native queue remained empty/stopped. The updated source is not installed, so fixed-build Android playback is unverified. No APK/EAS build, backend/database/cloud change or Git command ran. [Exact changed files and evidence](evidence/player-stage1/verification.json). Stop after Stage 1.


## Stage 2 — Heart and Liked Tracks

The shared Heart now morphs one SVG path with smooth fill/unfill and a subtle bounded scale, without a circular overlay; reduced motion and interruption cleanup are supported. Likes update immediately across song rows, Player and track actions, then persist through existing account journals. Explicit latest intent, failed-save rollback and account-generation guards protect rapid taps and account switching. Valid stable catalog IDs no longer require resident metadata to be liked. Library/Liked Tracks retain titles and errors while removing repetitive descriptions and counts.

**Local PASS:** 65 focused tests, mobile TypeScript, production Metro and Hermes 96; all four icons unchanged. Tests include isolated account-journal restart/offline synchronization and mocked animation scheduling. **Android PENDING:** updated APK not built/installed; native appearance, smoothness and real device persistence remain unverified. No Git, builds, backend/database/cloud change ran. [Changed files and evidence](evidence/likes-stage2/verification.json). Stage 2 stops here.


## Stage 3 — real track sharing

The approved metadata change preserves the provider’s exact public song page through authenticated GraphQL. Track sharing now prepares the real title/artist, HTTPS browser page and canonical-ID Fav Music deep link, with duplicate/stale guards and no playback URLs or credentials. Selected-track metadata keeps menus usable after cache eviction. Incoming shared content validates exact identity, handles loading/retry/unavailable tracks, and guards explicit Play navigation; authentication remains required. Missing shared songs and confirmed empty InstaMus manual searches show “Sorry, this song was not found.” No recognition integration is claimed.

**Local PASS:** 112 focused tests, mobile/server TypeScript, contracts compilation, production Metro and Hermes; icons and Stage 2 core unchanged. Two actual provider song pages returned HTTP 200 with matching canonical/title/artist metadata during bounded HTML-only checks. **Runtime PENDING:** backend source was not activated and no APK was built/installed. Android chooser, recipient apps, cold/warm links, authenticated return and exact playback require device acceptance. No permanent sharing domain/store listing was supplied, so browser and custom-app links are separate options. No Git, service restart, live database write, migration, cloud change or EAS build occurred. [Changed files, approval scope and evidence](evidence/sharing-stage3/verification.json).


## Stage 4 — scrolling stability

Audio/video carousel scrolling now browses artwork without selecting or starting music; use an explicit cover tap or Previous/Next. Scroll-release presses are guarded without deferred playback. Stable metadata order/references, memoized rows, focus-owned query snapshots and coalesced page requests prevent no-op re-render/fetch churn. Load More retains existing rows/cursors and retries failed pages without dropping the prefix; query and position caches are bounded. InstaMus matches are virtualized rows and history keys survive prepends. Thumbnail retries are bounded across row remounts; video presentation metadata no longer resets decoder sessions.

**Local PASS:** 158 focused tests across 15 files, mobile TypeScript, production Metro and Hermes. Stage 1 playback services/player store, personal collection core, Stage 3 sharing/backend contracts and four icons match their prior hashes. Performance evidence is a set of rendering/request-budget contracts, not native FPS measurements. **Android PENDING:** updated APK not built/installed; real scrolling, recycling, position and low-end performance acceptance remain required. No Git, APK/EAS build, backend/database/cloud change or service restart ran. [Changed files and evidence](evidence/scrolling-stage4/verification.json). Stage 4 stops here.


## Stage 5 — clean UI copy

Removed promotional/repetitive copy, descriptions below decade/season sections, unnecessary subtitles and track totals across the core screens and account/video presentation. Section titles, real metadata, actions, accessible feedback, meaningful errors and necessary consent remain. Routine supporting/status copy is short; errors, attribution and informed-consent details are not blindly truncated. Transfer details remain visible in the existing preview before confirmation.

**Local PASS:** 25 focused UI/regression tests, mobile TypeScript and production Metro. Source comparison confirms unchanged action labels/controls, event bindings, input values, styles and native-video lifecycle effects; 75 protected core/data/asset hashes match. No Git, APK build, backend/database/cloud change or service restart occurred. Android visual acceptance remains pending. [Affected files and evidence](evidence/clean-copy-stage5/verification.json).


## Stage 6 — seasonal category UI

Home uses a clear Seasons heading. All five seasonal detail screens use a compact header, artist-only supporting metadata and one accessible empty message; loading/error/retry remain separate. Search/Discovery adopt the minimal rows only with a season selected. Classification, actual provider identities, artwork, playback, pagination and navigation bindings are unchanged.

**Local PASS:** 52 focused tests, mobile TypeScript and production Metro (2,968 modules); existing style definitions and 78 protected source/asset hashes match. Tests use native-component mocks and captured provider metadata. **Android PENDING:** no updated APK built/installed; native visual/accessibility acceptance is unverified. No Git, APK/EAS build, backend/database/cloud change or service restart occurred. [Changed files and evidence](evidence/seasonal-stage6/verification.json).


## Stage 7 — skeleton loading

Reusable song-row/card, artwork, playlist/resource-card, category-grid and saved-link skeletons match existing content geometry and font scaling. Home, Search, Library, Warehouse, InstaMus and relevant collection/discovery/history/provider screens show placeholders only for missing content. Known navigation stays usable; cached songs/playlists and pagination prefixes remain visible. A delayed native opacity pulse is static under reduced motion and stops on blur/background/unmount. Errors/retry and completed empty states remain distinct.

**Local PASS:** 50 focused tests, mobile TypeScript and production Metro (2,971 modules). Existing event/query/artwork bindings and 57 protected source/data/icon hashes match. Native animation/rendering tests use mocks; actual Android visuals, accessibility and performance are pending. No Git, APK/EAS build, backend/database/cloud change or service restart occurred. [Changed files and evidence](evidence/skeleton-stage7/verification.json).


## Stage 8 — bottom navigation UX

Dock and tab-bar rendering share identical icon slots, touch targets and a compact moving highlight, inspired by the Kobra navigation interaction. Native transform/opacity transitions cancel obsolete motion and settle directly for reduced motion/resize. Secondary screens retain their actual underlying tab highlight. Active reselect is a no-op; duplicate presses coalesce. Returning to a tab preserves its route params. Keyboard visibility hides the dock without unmounting its subtree; safe insets and available landscape width govern layout. Existing routes, mini-player implementation, screen/store state logic and icons are unchanged.

**Local PASS:** 28 focused tests, mobile TypeScript and production Metro (2,974 modules); 73 protected source/data/icon hashes match. Tests include installed tab-router state/param retention plus mocked UI, animation and keyboard contracts. **Android PENDING:** native visuals, keyboard/rotation, font scaling and real state/performance acceptance require an updated APK; none was built. No Git, backend/database/cloud change or service restart occurred. [Changed files and evidence](evidence/bottom-navigation-stage8/verification.json).


## Stage 9 — Home UI cleanup

The requested decorative counts, rejected slogans and leading card dot were already absent from current Home source. Removed the remaining promotional Home headline and first navigation-group caption; feature/song sections now use Explore/Songs. Home's top logo has no extra frame, while its original asset and touch target remain. Hero spacing is tighter and no longer reserves artwork space when artwork is hidden on small screens/large fonts. Useful headings and full error/retry feedback remain accessible. All actions, routes, catalog queries, artwork bindings, typography and palette are preserved.

**Local PASS:** 43 focused tests, mobile TypeScript and production Metro (2,974 modules); 69 protected feature/data/icon hashes match. Tests use mocked native rendering and captured metadata; actual Android visuals remain pending. No Git, APK build, backend/database/cloud change or service restart occurred. [Changed files and evidence](evidence/home-cleanup-stage9/verification.json).


## Stage 10 — Your Moment UX

Removed the mix-details toggle and explanation panels. Weather/Undated explanations and decorative recommendation counts were already absent. Your Moment retains meaningful titles, period, filters, artwork and essential actions. Its filters stack labels on narrow/short-landscape/large-font layouts; recent tracks use flexible artwork/title/artist rows and clear section spacing. Existing recommendation logic, IDs, playback, pagination, error/retry and navigation actions remain unchanged. Other FilterRow consumers retain their existing presentation.

**Local PASS:** 80 focused tests, mobile TypeScript and production Metro (2,974 modules); 87 protected source/data/icon hashes match. UI/layout tests use mocks and do not prove native pixel-level overlap fixes. Android visual/accessibility acceptance remains pending; no APK was built. No Git, backend/database/cloud change or service restart occurred. [Changed files and evidence](evidence/your-moment-stage10/verification.json).


## Stage 11 — video player UI/UX

Video controls and captions now stay outside the contained video canvas, including scrollable fullscreen. Audio/video retain the exact shared Kobra glass transport; technical captions/detail headings are removed while active title/artist, required credit, seek and meaningful errors remain. Try again is an error-only, coalesced same-video recovery action; empty/loading catalog screens have no playback retry. Poster presentation no longer flashes over revealed video during buffering. Session-key/generation guards prevent stale player/orientation callbacks; metadata credits no longer recreate decoders. Existing orientation restoration and media authorization remain.

**Local PASS:** 94 focused tests, mobile TypeScript and final production Metro with source-content checks; 64 protected source/media/icon hashes match. The two unchanged original clips decode successfully as H.264/AAC on Mac. Native player/UI tests use mocks: actual Android video, blur, orientation, performance and remote streaming acceptance remain pending. No mock media was added, no APK was built, and no Git, backend/database/cloud change or service restart occurred. [Changed files and evidence](evidence/video-stage11/verification.json).


## Stage 12 — InstaMus UI cleanup

The existing manual-reference flow now uses one concise form heading, contextual Search results/Saved reels titles, short success feedback and compact action labels with full accessibility labels. Saved cards retain canonical song title/artist, original reference and distinct user notes; duplicated link descriptions/counts/promotion are absent. Stable SongRow callbacks retain scroll guards and reject stale search-result playback. Invalid reference parsing shows an error; loading/library failure does not imply an empty collection. Real search, manual association/bookmark persistence, sharing and pagination remain. No separate InstaFav UI exists in current mobile code; no new route/provider or Stage 21 Instagram integration was added.

**Local PASS:** 75 focused tests, mobile TypeScript and production Metro with bundle checks; 118 protected feature/data/icon hashes match. UI/actions use native/store mocks and captured metadata; persistence tests use isolated memory storage. Android visual/keyboard/accessibility acceptance remains pending. No Git, APK build, backend/database/cloud change or service restart occurred. [Changed files and evidence](evidence/instamus-stage12/verification.json).


## Stage 13 — Explore Catalog

Browse uses the actual resource category as its title, retaining global Explore navigation and Back. Extra provider/loading copy, duplicate collection subtitle and unavailable-year placeholders are removed; actual metadata and one source credit remain. Memoized cards have consistent font-scaled artwork/text bounds and matching resource skeletons. Only resource filters omit the previously nonfunctional All chip. Query-owned visible pages avoid ghost rows/cached-navigation flashes and defer scroll restoration until content exists. Existing single-flight/deduplication/prefix/retry behavior and exact collection playback IDs remain.

**Local PASS:** 96 focused tests, mobile TypeScript and production Metro (2,975 modules) with bundle checks; 90 protected feature/data/icon hashes match. Native views/transports use mocks and catalog fixtures; no live API or Android performance/visual acceptance is claimed. No Git, APK build, backend/database/cloud change or service restart occurred. [Changed files and evidence](evidence/explore-stage13/verification.json).


## Stage 17 — nostalgic premium theme

Neutral black/white foundations, blue actions, green playback/positive feedback and selective yellow/red now use semantic tokens. The existing dark presentation remains active; light tokens are defined without adding a mode/settings flow. One original static cassette occupies the existing Home artwork area and is hidden on constrained text-only layouts. Regular cards are flat; repeated gradients/reflections and artwork shadows are removed. Kobra media glass, morphing, navigation, artwork and layouts remain.

**Local PASS:** 90 focused tests and all-workspace TypeScript. Tested normal-text color pairs reach at least 6.45:1 dark and 4.90:1 light. Hooks/action-data bindings match in 25 components; 73 protected source/data/config/icon files match the before-stage snapshot. Native views/SVG rendering use mocks; Android visual, accessibility and low-end performance acceptance remain pending. No APK build, Git, backend/database/cloud change or service restart occurred. Partial Stage 14 history work is unchanged and not declared complete. [Changed files and evidence](evidence/nostalgic-stage17/verification.json).
