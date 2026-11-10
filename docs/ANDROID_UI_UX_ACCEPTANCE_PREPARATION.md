# Android UI/UX acceptance preparation

7 November 2026. **Source/build preparation PASS. End-to-end readiness BLOCKED. No EAS submission or new APK installation.**

This follows [final UI remediation](FINAL_UI_UX_GAP_REMEDIATION.md). No application code/configuration, backend service, database, S3 or cloud resource was changed. No Git command or EAS build was run. No updated-UI screenshot or device playback PASS is claimed.

## Fresh checks

| Check | Actual evidence |
|---|---|
| Device | CPH2599, serial X4GACUMZMVEQY5XO, authorized ADB connection; Android API 36, USB charging, battery 100% at inspection |
| Expo native autolinking | PASS: Blur 14.0.3 → `expo.modules.blur.BlurModule`, Video 2.0.6 → `expo.modules.video.VideoModule`, ScreenOrientation 8.0.4 → its native module |
| Community native autolinking | PASS through the installed Expo SDK 52 `react-native-config` command used by settings.gradle: TrackPlayer, Reanimated, SafeAreaContext, SVG and Google Sign-In discovered. Plain `react-native config` wrapper lacks a root community CLI; no dependency was added/upgraded. This is not the Gradle path used by this project. |
| Preview configuration | PASS: `preview-real-songs`, internal APK, com.favmusic, existing project/signing settings, default orientation, Android keyboard resize, unchanged icons. Diagnostic mode true; ordinary auth/catalog/account persistence false. No private public-build variable. |
| EAS environment inspection | PASS: existing project/account preview environments list no remote variables; nothing edited. Profile provides reviewed public flags/endpoints. |
| Host HTTPS | PASS: public `/health/live`, `/health/ready`, `/graphql` HTTP 200, normal certificate/hostname verification, account/cloud capabilities remain false. Initial default Node fetch timed out; process-only IPv4 preference and curl IPv4 passed. No system/mobile DNS or TLS configuration changed. |
| Normal Android HTTPS | **FAIL**: two credential-free HttpsURLConnection probe runs exited 137 after uncaught SocketTimeoutException waiting for HTTP response headers. This is the diagnostic process, not an Aadat app crash. Temporary DEX files removed. |
| Android address-family diagnosis | Both public IPv4 addresses complete TLS 1.3 and return `HTTP/1.1 200 OK`. The tested IPv6 address completes TLS 1.3 but times out waiting for HTTP headers. DNS produced both families. Explicit diagnostic connections retained HTTPS endpoint identification, normal trust and SNI. This proves IPv4 transport, not the normal app's default routing. |
| Private key expiry | **BLOCKED**, correctly denied: key expired 04:03:42 UTC / 09:33:42 IST; HTTPS diagnostic access returns HTTP 401 / DEVELOPMENT_ACCESS_DENIED. No TTL weakening or renewal performed. |
| Provider control | PASS: approved bycomsolutions adapter returns real Believer, Levitating and Enemy metadata and audio. Each bounded request returns HTTP 206, audio/mp4, 1,024 bytes and MP4 ftyp. No media file saved. This direct-provider check is not a successful mobile→diagnostic-backend flow with a fresh key. |
| EAS source archive | PASS: actual installed NoVcs shallow-copy mechanism, absolute project root, 328 files, no missing required workspace/UI/media inputs, zero unsafe paths, zero scanned private-secret hits, no backend/stale native Android/node_modules. Blur selection pinned in lockfile. No upload. |
| Existing local verification | Prior unchanged source passed all-workspace TypeScript, 654 tests (3 live-connectivity skips), normal/diagnostic production Metro and Hermes. No source edits this preparation; checks were not unnecessarily repeated. |

Evidence: [Expo modules](evidence/android-ui-acceptance/expo-autolinking.json), [community modules](evidence/android-ui-acceptance/community-autolinking-summary.json), [preview config](evidence/android-ui-acceptance/config.json), [host HTTPS](evidence/android-ui-acceptance/https-host.json), [normal Android probe](evidence/android-ui-acceptance/https-android.json), [family/TLS/HTTP stages](evidence/android-ui-acceptance/android-network-stages.json), [probe-only Logcat](evidence/android-ui-acceptance/android-probe-logcat.log), [expired-key denial](evidence/android-ui-acceptance/expired-key.json), [real stream evidence](evidence/android-ui-acceptance/provider-control.json), [archive/native/secret checks](evidence/android-ui-acceptance/archive-secret-and-native-check.json).

Archive content-manifest SHA-256: `68fc9a009724ffa94db17b12200e4c7ded048e7993e4ae84482db4dd2a999208`. Full local file/hash manifest is `/tmp/aadat-ui-acceptance/archive-manifest.json`; the prepared copy is `/tmp/aadat-ui-acceptance/archive`. Recheck it before submission. Source archive contains all four unchanged icon assets and both original videos; private keys are entered later and never embedded.

## Minimum recovery and build approval scope

These actions have **not** run:

1. Restore a working normal HTTPS path on CPH2599, preferably by the user connecting reliable Wi-Fi. Rerun credential-free platform checks. Do not force IPs in production code, disable TLS, create a replacement tunnel or change account guards. IPv4-only diagnostic success alone is insufficient.
2. Approve **one graceful local Fastify restart**, reusing its existing development launcher, Redis DB15 and existing Quick Tunnel, to generate one fresh private two-hour catalog key in a 0600 temporary file. Prepared script pins the expected existing backend listener; if it changed, stop and inspect. Existing loopback/protected-mode checks, Neon SELECT 1 readiness and ordinary local Redis rate-limit/catalog-cache state are included. No user/session/collection writes, environment edits, migrations, Redis daemon restart or cloud changes.
3. Only after normal Android HTTPS and actual fresh-key catalog/media checks pass, approve **exactly one Android EAS build** with `preview-real-songs`, `EAS_NO_VCS=1`, absolute EAS_PROJECT_ROOT, existing signing credentials and the secret-free source inputs. It may consume existing EAS quota/credits; no fixed price is asserted. No additional build, remote environment edit or resource provisioning is included. Stop on critical failure. If the key expires before acceptance, testing stays blocked rather than extending expiry or silently restarting again.
4. After that single successful build, download the APK, verify its native Blur/Video/TrackPlayer classes/media and signing/package, install with `adb install -r` to preserve data, then run the acceptance checklist below. No uninstall/clear-data.

The user's step 4 requires explicit EAS approval; the earlier service-start restriction also requires approval for the fresh local restart. Build permission can be conditional on the named prerequisites, avoiding an as-is build that cannot test real songs. No recovery/build action is authorized by this report itself.

## Device acceptance checklist after approval/install

Record build ID/APK link, archive fingerprint, package/signature and timestamps. Capture target-app screenshots and scoped Logcat; redact private keys/signed URL queries before sharing. Keep raw sensitive diagnostics private. Do not clear unrelated device data or infer audible output from progress alone; obtain the user's listening confirmation where needed.

| Area | Actual actions / required evidence | Current status |
|---|---|---|
| Native startup | Check APK Blur/Video/TrackPlayer classes; launch; confirm main registration, module availability and no fatal app exception | NOT RUN |
| Key/form | Portrait and landscape; keyboard open; scroll to Verify; private entry clears; close/expiry denial preserved | NOT RUN |
| Shared account presentation | Diagnostic → visual review → Login, Profile, Loading; disabled account actions/no loaded identity; type and discard memory-only name | NOT RUN |
| Glass/motion | Effects review with automatic/lightweight mode; real audio/video controls; screenshot highlights/backdrop; record morph, press and carousel transitions; reduced effects | NOT RUN |
| Layout/accessibility | Portrait/landscape, short/resized window, large font, horizontal/system-bar safe areas, keyboard reachability and labels/focus. Record/restore any temporary device setting changes | NOT RUN |
| Real audio | Search and play Believer, Levitating, Enemy; user-audible confirmation; Play/Pause, Next/Previous, seek/progress, Stop→Play, retry/errors | NOT RUN on candidate |
| Local video | Both original clips: native decode, seek/duration/buffering/error UI, carousel, fullscreen/back/rotation and single live engine | NOT RUN |
| Media ownership | Real audio → local video pauses audio; clip changes/exit keep audio queue paused; explicit audio resume pauses video; no simultaneous output | NOT RUN |
| Background/notification | Audio continues after Home/lock; notification buttons drive native state; reopen UI remains synchronized; inspect audio focus/decoder errors | NOT RUN on candidate |
| Performance | Observe interaction/frame times and dumpsys gfxinfo/memory under scrolling, glass and transitions; report measured frame samples, not an unqualified low-end performance PASS | NOT RUN |
| Guarded main screens | Home/Search/Library/Playlists/Warehouse/InstaMus/history/Profile account operations require a genuine account; diagnostic screen map is explanatory, not an account/data test | BLOCKED by real authentication/account HOLD |

Exact optical pixel refraction remains unimplemented; native blur over the actual video surface and visual fidelity still require acceptance. Local videos are original test patterns/tones, not a licensed remote video catalog. Remote video, cloud synchronization, real-account acceptance, recognition provider and production media licensing retain their existing blockers.

**Decision:** One limited diagnostic candidate is prepared, but submission remains blocked pending explicit conditional approval and prerequisite recovery. New-APK visual/audio/video/background PASS/FAIL results, screenshots and APK link do not yet exist.
