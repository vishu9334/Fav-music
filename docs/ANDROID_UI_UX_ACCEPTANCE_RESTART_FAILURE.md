# Android acceptance — approved restart failure

Follow-up: the subsequently approved startup retry succeeded; [current acceptance blocker](ANDROID_UI_UX_ACCEPTANCE_BLOCKER.md) records the remaining Android catalog failure and unused conditional EAS approval. This document retains the earlier failure evidence.

7 November 2026. **Conditional EAS approval recorded; builds submitted: ZERO. Backend startup: FAIL. New-APK acceptance: NOT RUN.**

The user approved one local Fastify restart and exactly one EAS preview-real-songs APK build, conditional on normal Android HTTPS and fresh-key catalog checks passing. The one approved restart was attempted; its replacement process exited. No second startup was attempted. The conditional build approval remains unused, but its prerequisites are unmet.

## Actual evidence

- **Phone Wi-Fi HTTPS PASS before restart:** CPH2599's normal HttpsURLConnection path returned HTTP 200 for liveness and GraphQL, TLS_AES_128_GCM_SHA256, with default trust/hostname validation. Its route now uses wlan0. Temporary probe removed. [Evidence](evidence/android-ui-acceptance/wifi-pre-restart-https-android.json).
- **Restart attempted:** owned old Fastify 92809 stopped gracefully; launcher 81084 generated a private two-hour key, expiring **07:00:14 UTC / 12:30:14 IST**, then logged only `[Startup] API failed to start. Check server configuration and dependency connectivity.` Existing Redis and tunnel were retained. [Activation](evidence/android-ui-acceptance/approved-restart.json).
- **Current service FAIL:** launcher exited; port 4000 has no listener. Cloudflare returned HTTP 502 origin_bad_gateway on health/readiness/GraphQL. [HTTP evidence](evidence/android-ui-acceptance/post-restart-https-502.json).
- **Fresh-key live tests FAIL:** mobile catalog integration could not unlock through the unavailable origin; Android catalog probe also failed and was removed. This is not evidence of invalid credentials or a playback-code failure. The phone's pre-restart connectivity PASS does not establish current endpoint availability.
- **Read-only dependency checks PASS afterward:** loopback Redis/protected mode/PING; pooled Neon SELECT 1 with authorized TLS 1.3; exact Prisma component native connect plus SELECT 1; application construction/Fastify plugin validation without start/listen or SQL. [Neon](evidence/android-ui-acceptance/post-failure-neon-readiness.json), [Prisma](evidence/android-ui-acceptance/post-failure-prisma-readiness.json), [routes](evidence/android-ui-acceptance/post-failure-route-validation.json).

**Exact original startup cause remains unconfirmed.** The production startup catch intentionally omits raw errors; the failed attempt did not retain its underlying exception. Passing subsequent dependency checks cannot establish whether that earlier failure was transient DNS, connectivity, readiness or another issue. No cause is guessed.

## Prepared minimum recovery

One additional **local startup attempt**, without stopping another process or renewing/extending the key, is prepared at `/tmp/aadat-ui-acceptance/start-existing-key-on-approval.mjs`. Both wrapper and embedded entry syntax were checked without execution. It:

1. Refuses to start if port 4000 is occupied or the existing key has under one hour remaining.
2. Reuses the reviewed development overlay, existing private key and original expiry, local Redis DB15 and existing tunnel.
3. Runs the existing application/bootstrap classes, with sanitized exception name/code/message captured if startup fails. No repository/backend code or persistent environment change.
4. Retains ordinary readiness SELECT 1 and local rate-limit/catalog-cache state only. No application/session/account writes, migrations, Redis restart, new tunnel, S3 or cloud changes.
5. Permits at most one attempt through an exclusive local marker. Failure stops the workflow; no repeated starts or EAS submission.

**Explicit approval is required:** the authorized single restart was consumed. The user previously required approval before service starts. A retry is not silently folded into that one-attempt scope. This is a new local-start approval request, **not a second EAS approval request**.

After an approved successful startup, reverify host/phone health, real fresh-key mobile catalog/streams, account isolation and archive integrity. Only if those pass may the already-approved single EAS build be submitted. If the key window becomes insufficient, do not renew it or submit an unusable build.

The existing [acceptance checklist](ANDROID_UI_UX_ACCEPTANCE_PREPARATION.md) remains applicable. No new APK, updated-UI screenshot, native-glass/video/performance acceptance or speaker-output evidence exists yet. No Git, database writes, migrations, S3 or cloud modifications occurred.
