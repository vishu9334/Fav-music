# Local Redis activation — Fastify / Redis / Neon PASS

7 November 2026, Asia/Calcutta. Executed the user's explicit approval to activate the development-only profile and restart local Fastify. **The new backend is running and connectivity checks pass.** Redis Cloud configuration remains unchanged. No migration, account/session/user write, tunnel creation, cloud resource change, S3 operation or EAS build occurred.

## Actual results

| Check | Evidence | Result |
| --- | --- | --- |
| Reviewed profile safety | Check-only mode passed immediately before restart | PASS |
| Old Fastify shutdown | Verified owned loopback process 18301 and its repository working directory; sent SIGTERM and confirmed port release | PASS |
| New backend | Launcher PID 63903; Fastify PID 63904; listening only on 127.0.0.1:4000 | PASS |
| Existing Redis | PID 926 unchanged; loopback bindings 127.0.0.1 / ::1; protected-mode=yes | PASS |
| Actual backend Redis socket | Fastify PID 63904 has an established TCP connection to 127.0.0.1:6379 | PASS |
| Selected logical database | Existing backend client observed in Redis database 15, last command evalsha; PING → PONG | PASS |
| Existing data boundary | Database 0 still reports 160 keys; no keys/values were read, flushed or edited | PASS for command boundary; no byte-level equality claim |
| Approved local writes | One expiring rate-limit key observed in database 15 | Expected and authorized |
| GET /health/live | HTTP 200, status alive | PASS |
| GET /health/ready | HTTP 200, ready=true | PASS |
| GET /health | HTTP 200, status ok, database=up, cache=up | PASS |
| GraphQL health/authCapabilities | HTTP 200, health ok; authenticationEnabled=false and cloudCollectionsEnabled=false | PASS |
| Unauthenticated catalogPage / me | HTTP 401 and UNAUTHORIZED for both | PASS: account guards remain enforced |
| Neon runtime connection | Existing pooled DATABASE_URL, SELECT 1 AS alive returns 1, TLS 1.3, certificate authorization true | PASS |
| Follow-up stability | All three health endpoints still HTTP 200 at uptime 209 seconds | PASS for observed interval |

HTTP checks were recorded at **03:30:27 IST** and the follow-up at **03:33:26 IST**. The separate successful pooled Neon readiness control ran at **03:32:27 IST**. These are host/backend checks, not Android playback or HTTPS tunnel acceptance.

[HTTP responses](evidence/local-redis-active/http-checks.json), [follow-up health](evidence/local-redis-active/followup-health.json), [Redis metadata](evidence/local-redis-active/redis-checks.json), [Neon SELECT 1/TLS result](evidence/local-redis-active/neon-readiness.json), [restart record](evidence/local-redis-active/restart.json), [consolidated verification](evidence/local-redis-active/verification.json).

## Diagnostic control failure, isolated from working backend configuration

An additional pooled-connection probe initially added startup options for read-only mode and statement timeout. Neon rejected that diagnostic startup package before executing the query:

```text
08P01: unsupported startup parameter in options: statement_timeout
```

The controlled repeat captured that exact error. Removing only the probe-added startup options, then using the unchanged backend connection factory/configuration, completed strict TLS and returned SELECT 1 = 1. The SQL was the constant read-only SELECT 1; no schema/data command was executed. No runtime URL, TLS rule, timeout setting or backend code was changed to make the control pass. [Failed options control](evidence/local-redis-active/neon-options-control.json).

The backend's startup path already requires its own SELECT 1 readiness before listening. That pg.Pool query is not emitted by Prisma's query logger, so the log summary does not claim a logged SQL trace. Startup acknowledgement, the actual healthy listener, and the separately verified same-config SELECT 1 provide distinct evidence; health endpoints report connection state rather than executing a new SQL query on every request.

## Running state and preservation

The development launcher and Fastify child were left running for the approved local workflow. Existing Redis was reused without restarting/reconfiguring it. Startup/HTTP logs are private at `/tmp/aadat-local-redis-active/server.private.log` (mode 0600); repository evidence contains sanitized results only.

The active child process uses [server/development/local-redis.env](../server/development/local-redis.env), including `redis://127.0.0.1:6379/15`, HOST=127.0.0.1, AUTH_ENABLED=false, ACCOUNT_PERSISTENCE_ENABLED=false and GraphiQL disabled. Standard startup still reads its original configuration: server/.env was not overwritten. The loopback-only local transport does not change Neon certificate validation or the held production Redis Cloud configuration.

Hashes confirm unchanged server/.env, mobile env, Expo configs/icons configuration, EAS config, Prisma schema, reviewed profile and launcher. No application code changed during activation. The previous preparation results remain **609 tests passed / 3 live-database tests skipped**, TypeScript PASS and backend compilation PASS; they were not redundantly rerun or labeled as new tests here.

## Remaining blockers

- Cloudflare command remains prepared only. Current approval excludes tunnel creation, cloud changes and public/mobile endpoint edits; no HTTPS URL has been generated or verified.
- Authentication/cloud collections remain intentionally disabled. No Google token or app credential was transmitted, and no login/refresh/logout mutation was called. Public.User and Prisma history were absent in the prior approved schema preflight; migration/account/session authorization remains separate.
- Redis Cloud TLS remains unresolved for production; this local profile is not a production replacement or a multi-user isolation guarantee.
- EAS build submission, APK installation and Android audible playback/Search/Playlists/Warehouse acceptance remain blocked/unverified.

Only reports/evidence changed in this activation task: this report, `docs/evidence/local-redis-active/`, and current-status notes in the local setup/access reports. No new Redis service, user/session records, migration, S3/cloud resource or EAS job was created.
