-- PREPARED ONLY. Do not run without explicit live read-only SQL approval.
-- Run on ONE connection using DIRECT_DATABASE_URL, with stop-on-error enabled.
-- System-catalog metadata only: no application/Neon Auth user rows or credentials.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '2s';
SET LOCAL idle_in_transaction_session_timeout = '30s';

-- 01: Confirm target, effective schema, role and enforced read-only transaction.
SELECT pg_catalog.current_database() AS database_name, CURRENT_USER AS effective_role,
       SESSION_USER AS session_role,
       pg_catalog.current_setting('server_version') AS postgres_version,
       pg_catalog.current_setting('transaction_read_only') AS transaction_read_only,
       pg_catalog.current_setting('search_path') AS search_path,
       pg_catalog.current_schema() AS effective_schema,
       pg_catalog.current_schemas(false) AS effective_schemas,
       pg_catalog.has_database_privilege(CURRENT_USER, pg_catalog.current_database(), 'CONNECT') AS can_connect;

-- 02: Schema presence, ownership and effective privileges. public must exist.
SELECT n.nspname AS schema_name, pg_catalog.pg_get_userbyid(n.nspowner) AS owner,
       n.nspacl::text AS acl,
       pg_catalog.has_schema_privilege(CURRENT_USER, n.oid, 'USAGE') AS can_use,
       pg_catalog.has_schema_privilege(CURRENT_USER, n.oid, 'CREATE') AS can_create
FROM pg_catalog.pg_namespace n WHERE n.nspname IN ('public', 'neon_auth') ORDER BY n.nspname;

-- 03: ALL relation names, including indexes, sequences, views and migration history.
-- Check User, User_pkey, User_email_key, User_googleSub_key, User_role_status_idx,
-- and _prisma_migrations for conflicts. relkind must match any claimed baseline.
SELECT n.nspname AS schema_name, c.relname AS object_name, c.relkind,
       pg_catalog.pg_get_userbyid(c.relowner) AS owner, c.relacl::text AS acl,
       c.relrowsecurity, c.relforcerowsecurity,
       CASE WHEN c.relkind IN ('r', 'p', 'v', 'm', 'f')
         THEN pg_catalog.has_table_privilege(CURRENT_USER, c.oid, 'SELECT') END AS can_select
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'neon_auth') ORDER BY n.nspname, c.relname;

-- 04: ALL public type names (also catches a conflicting composite User type).
-- Enum label order must match the draft. Other-schema names do not collide.
SELECT n.nspname AS schema_name, t.typname AS type_name, t.typtype,
       pg_catalog.pg_get_userbyid(t.typowner) AS owner, t.typacl::text AS acl,
       e.enumsortorder, e.enumlabel
FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
LEFT JOIN pg_catalog.pg_enum e ON e.enumtypid = t.oid
WHERE n.nspname IN ('public', 'neon_auth')
ORDER BY n.nspname, t.typname, e.enumsortorder;

-- 05: Columns and defaults; no table-row reads. Also snapshots Neon definitions.
SELECT n.nspname AS schema_name, c.relname AS table_name, a.attnum, a.attname,
       pg_catalog.format_type(a.atttypid, a.atttypmod) AS column_type,
       a.attnotnull, a.attidentity, a.attgenerated,
       pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS default_expression
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
WHERE n.nspname IN ('public', 'neon_auth') AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
ORDER BY n.nspname, c.relname, a.attnum;

-- 06: Constraints, including all FKs touching public or neon_auth in either direction.
SELECT n.nspname AS schema_name, c.relname AS table_name, k.conname, k.contype,
       rn.nspname AS referenced_schema, rc.relname AS referenced_table,
       k.convalidated, pg_catalog.pg_get_constraintdef(k.oid, true) AS definition
FROM pg_catalog.pg_constraint k
LEFT JOIN pg_catalog.pg_class c ON c.oid = k.conrelid
LEFT JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_catalog.pg_class rc ON rc.oid = k.confrelid
LEFT JOIN pg_catalog.pg_namespace rn ON rn.oid = rc.relnamespace
WHERE n.nspname IN ('public', 'neon_auth') OR rn.nspname IN ('public', 'neon_auth')
ORDER BY n.nspname, c.relname, k.conname;

-- 07: Index validity, uniqueness and actual expressions/column order.
SELECT n.nspname AS schema_name, c.relname AS table_name, ix.relname AS index_name,
       i.indisprimary, i.indisunique, i.indisvalid, i.indisready,
       pg_catalog.pg_get_indexdef(i.indexrelid) AS definition
FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid = i.indrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_class ix ON ix.oid = i.indexrelid
WHERE n.nspname IN ('public', 'neon_auth') ORDER BY n.nspname, c.relname, ix.relname;

-- 08: Routine inventory only. Do not execute routines or read their bodies.
SELECT n.nspname AS schema_name, p.proname, p.prokind,
       pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       pg_catalog.pg_get_userbyid(p.proowner) AS owner, p.prosecdef, p.proacl::text AS acl
FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'neon_auth') ORDER BY n.nspname, p.proname, p.oid;

-- 09: Table triggers and rule definitions. No trigger/function invocation.
SELECT n.nspname AS schema_name, c.relname AS table_name, t.tgname,
       t.tgenabled, t.tgisinternal, pg_catalog.pg_get_triggerdef(t.oid, true) AS definition
FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'neon_auth') ORDER BY n.nspname, c.relname, t.tgname;

SELECT schemaname, tablename, rulename, definition FROM pg_catalog.pg_rules
WHERE schemaname IN ('public', 'neon_auth') ORDER BY schemaname, tablename, rulename;

-- 10: Database-wide DDL event triggers. Any enabled trigger requires side-effect review.
SELECT e.evtname, e.evtevent, e.evtenabled, e.evttags,
       n.nspname AS function_schema, p.proname AS function_name
FROM pg_catalog.pg_event_trigger e JOIN pg_catalog.pg_proc p ON p.oid = e.evtfoid
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace ORDER BY e.evtname;

-- 11: Current creator's global/public default ACLs plus PostgreSQL hardwired defaults.
-- Non-owner table grants require review: User and _prisma_migrations contain sensitive data.
SELECT CASE WHEN d.defaclnamespace = 0 THEN '(global)' ELSE n.nspname END AS scope,
       d.defaclobjtype AS object_type, d.defaclacl::text AS acl
FROM pg_catalog.pg_default_acl d LEFT JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace
JOIN pg_catalog.pg_roles r ON r.oid = d.defaclrole
WHERE r.rolname = CURRENT_USER AND (d.defaclnamespace = 0 OR n.nspname = 'public')
ORDER BY scope, object_type;

SELECT pg_catalog.acldefault('r', r.oid)::text AS hardwired_table_acl,
       pg_catalog.acldefault('T', r.oid)::text AS hardwired_type_acl,
       r.rolsuper, r.rolinherit, r.rolbypassrls
FROM pg_catalog.pg_roles r WHERE r.rolname = CURRENT_USER;

-- 12: RLS policies and their metadata; do not query protected rows.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies WHERE schemaname IN ('public', 'neon_auth')
ORDER BY schemaname, tablename, policyname;

-- 13: Dependencies on proposed target names, including cross-schema dependencies.
WITH targets AS (
  SELECT 'pg_catalog.pg_class'::pg_catalog.regclass AS classid, c.oid AS object_id
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname IN
    ('User', 'User_pkey', 'User_email_key', 'User_googleSub_key', 'User_role_status_idx', '_prisma_migrations')
  UNION ALL
  SELECT 'pg_catalog.pg_type'::pg_catalog.regclass, t.oid
  FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public' AND t.typname IN ('User', 'ChatRetentionPreference', 'UserRole', 'AccountStatus')
)
SELECT pg_catalog.pg_describe_object(d.classid, d.objid, d.objsubid) AS dependent_object,
       pg_catalog.pg_describe_object(d.refclassid, d.refobjid, d.refobjsubid) AS referenced_object,
       d.deptype
FROM pg_catalog.pg_depend d JOIN targets t ON t.classid = d.refclassid AND t.object_id = d.refobjid
ORDER BY referenced_object, dependent_object;

COMMIT;
