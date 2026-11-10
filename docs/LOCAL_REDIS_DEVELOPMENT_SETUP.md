# Local Redis development — prepared and subsequently activated

7 November 2026, Asia/Calcutta. **The initial preparation checks below passed before activation. The subsequently approved activation is now verified PASS in the linked report.** During preparation no service was started/restarted or configuration activated; the later approved restart and local rate-limit writes are recorded separately. No cloud resource, migration or EAS build is authorized by the local activation.

**Activation update:** the user subsequently approved the local Fastify restart. It completed successfully, with Fastify/Redis/Neon connectivity PASS. See [actual activation evidence and running process details](LOCAL_REDIS_ACTIVATION_VERIFICATION.md). The preparation-only checks and reviewed scope below are retained as historical evidence; no repeated restart approval is needed.

## Actual findings

| Check | Outcome |
| --- | --- |
| Redis installation | PASS: existing Homebrew Redis 8.6.2 and redis-cli available |
| Existing service | PASS: Redis already listens on 127.0.0.1:6379 and ::1:6379; no new daemon needed |
| Network boundary | PASS: bind contains only loopback addresses; protected-mode=yes |
| Local Redis protocol | PASS: PING → PONG, without cloud credentials |
| Existing data | Database 0 reports 160 keys; no keys/values were read or modified |
| Prepared app database | Database 15 selected; 16 logical databases configured; only database 0 was populated at inspection |
| Inactive profile / backend environment validation | PASS: check-only launcher validates exact reviewed local settings and the existing ServerEnvironmentConfig |
| Fresh Neon transport | PASS: existing pooled DATABASE_URL and direct DIRECT_DATABASE_URL endpoints both complete certificate/hostname-verified TLS 1.3; no credentials or SQL sent in these new checks |
| Neon authentication/schema | Earlier explicitly approved read-only preflight PASS; public.User/history absent and nine Neon Auth tables present. No additional SQL run in this task |
| Current Fastify | Existing process listens on loopback port 4000. Its most recent prior HTTP check failed on the old closed Redis Cloud client; it has not been reconfigured/restarted here |
| Fastify → local Redis → Neon health | NOT RUN; requires activation/restart approval |
| TypeScript / backend compilation | PASS: all four workspaces typecheck; server build succeeds |
| Full local suite | PASS: **609 passed, 3 live-database tests skipped**, including ten new profile safety regressions |
| Cloudflare HTTPS | Command prepared only; no new endpoint or Android HTTPS connectivity PASS |

[Machine-readable results](evidence/local-redis-development/verification.json), [Redis metadata](evidence/local-redis-development/redis-inspection.json), [Neon transport checks](evidence/local-redis-development/neon-tls.json), [check-only output](evidence/local-redis-development/profile-check.log), [test summary](evidence/local-redis-development/tests-summary.txt).

## Prepared development configuration

New inactive profile: [server/development/local-redis.env](../server/development/local-redis.env).

```dotenv
NODE_ENV=development
HOST=127.0.0.1
PORT=4000
REDIS_URL=redis://127.0.0.1:6379/15
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_TLS=false
REDIS_PASSWORD=
AUTH_ENABLED=false
ACCOUNT_PERSISTENCE_ENABLED=false
ENABLE_GRAPHIQL=false
```

This profile is never loaded by standard server startup. The explicit launcher reads the existing server/.env into memory, overlays only the reviewed development keys in a child process, and invokes the existing compiled main/bootstrap. The cloud URL and all production credentials remain unchanged on disk. Cloud Redis credentials are not sent to local Redis; the child local connection has no password. PostgreSQL, OAuth and signing configuration are inherited without rewriting their values.

The configuration class rejects production invocation, non-loopback targets, database 0, auth/cloud enablement, unexpected profile keys and globally disabled TLS verification. It does not change normal production startup or enable fake authentication.

The local connection intentionally uses plaintext **only on this Mac's loopback interface**, as requested. Remote Neon HTTPS/TLS verification is unchanged. This network boundary trusts local processes/users; the existing Redis allows local unauthenticated access. Logical database 15 separates app key space from database 0 but is not an ACL/security boundary. The profile must not be used on an untrusted shared host or exposed over the LAN/internet. Redis documents the [trusted-client, loopback/protected-mode security model](https://redis.io/docs/latest/operate/oss_and_stack/management/security/).

No CONFIG SET, ACL mutation, daemon restart, persistence change or data flush was performed. The existing shared Redis daemon and database 0 remain intact. Database 15 was not reserved or written during preparation; the approved runtime will create only its normal local expiring rate-limit keys while account/session/cloud features stay disabled.

## Commands and approval boundary

All commands run from the repository root. These completed without starting application services:

```bash
pnpm --filter @aadat/server build
node server/scripts/local-redis-development.mjs --check
```

Only after explicit activation approval:

```bash
node server/scripts/local-redis-development.mjs --start
```

Before that start, identify and gracefully stop only the existing owned local Fastify process on port 4000 (currently PID 18301). Do not stop or replace Redis, unrelated processes or production services. Recheck process identity before signalling it. If the listener belongs to an unexpected process, stop for review.

Proposed approval scope:

1. Activate this exact development-only child-process profile and gracefully restart the existing local Fastify listener on 127.0.0.1:4000. No server/.env overwrite or Redis daemon/configuration change.
2. Allow the existing backend's PostgreSQL `SELECT 1` readiness check against the configured Neon runtime connection and normal **local Redis database-15 rate-limit counters**. These counters are local writes and are explicitly included. No PostgreSQL account/schema/history write, seeding or authentication/session mutation.
3. Perform credential-free localhost health/liveness/readiness and GraphQL auth-capability checks. Auth/cloud capabilities should remain disabled; do not label disabled auth as working Google login.
4. Record process IDs, sanitized responses and connection evidence. If startup fails, report the exact sanitized stage; do not switch back to insecure remote Redis, guess settings, clear local data or create another service.

Your latest task explicitly requests approval before starting services. The earlier recovery approval was conditional on a confirmed Redis Cloud TLS endpoint; this new loopback-only profile is a concrete alternative and has not been activated. Normal existing Neon compute usage may apply to readiness; no new paid resource is proposed. Rollback is to stop the new owned development process; no production configuration needs restoring because none was overwritten.

## Prepared HTTPS tunnel configuration — not executed

[Reviewed command file](../server/development/cloudflare-tunnel.command.txt):

```bash
cloudflared tunnel --url http://127.0.0.1:4000 --no-autoupdate --metrics 127.0.0.1:0
```

The installed CLI help confirms these flags. This forwards only Fastify HTTP port 4000 and never Redis port 6379. It requests a temporary generated HTTPS hostname; no hostname has been invented or configured. Certificate/hostname verification and credential-free computer/device checks are required before any future endpoint update. Do not automatically run this command from the local Redis launcher.

Your current instruction forbids cloud changes. No Quick Tunnel creation, existing tunnel termination, Cloudflare account setting or EAS environment edit is included in the local-start approval. A future tunnel action needs separate explicit authorization under the current rule. No HTTPS endpoint, credentials or mobile flags were changed here.

## Changed files

- [Local-only configuration class](../server/src/infrastructure/config/local-redis-development.config.ts)
- [Explicit check/start launcher](../server/scripts/local-redis-development.mjs)
- [Inactive local profile](../server/development/local-redis.env)
- [Prepared tunnel command](../server/development/cloudflare-tunnel.command.txt)
- [Ten regression cases](../server/src/infrastructure/__tests__/local-redis-development.test.ts)
- This report and `docs/evidence/local-redis-development/`

The original server/.env, mobile env/config/icons, production main/bootstrap/application code, Prisma schema and EAS config preserve their initial hashes. No dependency was added. The profile's tests verify preservation, production/TLS guards, non-loopback rejection, database separation and held auth/cloud flags. No mobile code changed, so prior Metro/Hermes/native evidence was not relabeled as a new run.

## Remaining blockers

- Approve activation before new Fastify/local-Redis end-to-end health verification.
- The real application User/schema/history and account/session writes remain under HOLD; local Redis alone cannot make Google login functional.
- Redis Cloud TLS remains unresolved for production; its configuration was deliberately preserved.
- HTTPS tunnel creation and EAS builds remain blocked by the current instruction; real Android playback is unverified.
