# Account collection persistence and future synchronization

## Implemented boundary

Guest access remains independent of authentication and media ownership. The existing guest `aadat-library-v1-{0,1}.json` journal is retained without conversion. A user identity returned by the authenticated backend selects `aadat-library-account-v1-<uuid>-{0,1}.json`. Google UI metadata, email, link parameters and decoded/unverified JWT claims never select an account. Server-returned identity is bound to SecureStore refresh credentials and checked during restoration.

Account collections are **local device persistence**, not cloud synchronization. Each account uses the same existing LibraryService, validation and alternating journal implementation as guest collections. Switching serializes with mutations, immediately hides the previous scope, invalidates queued stale actions and copy previews, and closes collection forms. A delayed save finishes only in its original journal. Logout/offline authentication failure returns to the original guest library; it does not delete account files or change native playback. Account files are app-private local metadata, not claimed to be separately encrypted. Tokens use SecureStore; access tokens remain in memory. Device listening history remains the existing device-wide history, not an account-synchronized history.

## Explicit one-time guest copy

1. Require a server-authenticated account and successfully loaded guest/account journals. No automatic copying on login.
2. Preview additions to likes, favourites, bookmarks, Warehouse and playlists. Do not write during preview.
3. Show that guest data stays unchanged, account Warehouse choices win conflicts, conflicting playlist names keep both copies, and nothing will be uploaded. InstaMus notes and listening history are not copied.
4. Bind confirmation to the current account generation and exact guest/account snapshots. Reject a stale preview after edits or identity change.
5. Write the complete merged account snapshot and `guestImportCompleted: true` receipt in **one account-journal revision**. Publish only after save success. Preserve real UUID references with missing metadata.
6. Keep the guest journal unchanged. Refuse repeated import for that account on this device, including after restart, so later account removals cannot be resurrected by replay. Later guest/account edits are independent. If a limit would be exceeded or an input journal is corrupt, fail without truncating or overwriting it. After an interrupted write, load the last valid account revision and retry a fresh preview.

This copy is reversible by editing account collections; it is not a distributed synchronization algorithm. No cloud success indicator, remote writer, background upload or collection mutation endpoint was added.

## Future cloud synchronization — blocked design

Before implementing/executing a live writer, obtain separate approval for schema/history, authenticated endpoints, data import and deployment. The existing models do not provide durable per-account revisions, offline change logs, tombstones or idempotent upload receipts. Neither an unversioned full-snapshot overwrite nor a blind set union is safe.

Proposed protocol for a later approved batch:

- Derive owner identity exclusively from a validated access token and active server session. Never accept an authoritative userId from a payload. Recheck suspension/account state for reads and writes.
- Keep a distinct guest namespace and per-account durable outbox. A local database/journal transaction must save a local edit and its operation ID together. Use stable collection IDs and ordered membership IDs; only approved real catalog UUIDs are eligible for remote media references. Demo/local sample references remain device-only and are shown as such.
- Read the account snapshot/revision before offering a first import. Present a conflict preview and require consent before uploading guest material; retain local backups and guest originals. Do not automatically upload InstaMus notes/history.
- Submit bounded operations with a random idempotency key and expected account revision. Commit the ownership check, licence/catalog-reference validation, operation receipt, revision increment and resulting change log atomically in one database transaction. Duplicate operation IDs must return the original result. Reject stale revisions with an explicit conflict response.
- Persist deletion tombstones and ordered playlist edits. Preserve both independently created playlists on name conflict. Never resurrect a removed item through a union. For overlapping explicit changes, require review or an approved deterministic policy; device clocks must not decide ownership or silently discard edits.
- Keep separate merge bases and cursors for each account. Persist successful acknowledgements before removing local outbox entries. Never replay account A's operations under account B's session. Logout clears in-memory credentials and detaches account data but retains its durable pending work privately for that account.
- Retry only idempotent operations with bounded backoff. A 401 refreshes credentials once; a 409 fetches/reviews a fresh base; offline/5xx leaves pending data intact. Show local/pending/confirmed states truthfully. Do not show a successful cloud save without a committed server receipt.
- Rehearse concurrent edits, reordered/duplicated delivery, rename/delete conflicts, revoked sessions, interrupted local save/ack, account switching and backup/restore on isolated approved test resources before production. Live migration/recovery resources and data writes are not approved by this document.

## Approval and verification requirements

The authentication service is default-off (`AUTH_ENABLED=false`). Mobile additionally requires `EXPO_PUBLIC_AUTH_ENABLED=true` and an exact `EXPO_PUBLIC_AUTH_VERIFIED_ENDPOINT` match to the reviewed HTTPS GraphQL endpoint. A credential-free `authCapabilities` request checks the server's service/contract/readiness declaration before Google credentials are acquired or sent. This is not a substitute for operator verification of endpoint ownership, database readiness, TLS, OAuth signing-certificate registration or a real device test.

Authentication requests use a dedicated Android `HttpsURLConnection` module with redirects disabled; they never fall back to React Native fetch. The installed RN 0.76/whatwg-fetch path does not enforce browser redirect options, so a JavaScript-only redirect flag is insufficient. The native client uses default TLS/hostname verification, bounds payloads, rejects endpoint mismatch and supports timeouts/cancellation. A config plugin prepares genuine package registration at both Expo roots. Existing APKs without this transport fail closed before Google sign-in; the React Native bridge integration and actual Android TLS/redirect behavior require an approved native build/device verification. JVM contract checks are not a substitute for that verification.

No flags were enabled or actual environment files changed in Batch 6. Cloud collections remain explicitly false in capabilities. PostgreSQL/Neon and Redis session writes, licensed catalog imports and infrastructure changes remain outside current execution approval. Authenticated user creation/session rotation and multi-device collection persistence cannot be claimed live while those holds remain.
