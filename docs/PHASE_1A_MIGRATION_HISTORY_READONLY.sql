-- CONDITIONAL, PREPARED ONLY. Requires explicit live read-only SQL approval.
-- Run ONLY if the catalog preflight confirms public._prisma_migrations is an
-- ordinary table with all selected columns and appropriate SELECT permission,
-- no enabled RLS, and no unreviewed rewrite rules.
-- Never run automatically if it is absent, a view, a foreign table or malformed.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '2s';
SET LOCAL idle_in_transaction_session_timeout = '30s';

SELECT migration_name, checksum, started_at, finished_at, rolled_back_at, applied_steps_count
FROM public._prisma_migrations ORDER BY started_at, migration_name;

COMMIT;
