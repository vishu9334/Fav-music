# Neon connection diagnosis — 6 November 2026

The current failures are isolated to this machine/network's DNS and IPv6 TCP path, before database SQL execution. DNS is inconsistent for valid Neon hostnames, and the advertised Neon IPv6 addresses cannot establish TCP connections on port 5432 from this network. The same endpoint and credentials authenticate successfully over IPv4 with certificate verification. There is also a separate configuration error: DIRECT_DATABASE_URL contains the pooled hostname.

## Actual findings

| Check | Result | Evidence |
| --- | --- | --- |
| Local URL syntax/credential presence | PASS | Valid Neon PostgreSQL URLs; credentials/database present; no whitespace; sslmode=require; runtime/direct database, role and password match. No credential values printed. |
| DIRECT_DATABASE_URL is unpooled | FAIL | Both variables use `ep-calm-paper-ao3neqs5-pooler.c-2.ap-southeast-1.aws.neon.tech`. |
| Neon endpoint state | PASS | Read-only Neon API reports endpoint `ep-calm-paper-ao3neqs5` active, disabled=false, suspend_timeout_seconds=0; PostgreSQL 18. Public connections are not blocked and no IP allowlist restriction is configured. No start/resume/settings operation was issued. |
| Independent DNS | PASS | Cloudflare HTTPS DNS returns HTTP 200/DNS status 0 and three A plus three AAAA records for both API-confirmed hostnames. |
| Local/system DNS | FAIL / intermittent | Direct A resolution succeeded while AAAA was refused and system lookup returned ENOTFOUND in one probe. Pooled A was refused while system lookup returned only IPv6. Later pooled pg connections returned ENOTFOUND; a direct system-DNS login returned both families and succeeded over IPv4. |
| TCP port 5432 over IPv4 | PASS | All three independently resolved addresses connected in 93–97 ms. |
| TCP port 5432 over IPv6 | FAIL | All three independently resolved addresses timed out at 5,002 ms in bounded probes. An IPv6 default route exists through en0, so a listed route alone is not proof of reachability. |
| TLS and auth over verified IPv4 | PASS | Direct and pooled hosts both reached authenticated ReadyForQuery in 623 ms. TLS 1.3 and certificate/hostname verification succeeded; SCRAM authentication completed. No SQL was sent. |
| Direct host with normal system DNS | PASS in later probe | Authenticated in 692 ms over IPv4. This does not erase the earlier intermittent DNS failure. |
| 15-second error reproduction | PASS — failure reproduced | Controlled IPv6 selection produced pg `timeout expired` at 15,002 ms. Socket trace ends at TCP attempt, with no TCP-connected, TLS or authentication event. |

The Neon API-confirmed direct hostname is:

`ep-calm-paper-ao3neqs5.c-2.ap-southeast-1.aws.neon.tech`

The configured pooled hostname is valid too: it authenticated over IPv4. Its presence in DIRECT_DATABASE_URL is a migration-configuration error, but does not by itself explain a TCP timeout. The timeout is reproduced before a pooler or PostgreSQL authentication exchange can occur.

## Failure stage and limits

Observed path: local resolver sometimes fails or returns only AAAA records → the client attempts an unreachable IPv6 address → TCP remains unconnected → pg's connection timeout fires. Node's automatic family selection cannot fall back to an IPv4 record that the resolver did not return. Other attempts fail immediately at DNS with ENOTFOUND. IPv4 certificate verification and successful authentication rule out invalid credentials, a broken TLS certificate and a persistently unavailable compute as causes of these reproduced failures.

The original 15,008 ms preflight attempt did not capture socket events. Its individual destination/address family cannot be recovered after the fact. The present controlled probe reproduces that timeout mechanism and identifies the current local DNS/IPv6 failures; it does not retroactively prove that historical socket's address. The exact router/ISP component that refuses DNS records or drops IPv6 TCP traffic is not identified by these host-level tests.

## Smallest safe fix — recommended, not applied

1. Correct only DIRECT_DATABASE_URL's hostname to the API-confirmed unpooled hostname above, retaining the existing role, password, database and TLS configuration. This is a local connection configuration correction, not a database operation. Keep DATABASE_URL pooled for the application's existing connection pattern. Neon documents `-pooler` as the pooled hostname and direct connections for administrative/session-level work: [Neon connection guidance](https://neon.com/docs/get-started/connect-neon).
2. Repair local DNS so both valid hosts consistently return A records, and prefer a working IPv4 connection on this network. For a narrowly scoped diagnostic caller, use dynamically resolved IPv4 addresses from a reliable resolver while retaining the DNS hostname for TLS/SNI. The diagnostic demonstrated this in memory only. A DNS-order preference alone cannot fix missing/refused A answers. Do not persist the temporary IP addresses in URLs or hosts files; they are DNS-managed and can change.
3. After those separately authorized local changes, repeat the no-SQL connection handshake, then complete the previously approved catalog preflight on the verified direct host. Migration, history writes and schema changes remain unapproved. No fix or DNS setting was changed in this task.

## Evidence and preservation

[Sanitized evidence](PHASE_1A_NEON_CONNECTION_EVIDENCE.json) records the exact hosts, stages, timings and statuses. Private raw evidence is under the directory named in `/tmp/aadat-neon-diagnostic-current`, including `connection-config.json`, `neon-control-plane.json`, `dns.json`, `dns-independent.json`, `tcp-tls.json`, `postgres-handshake.json`, `timeout-reproduction.json` and `preservation-check.json`.

Only read-only project/endpoint metadata APIs and network/authentication diagnostics were used. All database connections were closed. SQL statements: **0**. Database-write statements: **0**. Neon control-plane changes: **0**. No credentials were printed. No schema, role, password, endpoint state, DNS, environment, application or migration file was changed. Sixteen protected source/config/assets hashes remain unchanged. Existing Neon Auth table rows were neither read nor written. No Git command or EAS build was run.
