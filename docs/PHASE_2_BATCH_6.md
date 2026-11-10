# Phase 2 Batch 6 — Authentication and user persistence

6 November 2026. **Local implementation and verification: PASS. Live authentication, native bridge/device verification and cloud account persistence: BLOCKED.** Stopped after Batch 6; no real account login or cloud synchronization success is claimed.

## Audit and reuse

Reused the existing native Google Sign-In provider, backend Google verifier, JWT/Redis session services, GraphQL auth controllers, SecureStore repository, AuthController and Login/Profile screens. Reused LibraryService, its Zustand actions and alternating local journal. No second login system, fake production identity, token polyfill or cloud sync simulation was added. The detailed initial audit is in [PHASE_2_BATCH_6_AUDIT.md](PHASE_2_BATCH_6_AUDIT.md).

Installed versions remain React 18.3.1, RN 0.76.6, Expo 52.0.49 (SDK 52), Google Sign-In 16.1.1 and SecureStore 14.0.1. Dependency manifests/lockfile are unchanged. Google and TrackPlayer native dependencies remain discoverable. Provider configuration still requests only a Google ID token for the backend Web OAuth audience, with Google offline access disabled. Backend signature/audience/issuer/expiry verification, verified email, subject-based lookup, no automatic email linking, account-status checks and session-family replay protection remain in use.

## Implemented locally

- Restored app-wide auth lifecycle without gating/remounting the player. Session restoration occurs at launch/foreground; a foreground-only timer renews 30 seconds before expiry and is cleaned up in the background/unmount.
- Added a Profile entry to the existing Library UI. Login, loading, cancellation, retry/error/offline, local logout and verified-profile states reuse the existing design. Guest music/navigation remain available.
- Added backend default-off auth enforcement (`AUTH_ENABLED=false`). Login, refresh, logout and current-user service operations reject HOLD before verifier/repository/session work. A credential-free `authCapabilities` query reports service/version and flags; cloud collections are always false. REST now maps a controlled HOLD to HTTP 503.
- Mobile additionally requires `EXPO_PUBLIC_AUTH_ENABLED=true` and exact `EXPO_PUBLIC_AUTH_VERIFIED_ENDPOINT` equality with the configured HTTPS GraphQL endpoint. These are approval/configuration gates, not evidence that an endpoint or database was verified. Readiness must succeed before Google sign-in is opened or credentials sent. Current actual environment files remain unchanged and disabled/unbound.
- Added a dedicated native Android credential transport because RN 0.76's whatwg-fetch/XHR path does not enforce browser `redirect: 'error'`. The genuine Java module uses `HttpsURLConnection`, disables redirects before writing a body, retains default TLS and hostname verification, validates the exact approved HTTPS endpoint, caps request/response bodies at 1 MiB, bounds concurrency and supports timeout/cancellation. Auth has **no fetch fallback**. Missing/incompatible native transport causes CONFIGURATION failure before Google sign-in.
- Registered an idempotent Expo config plugin at both roots to include that transport in a future approved native build. Existing checked-in Android files were not changed and no prebuild/Gradle/EAS build was executed. The plugin is necessary because the EAS archive excludes `apps/mobile/android`; its Java source remains under `apps/mobile/plugins` for future generation. MainApplication template insertion is tested against the existing Kotlin source. Native React bridge compilation/registration and device transport behavior remain unverified.
- Kept access credentials in service memory and refresh/revocation credentials in SecureStore. Stored records are bounded/sanitized and now bind refresh credentials to the verified server user ID. Google tokens/secrets and app access tokens do not enter profile/Zustand state or local collection files. Rotation is persisted before profile fetch; identity mismatch is rejected/revoked; offline errors preserve retryable credentials without fabricating a profile.
- Added `withAccessToken(expectedUserId, request)` for future authenticated APIs: refresh before expiry, serialize single-use token rotation, retry one rejected access token and reject mismatched-account or late-after-logout responses. Network errors do not trigger blind operation retries. This batch adds no cloud collection writer.
- Logout immediately invalidates in-memory request authority and hides account collections. SecureStore saves revocation intent before removing active local credentials; offline/server-HOLD revocation remains pending. A failed durable logout write cannot silently restore the account in the same running service. A logout preempts queued Google sign-in and cannot be undone by a late provider/server result. If device storage itself fails, durable logout cannot be claimed until retry succeeds.

## Account collections and synchronization boundary

Guest data keeps the original `aadat-library-v1-{0,1}.json` files. Each verified account uses its own `aadat-library-account-v1-<uuid>-{0,1}.json` journal. Account scope comes from server-authenticated profile state, not Google UI metadata, email, deep links or unverified JWT claims. No account journal is selected by production UI while auth is on HOLD.

All existing likes, favourites, bookmarks, playlists, Warehouse and InstaMus actions run through the same LibraryService. Account changes serialize with saves, hide old data immediately, reject queued stale actions and preserve each original journal. Repeated activation coalesces. Collection dialogs and old playlist routes are invalidated on account changes, including delayed delete confirmations. Logout/failed authentication returns to the original guest library without deleting account data or touching playback. History remains the pre-existing device-wide history; it is not represented as account-synchronized history.

The profile offers an explicit **one-time local copy** of guest likes/favourites/bookmarks/Warehouse/playlists: preview counts/conflicts, confirm, then commit the complete merge and receipt in one local account revision. Guest files never change. Account Warehouse choices take precedence; conflicting playlist names retain both playlists. Missing real UUID metadata is preserved. Overflow/corrupt data/stale previews fail without truncation. A completion receipt survives restart and prevents a repeated copy from resurrecting later account removals. InstaMus notes and history are not copied. Local collection metadata is app-private storage, not claimed separately encrypted.

This is device-local account persistence. **Cloud synchronization is not implemented or enabled.** A safe revision/CAS, idempotency, per-account outbox, tombstone, conflict and recovery protocol is specified in [PHASE_2_BATCH_6_SYNC_DESIGN.md](PHASE_2_BATCH_6_SYNC_DESIGN.md). Existing schema/history lacks the required approved concurrency/change-log support. No fake upload, remote success indicator, background writer or unversioned overwrite was introduced.

## PASS/FAIL evidence

| Check | Result and actual evidence |
| --- | --- |
| Contracts build | PASS — `pnpm --filter @aadat/contracts build` |
| TypeScript | PASS — `pnpm run typecheck`, all four workspaces |
| Full regression suite | PASS — `TEST_LIVE_CONNECTIVITY=false pnpm test`: **520 passed, 3 skipped**, 40 files passed / one live-only file skipped |
| Android production Metro | PASS — eager/reset-cache/dev false export: **2,922 modules, 31 assets**, exit 0 |
| Hermes | PASS — bytecode compilation/disassembly exit 0; standard RN/Reanimated warnings remain |
| Canonical runtime | PASS, static evidence — one registerComponent definition / two symbol references; bundle ends `__r(167); __r(0);` |
| Native HTTP policy/client | PASS, JVM contract only — javac + executable checks for approved HTTPS, no redirects, unchanged default TLS/hostname verifier, body limits, HTTP status and cancellation; in-process connection doubles, no sockets |
| Native adapter/plugin | PASS, JS/source contract only — missing-guard refusal, timeout cancellation, sanitized errors, idempotent existing Kotlin template modification, plugin registered at both roots |
| Protected files | PASS — 83/85 baseline files byte-identical; two Expo configs differ only by transport plugin entry; icon fields and all other config values unchanged |
| Icon assets | PASS — all four existing icon assets match the prior protected hashes |
| Prisma/schema/history, actual env, audio/video/catalog/native source | PASS — protected hashes unchanged; no new migration artifacts |
| Bundle sensitive literal scan | PASS, limited check — 7 unique configured sensitive literals tested, zero matches; values not printed |
| Actual Google login/user registration/refresh/logout | BLOCKED — live database/session writes remain on HOLD; endpoint/device/OAuth checks pending |
| Native Android auth bridge and TLS/redirect behavior on device | BLOCKED / NOT RUN — requires an approved auth-transport-capable native APK; no native/EAS build |
| Cloud user collection persistence | BLOCKED — design only, no approved schema/write API or live execution |

The 38 additional Vitest checks cover default-off auth, approved endpoint binding, credential-free readiness, no native transport fallback, secure response/profile parsing, Google cancellation/Play Services/network cases, bound identity and refresh serialization, one retry, late logout results, failed logout persistence, lifecycle timers, account isolation/restart/corruption, in-flight saves, stale previews, one-time copy receipts/conflicts/overflow/recovery, and actual GraphQL/REST HOLD rejection without dependency access. Existing Batches 1–5 and backend regression suites pass. Test-injected credentials and identities never enter a running production app; tests make no real Google/Neon/Redis/S3 calls.

JVM command (not an Android/Gradle/APK build):

```sh
javac -d /tmp/aadat-phase2-batch6-_362h0ta/java-check apps/mobile/plugins/auth-transport/AuthHttpClient.java apps/mobile/plugins/auth-transport/tests/AuthHttpClientCheck.java
java -cp /tmp/aadat-phase2-batch6-_362h0ta/java-check com.favmusic.auth.AuthHttpClientCheck
```

Metro used `pnpm exec expo export:embed --eager --reset-cache --platform android --dev false`, outside-repo bundle/assets output, dotenv disabled and auth explicitly disabled. Hermes used the existing RN compiler. No native runtime success is inferred from Metro/Hermes or JVM tests.

Temporary evidence: `/tmp/aadat-phase2-batch6-_362h0ta` contains Metro/Hermes logs and outputs, the JVM check log/classes, configuration audit, protected hashes, config-integrity comparison and verification JSON. Full test/typecheck/contracts logs are `/tmp/aadat-phase2-batch6-*.log`.

Bundle SHA-256: `ba9fe33c49e413670eb4bb3d9a7c88b5c5a135f4b33441bb0c0ea252fffd32e4`. Hermes SHA-256: `90ab4ab19426b70106614be7658890226deaa084005bfee14eb7398fbf66f655`.

## Configuration and remaining blockers

- Public Google Web client ID is present, has valid format and matches the backend client ID. No client secret is needed by this ID-token flow or was copied to mobile. Android OAuth registration for `com.favmusic` and the actual signing SHA-1/SHA-256 was not independently verified. Upstream marks the reused Original Android Google SDK as deprecated but functional; a future supported-native-provider upgrade needs its own compatibility review.
- An HTTPS GraphQL URL is present in the actual environment but was not contacted or treated as currently verified. The exact approved endpoint binding is absent, and server/mobile auth flags are off. No credentials were transmitted. Obtain operator verification of ownership/reachability/TLS/readiness before binding/enabling it; a readiness declaration does not prove database health.
- The database HOLD is unchanged. Live Google login can create a User; session creation/rotation/revocation writes Redis. None was executed. Neon schema/migration/history/recovery approval remains separate; no migration or Prisma schema/client change was made in this batch.
- Native auth transport source is prepared with a config plugin, but the React bridge has not been compiled into an APK or tested on Android. A future explicit build approval and device end-to-end checks must verify package registration, SecureStore, OAuth certificate registration, TLS/redirect refusal, cancellation, sign-in/session restoration/logout and guest playback continuity. Existing APKs without the guard fail closed. Local Java client checks do not establish native bridge compatibility.
- Cloud collections require the separately reviewed schema, revision/tombstone/outbox API, migration/recovery rehearsal and explicit data-write approval described in the sync design. Device-local account collections do not establish multi-device persistence, and guest copy does not upload anything.
- Batch 5 licensed catalog/S3 and Batch 4 native video/device blockers remain where previously documented. Playback/video/catalog implementations and icon assets are unchanged. Earlier user-confirmed seek is historical device evidence, not verification of this new auth runtime.

No Git commands, live SQL, migrations, baselining, live database/Redis writes, Neon snapshots/branches/computes, deployment, cloud resource/storage changes, real OAuth calls, native/Gradle/APK builds or EAS builds were performed. Java contract compilation used temporary output only. Local source changes do not authorize any future live write or build.

## Changed files

```text
.env.example
app.json
apps/mobile/.env.example
apps/mobile/app.json
apps/mobile/app/_layout.tsx
apps/mobile/plugins/auth-transport/AadatAuthModule.java
apps/mobile/plugins/auth-transport/AadatAuthPackage.java
apps/mobile/plugins/auth-transport/AuthHttpClient.java
apps/mobile/plugins/auth-transport/tests/AuthHttpClientCheck.java
apps/mobile/plugins/with-auth-transport.js
apps/mobile/src/auth/__tests__/auth-collection-binding.test.ts
apps/mobile/src/auth/__tests__/auth-service.test.ts
apps/mobile/src/auth/__tests__/graphql-auth.test.ts
apps/mobile/src/auth/__tests__/native-adapters.test.ts
apps/mobile/src/auth/__tests__/native-auth-transport.test.ts
apps/mobile/src/auth/__tests__/session-lifecycle.test.ts
apps/mobile/src/auth/adapters/native-auth.transport.ts
apps/mobile/src/auth/adapters/native-google-auth.provider.ts
apps/mobile/src/auth/auth.module.ts
apps/mobile/src/auth/components/account-collections.panel.tsx
apps/mobile/src/auth/components/auth-session-lifecycle.tsx
apps/mobile/src/auth/components/auth.screen.tsx
apps/mobile/src/auth/contracts/auth.contract.ts
apps/mobile/src/auth/controllers/auth-collection.binding.ts
apps/mobile/src/auth/controllers/auth.controller.ts
apps/mobile/src/auth/repositories/graphql-auth.repository.ts
apps/mobile/src/auth/repositories/secure-session.repository.ts
apps/mobile/src/auth/services/auth-config.ts
apps/mobile/src/auth/services/auth.service.ts
apps/mobile/src/components/library/LibrarySheets.tsx
apps/mobile/src/library/__tests__/account-library.test.ts
apps/mobile/src/library/account-library.service.ts
apps/mobile/src/library/file-library.repository.ts
apps/mobile/src/library/guest-import.service.ts
apps/mobile/src/library/library.contract.ts
apps/mobile/src/library/library.service.ts
apps/mobile/src/screens/LibraryScreen.tsx
apps/mobile/src/screens/PlaylistScreen.tsx
apps/mobile/src/screens/SharedContentScreen.tsx
apps/mobile/src/screens/WarehouseScreen.tsx
apps/mobile/src/store/useLibraryStore.ts
docs/PHASE_2_BATCH_6.md
docs/PHASE_2_BATCH_6_AUDIT.md
docs/PHASE_2_BATCH_6_SYNC_DESIGN.md
packages/contracts/src/graphql/schema.graphql
packages/contracts/src/graphql/schema.ts
server/src/__tests__/fixtures/auth-env.ts
server/src/modules/auth/__tests__/auth-controller.test.ts
server/src/modules/auth/__tests__/auth-hold.test.ts
server/src/modules/auth/__tests__/auth-service.test.ts
server/src/modules/auth/__tests__/phase1a-graphql.test.ts
server/src/modules/auth/auth.module.ts
server/src/modules/auth/contracts/auth-service.contract.ts
server/src/modules/auth/controllers/auth-graphql.controller.ts
server/src/modules/auth/services/auth.service.ts
server/src/shared/middleware/error-handler.middleware.ts
```

Generated contract output under `packages/contracts/dist/**` was refreshed from the SDL. Existing Prisma schema/migrations/generated client and mobile dependency manifests/lockfile were not changed.

## Sources

- [Google backend verification](https://developers.google.com/identity/sign-in/android/backend-auth): verified ID-token identity over HTTPS, not client-supplied IDs.
- [Google Sign-In library's original API](https://react-native-google-signin.github.io/docs/original): Web audience configuration, cancellation and underlying Android SDK status.
- [Android per-connection redirect control](https://developer.android.com/reference/java/net/HttpURLConnection#setInstanceFollowRedirects(boolean)) and [HTTPS verification defaults](https://developer.android.com/reference/javax/net/ssl/HttpsURLConnection). The installed RN 0.76 `XMLHttpRequest` and whatwg-fetch 3.6.20 source were inspected directly for the fetch redirect limitation.

**Stopped after Batch 6 for review.**
