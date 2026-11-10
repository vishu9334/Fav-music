# Android access prerequisites — EAS remains blocked

7 November 2026, Asia/Calcutta. The user chose **keep EAS blocked and resolve access prerequisites first**. No APK job is approved. No database migration, auth/user/session write, S3 operation or cloud environment update has been performed. No process was restarted and no new tunnel was created.

**Current status after approval:** scope B was approved and completed PASS; scope A was approved conditional on verified Redis TLS and remains blocked. The user then confirmed the TLS endpoint is not yet known. See [provider requirements and fresh preflight results](REDIS_TLS_CONFIGURATION_REVIEW.md). Historical diagnosis and reviewed scopes below are retained; no repeated scope-A/B approval is requested.

**Local-development alternative now active:** the user later approved a separate loopback Redis profile and local Fastify restart. [Fastify/Redis/Neon now pass local connectivity checks](LOCAL_REDIS_ACTIVATION_VERIFICATION.md). Redis Cloud TLS and external tunnel/auth/EAS gates below remain unresolved; the original Cloud TLS scope was not used to authorize a tunnel.

## Fresh findings

| Prerequisite | Finding | Status |
| --- | --- | --- |
| Backend startup implementation | Existing executable main/bootstrap are implemented; local process 18301 listens on 127.0.0.1:4000 | Present; do not rebuild |
| Backend request health | `/health/live` returns HTTP 500; GraphQL returns an error; existing process log reports `Connection is closed.` | FAIL |
| Redis service reachability | Existing configured endpoint resolves; PING returns `PONG`, status ready; this probe used the existing non-TLS configuration | Reachability only; not secure readiness |
| Redis account-security transport | REDIS_URL uses redis://; REDIS_TLS is false/unset; a subsequent credential-free strict TLS handshake to that exact host/port fails ERR_SSL_WRONG_VERSION_NUMBER | BLOCKED; approved TLS configuration required |
| Redis client retained by running backend | Global request rate limiter uses the existing Redis client; its closed connection fails requests before liveness/auth capability handlers | FAIL; smallest recovery is a controlled local restart, retaining rate limits |
| Existing development tunnel | Process 4108 remains running, but logs repeatedly report `Unauthorized: Tunnel not found` | FAIL |
| Existing public hostname | System lookup ENOTFOUND; certificate-verified Cloudflare DNS-over-HTTPS returns DNS status 3 (NXDOMAIN), no A answers | FAIL; this hostname is not currently usable |
| Google/public client and signing configuration | Client ID present with valid format; signing material present and meets local minimum length; actual values not reported | Configuration presence PASS; real Google login not verified |
| Auth/cloud enablement | AUTH_ENABLED and ACCOUNT_PERSISTENCE_ENABLED are false/unset | Intentional HOLD; unchanged |
| Neon native direct connectivity | Latest dedicated diagnosis verified direct native Prisma connectivity on 6 November; pooled native DNS remained unreliable | Historical direct PASS; no new native/SQL attempt made |
| Application schema | Latest approved historical check found no public.User; no fresh live schema inspection performed here | Current state UNVERIFIED; do not assume a migration happened |
| EAS preview settings | Previous readiness task verified no preview variables at project/account scope; local preview env is also empty | BLOCKED; no cloud variable edit approved |

The backend's current failure is not missing startup code and not demonstrated Redis-service unavailability. A fresh Redis PING succeeds while the existing request path fails on a closed client. That initial diagnostic reused the existing plaintext Redis configuration; it must not be represented as a TLS verification. The subsequent TLS probe sent no credentials or Redis commands. An approved TLS Redis endpoint is required before any further credential-bearing Redis probe, backend restart or real session operation. Source retry limits allow the client to reach a terminal disconnected state after network failures. No speculative retry/rate-limit/auth bypass was added. A controlled process restart is the smallest proposed next action; it must be verified before declaring recovery.

The tunnel failure is not merely an Aadat URL parser error: both independent DNS and the tunnel's own control-plane error agree that the old hostname/tunnel is unavailable. No URL guessing, alternate host, DNS override, TLS relaxation or authentication workaround was attempted.

Evidence: [local backend responses](evidence/android-access-prerequisites/local-backend.json), [Redis/DNS controls](evidence/android-access-prerequisites/network-read.json), [sanitized process-log errors](evidence/android-access-prerequisites/process-log-summary.json), [configuration presence only](evidence/android-access-prerequisites/config-presence.json), [diagnosis/checksums](evidence/android-access-prerequisites/diagnosis.json).

## Missing secure configuration — required before recovery

The existing configured Redis endpoint on port 10761 does not pass the strict TLS handshake. No alternate endpoint or port was guessed. Do not merely change redis:// to rediss:// on that unverified endpoint, disable certificate verification or fall back to plaintext.

Provide an already-approved TLS Redis connection through the existing environment configuration (REDIS_URL using rediss:// and/or appropriate verified TLS settings), and share only the variable names/presence, not password values. No new Redis service, paid plan, TLS setting change in a cloud console or credential rotation is authorized by this report. If no approved secure endpoint exists, that provider/configuration decision is an external blocker. The existing backend Redis module must pass strict certificate/hostname validation and an encrypted PING before restarting the app or exposing a replacement HTTPS route. The earlier plaintext PING carried Redis connection authentication under the existing configuration, not Google/session credentials.

## Concrete approval A — development connection recovery only

Proposed actions, **not executed**:

1. Only after the supplied Redis TLS configuration passes strict encrypted connection verification, build the existing contracts/backend locally if needed; verify the known process identity and gracefully stop only the owned local Fastify process on port 4000 (currently 18301). Start the current reviewed backend on loopback port 4000 with AUTH_ENABLED=false, ACCOUNT_PERSISTENCE_ENABLED=false and GraphiQL disabled. Do not expose a 0.0.0.0 listener or change database/Redis credentials or schemas.
2. Startup performs its existing PostgreSQL `SELECT 1` readiness check and verified TLS Redis connection/authentication. Never restart using the current plaintext Redis configuration. Subsequent HTTP health/capability checks use the existing Redis rate limiter; **its normal expiring rate-limit counters are writes**, and are expressly included in this proposed scope. They are not user/session/collection writes. Do not disable the limiter or enable a silent fallback.
3. Stop/replace only the known failed Quick Tunnel process 4108. Leave other tunnel process 93474 untouched. Start exactly one replacement Quick Tunnel to `http://127.0.0.1:4000`, using the existing installed cloudflared:

```sh
cloudflared tunnel --url http://127.0.0.1:4000 --protocol http2 --no-autoupdate --metrics 127.0.0.1:0
```

4. Capture the single generated HTTPS hostname. Verify certificate/hostname validation, redirects disabled and credential-free health/auth-capability operations from the computer and Android diagnostic client. Never send Google/session credentials during these tests. If transport or upstream connection fails, report it rather than create extra tunnels automatically.
5. Only after transport verification, replace the obsolete **public** EXPO_PUBLIC_GRAPHQL_ENDPOINT in the existing local mobile/server env files. Preserve all other values and keep auth/catalog activation and cloud-write flags disabled. Do not set a marker that claims real auth readiness from TLS transport alone. Do not edit EAS remote variables, deploy a backend or submit any build.

Risks/costs: the replacement creates a public temporary development HTTPS route to the local API; anyone knowing its URL can reach its protected routes. Authentication and rate limits remain enforced. Cloudflare documents that [Quick Tunnels are temporary development endpoints with no uptime guarantee](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/). No account/domain/paid resource provisioning is proposed. Existing database/Redis/traffic usage may incur normal plan usage; the account's billing entitlement is not independently verified. Startup may wake the existing Neon compute. No new Neon/S3 resource is included.

This approval is required because the selected build-hold option explicitly did **not** authorize cloud changes; replacing the Quick Tunnel creates a new external endpoint. Startup's SELECT 1 and the normal Redis counter writes are disclosed rather than mislabeled as entirely read-only.

Expected outcome: local backend and device HTTPS **transport** verified, with auth still honestly on hold. It does not make Google login functional or authorize account creation.

## Concrete approval B — fresh metadata-only SQL preflight

Approved and now completed PASS: ran only the existing reviewed [PHASE_1A_MIGRATION_PREFLIGHT_READONLY.sql](PHASE_1A_MIGRATION_PREFLIGHT_READONLY.sql) against DIRECT_DATABASE_URL. It uses a repeatable-read **READ ONLY** transaction, bounded statement/lock/idle timeouts and catalog-only queries for schema objects, enum definitions, indexes, foreign keys, permissions and migration-table existence. Its exact checksum is recorded in the diagnosis evidence.

No application/Neon Auth user rows, migration-history rows, DDL, schema modification, baselining, snapshot, branch, compute resource, migration deployment or native engine mutation is included. Preserve full private diagnostics locally and publish only sanitized metadata conclusions. Existing normal database compute usage may apply. If the script or target changes, stop for review rather than broaden the scope.

This refresh is useful because earlier schema results are historical. It does not treat a past missing table as a fresh finding. The original instruction requires approval before live SQL; none ran during the initial diagnosis. A later explicit approval authorized the now-completed preflight, recorded in the linked current results. Approval B does not grant approval A, migrations or account writes.

## Authentication remains a separate gate

- Google login verifies a real Google ID token on the backend, then may create a PostgreSQL User row and writes Redis session state. Refresh/logout also mutate session state. They cannot be verified while all such writes remain blocked.
- The reviewed auth-only migration artifact remains unapplied by this work. Latest direct native connectivity PASS supersedes the earlier direct-connectivity failure; recovery/migration authorization remains separate. Consult the latest [native diagnosis](PHASE_1A_PRISMA_NATIVE_CONNECTIVITY_DIAGNOSIS.md) together with the [migration safety/recovery plan](PHASE_1A_NEON_FINAL_SAFETY_CHECK.md), without reusing aged recovery observations as guarantees.
- The current instruction forbids migrations. Neither proposed approval requests permission to apply one. If fresh preflight still shows missing auth objects, a later explicit scope change and migration/recovery approval are required before database work can unblock login.
- Real OAuth Android package/signing registration must match the final APK. A public client ID with valid syntax does not prove that registration or a successful login.
- Only after a real auth backend, verified HTTPS and account/session permissions are available should the public preview endpoint/client ID and enablement settings be reviewed for a functional APK. EAS remote config remains unchanged and build submission remains blocked.
- Local account-bound playlist/Warehouse verification can keep EXPO_PUBLIC_ACCOUNT_PERSISTENCE_ENABLED=false; cloud collection writes are not required for per-device journal tests and remain on HOLD.

## Changes and verification boundary

Added this report and `docs/evidence/android-access-prerequisites/`; updated the previous build-readiness decision to record the user's explicit HOLD. No app/backend/configuration source was modified. Existing TypeScript/599-test/Metro/Hermes results remain the prior readiness evidence; no new software change warrants a duplicate suite run here. This task performed local HTTP diagnostic requests, Redis connection/PING, DNS checks and process/log inspection; it did not issue direct PostgreSQL SQL or authentication mutations.

Scope B has now completed under explicit approval. Scope A is already approved but cannot execute until secure Redis configuration is verified. The required next input is the Redis provider plan/TLS setting and console-confirmed secure connection information; do not repeat the existing A/B approval request. EAS, migrations, auth/session/user writes, S3 and unrelated cloud resources remain blocked under either approval.
