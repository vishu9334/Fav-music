# Prisma native connectivity diagnosis — direct PASS, pooled DNS FAIL

Checked 6 November 2026, approximately 10:05 IST. **Native Prisma connectivity to the configured Neon direct host is now verified safely with read-only operations.** The pooled native check still fails at the local DNS path. No configuration, data, schema, migration history or resource was changed. The user's instruction to keep all live writes blocked remains in force.

## Exact operation results

| Operation/control | Result | Actual evidence |
| --- | --- | --- |
| Native direct schema diff | **PASS** | Prisma 7.10.1 `migrate diff --from-config-datasource --to-empty --exit-code`, exit 0, 4,429 ms: `No difference detected.` |
| Native direct introspection | **PASS for connectivity; expected empty-schema diagnostic** | `db pull --print --schemas public` connected and returned P4001 in 5,289 ms because public has no tables. Exit 1 here does not represent a network/authentication failure. No source schema was written. |
| Native pooled schema diff | **FAIL** | Same read-only diff, pooled host, exit 1 / P1001 in 668 ms. System lookupAll/lookup4/lookup6 all returned ENOTFOUND; local resolve4/resolve6 returned EREFUSED. |
| Existing API-confirmed compute alias | PASS, diagnostic only | Native diff on `ep-calm-paper-ao3neqs5-j0k.c-2.ap-southeast-1.aws.neon.tech` exited 0 in 4,424 ms. This existing alias belongs to the same endpoint/branch. It was not persisted or recommended as the stable deployment URL. |
| Node direct/pooled controls | PASS | Strict-TLS IPv4 authentication and read-only metadata checks, public table count 0, read_only=on; 1,651/1,124 ms respectively. The direct session stayed open through native checks. |
| Independent DNS A answers | PASS | Certificate-verified HTTPS DNS returned three IPv4 addresses for each API-confirmed hostname. No database credential was sent to the DNS provider. |
| IPv4 PostgreSQL TLS | PASS | All three hostname probes (direct, pooled, existing compute alias) verified TLS 1.3 certificates/hostnames in 303–309 ms using fresh resolved IPv4 addresses. |
| IPv6 TCP | **PASS now** | All three fresh AAAA addresses for both direct and pooled hosts connected to port 5432 in 96–100 ms. Earlier IPv6 timeouts did not recur. |
| IPv6 PostgreSQL TLS | PASS | Direct and pooled hostname verification passed over IPv6, TLS 1.3, 302/301 ms. |
| Native libpq IPv4 control | PASS | psql with dynamic PGHOSTADDR, original PGHOST, verify-full/system CA and required channel binding exited 0 in 852 ms; read-only result `on|public|0`. This is a control, not a Prisma configuration change. |

Configured direct host:

`ep-calm-paper-ao3neqs5.c-2.ap-southeast-1.aws.neon.tech`

Configured pooled host:

`ep-calm-paper-ao3neqs5-pooler.c-2.ap-southeast-1.aws.neon.tech`

The exact failing pooled native error was:

```text
Error: P1001

Can't reach database server at `ep-calm-paper-ao3neqs5-pooler.c-2.ap-southeast-1.aws.neon.tech:5432`
```

The direct introspection diagnostic was:

```text
P4001 The introspected database was empty:
```

P4001 confirms the native engine reached the database and inspected an empty public schema. Its generic suggestion to create a table was not acted on: migration/table creation remains unapproved. The successful direct diff independently confirms native connection/authentication/schema inspection without interpreting an error exit as success by itself.

## Cause and engine-specific behavior

The current remaining native failure is **pooled-host local DNS resolution**. A valid API-confirmed pooled hostname fails local lookup, while independently resolved addresses complete TLS and the Node fallback authenticates on that same host. A pooled transport/backend failure was not demonstrated. The correct migration target is already the unpooled direct URL, which passed this check.

The earlier direct P1001/DNS and IPv6 failures were historical observations. This check shows direct OS lookup returning A/AAAA records, successful native direct access, and successful IPv6 TCP/TLS. It would be incorrect to keep reporting a currently universal IPv6 outage or a permanently broken native engine. Local c-ares resolve4/resolve6 still returned EREFUSED even while direct OS lookup succeeded; the resolver path remains inconsistent. The prior individual failed sockets were not instrumented, so their exact historical address choices cannot be reconstructed.

The installed native engine commit is `d1b3f377ca835d73fd50954a5e22128b9ebdd6b8`. Its matching [URL parser source](https://raw.githubusercontent.com/prisma/prisma-engines/d1b3f377ca835d73fd50954a5e22128b9ebdd6b8/quaint/src/connector/postgres/url.rs) and [native driver source](https://raw.githubusercontent.com/prisma/prisma-engines/d1b3f377ca835d73fd50954a5e22128b9ebdd6b8/quaint/src/connector/postgres/native/mod.rs) show a separate Rust Quaint/tokio-postgres connection path with native TLS. It takes its host/options from the Prisma datasource URL; it does not use the Node pg factory, Node DNS callbacks or Node result-order flags. The inspected URL parser discards unsupported query keys, so libpq's PGHOSTADDR control must not be presented as a supported Prisma URL fix.

For every native attempt, only the child-process URL was augmented with schema=public, sslmode=require, sslaccept=strict, connect_timeout=5, socket_timeout=10 and default_transaction_read_only/statement/lock timeout startup options. Credentials stayed in process memory and sanitized output; no URL secret appeared in command-line arguments or reports. The original environment/configuration remained unchanged. Native successes required certificate checking; no accept-invalid-certs, IP-only TLS identity or trust bypass was used.

`migrate diff` describes schema differences without applying them; see the [Prisma CLI reference](https://www.prisma.io/docs/orm/v7/reference/prisma-cli-reference#migrate-diff). `db pull --print` was used specifically to avoid rewriting schema.prisma. No migrate deploy/dev/resolve, db execute, seed, snapshot, branch, compute creation or restore operation was called.

## What remains blocked

- **All live writes remain blocked by the user's decision.** Successful connectivity is not migration, baselining or resource approval.
- Hosted recovery snapshot/isolated restore verification remains unapproved and incomplete. No resources were created or requested again in this diagnosis.
- DNS reliability remains a deployment risk. Repeat the native direct read-only check and live safety preflight immediately before any separately approved migration from the actual deployment environment. This point-in-time PASS does not prove the local resolver is permanently fixed.
- public.User is still absent. Authentication persistence cannot succeed until a separately approved initial migration is applied. Empty public needs an actual migration, not a false baseline.

No corrective system-wide DNS, network, TLS, application or environment change is recommended as already applied. Use the verified stable direct hostname for future native migration work; do not switch production configuration to the diagnostic compute alias or pin transient IPs. A reliable resolver/network for the native process is still necessary for repeatable operation.

## Evidence

[Sanitized evidence](PHASE_1A_PRISMA_NATIVE_DIAGNOSIS_EVIDENCE.json) records operation results, exact sanitized errors, DNS comparisons and controls. Private detailed logs are under the directory referenced by `/tmp/aadat-prisma-native-diag-current`. It contains redacted native stdout/stderr, DNS results, IPv6 TCP/TLS results, API-confirmed endpoint metadata and preservation hashes. Source/configuration/environment/migration hashes are unchanged. User/account/session rows were not read. No Git command or EAS build was run.

**Final connectivity decision:** direct native Prisma PASS, pooled native DNS FAIL. **Live migration/resource authorization remains HOLD.**
