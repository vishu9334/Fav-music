# Backend startup and Android HTTPS verification

Verified locally on 6 November 2026. Fastify now listens on port 4000. Cloudflare forwards to its loopback HTTP listener; the external client connection uses verified HTTPS. No real Google ID token or session credential was transmitted during these checks.

Current temporary GraphQL endpoint:

`https://massachusetts-colleges-silicon-utc.trycloudflare.com/graphql`

## Implementation and changed files

- `server/src/main.ts` (new): executable entry point, server-relative dotenv loading, GraphiQL disabled by default, signal shutdown and sanitized startup failures.
- `server/src/bootstrap/server-bootstrap.ts` (new): class-based lifecycle coordinator with shared startup/shutdown promises and failed-start cleanup.
- `server/src/index.ts`: shared lifecycle operations, read-only database readiness probe before listening, and cleanup of partially initialized resources.
- `server/package.json`: `start` runs `dist/main.js`; `dev` watches `src/main.ts`. Importing the library does not start a listener.
- `server/.env.example`: documents `ENABLE_GRAPHIQL=false`.
- `server/src/__tests__/server-bootstrap.test.ts` and `application-lifecycle.test.ts` (new): startup, signal/concurrency and failure cleanup regression coverage.
- `server/src/__tests__/application.test.ts`: the listener test uses an ephemeral loopback port.
- `apps/mobile/.env.local` and `server/.env`: only `EXPO_PUBLIC_GRAPHQL_ENDPOINT` was updated, after device HTTPS verification. The root `.env` links to `server/.env`. Database/Redis URLs and all other parsed values were preserved.
- `docs/PHASE_1A_AUTH_SCHEMA_DRAFT.sql` (new, unapplied) and the two reports: schema review and handover.

Start from the repository root after building contracts and server:

```sh
HOST=127.0.0.1 ENABLE_GRAPHIQL=false pnpm --filter @aadat/server start
cloudflared tunnel --url http://127.0.0.1:4000 --protocol http2 --no-autoupdate --metrics 127.0.0.1:0
```

The current backend process is PID 3625; the tunnel is PID 4108. Both were left running. This is a development Quick Tunnel: its generated hostname must be reverified and mobile configuration updated if the tunnel is replaced. It is not a stable production endpoint. See [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

## Actual verification

| Check | Result |
| --- | --- |
| Backend compilation | PASS |
| Monorepo TypeScript | PASS — all four projects |
| Relevant/full regression suite | PASS — 263 passed, 3 live-connectivity cases skipped |
| `http://localhost:4000/health/live` and `/health/ready` | PASS — alive / ready |
| Local GraphQL health and auth schema | PASS — health `ok`, version `0.1.0`; login/refresh/logout exposed |
| Computer HTTPS GraphQL | PASS — certificate verification enabled, HTTP 200 |
| Android CPH2599 HTTPS GraphQL | PASS — HTTP 200, `TLS_AES_128_GCM_SHA256`, health `ok` |
| Guest `me` and intentionally invalid Google token | PASS — rejected; no authenticated session issued |
| Mobile production Metro export | PASS — 2,827 modules, 25 assets; verified HTTPS URL present and old localhost GraphQL URL absent |
| Hermes compilation | PASS |
| Backend secret-value scan in mobile bundle | PASS — no configured secret values found |
| Playback, player screen, icons, app JSON, entry point, Metro and Prisma source preservation | PASS — original SHA-256 values unchanged |
| Real Google login, persistence, logout and restoration on device | BLOCKED — missing Aadat database schema and native app |

Device proof used Android's `HttpsURLConnection` with default certificate and hostname verification, redirects disabled and bounded timeouts. A temporary diagnostic dex ran through `app_process`; no APK was built or installed. Its remote temporary file was removed afterward. Device serial: `X4GACUMZMVEQY5XO`. Probe ID: `aadat-036932d1-71fc-4322-8e39-564370057e19`.

An initial Metro artifact retained the old endpoint from its transform cache. Inspection of the installed Expo CLI showed that CI mode disables `--reset-cache`. Exporting with CI unset and `--reset-cache` produced and verified the correct endpoint without modifying Metro configuration.

## Database and native runtime blockers

Read-only metadata inspection found only `neon_auth` tables, with no `public."User"` and no Aadat application tables. Database connectivity is healthy, but health checks do not certify schema readiness for authentication. The Neon-managed user table has a different model and is not a substitute for the application's Prisma User. A subsequent fresh metadata connection timed out; any approved schema operation must repeat its target/object preflight.

The [auth-only SQL draft](PHASE_1A_AUTH_SCHEMA_DRAFT.sql) is derived from the checked-in Prisma schema. It creates three enums, the User table and three indexes inside a transaction, explicitly in `public`. It contains no data modification, object removal or Neon-managed schema changes. It fails and rolls back on target-object conflicts. It is a minimal authentication prerequisite, not the full application's initial migration or migration-history baseline. It has **not** been applied or tested against PostgreSQL as DDL. Explicit migration approval is required by the user's instruction, "Do not apply migrations without approval."

ADB currently lists no `com.favmusic` package for Android user 0. Interactive Google login, signing/OAuth registration, SecureStore and session restoration therefore remain unverified on the device. No EAS or native APK build was run. A stable production HTTPS endpoint also remains required before production use.

Evidence directory: `/tmp/aadat-startup-tunnel-gtosp9gt`. Key files include `android-https-verification.json`, `android-https-probe.txt`, local and HTTPS GraphQL responses, `database-table-inventory.json`, `auth-database-schema-check.json`, `auth-schema-draft-check.json`, `mobile-bundle-endpoint-check.json`, `bundle-config-safety-check.json`, `metro-export.log`, `hermes-compile.log`, `server.log`, and `cloudflared.log`. Test and typecheck logs: `/tmp/aadat-startup-tests.log`, `/tmp/aadat-startup-typecheck.log`, `/tmp/aadat-startup-build.log`.

No Git command, database migration, destructive database operation or EAS build was run. Playback and icons were preserved. Manual runtime verification previously confirmed seeking works on the device; playback was not retested in this startup task.
