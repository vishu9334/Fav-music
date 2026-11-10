# HTTPS development Quick Tunnel — preparation and reviewed scope

7 November 2026, Asia/Calcutta. **At preparation time, no tunnel or configuration change had occurred and public/Android checks were NOT RUN.** This is the reviewed pre-approval record; execution is now completed in the verification report linked below.

**Execution update:** the user approved this scope. The one tunnel was created; computer and CPH2599 HTTPS checks passed, and only the development-mobile endpoint was updated. [Completed verification and current URL](DEVELOPMENT_HTTPS_TUNNEL_VERIFICATION.md). The preparation record below is historical; no repeat approval is requested.

## Preparation evidence

- Existing Fastify process 63904 is still listening on **127.0.0.1:4000**. Its preceding approved activation passed local health/GraphQL, Redis and Neon checks; public connectivity is not inferred from that result.
- CPH2599 is connected and ADB-authorized, serial `X4GACUMZMVEQY5XO`.
- Installed cloudflared **2026.10.7** supports the reviewed url/no-autoupdate/metrics flags. Neither default ~/.cloudflared/config.yml nor config.yaml exists; no account configuration was changed.
- A bounded Android HTTPS diagnostic is compiled to temporary DEX. Compilation succeeds; javac emits only obsolete-Java-8 target warnings. Nothing has been pushed to or executed on the phone yet; this is not an APK/EAS build.
- Host diagnostic syntax check passes. Both diagnostics use normal TLS/hostname validation, reject redirects, send no credentials and cap each JSON response at 64 KiB with bounded timeouts.
- Current development mobile EXPO_PUBLIC_GRAPHQL_ENDPOINT still contains the obsolete tunnel. Auth/catalog/cloud persistence remain disabled; the verified-auth endpoint marker is absent.

[Preparation status](evidence/development-https-tunnel-preparation/readiness.json), [current public mobile configuration](evidence/development-https-tunnel-preparation/mobile-config.json), [reviewable Android probe source](evidence/development-https-tunnel-preparation/AadatDevelopmentHttpsProbe.java), [reviewable host probe](evidence/development-https-tunnel-preparation/host-check.mjs).

## Proposed single-tunnel action

Only after explicit approval, start **one** temporary Quick Tunnel:

```bash
cloudflared tunnel --url http://127.0.0.1:4000 --no-autoupdate --metrics 127.0.0.1:0
```

Record its new process ID and actual generated HTTPS origin from its own output. Do not guess a hostname, create a named tunnel, edit DNS/account settings, expose Redis port 6379, alter unrelated existing tunnels or restart backend/Redis. Keep private connector logs in /tmp. Stop this newly created tunnel if verification fails; do not automatically create another.

This creates a temporary external HTTPS route to the local API. Anyone knowing its URL can reach the public health/capability routes; authentication guards and rate limits remain enforced. It is a development endpoint, not a stable production address or deployment. [Cloudflare Quick Tunnel documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

No paid resource provisioning is requested. Normal existing service/traffic usage can apply. No API/Google/session secrets are sent in probes or copied into public reports. The loopback HTTP origin stays on this computer; the public client connection uses verified HTTPS.

## Verification and the one allowed configuration update

1. Check the generated HTTPS origin from the computer: GET /health/live, GET /health/ready and POST /graphql with health and authCapabilities only. Require HTTP 200, expected service identity, health/readiness success and the current held auth/cloud flags. Redirects, non-JSON/oversized responses or TLS failures stop the update.
2. Push the temporary diagnostic DEX to a unique /data/local/tmp path on CPH2599, run it via Android app_process using default HttpsURLConnection trust/hostname verification, and remove only that temporary file afterward. No APK/app install, app launch, data clearing or OS trust-store modification is included.
3. The Android probe must independently return HTTPS HTTP 200 for liveness and GraphQL, an actual negotiated cipher and the expected payload for this newly generated origin and unique probe ID. This proves device transport reachability, not the Aadat APK's login, native modules or music playback.
4. Only when **both** host and device verification pass, update exactly **apps/mobile/.env.local → EXPO_PUBLIC_GRAPHQL_ENDPOINT** to the verified origin plus `/graphql`. Recheck the file before writing so concurrent user edits cannot be overwritten. Preserve every other setting and the file's remaining contents.
5. Do not update server/.env or root .env (its alias), Redis Cloud/local Redis settings, production app config, OAuth values, EAS environment or other mobile variables. Do not set EXPO_PUBLIC_AUTH_VERIFIED_ENDPOINT or enable authentication/catalog/cloud flags: transport success alone does not establish real auth readiness.
6. Record the generated URL, statuses, cipher/device/probe identity and the one-key development change. Retain the approved working tunnel process for review; no additional tunnel/build is authorized.

The existing Fastify rate limiter necessarily increments **normal local Redis database-15 expiring counters** when these HTTP checks run. Those already-approved operational counters are disclosed in the requested scope. No PostgreSQL SQL, account/user/session records, migration/history writes or other database data writes are requested. The health/capability queries inspect service state only. Rate limiting must not be disabled to avoid the counters.

## Exact approval requested

Approve only one temporary Cloudflare Quick Tunnel, the credential-free computer/Android checks (including a removable diagnostic file), and the single development-mobile URL update after both checks succeed. Include normal existing local rate-limit counters. This is the narrowly requested exception for creating the temporary route; it does not permit other cloud/provider configuration changes.

Your task's step 6 requires approval before creating a tunnel or changing configuration. No such action has occurred. No Git commands, migrations, application database writes, S3 changes, paid resources or EAS builds are included. A later APK build needs its own explicit approval.

## Remaining blockers independent of HTTPS

Authentication/session/schema permissions remain on HOLD; public.User and Prisma history were absent in the approved preflight. EAS preview variables remain unconfigured and excluded development env files do not become cloud-build variables automatically. No Google login, account persistence, real-song Android playback or production readiness will be claimed from a transport probe.

Only this report and `docs/evidence/development-https-tunnel-preparation/` were added during preparation. Runtime source/configuration and production/Redis settings remain unchanged. New temporary probe source/classes/DEX and readiness artifacts are under `/tmp/aadat-https-tunnel-preparation/`.
