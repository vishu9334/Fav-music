# Development HTTPS tunnel — computer and Android reachability PASS

7 November 2026, Asia/Calcutta. Executed the user's approval for **one** temporary Quick Tunnel, credential-free host/phone verification and a single development-mobile URL update after both passed.

Verified development GraphQL endpoint:

`https://anyway-pdf-obligation-suggests.trycloudflare.com/graphql`

The tunnel is left running as **PID 72346**, forwarding only to **http://127.0.0.1:4000**. Fastify/Redis were not restarted. This temporary URL relies on the connector and local services remaining running; it is not a production endpoint or availability guarantee.

## Actual evidence

| Operation | Observed result |
| --- | --- |
| Before creation: local readiness | HTTP 200; ready=true |
| Quick Tunnel creation | Exactly one CLI invocation, one generated origin and a registered connector; no other tunnel/account/DNS configuration changed |
| Computer HTTPS /health/live | HTTP 200; status alive |
| Computer HTTPS /health/ready | HTTP 200; ready=true |
| Computer HTTPS /graphql | HTTP 200; health ok, service aadat-music, version 1 |
| CPH2599 HTTPS /health/live | HTTP 200; status alive; TLS_AES_128_GCM_SHA256 |
| CPH2599 HTTPS /graphql | HTTP 200; health ok, expected service/capabilities; TLS_AES_128_GCM_SHA256 |
| Credential transport | No Google/access/refresh/app credentials sent by any probe; normal certificate/hostname verification; redirects rejected |
| Android temporary diagnostic | Reviewed DEX hash matched; temporary file copied/executed and removed successfully; no APK installed |
| Development API configuration | Updated only apps/mobile/.env.local → EXPO_PUBLIC_GRAPHQL_ENDPOINT, after matching host+phone PASS results |
| Preservation | All other mobile values/lines preserved; server/.env, Redis Cloud/local profile, app/EAS configurations unchanged |

Host checks began at **06:44:28 IST**; phone checks began at **06:45:17 IST**; the mobile endpoint update completed at **06:46:31 IST**. Unique probe ID: `aadat-https-871d74a9-05b1-4dd1-9a75-2bece5c0d831`. Both clients verified the same newly generated origin. Android responses were 57 and 172 bytes; both probes enforced bounded response sizes and timeouts.

[Host HTTP evidence](evidence/development-https-tunnel/host-results.json), [physical Android evidence](evidence/development-https-tunnel/android-results.json), [tunnel invocation](evidence/development-https-tunnel/tunnel-process.json), [single-key update/preservation proof](evidence/development-https-tunnel/mobile-update.json), [consolidated results](evidence/development-https-tunnel/verification.json).

## Exactly what changed

The only active runtime configuration edit was:

- File: `apps/mobile/.env.local`
- Key: `EXPO_PUBLIC_GRAPHQL_ENDPOINT`
- New value: `https://anyway-pdf-obligation-suggests.trycloudflare.com/graphql`

The update refused symlink targets/concurrent edits, required matching host/device successful verification and completed device cleanup, then atomically replaced the file. Reverse reconstruction confirmed every other line unchanged. Server/root production environment, Redis Cloud URL, local Redis profile, OAuth values, app icons/configuration and EAS settings were preserved.

Auth/catalog/cloud persistence flags remain unchanged and disabled/unset. EXPO_PUBLIC_AUTH_VERIFIED_ENDPOINT was not set: HTTPS transport reachability does not establish real OAuth/backend account readiness. EAS preview variables remain untouched. No app bundle/APK was rebuilt; a future development client run must reload its environment to use the new value.

Documentation/evidence additions: this report and `docs/evidence/development-https-tunnel/`; the preparation report now links to these completed results. Connector/raw phone logs remain private under `/tmp/aadat-https-tunnel-preparation/`. No secrets were copied into public evidence.

## Scope and remaining blockers

The API's normal **local Redis database-15 rate-limit counters** incremented as explicitly disclosed and approved. No PostgreSQL SQL, application/user/session records, migrations, S3 operations, production deployment, paid-resource provisioning or EAS build was performed. The only cloud action was the approved single temporary Quick Tunnel. Existing unrelated tunnels were not modified.

- **Authentication/schema:** authenticationEnabled=false and cloudCollectionsEnabled=false were returned by the actual API on both clients. Real Google login, user persistence and session operations remain under their separate holds; prior preflight found public.User/history absent.
- **Native Android acceptance:** a real phone's Android HTTPS stack reached the API. This standalone diagnostic is not proof of the Aadat APK's auth transport, Google login, SecureStore, TrackPlayer, video or audible playback. No APK was installed/launched here.
- **Build configuration:** no EAS build or remote variable update is authorized by this work. Excluded local environment files do not supply remote build settings automatically.
- **Production:** Quick Tunnel URLs are temporary and depend on this Mac's processes/network. Production Redis Cloud TLS remains unresolved; the separate trusted-loopback Redis development setup was preserved.

**Result: HTTPS development transport and the requested development configuration update PASS. Production authentication and Android app acceptance are not declared complete.**
