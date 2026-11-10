# Redis Cloud TLS configuration and approved preflight results

7 November 2026, Asia/Calcutta. **Redis TLS FAIL / access recovery HOLD. Read-only Neon preflight PASS. EAS remains blocked.** No backend restart, replacement tunnel, cloud/provider change, migration, account/session write or EAS build was performed. The existing conditional recovery approval remains valid, but its TLS prerequisite has not passed.

## Latest environment recheck — new endpoint, TLS still FAIL

The user supplied a changed REDIS_URL. The new effective endpoint is `redis-17687.crce286.ap-south-1-1.ec2.cloud.redislabs.com:17687`; both server/.env and its root alias load it correctly. Its scheme remains redis://, and REDIS_TLS is absent. A strict credential-free TLS handshake to this new exact endpoint also returns ERR_SSL_WRONG_VERSION_NUMBER. No credentials or Redis commands were sent; no setting, restart, tunnel or build action followed. [Latest check evidence](evidence/android-access-recovery/redis-env-recheck.json).

The original endpoint evidence below is historical. The current REDIS_URL port is **17687**, not 10761. Client configuration and provider-side TLS remain separate prerequisites.

## Initial provider and observed failure

The initially inspected endpoint was Redis Cloud, using the Redis Labs domain:

`redis-10761.crce276.ap-south-1-3.ec2.cloud.redislabs.com:10761`

The effective `server/.env` still has a `redis://` REDIS_URL and no REDIS_TLS setting. Root `.env` resolves to that same file. No separate TLS URL variable was found. Credentials were inspected only for configuration presence and were not printed.

A fresh **credential-free** strict TLS handshake to that exact configured hostname/port returned:

```text
ERR_SSL_WRONG_VERSION_NUMBER
```

Certificate validation remained enabled; no Redis commands or credentials were sent in this task's TLS check. No alternate port was attempted. This listener does not currently complete TLS, so certificate trust and Redis authentication could not be evaluated. It does not establish which subscription is owned or whether another approved secure endpoint exists.

The earlier plaintext PING result remains a historical reachability check only. It is not a secure connection PASS, and no further plaintext authentication was attempted here. [Fresh TLS evidence](evidence/android-access-recovery/redis-tls.json).

## Documented provider requirements

Redis Cloud documents TLS availability for **paid Essentials and Pro** subscriptions; **Free Essentials does not provide TLS**. TLS must be enabled on the database; a client URI change alone does not enable it. The account's actual plan/security settings were not inspected, so a Free plan or a required upgrade is not assumed. [Official Redis Cloud TLS documentation](https://redis.io/docs/latest/operate/rc/security/database-security/tls-ssl/).

For an eligible database, its owner must review Configuration → Security and the TLS setting. Obtain the actual database FQDN/port and connection details from its Configuration/Connect screens. Keep the existing endpoint/port unless the provider supplies different values; enabling TLS may permit the same endpoint. Any provider-side TLS toggle, plan change or new resource needs separate authorization and was not performed. [Official connection-information workflow](https://redis.io/docs/latest/operate/rc/databases/connect/).

Use the provider's certificate trust requirements: download `redis_ca.pem` if needed; mutual TLS additionally requires the approved client certificate/private key. Those are conditional requirements, not proof that this database requires mTLS. [Official TLS trust and client-authentication requirements](https://redis.io/docs/latest/operate/rc/security/database-security/tls-ssl/).

## Exact environment-variable behavior in this repository

| Variable | Current state / precedence | Required change once provider TLS is confirmed |
| --- | --- | --- |
| `REDIS_URL` | Present; plaintext redis://; takes precedence over split host/password settings. Its current explicit URI port 17687 is effective. | Replace only with the owner's actual console-confirmed TLS connection URI using rediss://, retaining authorized credentials and the confirmed FQDN/port. No URI is fabricated here. |
| `REDIS_TLS` | Absent; backend recognizes exactly `true` or `1`. A rediss:// URI also enables TLS automatically. | Explicit `true` is suitable after server-side TLS is verified; optional with rediss://. Setting it alone cannot fix the current non-TLS listener. |
| `REDIS_HOST` | Present as legacy/fallback configuration; REDIS_URL wins. The parser also accepts a URI in this legacy field when REDIS_URL is absent. | No change required when using REDIS_URL. Do not substitute an IP for the verified hostname. |
| `REDIS_PORT` | Present as fallback; it does not override an explicit port in REDIS_URL. | No guessed port change. Align with the console only if split-host mode is deliberately used. |
| `REDIS_PASSWORD` | Empty; current credentials are supplied privately through REDIS_URL. This variable is used in split-host mode. | Do not duplicate or print credentials; use the provider's authorized connection configuration. |

There is no separate `REDIS_USERNAME` variable consumed by the current backend; use the provider-confirmed ACL username in REDIS_URL when required. Do not invent an ACL user.

Local source evidence: [environment parser](../server/src/infrastructure/config/server-environment.config.ts), [application wiring](../server/src/index.ts), [Redis client implementation](../server/src/infrastructure/cache/implementations/redis-cache.service.ts).

The existing `RedisCacheService` already supports TLS via ioredis, but its `IRedisConfig` currently exposes only a TLS boolean. It has no application environment mapping for a custom CA file, client certificate or private key. If the actual provider chain is trusted by the default Node trust store and no mTLS is required, verify the existing TLS path directly. If provider CA/mTLS material is required, add narrowly scoped TLS options to this existing implementation in a reviewed local change; merely adding invented CA/cert/key environment variables will have no effect today. [ioredis TLS options](https://github.com/redis/ioredis#tls-options).

All future checks must preserve hostname/certificate validation. Do not set NODE_TLS_REJECT_UNAUTHORIZED=0, rejectUnauthorized=false, accept an untrusted chain, try common replacement ports, create a TLS proxy as a substitute for provider security, or fall back to plaintext.

## Minimal next configuration evidence needed

The owner needs to confirm the **actual Redis Cloud plan**, database TLS setting, console-confirmed endpoint/port and whether custom CA or mutual TLS is required. Secrets belong only in the existing secure environment/files, not chat or reports. No Redis console/API credentials were requested or inferred from database credentials.

- If the existing plan supports TLS and it is already enabled, supply its approved connection configuration in REDIS_URL; run a credential-free handshake first, then an encrypted authenticated PING through the real backend client with strict validation.
- If an eligible plan has TLS disabled, enabling it is an additional cloud configuration change requiring explicit permission before action.
- If the account is Free Essentials, this provider's documented TLS requirement cannot be met by a local scheme/port change. A paid upgrade or different approved TLS provider is an external decision; no purchase, provisioning, provider switch or migration is approved here.

After strict TLS succeeds, already-approved scope A can recover the local backend, create the single replacement development tunnel, verify credential-free HTTPS from computer/Android and update only the local public endpoint. Its approved SELECT 1 readiness and normal expiring Redis rate-limit counters remain the only stated database/cache operational effects. Authentication/cloud collection flags stay disabled. Do not request the same scope-A permission again unless its scope changes.

## Approved read-only database preflight — actual PASS

Executed exactly `docs/PHASE_1A_MIGRATION_PREFLIGHT_READONLY.sql`, checksum:

`35556085aa1ef7d3abd109c45e88829e48b606f202134efa9b0a252e9391628a`

Results at **00:22:50 IST, 7 November 2026**:

| Check | Observed result |
| --- | --- |
| Direct Neon target | Configured unpooled host; no alternate branch/target |
| PostgreSQL transport | TLS 1.3; certificate authorization true; verify-full hostname policy |
| Transaction | Explicit repeatable-read READ ONLY; transaction_read_only=on; statement/lock/idle limits applied |
| PostgreSQL version | 18.6 |
| Public relations / tables | 0 / 0 |
| Public types / auth enums | 0; no proposed-name conflicts |
| public.User | Absent |
| public._prisma_migrations | Absent; no history-row query executed |
| Public schema permissions | CONNECT, USAGE and CREATE available; privileges are not write authorization |
| Public foreign keys / target dependencies | 0 / 0 |
| DDL event triggers / custom default ACL rows | 0 / 0 |
| Neon Auth tables | 9 present; catalog metadata only |
| Application/Neon Auth row reads or writes | None |
| Migration/baselining/DDL | None |

The nine Neon Auth tables remain catalog-visible; READ ONLY enforcement and the reviewed statement set establish the no-write boundary. No row-level or byte-for-byte data comparison is claimed. Full metadata results remain private in `/tmp/aadat-access-recovery/preflight.private.json`; [sanitized result](evidence/android-access-recovery/preflight-summary.json) is retained in the repository.

The missing public.User and migration history are now **freshly reconfirmed**, rather than inferred from an old report. Real PostgreSQL user persistence still needs a separately approved initial migration; real Redis session operations also require their authorization. Current instructions prohibit migration execution. The auth-only candidate checksum remains unchanged in prior evidence; no migration approval is inferred from read-only preflight success.

## Files changed and remaining holds

Only reports/evidence were changed: this review, `docs/evidence/android-access-recovery/`, and current-status notes in `ANDROID_ACCESS_PREREQUISITES.md` and `ANDROID_REAL_SONG_BUILD_READINESS.md`. No environment, Redis/backend/mobile source, app config, Prisma schema, icon or dependency was modified by this task. [Preservation and scope status](evidence/android-access-recovery/status.json).

No new application code changed, so the previously completed TypeScript/599-test/Metro/Hermes checks were not redundantly rerun or relabeled as new results. No APK, playback or Android HTTPS PASS is claimed.

**Current boundary:** scope B completed PASS. Scope A approved but blocked by unconfirmed TLS Redis configuration. Migrations, account/session writes, provider settings/paid resources, EAS remote settings/builds and S3 remain blocked.
