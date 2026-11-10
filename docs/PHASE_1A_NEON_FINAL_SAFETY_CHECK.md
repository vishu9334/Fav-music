# Final Neon migration safety check — FAIL / HOLD

Checked 6 November 2026, approximately 09:48 IST. All work in this check was read-only. No live DDL, DML, migration-history write, baselining, snapshot creation, branch creation or restore occurred. No Git command or EAS build was run.

**Later diagnostic update:** native direct schema diff and direct print-only introspection now [verify connectivity](PHASE_1A_PRISMA_NATIVE_CONNECTIVITY_DIAGNOSIS.md); IPv6 TCP/TLS also passes in the fresh probes. Pooled DNS remains faulty. The results below describe the earlier safety-check snapshot. The user declined recovery-resource writes, so snapshots/branches/restores/migrations/baselining remain blocked.

## Verified findings

| Check | Result | Actual evidence |
| --- | --- | --- |
| Correct target configuration | PASS | DIRECT_DATABASE_URL uses the previously API-confirmed unpooled host; runtime DATABASE_URL remains pooled. Same logical endpoint/database/role. No environment change. |
| Direct Node connection | PASS | Authenticated over IPv4 with certificate-verified TLS in 2,330 ms. |
| Native Prisma to Neon | **FAIL** | Native `migrate diff --from-config-datasource --to-empty --exit-code` returned exit 1 / P1001 in 624 ms. A healthy Node connection was held open during the attempt. Concurrent system DNS returned ENOTFOUND. No successful native introspection occurred. |
| Native read-only/TLS controls | Configured | Child-process URL only: public schema, sslmode=require, sslaccept=strict, bounded connect/query times and default_transaction_read_only=on startup option. The failed native connection did not confirm that setting server-side. |
| Live public schema | PASS | All 20 approved preflight statements completed; transaction_read_only=on. Zero public relations and zero public type rows. |
| Live migration history | PASS — absent | No public._prisma_migrations relation; conditional history SELECT correctly skipped. No failed/applied history is being silently baselined. |
| Permissions | PASS | CONNECT plus public USAGE and CREATE available to the configured deploying role. No grants/ownership changes made. |
| Conflicts/side effects | PASS | Zero target dependencies, zero DDL event triggers, zero custom default ACL rows. Standard future-table permissions remain owner-only. |
| Neon Auth structural preservation | PASS | Ten groups of Neon catalog definitions/ownership/ACLs/constraints/indexes/triggers/policies match the previous successful preflight exactly. Nine existing tables remain. No account/session/user table rows were read or written. This is structural comparison, not a claim of byte-for-byte data equality. |
| Local rehearsal | PASS — previous phase | Apply, replay, actual native schema diff, forced rollback, synthetic restore and forward correction passed on PostgreSQL 18.4. No local database was restarted or changed during this safety check. Prior Neon preflight is PostgreSQL 18.6. |
| Artifact equality | PASS | Reviewed draft, current candidate, actual local applied-history checksum, local forward-test init copy and rehearsal report all match the same SHA-256 below. |
| Live recovery verification | **PARTIAL / HOLD** | Root production branch ready; history retention configured for six hours; snapshot list empty. Read-only WAL/time observation recorded, but no durable recovery artifact or isolated Neon restore has been verified. |

Native connection diagnosis remains the local/system resolver path: ENOTFOUND is observed while the scoped Node IPv4/HTTPS-DNS helper works. Node's helper does not configure the native engine. Holding a functioning database connection open excludes an idle compute as the sole cause of this native failure. The API reported idle before the read connection; no explicit resume/settings API was called. A successful local native rehearsal proves the engine can run locally, not that its Neon DNS/TLS path works here.

No additional system-wide DNS/TLS change, endpoint alias, IP pinning or permanent connection override was introduced. Before live deployment, the same native read-only check must succeed from the intended deployment environment with strict certificate checking and the stable direct hostname.

## Recovery strategy validated to the read-only boundary

Read-only project/branch/snapshot API calls confirm project `misty-darkness-00417111`, root production branch `br-winter-scene-aoerp4n6`, history_retention_seconds=21600, branch state ready, and **zero listed snapshots**. These observations do not establish a usable snapshot or prove a restore will work. Absence of a snapshot does not by itself mean PITR history is unavailable; the API results here did not independently certify the earliest restorable position.

A read-only session recorded server time `2026-11-06T04:18:34.604Z` and WAL position `0/1CA4FE8`. This is an observation, not pg_create_restore_point, a pinned recovery marker, or a snapshot. No WAL-switch/restore-point function was called. The observation can age out of the six-hour history window and must not be reused as an indefinite recovery guarantee.

The proposed safe hosted validation is to create a manual snapshot, restore it into a **new isolated branch**, and compare catalog metadata there without altering or switching production. Neon documents [manual snapshots and multi-step restore into a new branch](https://neon.com/docs/guides/backup-restore). Creating these resources is a write to Neon control-plane/storage and requires the separate approval described below. A full restore or cutover of production would rewind unrelated Neon Auth data and is excluded.

Successful local restoration of synthetic rows does not establish hosted snapshot/PITR recovery. This check validates the recovery design and current metadata only; hosted recovery remains unverified until a separately approved snapshot/isolated restore succeeds.

## Migration artifact and eventual live scope

Migration: `20261106000100_init_auth`.

SHA-256: `211948b3ace14b3e68f040fce2a9ad18fa4ee6abfbdce2f4a656a3c084a5ffa8`.

The five independent artifact/checksum comparisons match, including the actual successful local history row. The test-only forward index is not in the candidate. There is no active server/prisma/migrations directory. The artifact has local-rehearsal approval only; the prior keep-unapplied instruction still applies to Neon.

After blockers clear, a **separate live migration approval** must explicitly cover:

- Three new public enums: ChatRetentionPreference, UserRole and AccountStatus.
- New public.User with ten columns, eight NOT NULL requirements, its PK, two unique indexes and one role/status index, plus PostgreSQL implicit array/composite/dependency objects.
- Prisma creation/use of public._prisma_migrations, its required PK/index and checksum/outcome/history rows, through the one exact initial migration. Standard advisory locking is part of Prisma execution.
- Local activation of that exact migration and PostgreSQL lock file; no other pending migration may be present. Deployment uses the verified direct public target with strict native TLS after fresh preflight.

That approval must exclude existing Neon Auth objects/data, other application models/FKs, GRANT/REVOKE/ownership/RLS/extension changes, data seeding, Google login writes, baselining, resets and branch cutover/restore. The empty public state needs an actual initial migration, not resolve --applied. Any intervening object/history/privilege change stops this scope for review.

## Next approval request — recovery resources only

No live migration approval is requested while native connectivity is failing. The next independently useful action is hosted recovery validation, with this exact proposed scope:

1. Reconfirm the production branch ID and snapshot capacity read-only. Create **one manual snapshot** of production's current state in the same project, named `aadat-phase1a-pre-migration-20261106-<unique suffix>`. Record snapshot ID/status/source/time; do not claim ready until the API confirms it. Storage charges may apply.
2. Restore only that snapshot into **one new isolated branch**, named `aadat-phase1a-recovery-check-20261106-<same suffix>`, explicitly `finalize:false` and with **no target_branch_id**. Confirm the returned ID differs from production. Never call finalize_branch_restore, restore onto an existing branch, reassign production computes, swap branch names or change application endpoints.
3. If a compute is necessary, create at most one normal **read_write** endpoint on the new branch, at 0.25 CU (min/max), with a 300-second suspend timeout. Its write capability is not permission to issue SQL writes: every verification session must be explicitly read-only. This avoids depending on availability of a separate read-replica product. If the configuration is unsupported or a safe new target cannot be confirmed, stop. No source endpoint is created/changed. Compute charges may apply.
4. Use strict-TLS, read-only sessions to inspect only restored catalog metadata and compare against the source snapshot context. Do not read/export account/session/user row contents or invoke restored functions/login flows. A server-side branch copy inherently includes production/Neon Auth data within this same Neon project; it must not be copied to the local rehearsal or connected to the app.
5. Retain the snapshot and isolated branch for review. No deletion, production restore, cutover, migration, data repair, identity/session write or automatic cleanup is included. Record any hosted recovery limitations; catalog comparison alone is not a full record-level data recovery certification.

The tool defaults require care: restore_snapshot defaults to immediate finalization for new targets. The proposed call must explicitly override that with finalize:false. Missing safe parameters or an unexpected returned target means STOP.

This is a concrete **recovery-resource approval**, separate from migration approval. The user instruction requiring it is: **"STOP and request explicit approval before any live write."** No resource creation was performed during this read-only check.

## Evidence and preservation

[Sanitized evidence](PHASE_1A_NEON_FINAL_SAFETY_EVIDENCE.json) includes live counts/permissions, native error/DNS evidence, recovery observations and all five artifact checksums. Private catalog/CLI/API summaries are under the directory referenced by `/tmp/aadat-neon-safety-current`. Source configuration, environment, Prisma schema and migration files remain unchanged. No backend/mobile code or application service process was changed, so application tests were not rerun for this metadata-only check.

**Final decision: FAIL / HOLD** until native Neon connectivity and hosted recovery verification succeed and an explicit live migration/history-write approval is granted.
