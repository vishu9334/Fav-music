# Neon connection configuration fix — 6 November 2026

Connection configuration and Node-client networking are fixed and locally verified. The approved read-only migration preflight passed. No migration or baselining write was executed; the auth schema remains unapplied.

## Changes

- `server/.env`: only DIRECT_DATABASE_URL's hostname changed to `ep-calm-paper-ao3neqs5.c-2.ap-southeast-1.aws.neon.tech`, the previously API-verified unpooled host. Role, password, database and query parameters were preserved. DATABASE_URL is byte-for-byte unchanged and still uses the pooled host. All other parsed environment values were preserved. Root `.env` links to this same server environment file. No secret values were printed or copied into reports.
- `server/src/infrastructure/database/implementations/neon-connection.factory.ts` (new): class-based, Neon-only pg configuration, IPv4 resolver and socket. A bounded local A-record query runs first; failure or invalid/empty results use certificate-verified Cloudflare HTTPS DNS. Only the Neon hostname/type A is sent to that resolver. Requests reject redirects and time out after two seconds. Local resolution uses a dedicated resolver with a 750 ms timeout and one try per server.
- IPv4 answers are validated/deduplicated. Concurrent resolution for one hostname shares an operation; completed operations are removed, so later connections resolve afresh rather than pinning stale addresses. The socket offers only IPv4 addresses to Node's connection selection, permitting multiple-address attempts while retaining the original hostname.
- The factory enforces `sslmode=verify-full` in the in-memory pg connection URL and enables channel binding. pg keeps the DNS hostname for SNI and hostname/certificate verification. No global DNS/IP-family/TLS setting, OS network setting, hosts file or permanent IP address was changed. Other database hosts retain their existing pg configuration.
- `server/src/infrastructure/database/implementations/prisma-database.service.ts`: the existing runtime pool and Prisma adapter use the factory. Existing admin CLI consumers of this service also receive the connection strategy; none of those write-capable CLI commands was run.
- `server/.env.example`: documents the Node-only networking policy and native Prisma limitation.
- `server/src/infrastructure/__tests__/neon-connection.test.ts` (new): 13 regressions cover DNS refusal/empty results, fallback response validation, concurrent lookup sharing and refresh, non-Neon isolation, sanitized failure, TLS settings, URL preservation and IPv4 socket lookup.
- `server/src/infrastructure/__tests__/infrastructure.test.ts`: the existing ping failure test now injects a pool error instead of attempting a real network connection with test credentials.

The backend was rebuilt and the local API process previously started in this session was gracefully restarted. New PID: 18301, listening on loopback port 4000. The existing Cloudflare tunnel was not changed. Startup ran the existing read-only database readiness probe; no migration or schema initialization occurs at startup.

## Actual PASS/FAIL evidence

| Check | Result |
| --- | --- |
| Correct direct host / preserved pooled URL and other environment values | PASS |
| Pooled connection with new production factory | PASS — authenticated over IPv4, TLS 1.3, certificate authorized, 1,873 ms |
| Direct connection with new production factory | PASS — authenticated over IPv4, TLS 1.3, certificate authorized, 581 ms |
| Approved preflight | PASS — all 20 statements completed, including the explicit read-only transaction and session settings |
| Live server identity | PASS — PostgreSQL 18.6, effective schema public, transaction_read_only=on |
| Permissions | PASS — CONNECT and public USAGE/CREATE available |
| Target conflicts | PASS — zero public relations, zero public type rows, zero target dependencies; target enums/index names do not exist |
| DDL side effects/default grants | PASS — zero DDL event triggers, zero custom default ACL rows; hardwired new-table ACL grants only its owner access |
| Prisma history | SKIPPED correctly — public._prisma_migrations absent; conditional history SELECT was not sent |
| Neon Auth | Nine existing tables recorded in the catalog snapshot; their table rows were neither read nor written |
| TypeScript | PASS — all four workspaces |
| Regression suite | PASS — 276 passed, 3 live-connectivity cases skipped |
| Backend compilation and local API activation | PASS |
| Preserved protected files | PASS — all 16 existing hashes unchanged, including Prisma schema, playback, icons, entry point and Metro |
| Migration execution | NOT RUN — no authorization for writes |

The first full suite run encountered sandbox EPERM in two existing loopback listener tests. Rerunning the suite with loopback permission and live-connectivity tests disabled passed. Initial type-overload/test assertions were corrected before the final passing checks.

The 20 approved preflight statements consist only of transaction/session controls and catalog SELECTs. Both handshake probes issued no SQL. Backend activation also performed its existing SELECT 1 readiness check. There was no DDL, DML, Prisma history write, branch restore or Neon control-plane mutation. Table-data equality was not measured; structural metadata was read and no operation in this task changed Neon Auth data.

## Remaining migration blockers

1. Explicit migration or baselining write approval has not been given. The earlier keep-unapplied decision remains effective. There is still no active `server/prisma/migrations` directory; the candidate stays under docs.
2. An isolated PostgreSQL rehearsal and a verified recovery point/restore procedure remain incomplete. These require separately authorized work because this task forbids database writes, including rehearsal writes.
3. Prisma's native migration engine does not use pg's custom socket. Its connectivity remains unverified. Its future deployment environment needs reliable DNS/IPv4 routing, or a separately reviewed per-process solution, before any migration is approved. A successful Node preflight is not native-engine certification.

The observed live state is the empty public-schema path: an auth-only **initial migration**, not a baseline marking nonexistent objects applied. The existing candidate creates User, three enums and its indexes only; the other Prisma models and their incoming User foreign keys require later approved migrations. Future Prisma bookkeeping writes remain part of a separate explicit migration approval.

The local DNS service and IPv6 route themselves were not repaired globally. Their failures are handled within the targeted Node database clients through dynamic IPv4 resolution and the HTTPS fallback. If both DNS paths fail, the client fails closed with a sanitized error.

[Sanitized evidence](PHASE_1A_NEON_CONNECTION_FIX_EVIDENCE.json) contains the final results. Private raw metadata and logs are in the directory named by `/tmp/aadat-neon-fix-current`: `environment-update.json`, `catalog-preflight.json`, `verification-summary.json`, `server.log`. Verification logs: `/tmp/aadat-neon-fix-typecheck.log`, `/tmp/aadat-neon-fix-tests.log`, `/tmp/aadat-neon-fix-build.log`.

No Git commands, EAS builds, migrations, destructive operations, backend account-data writes or changes to Neon-managed tables were performed.
