# Android real-song preview — local checks PASS; E2E readiness BLOCKED

6–7 November 2026, Asia/Kolkata. **No EAS build has been submitted. No APK/build ID/link exists for this task.** The connected phone is CPH2599, serial `X4GACUMZMVEQY5XO`; fresh ADB package inspection returns `Unable to find package: com.favmusic`. No app was installed, launched or tested. No app Logcat capture exists because the new APK has not been built/installed.

The preview source archive is prepared. **Submitting it as configured cannot satisfy the requested real-song acceptance tests:** the preview has no endpoint/auth/catalog variables, account access is gated, and the configured local HTTPS backend fails DNS resolution. Recommendation: keep the single build unspent until those prerequisites are resolved. A user can explicitly approve an as-is startup/native smoke-test build, but that is not a real-song playback acceptance build.

**Latest audit:** [real-song test readiness](ANDROID_REAL_SONG_TEST_READINESS.md) freshly reconfirms upstream audio access, current catalog 401 guards and the remaining preview configuration blocker. HTTPS development transport now works; this earlier report's DNS finding is historical. No as-is build has been approved.

## Actual verification results

| Check | Status and evidence |
| --- | --- |
| TypeScript | PASS: four workspaces, `pnpm run typecheck` |
| Full local suite | PASS: **599 passed, 3 live-database tests skipped**; no live DB test enabled |
| Catalog-branch production Android Metro | PASS: 2,932 modules, 29 assets; catalog flag enabled only in this export process |
| As-configured preview production Android Metro | PASS: 2,932 modules, 29 assets; all EXPO_PUBLIC values removed from this export process, dotenv disabled, matching current empty preview configuration |
| Hermes compilation, both bundles | PASS: one registerComponent definition each; canonical `__r(167); __r(0);` entry sequence; no SoundHelix stream string |
| Expo/app identity | PASS: SDK 52; package `com.favmusic`; project `be1ffc50-0de2-4b0e-a0d1-ad3ea5e543ee`; dark theme, aadatmusic scheme and existing icon paths preserved |
| Community native source discovery | PASS: 8 Android packages, including TrackPlayer and RNGoogleSignin; not an APK/native runtime proof |
| Expo native source discovery | PASS: 18 Android Expo modules, including ExpoVideo, SecureStore, FileSystem and ScreenOrientation; not an APK/native runtime proof |
| Custom native sources | Auth transport/share Java package and Expo config plugin included; actual APK compilation/registration pending |
| Native dependency version alignment | **WARNING / exact recommendation check FAIL:** Expo 52.0.49 recommends RN 0.76.9; RN remains intentionally pinned at 0.76.6 under the existing runtime fix. No dependency was changed. Other checked Expo-managed packages match their SDK ranges. The check was offline. |
| Upload source archive | PASS: 300 files, no missing required workspace files, no environment/signing files, no symlinks, no backend or legacy Android project; exact private-environment-value scan found no matches |
| EAS account | `whoami` succeeded; read-only preview environment queries succeeded; no signing credentials downloaded or changed |
| Preview EAS variables | **BLOCKED:** zero variables at project and account scope; preview profile has no `env` values |
| Configured local HTTPS GraphQL backend | **FAIL:** credential-free `__typename` attempt failed before HTTP, `TypeError: fetch failed`, cause `ENOTFOUND` for massachusetts-colleges-silicon-utc.trycloudflare.com |
| Device connectivity | PASS: CPH2599 connected and ADB-authorized |
| New APK/runtime/audio/Search/Playlists/Warehouse | **NOT RUN / BLOCKED**, not Android PASS |

[Machine-readable verification](evidence/android-real-song-readiness/verification.json), [test summary](evidence/android-real-song-readiness/tests-summary.txt), [TypeScript output](evidence/android-real-song-readiness/typecheck.log), [dependency check](evidence/android-real-song-readiness/mobile-dependencies.log), [ADB package evidence](evidence/android-real-song-readiness/device-package.txt).

Hermes warnings concern expected native/worklet globals; compilation exited zero. Existing test DOM accessibility warnings did not fail the suite. Native source discovery cannot establish Gradle compilation, decoder compatibility, signing/OAuth registration or physical playback.

## Native/configuration audit

Installed versions include Expo 52.0.49, React 18.3.1, RN 0.76.6, TrackPlayer 4.1.2, ExpoVideo 2.0.6, ScreenOrientation 8.0.4, SecureStore 14.0.1 and Google Sign-In 16.1.1. [Exact installed/declared/SDK recommendations](evidence/android-real-song-readiness/native-versions.json).

Both root and mobile module discovery find the same required Android modules. The custom AadatAuthPackage is added by the existing Expo plugin, rather than automatic package discovery. Main registration remains synchronous before playback-service registration. The notification playback service routes commands through the same AudioPlaybackService; RemoteStop uses stop rather than queue reset. Foreground-service/media-playback/wake-lock permissions remain configured. Hermes is the SDK's default; the explicit New Architecture setting remains false.

The archive excludes the legacy `apps/mobile/android` tree. EAS will generate native sources from reviewed Expo configuration; it must not directly build the old native package/signing setup. Actual APK verification must inspect `com.favmusic`, certificate, TrackPlayer, Google Sign-In, ExpoVideo, SecureStore and custom Aadat modules after the approved build.

All four existing icon files, both Expo configs, root EAS profile, ignore rules, entry point, Metro configs and lockfile retain their initial hashes. No runtime code, native dependencies or app environment was changed during this readiness task.

## Real catalog → TrackPlayer audit

The selected backend provider remains Bycom through `IMusicProviderService` → existing JioSaavn compatible adapter → ProviderCatalogService → authenticated GraphQL catalog. The mobile path remains GraphQLCatalogRepository → CatalogClientService/registry → MediaLeaseService → `resolveCatalogTracks` → AudioPlaybackService/native queue. Search, personal playlists and Warehouse use the same canonical UUIDs; no new demo queue or direct unauthenticated provider path was introduced.

The previous live [Bycom verification](JIOSAAVN_BYCOM_DEVELOPMENT_SWITCH.md) received 206/audio/mp4/1,024 bytes for each of Believer, Levitating and Enemy at 96/160/320 kbps. Those are historical source-access checks, not a new device playback PASS. Their exact native identities are in the device plan below. Sources must be freshly resolved by the app for acceptance; opaque URLs must not be hardcoded into this APK.

This run's regression suite verifies the real captured metadata through local GraphQL, canonical identity persistence, source leases, Play/Pause/Next/Previous/Seek, RemoteStop/empty queue recovery, collection persistence, recommendations, sharing and manual linking. Native playback and authenticated contexts in automated tests are explicitly mocked/test-only. No real login or backend/user write was executed.

The actual default catalog transport demands a real authenticated user and an approved exact HTTPS endpoint. Home, search/player and personal collection routes remain account-gated. Existing user/guest documents remain preserved; no guest bypass, fake session or test identity is made available in the app.

## Exact build blockers

1. Neither local mobile auth/catalog enablement flags nor a verified-endpoint marker is set. Root preview has no public environment values, and read-only EAS checks found none at project/account preview scope.
2. Environment files are correctly excluded from the cloud archive. A local URL or Google client ID is therefore not supplied to this preview simply because it exists in a local env file. Expo documents this [remote build environment boundary](https://docs.expo.dev/eas/environment-variables/).
3. The locally configured tunnel hostname failed DNS resolution from this host. This does not establish a global outage; it does mean the endpoint is not currently verified for credentials, catalog requests or the Android device.
4. Real backend OAuth/session/schema prerequisites remain under the existing HOLD. No live schema was inspected or changed in this task. Successful user registration/login/session creation cannot be assumed or authorized by an APK build approval.
5. Exact RN patch alignment has the existing warning above. The pinned Gate 5K runtime was preserved; no unreviewed upgrade or singleton change was made.

Before a useful acceptance build, provide/verify a device-reachable HTTPS backend with real authentication enabled and an approved account persistence path. Then review the public preview values for `EXPO_PUBLIC_GRAPHQL_ENDPOINT`, matching `EXPO_PUBLIC_AUTH_VERIFIED_ENDPOINT`, `EXPO_PUBLIC_AUTH_ENABLED=true`, `EXPO_PUBLIC_CATALOG_ENABLED=true`, and the existing public Google Web client ID. Android OAuth package/signing registration must match the built APK. These values are not configured or approved by this report. `EXPO_PUBLIC_ACCOUNT_PERSISTENCE_ENABLED` must remain false while live collection writes are blocked; authenticated per-device journal checks can then be distinguished from cloud synchronization. Any required auth database/session writes need a separate approval; none are included here.

## Prepared archive and proposed one-build scope

Prepared using the installed EAS `NoVcsClient.makeShallowCopyAsync` itself, with explicit absolute `EAS_PROJECT_ROOT`. No EAS upload/job/Gradle build/prebuild was invoked. The archive contains mobile source/plugins/local original video assets, all workspace dependency sources/exports/configs, pnpm lockfile, hoisted-linker configuration and icons. No node_modules, backend, env, signing file or legacy Android tree is included. [Archive checks](evidence/android-real-song-readiness/archive-check.json), [exact-secret scan](evidence/android-real-song-readiness/archive-secret-check.json).

Local review artifacts:

- `/tmp/aadat-android-readiness/archive/` — exact 300-file source staging directory.
- `/tmp/aadat-android-readiness/aadat-preview-source.tgz` — 2,502,748-byte local archive; SHA-256 `f7cf7a2257677c077b1c0eee9d4b50eeed78e0137d574e87dc5d850b8f6d73aa`.
- `/tmp/aadat-android-readiness/archive-files.json` — complete file manifest; sorted manifest hash `3c2beba68d33b5e81d6d5d1095f602745dd903b1e3a778bda58bdd2426acceb4`.
- Export bundles/bytecode, full local test logs and private EAS read outputs remain under that directory. Private EAS outputs are not copied into repository evidence.

Proposed command, run from repository root **only after explicit approval**:

```bash
EAS_NO_VCS=1 EAS_PROJECT_ROOT="$PWD" EXPO_NO_DOTENV=1 ./apps/mobile/node_modules/.bin/eas build --profile preview --platform android --non-interactive --freeze-credentials
```

The installed CLI's NoVcsClient attempts `git rev-parse` unless EAS_PROJECT_ROOT is absolute; setting both variables is required to honor the no-Git instruction. That fallback was identified by reading the CLI source and was not executed. `--freeze-credentials` prevents credential updates in noninteractive mode. Missing signing credentials must stop the attempt rather than generate/rotate them.

Approval scope is **one** internal-distribution Android preview APK job for existing project/package, source upload to EAS and reuse of existing signing credentials; it may consume EAS quota/credits. The exact plan/cost entitlement is not verified. No automatic resubmission, additional build, backend deployment, cloud environment edit, paid resource, migration, database write or S3 change is covered. The job operates on workspace source; recheck archive/configuration equivalence immediately before any approved submission. The local tar is a review artifact, not an already uploaded EAS artifact. If configuration changes to resolve blockers, regenerate the archive and present that concrete revised scope before submission.

If the user elects an as-is build, only installation/startup/native/configuration smoke checks are currently executable; real-song acceptance remains blocked. Building as-is is not recommended for the stated goal.

## Device acceptance plan after the prerequisites and build approval

All cases below are **NOT RUN**. [Structured results template](evidence/android-real-song-readiness/android-acceptance-results.json) contains no fabricated evidence, build ID or APK URL.

1. Record the single EAS build ID/status/APK link. Download that APK, compute its hash and inspect package, certificate, permissions, native classes/modules and icon resources. Stop on failure; do not create a second build without approval.
2. Install with `adb -s X4GACUMZMVEQY5XO install -r <verified-apk>`, preserving app data. Obtain any physical Android install approval when prompted. Do not uninstall or clear account/guest documents.
3. Begin fresh, timestamped Logcat capture before launch; keep raw output private and redact tokens, personal identifiers and opaque media URLs before reporting. Launch `com.favmusic/.MainActivity`, record PID/startup/UI evidence, and check canonical main registration and native-module/startup errors.
4. Use a genuinely authenticated account over the verified HTTPS backend. Confirm actual catalog queries and exact track identities; no test token, guest mode or seeded synthetic catalogue may substitute.

| Requested song | Expected artist | Provider-native ID |
| --- | --- | --- |
| Believer | Imagine Dragons | BeXBcbVK |
| Levitating | Dua Lipa | 3IoDK8qI |
| Enemy (from the series Arcane League of Legends) | Jid, Imagine Dragons, Arcane, League of Legends | drvhW8ob |

5. For each song, record visible metadata, native active-track identity, advancing position/duration, buffering/decoder/HTTP errors and media session state. Obtain physical audible-listening confirmation. Playing state or an advancing timer alone cannot prove audible output. Do not record/copy song audio as a test artifact.
6. Build an explicit three-song queue; test Play/Pause, Next/Previous and seek to a known offset, preserving selected ID/order and observing native progress. Test pause/seek/resume, Stop/Play and notification commands without losing the queue.
7. Background/lock the device for at least 60 seconds, confirm audible continuation and notification controls (Play/Pause/Next/Previous as exposed), then return to the app and compare UI/native state. Handle audio focus and network loss honestly; record failures.
8. Search real titles/artists; inspect distinct result pages and an empty query result. Create a clearly named local account playlist, add/reorder where supported/remove real canonical songs, relaunch and verify journal persistence. Save/archive/restore those songs in Warehouse and verify preservation. Keep cloud writes disabled; do not describe per-device results as cloud persistence.
9. Report PASS/FAIL/NOT RUN per case with Logcat timestamps, screenshots, native media/progress evidence, exact source IDs and separate audible confirmation. Report build/install/login failures as failures; stop before any additional build or held database action.

## Changes and approval boundary

Only this report and `docs/evidence/android-real-song-readiness/` were added to the repository. Temporary local verification/archive files were created in `/tmp/aadat-android-readiness/`. No runtime/configuration/icon/dependency file was modified. Read-only EAS account/environment calls and a credential-free failing HTTPS connectivity request were made. No credentials were transmitted to HTTP or an unverified backend.

The follow-up access diagnosis also identifies a closed backend Redis client and missing verified Redis TLS configuration; see the linked report below.

**User decision, 7 November 2026: keep EAS blocked and resolve access prerequisites first. No as-is build is approved.** See [current access diagnosis and proposed recovery scope](ANDROID_ACCESS_PREREQUISITES.md). Backend/tunnel recovery was subsequently approved only after Redis TLS verification; it is still blocked at that prerequisite. The separately approved read-only SQL preflight has passed. See [current Redis/provider and schema findings](REDIS_TLS_CONFIGURATION_REVIEW.md). No migration, account/session write, S3 change, EAS environment edit or APK build is approved.
