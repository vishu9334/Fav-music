-- LOCAL DISPOSABLE FORWARD DATABASE ONLY. Prepared; not executed.
-- A synthetic migration to verify history-preserving forward correction.
-- Never copy this test-only index into the live migration candidate.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE INDEX "User_createdAt_rehearsal_idx" ON public."User"("createdAt");
COMMIT;
