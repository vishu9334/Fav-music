# Phase 1A local rehearsal — PASS

Completed 6 November 2026, 09:40–09:42 IST, under the user's explicit **local rehearsal only** approval. One private PostgreSQL 18.4 cluster was initialized on 127.0.0.1 with four isolated databases. No Neon connection, production credential/data copy or live database write occurred. The local cluster is stopped; files, synthetic backup and evidence are retained privately.

## Actual results

| Scenario | Result | Evidence |
| --- | --- | --- |
| Initial migration | PASS | Exact reviewed init_auth migration applied through Prisma 7.10.1; one successful history entry with checksum `211948b3ace14b3e68f040fce2a9ad18fa4ee6abfbdce2f4a656a3c084a5ffa8` |
| Replay/idempotence | PASS | Subsequent deploy applied nothing; history content and timestamps unchanged |
| Auth schema | PASS | All ten column definitions/defaults/nullability, three enum label sequences, PK, three explicit indexes and eight PostgreSQL 18 NOT NULL constraints verified; native auth-schema diff exited 0 |
| Prisma persistence | PASS | Three synthetic users created; Prisma supplied UUIDs and updatedAt; defaults correct; duplicate email/subject rejected with P2002; multiple null subjects accepted; rejected operations left three rows |
| Transaction rollback | PASS | Division by zero after all candidate DDL but before COMMIT produced SQLSTATE 22012 / psql exit 3; reconnect found zero public relations and zero public types |
| Backup and restore | PASS | Custom-format public-only dump restored into the separate empty recovery database in one transaction; exact users, IDs/content, schema and history matched; native diff exited 0; original apply database unchanged |
| Forward correction | PASS | Separate scratch migration history added a synthetic createdAt index; two successful history entries with correct checksums; three users and original migration history unchanged |
| Shutdown | PASS | pg_ctl stop succeeded; final pg_ctl status exited 3 (no server running), and postmaster.pid is absent |
| Preservation | PASS | Reviewed candidate, production Prisma schema/config/environment, package manifest and all 16 protected source/assets hashes unchanged; no active server/prisma/migrations directory |

The restore list was checked against expected public objects before use. Only its CREATE SCHEMA public entry was omitted because the new destination database already had public. No clean/drop operation or existing database overwrite was used.

The disposable cluster's four databases used the run ID `946f938ea627`: apply, atomic, recovery and forward. Only generated local credentials and test-only `.invalid` email addresses/subjects were used. Child process environments excluded live database variables; the rehearsal config never loaded server/.env. Every direct SQL connection verified its database, role, loopback address/port and exact private data_directory before operating.

Two harness assertions initially stopped the cluster: PostgreSQL rendered the loopback inet address with `/32`, and PostgreSQL 18 records NOT NULL constraints as separate catalog entries. The private runner was corrected to normalize the address and explicitly validate all eight NOT NULL entries. The **same cluster** was resumed; no second cluster was created, no reviewed migration was edited and no database reset/drop was used. Prior failure summaries are retained. PostgreSQL documents the NOT NULL catalog representation in [pg_constraint](https://www.postgresql.org/docs/18/catalog-pg-constraint.html).

## Retained evidence

[Sanitized evidence](PHASE_1A_LOCAL_REHEARSAL_EVIDENCE.json) contains per-scenario results, checksums, preservation and shutdown checks. The private cluster root is recorded there and in `/tmp/aadat-local-rehearsal-current`. It contains commands/status logs, source hashes, catalog/fixture snapshots, the custom-format dump and reviewed restore list, PostgreSQL logs and earlier harness failure summaries. The generated local password file is private and must not be printed or copied into reports. No files or databases were deleted after shutdown.

Dump SHA-256: `e27557493821b8359290a474ecb099e85d3e38a7ccc3a0b5bcd022fed2365f92`.

Only documentation/evidence was added to the repository for this execution. No application code changed, so the full application unit suite was not rerun. This task's validation is the actual isolated PostgreSQL/Prisma rehearsal described above.

## Live readiness remains HOLD

This successful **local** native Prisma execution does not clear the prior **Neon** native-engine P1001/ENOTFOUND failure. No Neon connectivity retry was made under local-only approval. The local cluster is PostgreSQL 18.4; the prior Neon preflight reported 18.6. Matching major versions do not certify the hosted network, TLS path or every patch-specific behavior.

Remaining requirements before any live application:

1. Successful native Prisma read-only connectivity against the verified Neon direct host with strict certificate checking.
2. Fresh read-only target/conflict/privilege/trigger preflight immediately before a proposed live write.
3. Verified live recovery point and a separately approved isolated recovery procedure. Restoring synthetic local fixtures does not certify Neon PITR; six-hour retention metadata alone is insufficient.
4. Separate, explicit live auth migration **and Prisma history-write approval**. The earlier keep-unapplied instruction remains effective for Neon. No baselining action or live migration was authorized by this local rehearsal approval.

No Git command, EAS build, live schema/data change, Neon-managed table operation or production backend/authentication action was performed.
