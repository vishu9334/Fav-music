# Android UI/UX acceptance — catalog access blocker

7 November 2026, evidence collected through 05:12 UTC / 10:42 IST.

**Approved startup retry: PASS. Android catalog access: FAIL. EAS submissions: ZERO. Updated-APK acceptance: NOT RUN.**

The user approved one additional local startup attempt after the [earlier restart failure](ANDROID_UI_UX_ACCEPTANCE_RESTART_FAILURE.md). That retry succeeded. The previously approved single EAS build remains conditional on readiness; it was not submitted because Android catalog access did not pass. No approval is being silently repurposed into an as-is build.

## Completed work and actual evidence

| Check | Result |
|---|---|
| Approved startup retry | **PASS**: existing application/ServerBootstrap listening on 127.0.0.1:4000, PID 84177. Existing private key and original expiry reused; no key renewal. Existing Redis/tunnel unchanged. |
| Normal phone HTTPS | **PASS** on CPH2599 Wi-Fi: HttpsURLConnection liveness and credential-free GraphQL HTTP 200, TLS_AES_128_GCM_SHA256, ordinary platform trust and hostname verification. [Evidence](evidence/android-ui-acceptance/post-retry-https-android.json). |
| Actual mobile catalog client on host | **PASS**: DevelopmentCatalogClient → existing HTTPS diagnostic backend/provider, real search/details/pagination/leases for Believer, Levitating and Enemy. [Live results](evidence/android-ui-acceptance/post-retry-live-results.json). |
| Bounded real audio | **PASS**: all three returned sources HTTP 206, audio/mp4, exactly 1,024 bytes received/inspected, MP4 ftyp; readers immediately cancelled, no audio files saved. This is host HTTP evidence, not speaker output. |
| Protected account boundary | **PASS** live: missing/wrong diagnostic key 401; ordinary account API with diagnostic key 401; account fields, mutation and VIDEO unavailable through diagnostic schema. No user/session/collection writes or fake identity. |
| Exact phone query from host | **PASS**: same Believer query with first:3 returns HTTP 200, three tracks, 1,401 ms. [Comparison](evidence/android-ui-acceptance/exact-phone-query-host.json). |
| Android catalog probe | **FAIL**, including one bounded retry after host/provider caches were warm. Temporary DEX removed each time. Crash buffer identifies SocketTimeoutException waiting for HTTP response headers in AuthHttpClient.post, at getResponseCode, called from AadatPlaybackCatalogProbe.main line 16. Exit 137 is the diagnostic process's termination, not evidence of an Aadat app crash. [Probe result](evidence/android-ui-acceptance/post-retry-android-catalog.json), [probe stack](evidence/android-ui-acceptance/catalog-probe-crash.log). |
| Existing installed APK's actual client | **FAIL**: brought the previously installed app to foreground, entered the same fresh key through secure input without a secret file/argument, submitted Verify. UI first displayed Verifying, then **“Access could not be verified. Check the private key, server and network.”** Input cleared. No new APK installed. [Screenshot](evidence/android-ui-acceptance/existing-apk-access-failure.png), [UI tree](evidence/android-ui-acceptance/existing-apk-access-failure-ui.json), [existing-app Logcat](evidence/android-ui-acceptance/existing-app-logcat.log). |
| Source/archive integrity | **PASS**, all 328 prepared source inputs still match the reviewed manifest, zero changed inputs, current private key absent. Autolinking/configuration checks from preparation remain valid. Native Gradle/APK inspection is still pending. [State](evidence/android-ui-acceptance/acceptance-blocker-state.json). |

## Exact known failure and limits

The reproducible native diagnostic failure is **HTTP response-header read timeout**, after the secure request is opened, in the unchanged AuthHttpClient path. The installed app independently displays an access-verification failure. Its production error handling does not expose the raw exception, so its exact internal exception is not asserted from the UI alone.

The fresh key is accepted by the actual host-side mobile client, the same query returns promptly on the host, the backend remains listening, and ordinary phone HTTPS health/GraphQL succeeds. These facts rule out a universally expired/rejected key or a completely unavailable origin at that time. They do **not** establish the underlying network/edge/request-specific cause. Earlier cellular IPv6 header timeouts were observed before Wi-Fi; attributing the current authenticated request failure to IPv6 without a fresh family-specific comparison would be a guess.

The original failed backend startup exception remains unknown; the successful retry and later dependency checks do not retroactively identify it.

## Acceptance status

| Requested device acceptance | Status |
|---|---|
| New APK/package/native Blur/Video/TrackPlayer inspection and install | **BLOCKED**, build prerequisites unmet; no new build ID or APK link exists |
| Remediated key-form scrolling, keyboard, small-screen/large-font and rotation layouts | **NOT RUN** on updated UI |
| Native glass, morphing glyphs, artwork carousel, animations/performance | **NOT RUN** on updated UI; exact optical pixel refraction remains an implementation gap |
| Shared Login/Profile/Loading presentation review | **NOT RUN** on updated UI; account actions remain disabled in review |
| Real Saavn audible playback, controls and seek | **BLOCKED** by phone catalog access; previous APK playback evidence is historical, not a new acceptance PASS |
| Original local native video, fullscreen/carousel/seek | **NOT RUN** on updated UI; host media decode/bundling remains verified separately |
| Audio/video switching, background audio and notification controls | **NOT RUN** for candidate |
| Protected Home/Library/Playlists/Warehouse/account/history screens | **BLOCKED** by existing genuine-authentication/account HOLD; no bypass attempted |
| Screenshot/Logcat evidence | **PASS for the pre-build failure only**. Screenshot belongs to the old installed diagnostic UI, not the final remediated UI. |

## Current state and next dependency

- Fastify remains on loopback PID 84177 under the approved temporary startup wrapper, using the existing application/bootstrap classes. Redis and the original tunnel remain running unchanged.
- Existing diagnostic key expires **07:00:14 UTC / 12:30:14 IST**. No expiry extension or automatic renewal. New reads are denied at expiry; this is not an automatic backend shutdown.
- The app is left at its access-error screen with the private field cleared; personal data was not transferred, cleared or read.
- **Single conditional EAS approval is unused**. No submission marker, new build, upload, APK installation, uninstall or app-data clear occurred.
- No Git, database writes/migrations, S3/cloud changes, backend source changes, icon changes or authentication relaxation.

Before submission, diagnose and restore the phone's real diagnostic-catalog HTTPS path, then repeat the unchanged native/app request successfully, with a valid key window and verified archive. Do not change TLS protections, force fake success, alter account guards or claim host streaming proves phone playback. Any service/key/network/cloud change beyond approved scope requires its own exact review. If the existing key expires, that is an additional readiness blocker, not permission to renew it.

The [prepared acceptance checklist](ANDROID_UI_UX_ACCEPTANCE_PREPARATION.md) and single-build plan remain ready, but the critical preflight failure stops this run before EAS submission.
