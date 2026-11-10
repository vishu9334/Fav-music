# Phase 1A migration readiness — prepared, not executed

Prepared 6 November 2026. No live SQL, migration, database write, Git command or EAS build was run for this task. The user's earlier decision to keep the auth schema unapplied remains in force. Only documentation and inactive candidate files were added. Existing SQL draft, Prisma config/schema, runtime code and environment values are unchanged.

## Approved live preflight follow-up — connection failure

On 6 November 2026, the user approved **read-only preflight only**. The approved files were checked against their recorded SHA-256 hashes before a connection was attempted. Offline comparison confirmed the configured runtime/direct URLs match on Neon endpoint (allowing for the pooler suffix), database, role and schema. TLS verification was required and a 15-second connection timeout was configured.

The direct connection attempt failed after 15,008 ms, before any SQL statement was sent. No live database identity, read-only setting, conflict, privilege or Neon catalog result was obtained. The catalog preflight is **FAIL / incomplete**, and the conditional Prisma history read was **NOT RUN**. The client supplied no structured error code; DNS, reachability, TLS and server-side causes cannot be distinguished from this recorded evidence. This is not evidence that a schema conflict or permission denial exists.

Execution time: 08:41:07–08:41:22 IST. Evidence: [PHASE_1A_LIVE_PREFLIGHT_RESULT.json](PHASE_1A_LIVE_PREFLIGHT_RESULT.json). Zero SQL statements and zero database-write statements were executed. No migration was activated or applied, no connection/configuration value was changed, and no automatic retry or alternate database was attempted. The connection was closed. Stopped under the plan's failure rule; migration readiness remains **HOLD**, and the auth draft remains unapplied. An isolated rehearsal and verified recovery point also remain prerequisites for any later migration approval.

The preparation table below describes the earlier static work; its live checks have not become a PASS. Resolving direct-connection connectivity and completing the approved read-only checks are still necessary before requesting a concrete migration execution approval.

Subsequent read-only [connection diagnosis](PHASE_1A_NEON_CONNECTION_DIAGNOSIS.md) found intermittent local DNS failure, unreachable IPv6 TCP and an incorrectly pooled DIRECT_DATABASE_URL. Both API-confirmed hostnames authenticated over verified IPv4 without SQL. No configuration fix or catalog preflight was applied/run during that diagnosis.

**Latest follow-up:** the authorized [connection fix and read-only preflight](PHASE_1A_NEON_CONNECTION_FIX.md) now pass. DIRECT_DATABASE_URL uses the verified unpooled host; DATABASE_URL is preserved. The scoped Node pg factory handles IPv4/DNS fallback without global changes. Live results confirm empty public objects/types, sufficient privileges, no DDL event triggers/custom default grants and absent Prisma history. Nine Neon Auth tables remain outside application migration ownership. Migration execution is still **HOLD**: no write approval, isolated rehearsal/recovery validation or native Prisma networking certification. Earlier failed-attempt evidence and the preparation table below are historical snapshots; the newest evidence is `PHASE_1A_NEON_CONNECTION_FIX_EVIDENCE.json`.

**Final readiness review:** native Prisma read-only diff failed twice with P1001; the concurrent system resolver returned ENOTFOUND. The [final readiness report](PHASE_1A_FINAL_MIGRATION_READINESS.md) and `PHASE_1A_FINAL_READINESS_EVIDENCE.json` supersede the earlier pending native check. A loopback-only PostgreSQL rehearsal config, auth schema snapshot and rollback/forward fixtures are prepared and validated offline; no rehearsal database was initialized. Overall readiness remains FAIL/HOLD pending native connectivity, authorized rehearsal/recovery verification and separate live-write approval.

**Local rehearsal follow-up:** after explicit local-only approval, the [four-scenario PostgreSQL rehearsal](PHASE_1A_LOCAL_REHEARSAL_RESULT.md) passed, including native apply/diff/replay, rollback, synthetic restore and forward correction. The single private cluster is stopped and retained. This clears the local rehearsal requirement only; it does not authorize Neon writes or clear native Neon DNS/connectivity and live recovery requirements.

**Latest Neon safety check:** the [fresh read-only live check](PHASE_1A_NEON_FINAL_SAFETY_CHECK.md) reconfirmed empty public schema, absent history, sufficient permissions, unchanged Neon catalog metadata and exact rehearsed artifact equality. Native Prisma still returned P1001 with concurrent system DNS ENOTFOUND while Node held a verified connection. Recovery metadata shows six-hour history and no snapshots; no snapshot/restore was created. Overall live readiness remains FAIL/HOLD. The report defines separate recovery-resource and eventual migration approval scopes.

**Latest native diagnosis:** [read-only native direct connectivity now passes](PHASE_1A_PRISMA_NATIVE_CONNECTIVITY_DIAGNOSIS.md): direct schema diff exit 0, and direct print-only introspection reached the empty public schema (P4001). IPv6 TCP/TLS also passes now. Pooled native lookup still fails P1001/ENOTFOUND, and DNS remains inconsistent. This supersedes the earlier blanket native-connectivity failure as a point-in-time result only. The user's decision to keep all live writes blocked still applies; hosted recovery and live migration/baselining remain unapproved.

## Artifacts and current decision

| Artifact/check | Result | Evidence/limit |
| --- | --- | --- |
| Catalog and permission preflight | PASS — prepared | `PHASE_1A_MIGRATION_PREFLIGHT_READONLY.sql`, catalog metadata in an explicit read-only transaction |
| Existing history inspection | PASS — prepared | `PHASE_1A_MIGRATION_HISTORY_READONLY.sql`, conditional on an existing ordinary history table |
| Initial migration compatibility | PASS — offline | Seven CREATE definitions match current Prisma-generated SQL after normalizing explicit public qualification |
| Migration history strategy | PASS — designed | Inactive candidate directory, PostgreSQL lock file and conditional deployment/baselining rules below |
| Post-commit recovery | PASS — designed | Preserve accounts, stop auth traffic, reconcile evidence and prefer a separate forward correction |
| Neon Auth preservation in prepared scope | PASS — static | No candidate statement targets Neon objects or existing data; read-only probes never query Neon Auth table rows |
| Live conflicts, permissions, DDL side effects and current Neon state | NOT VERIFIED | Approval required before live SQL; old table inventory is historical evidence only |
| Apply readiness | FAIL / HOLD | No live preflight approval or passing results, no isolated PostgreSQL rehearsal or restore validation, and no migration-write approval |

Exact local results and file hashes are in `PHASE_1A_MIGRATION_READINESS_EVIDENCE.json`. Static checks are not PostgreSQL parser/execution tests.

## Approval A — live read-only preflight only

Request permission to run the two named read-only files, with the second conditional, against the database identified by the existing `server/.env` `DIRECT_DATABASE_URL`. Before connecting, compare runtime `DATABASE_URL` with the direct URL without printing credentials: same Neon endpoint after removing the pooler suffix, database name, role and effective schema. If roles or targets differ, stop; another target is not implicitly authorized.

Use one connection per file, TLS certificate verification, a bounded connection timeout, stop-on-error, and repeatable-read/read-only transactions. Each file sets 15-second statement, 2-second lock and 30-second idle-in-transaction limits. Supply the connection secret from the existing local environment in process memory; do not place it in a command line, report, logs or shell history. Do not run arbitrary SQL, prepared migration SQL, Prisma deploy/resolve/status commands or routine bodies as part of this approval. On any error, close the connection so its transaction ends. Save metadata privately and report only relevant findings.

The main file inspects 13 groups: target/version/read-only state; schema existence/ownership/USAGE/CREATE; all public/Neon relation names and ACLs; types and ordered enum values; columns/defaults; constraints and incoming/outgoing FKs; index definitions/validity; routine inventory; table triggers/rules; database DDL event triggers; creator default ACLs; RLS policies; dependencies on target names. It reads catalog definitions, not application records, identity records, session tokens, passwords or function bodies. Catalog expressions should still be treated as private metadata.

Run the history file only if the main results confirm an ordinary `public._prisma_migrations` table, its selected columns and SELECT permission, with no enabled RLS or unreviewed rewrite rules. It reads migration names, checksums, timestamps and applied step counts, excluding migration error logs. If absent, skip it; if malformed, a view/foreign table, protected by unreviewed row policies or inaccessible, stop. This is Prisma bookkeeping metadata, not application data.

No live SQL has been executed under this plan. Read-only preflight approval **does not authorize a migration or metadata write**.

### Required pass criteria

1. Expected target/role verified; `transaction_read_only=on`; supported PostgreSQL version. `public` exists, the application resolves its User table in public, and the deploying role has CONNECT, schema USAGE and CREATE. A differing/default schema or missing privilege requires a separate reviewed correction, not a silent grant/config change.
2. For the normal initial-migration path, no User table/composite type, target enums, four index names (`User_pkey`, `User_email_key`, `User_googleSub_key`, `User_role_status_idx`) or other Aadat application objects already exist. Check all relation/type kinds, not just tables. Automatic PostgreSQL array/composite types must not have problematic dependencies. Existing unrelated public objects require classification before proceeding.
3. Enum labels/order, column definitions, index uniqueness/column order/validity and constraints match exactly for any proposed baseline. A same-named incompatible object is a conflict, never a reason to skip creation.
4. No unresolved existing Prisma history. Any applied or failed migration without its exact source/checksum stops this new-history plan until the user's existing migration files are recovered.
5. Evaluate global and public-scoped default ACLs together with hardwired defaults. Unexpected non-owner access to the future User or history table is a stop condition pending a reviewed permission plan. Normal public USAGE on enum types is not table-data access. Do not add grants, RLS policies or ownership changes under an auth-DDL approval.
6. Review any enabled DDL event trigger before allowing DDL. These database-level triggers can cause side effects outside the named tables. Do not invoke their functions or disable them. If safety cannot be established from existing reviewed definitions, request a separate read-only definition review and stop migration execution.
7. There are no unreviewed cross-schema dependencies, policies, rules or permissions that make the auth-only scope unsafe. Save a before snapshot of the Neon schema definitions/ownership/ACLs/constraints/indexes/triggers. An absent snapshot or an unexplained change prevents a preservation PASS.
8. Immediately before any future write, repeat the approved preflight: an earlier read-only snapshot does not lock the database against later DDL. Coordinate a window without competing schema changes. The candidate intentionally fails on conflicts instead of using IF NOT EXISTS.

## Prisma initial migration and baselining strategy

The application Prisma schema has 17 models; this phase implements only User plus its three enums and indexes. Twelve incoming User FK relationships belong to later model migrations. User itself has no outgoing FK. Neon-managed objects are outside the application's Prisma migration ownership and must never be introspected into an application baseline or removed to make drift disappear.

Candidate files are deliberately outside the active Prisma directory:

```text
docs/phase1a-migration-candidate/migrations/
  migration_lock.toml                         # provider = "postgresql"
  20261106000100_init_auth/migration.sql       # exact copy of reviewed auth draft
```

No `server/prisma/migrations` directory was activated. The candidate is not discovered by the existing Prisma config. Its SQL retains its explicit transaction, timeout settings, public qualification and conflict failures. Prisma's history table is managed by Prisma itself, not hand-written SQL.

| Verified live state | Strategy after a separate write approval |
| --- | --- |
| Empty application target schema and no history | Activate only this reviewed migration and lock file under `server/prisma/migrations`; use Prisma migrate deploy. This applies the auth SQL and records the actual checksum/outcome in public._prisma_migrations. Do not run resolve --applied first. |
| Exact auth objects already present, no history | After proving complete equivalence, obtain distinct baseline approval; activate the exact files and use migrate resolve --applied for this migration only. This records bookkeeping without recreating auth objects. Do not baseline objects that are missing. |
| Partial, different or extra application objects | STOP. Produce a state-specific additive reconciliation plan and new approval. Do not DROP, reset, db push, overwrite enums, or claim the candidate was applied. |
| Existing successful or failed history | STOP and recover/reconcile exact history first. A checksum/name collision or failed migration is not an empty initial state. |

For the empty-state path only, the future command from the repository root is `pnpm --filter @aadat/server exec prisma migrate deploy`. It is documented, **not executed**. Confirm `DIRECT_DATABASE_URL` targets public as Prisma's migration schema. List pending migrations before approving: deploy applies **all** pending files, so exactly this candidate may be pending. Any extra pending migration voids the approval scope.

The alternative baseline command is `pnpm --filter @aadat/server exec prisma migrate resolve --applied 20261106000100_init_auth`; it writes history and needs its own approval. Never mark a full 17-model initial migration applied when only User exists. Never manually edit `_prisma_migrations`.

If public contains unrelated existing objects, do not assume the empty-state path applies: Prisma can reject a nonempty target without history. Classify those objects and prepare an explicit ownership/history strategy before any deploy. Do not bypass that rejection by falsely marking init_auth applied. Existing Neon Auth tables in their separate schema are not grounds to baseline or modify that schema.

The full schema intentionally describes future models beyond this first migration. Prisma deploy applies migration files; it does not make the entire schema present or certify drift absence. Future application models require separate staged migrations derived from the **actual migration-history end state**, excluding Neon-managed schemas. Do not generate another from-empty full migration over the deployed User. Rehearse migration-history-to-schema differences on a separately authorized disposable PostgreSQL database with a disposable shadow database, review all new objects/FKs, and never point migrate dev/reset/shadow operations at the shared Neon database. Do not use an auth-only database for features requiring the remaining models.

Once activated and applied, keep the migration file immutable. Fresh isolated databases replay init_auth; pre-existing exact auth installations use the separately approved baseline route. Every later correction is a new migration. The lock file remains PostgreSQL. Record the exact migration checksum, Prisma version, verified target fingerprint and pre/post evidence.

## Failure recovery and forward correction

Before any future approved application, arrange a verified recoverable backup/PITR point and rehearse recovery on an isolated target. Confirm the available Neon restore window and retain the source/checksums, catalog snapshot and operation timestamps. No branch, snapshot, restore or rehearsal database was created here; these are separate approvals. Do not promise a backup exists without verification. Do not restore an entire shared branch to repair auth: that could rewind unrelated Neon Auth data.

| Situation | Safe response |
| --- | --- |
| Failure before auth SQL commits | Stop. Explicit PostgreSQL transaction should leave no partial auth objects; verify with newly approved read-only checks. Prisma may still leave a failed bookkeeping row outside that transaction. Preserve it as evidence; do not assume it disappeared. |
| Network loss/uncertain commit | Do not retry, drop objects or mark applied blindly. Inspect actual objects and history first. Classify no commit, successful commit, or committed objects with incomplete history. |
| Failed history with no committed auth objects | Once verified, request approval to mark that failed migration rolled back using Prisma resolve --rolled-back, then separately approve a retry. This only changes history; it does not undo SQL. |
| Auth objects committed but history failed/incomplete | Verify exact definitions/checksum, then obtain approval for Prisma's history reconciliation. Do not rerun CREATE statements or manually UPDATE/DELETE bookkeeping. |
| Successful commit, application regression | Stop authentication traffic/retries while preserving all User rows and provider subjects. Roll back application behavior to its compatible prior state; do not remove native music/playback behavior or erase the database. This task does not change runtime code. |
| Correctable committed schema problem | Inspect first and prepare a separate immutable forward migration. Prefer compatible additions, then a separately approved backfill and later constraint tightening. Grants, type/column changes, backfills and enum additions are outside the current candidate and require explicit review/approval. Do not edit the applied migration. |
| Recovery requires prior account state | Restore to a separate authorized destination, compare and plan targeted reconciliation with protected subject/ID mappings. Any user-row reads, exports, merges or restores require explicit authorization and protected storage. Keep Neon-managed tables out of the operation. |

There is intentionally no automated down/drop script. After commit, dropping User loses accounts; CASCADE could also remove later foreign keys or unrelated dependencies. Even an empty User table is not permission to remove objects. A clean removal would require separately approved row/dependency checks and a new destructive-action scope. Neither migration failure nor this readiness task authorizes that action.

### Post-commit acceptance under a future migration approval

Perform approved read-only catalog checks for exact User/enums/index definitions and a successful matching history row; confirm no other migration applied. Compare the pre/post Neon catalog snapshots. No candidate statement reads or writes Neon user rows, invokes routines, changes default grants, alters Neon FKs, grants access or restores a branch. Enabled DDL event triggers and unexpected privilege inheritance must already be cleared as described above.

Catalog equality proves structural preservation, not a byte-for-byte live data comparison. No new live data-preservation claim is made today. Under this task, preservation follows from making no database contact or write. A future data comparison, if required, needs separate approval and must account for legitimate concurrent Neon Auth activity; migration-only observation cannot prove that all unrelated traffic stopped. A live Google login would itself insert/update auth/session data and remains outside migration-only acceptance.

## Exact future approval scopes

**A — requested now:** execute only the prepared catalog preflight and conditional history SELECT file, on the verified existing direct database, in read-only transactions. Metadata may be inspected/saved locally. No DDL, DML, migration commands, branch creation, backups or restores. Report findings and stop before writes.

**B — not requested for execution yet:** only after A passes and rehearsal/recovery prerequisites are met, request activation/application of `20261106000100_init_auth` with the recorded hash. Authorize three new public enums, one new public.User table with ten columns and its PK, three explicit indexes (four including the PK index), PostgreSQL's implicit array/composite/dependency objects, and Prisma creation/use of public._prisma_migrations with its own required PK/index and history rows/checksums/status updates. Prisma may take its standard migration advisory lock. No other pending migration, schema, application table, FK, grant, policy, trigger, existing data or Neon-managed object may be changed. Baseline/failed-history resolution is not included in the ordinary empty-state deployment approval.

**C — separate if needed:** exact-state baselining or failed-history reconciliation using a named Prisma resolve action, with its metadata-only writes explicitly approved. Not authorized now. It never substitutes for actually creating missing objects or reverses committed SQL.

Any failure, unexpected target/object/privilege/trigger, checksum change, extra pending migration or scope expansion means STOP and report. Neither A nor a later B grants permission for destructive recovery, Google login data writes, backend/UI changes or a new APK build.

## References

- [Prisma baselining](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/baselining)
- [Prisma deploy/resolve behavior](https://www.prisma.io/docs/orm/v7/reference/prisma-cli-reference)
- [Prisma failed migration and hotfix reconciliation](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/patching-and-hotfixing)
- [PostgreSQL read-only transactions](https://www.postgresql.org/docs/current/sql-set-transaction.html)
- [PostgreSQL default privileges](https://www.postgresql.org/docs/current/catalog-pg-default-acl.html)
