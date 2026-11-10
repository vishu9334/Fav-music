# Phase 1A final migration readiness — HOLD

Reviewed 6 November 2026. **Live migration readiness: FAIL / HOLD.** Native Prisma connectivity failed, and rehearsal/recovery execution is not approved. The initial migration and a guarded local-only rehearsal plan are prepared. No database write, migration, rehearsal, baselining, Git command or EAS build was executed.

**Approved follow-up:** the user subsequently approved local rehearsal only. All four isolated scenarios now [PASS](PHASE_1A_LOCAL_REHEARSAL_RESULT.md), and the single local cluster is stopped with evidence retained. Local writes were limited to that approved cluster. The earlier preparation/approval status below is historical. Native Neon connectivity, live recovery verification and explicit live migration/history-write approval remain unresolved; no Neon write occurred.

## Evidence and remaining blockers

| Check | Result | Evidence |
| --- | --- | --- |
| Previous Neon/Node preflight | PASS, previous phase | Direct/pooled IPv4 TLS auth passed; read-only catalog snapshot showed empty public, sufficient privileges, no conflicting objects/default grants/DDL triggers and absent Prisma history. See connection-fix evidence. |
| Native Prisma connectivity | **FAIL** | Two `prisma migrate diff --from-config-datasource --to-empty --exit-code` attempts returned P1001, exit 1, in 771/765 ms. The second attempt's system DNS lookup returned ENOTFOUND. No successful native introspection result was obtained. |
| Native read-only safeguards | PASS — configured | Child-process URL only: schema=public, sslmode=require, sslaccept=strict, connect_timeout=10, socket_timeout=15, startup options default_transaction_read_only=on / statement_timeout=15000 / lock_timeout=2000. Persistent environment/config unchanged. No writes were requested. A server-confirmed read-only value was not obtained because native connection failed. |
| Actual native binary | PASS — identified | Prisma 7.10.1; schema-engine-cli d1b3f377ca835d73fd50954a5e22128b9ebdd6b8; Mach-O arm64. Node pg's custom socket is not used by this engine. |
| Source schema | PASS — local | Existing Prisma schema validates; auth-only rehearsal snapshot generates all seven reviewed CREATE definitions exactly after normalizing public qualification. |
| Candidate integrity | PASS — local | Candidate remains byte-identical to the reviewed draft; no active server/prisma/migrations directory. |
| Rehearsal target guards | PASS — offline | Local-only config accepted a manifest loopback URL for validation and rejected remote Neon, shared port 5432, host override, duplicate schema and missing explicit URL. Validation did not contact a database. |
| Rehearsal execution / recovery test | **NOT RUN** | No local cluster/database was initialized. No backup or restore test was performed. Approval required. |
| Tool availability | PASS, with limits | Local PostgreSQL/pg_dump/pg_restore/pg_ctl 18.4 available. Neon is 18.6: same major, different patch. Docker daemon unavailable; no daemon was started. |
| Neon restore window | METADATA ONLY | Read-only project API reports history_retention_seconds=21600 (six hours). This is not proof of a usable restore point or a successful restore. No snapshot, branch or restore was created. |
| Live preservation | PASS for this task's actions | Native attempts were read-only and failed before introspection. No live data/table/history mutation was issued; source/config/environment hashes unchanged. Existing Neon Auth rows were not read. |

Full sanitized results and hashes: [PHASE_1A_FINAL_READINESS_EVIDENCE.json](PHASE_1A_FINAL_READINESS_EVIDENCE.json). Raw CLI outputs are private files under the directory referenced by `/tmp/aadat-final-readiness-current`. CLI errors/URLs were not printed without redaction. The engine identity is recorded to distinguish a native check from the earlier Node-client check.

Native DNS/TCP reliability is still a hard live-deployment blocker. A longer timeout or successful Node preflight is not native-engine certification. Before live deployment, use a reviewed environment/network in which the same native read-only command succeeds with certificate validation. A later write-mode deployment must retain strict native TLS (`sslmode=require`, `sslaccept=strict`); Node's verify-full normalization does not configure Prisma's engine. No environment or networking workaround was applied in this task.

## Initial migration for the empty public schema

The latest successful catalog preflight supports a real **initial migration**, not a baseline pretending missing objects exist:

1. Keep the candidate inactive under `docs/phase1a-migration-candidate/migrations/20261106000100_init_auth/migration.sql`, with its PostgreSQL `migration_lock.toml`. Candidate SHA-256: `211948b3ace14b3e68f040fce2a9ad18fa4ee6abfbdce2f4a656a3c084a5ffa8`.
2. After native connectivity, rehearsal/recovery validation and separate live-write approval, repeat read-only catalog checks and confirm public remains empty, permissions/default grants/triggers remain safe, and no history appeared. Do not treat the previous snapshot as a lock against concurrent changes.
3. Activate only that immutable initial migration under server/prisma/migrations. Exactly one migration may be pending. Apply through Prisma migrate deploy on the verified direct public target so Prisma creates/updates its own history with the actual checksum and outcome. History creation/status writes require explicit live approval too.
4. Scope: three public enums, User with ten columns, its primary key plus three explicit indexes, PostgreSQL implicit types/dependencies and Prisma bookkeeping. Existing Neon-managed schemas/data are excluded. Do not use resolve --applied, reset, db push or a from-empty full migration on the live empty schema.
5. The full source schema contains 17 models; the initial migration intentionally implements auth-only User. Twelve incoming User relationships belong to later separately approved model migrations. The rehearsal snapshot omits only relation fields/future models and is not a replacement for the source schema.
6. If target objects/history unexpectedly exist, STOP and inspect the exact state. Baseline only an independently proven equivalent existing schema under a separate metadata-write approval. Never mark the full model schema applied when only auth exists.

The [Prisma deploy reference](https://www.prisma.io/docs/orm/v7/reference/prisma-cli-reference) documents that deploy applies all pending migrations and does not certify drift absence. [Baselining](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/baselining) is for objects already present, which is not the observed empty public state.

## Isolated disposable rehearsal — proposed scope, NOT executed

Use the already installed Homebrew PostgreSQL **18.4** binaries, with the patch difference from Neon 18.6 explicitly recorded. The SQL uses standard PostgreSQL 18 features; this rehearsal does not certify Neon-specific behavior or replace live native connectivity. No live branch clone, dump, credentials, Google tokens or Neon Auth data are needed.

Prepared artifacts:

```text
docs/phase1a-rehearsal/
  prisma.config.ts     # no dotenv; explicit loopback/manifest target required
  schema.prisma       # auth-only snapshot, offline matched to reviewed SQL
  atomic-failure.sql  # candidate DDL + deliberate division by zero before COMMIT
  forward-index.sql   # synthetic local-only forward migration; never a live candidate
```

The config requires a private canonical temporary root, a manifest database from the allowed names, host exactly 127.0.0.1, a dedicated non-5432 port, local role aadat_rehearsal, a generated local password, public schema and local-only sslmode=disable. It rejects host/query overrides and duplicate parameters. It never reads DATABASE_URL or DIRECT_DATABASE_URL. Plaintext PostgreSQL here is limited to loopback and synthetic local credentials; live Neon TLS settings remain unchanged. The migration config is not an automatic authorization to run it.

### Setup after explicit approval

1. Create a fresh private directory `aadat-phase1a-rehearsal-<random>` beneath the OS temporary directory (0700). Generate a random local role password, store only in a 0600 password file/private process environment, and select a free nonstandard loopback port. Write target.json containing only that port and four database names with one 12-hex run ID. Do not source server/.env or inherit live database credentials into rehearsal processes.
2. Run initdb for this new cluster only, role aadat_rehearsal, SCRAM host authentication, and local socket authentication within its private directory. Start using pg_ctl with listen_addresses=127.0.0.1, the selected port and a private socket directory. No existing PostgreSQL service, shared cluster or Docker daemon is started/stopped/modified. initdb itself writes local PostgreSQL catalogs and is included in the approval request.
3. Before any test SQL, verify current_database/current_user and SHOW data_directory against the exact new cluster path. A loopback URL alone is insufficient proof of isolation. Stop on any mismatch. Never connect to a Neon URL or use a production role/password as fallback.
4. Create only these four databases in that new cluster: `aadat_phase1a_apply_<runid>`, `aadat_phase1a_atomic_<runid>`, `aadat_phase1a_recovery_<runid>`, `aadat_phase1a_forward_<runid>`. Record local target/PID/version/data-directory evidence, candidate checksums and scenario start/end times. No server application, Google provider, Redis service or production seed command is invoked.

### A — apply, replay and Prisma history

Point REHEARSAL_ROOT/REHEARSAL_DATABASE_URL only at the apply database. With the prepared config, apply the exact reviewed candidate using Prisma migrate deploy, then run it again. Verify one successful init_auth history entry with the candidate checksum, no failed row, expected enum labels/order, all ten column types/nullability/defaults, User PK and all three explicit indexes. Repeat deployment must apply nothing and leave history unchanged.

Run native `migrate diff --from-config-datasource --to-schema <auth snapshot> --exit-code` with this explicit local config; expect exit 0. Do not compare the auth-only rehearsal against all 17 source models and call the intentionally missing future models a migration failure. No shadow database or migrate dev/reset is needed.

Insert only synthetic users through the existing generated Prisma client plus a local adapter: for example emails under `.invalid`, generated IDs and test-only subjects. Omit id/updatedAt to verify Prisma supplies uuid()/updatedAt, exercise unique email/Google-subject constraints and nullable subjects, then confirm those rejected duplicate operations did not damage existing fixtures. No Google login is simulated. Retain a deterministic fixture ID/content manifest for recovery comparison.

### B — transactional rollback

On the separate empty atomic database, run only the prepared atomic-failure.sql with psql -X and ON_ERROR_STOP=1. It contains the exact candidate DDL followed by SELECT 1/0 before COMMIT. Expect a nonzero exit (division by zero); connection closure must roll back the transaction. Reconnect and verify **none** of the candidate table, enums or indexes exists. The reviewed migration is not edited to inject failure. This tests SQL atomicity; it does not claim Prisma's separate failed-history bookkeeping rolls back with the auth DDL.

### C — committed-state recovery

Dump only the synthetic apply database's public schema/data/history with pg_dump custom format, no owner/ACL replay, to a 0600 file. Record its checksum, fixture manifest and migration history. Restore into the distinct, freshly created recovery database, never over apply/live/shared data. Inspect the dump table of contents and reject non-public/unexpected objects. Since the destination already has public, omit only the SCHEMA public creation entry from the restore list; do not use clean/drop to make it fit. Use pg_restore --exit-on-error --single-transaction --no-owner --no-acl with the reviewed list.

Verify exact synthetic IDs/subjects/content, row counts, constraints/indexes, candidate checksum and successful history; run the native auth-snapshot diff and expect no differences. A backup file's existence is not a restore PASS. Preserve original apply rows throughout. This verifies isolated committed-state recovery without rewinding Neon-managed data.

### D — forward correction without loss of accounts

On the separate forward database, use a scratch migrations directory under the private root. Copy the unchanged init_auth/lock file there, deploy it, and create synthetic fixtures. Append only a second test migration containing forward-index.sql, then deploy again. The config chooses this scratch directory only for the explicit forward scenario/database.

Verify both successful history rows/checksums, the added synthetic createdAt index and unchanged fixture IDs/content/count. This proves a new migration can correct committed state without editing the applied init or erasing accounts. The test-only index must never enter the live candidate or server migrations directory. A real future correction requires its own reviewed change and approval.

### Acceptance and stop/cleanup behavior

Require all four scenarios to pass, retain exact commands/statuses and sanitized evidence, and stop the newly created local cluster at the end or on failure. Retain its private files and dump for review; do not delete/drop databases or any existing cluster as cleanup under this approval. Stop immediately on target mismatch, unexpected pending migration, checksum mismatch, restore error or data mismatch. A rollback/recovery failure blocks live deployment; it does not authorize destructive repair.

## Live recovery limits

The project API's six-hour retention setting is useful metadata, not a verified current PITR snapshot. Before a live write, verify a recoverable point near the intended migration time and a restore procedure on a separately authorized isolated destination. That backup/branch/recovery work is not included in the local rehearsal approval. Never restore an entire shared Neon branch as an automatic auth rollback: unrelated Neon Auth changes could be lost.

For a live failure after commit: stop auth retries, preserve User rows and subjects, inspect actual objects/history, prefer a new compatible forward correction, and request separate approval for any history reconciliation or data repair. Prisma resolve --rolled-back only changes history; it does not undo committed SQL. No automated down/drop script is provided.

## Approval requested now

Approve **one local-only PostgreSQL 18.4 rehearsal cluster** and its four named test databases, including cluster initialization, the exact auth migration/history writes, synthetic fixture writes, deliberate transaction failure, dump/restore into a new local database and one synthetic additive index migration. Stop the cluster and retain evidence/files afterward. No Neon connections, database writes, migrations, branches, restores, production data copies, environment edits, Git commands or EAS builds are included in that rehearsal approval.

The live database remains untouched and migration readiness remains FAIL/HOLD even if this local rehearsal later passes, until native Neon connectivity and live recovery/write approval are independently resolved. The instruction requiring this approval is the user's: **"Do not execute migration rehearsals involving database writes without explicit approval."** No approval is inferred from successful read-only checks.
