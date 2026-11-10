# Phase 1A — Google authentication

Local authentication implementation was verified on 5 November 2026. Follow-up startup, tunnel and Android HTTPS verification completed on 6 November; see [the follow-up report](BACKEND_STARTUP_AND_TUNNEL.md). Live sign-in remains blocked by the missing application database schema and an auth-capable native APK. No EAS build, migration, Git command or destructive database operation was performed.

## Audit and implementation

The existing backend already provided Google token verification, Prisma user persistence, a class-based authentication service, JWT access tokens, Redis refresh-token rotation and session-aware authorization. These implementations were reused. The mobile app had no authentication implementation; GraphQL exposed `me` but no login/refresh/logout operations.

The mobile implementation follows Controller → Service → Repository contracts/implementations, with a native provider adapter and a composition root. React screen classes render controller state and never hold credentials.

- Native Google sign-in uses `@react-native-google-signin/google-signin` 16.1.1, compatible with the installed Expo 52.0.49. Only the Google ID token is sent to the backend; provider-supplied profile IDs/email are not accepted as identity. The sign-in screen uses the SDK's branded button.
- The backend verifies Google signatures, issuer, expiration and configured audience using the existing `google-auth-library` verifier. Email verification must be the boolean `true`. Provider errors cannot echo submitted ID tokens.
- Existing Google subjects log in; new verified subjects register through the Prisma repository. Email-based automatic linking remains prohibited. Concurrent registration conflicts may recover only the same verified Google subject.
- Suspended/deactivated accounts cannot log in, refresh or use existing authenticated sessions. Account status is an explicit repository contract field.
- GraphQL adds `loginWithGoogle(idToken)`, `refreshSession(refreshToken)` and `logout(refreshToken)`, and routes `me` through the authentication service. REST endpoints remain available. Error formatting preserves existing HTTP statuses and emits safe domain codes/messages.
- Existing hashed Redis refresh sessions remain authoritative. Rotation now rejects revoked session IDs atomically. Logout with a consumed refresh token also revokes its family, covering refresh/logout races and lost refresh responses.
- Mobile access tokens remain in memory. Refresh credentials are encrypted by Expo SecureStore/Android Keystore. Google ID tokens and client secrets are not persisted. The SecureStore config plugin configures backup handling.
- Mobile restore/login/rotation/logout operations are serialized. Duplicate presentation requests share an in-flight operation. A late login result cannot restore authenticated UI after logout.
- Session restoration runs at startup and on foregrounding without gating or remounting the music player. Expired access tokens rotate through the backend. Offline restoration preserves stored credentials without inventing an authenticated profile.
- Offline logout removes the active local credentials and securely persists revocation intent. Revocation is retried on restore, foregrounding or sign-in; immediate remote revocation cannot be guaranteed while disconnected.
- Login, loading and profile screens use the existing dark Aadat palette. The player stays at `/`; an account shortcut adds `/profile`, and `/login` is also available. Returning to music remains possible during authentication.
- Google and SecureStore imports are deferred. Missing native support results in a controlled update/error state instead of an early module-import startup failure.

The Android provider uses the library's Original Google Sign-In API. Its underlying Android SDK is deprecated but documented as functional; a future Credential Manager migration should be planned separately for the pinned Expo/RN stack. This local verification does not certify native Google compatibility on a signed device build. See the [Expo integration guide](https://docs.expo.dev/guides/google-authentication/), [provider API documentation](https://react-native-google-signin.github.io/docs/original), and [Google backend verification requirements](https://developers.google.com/identity/sign-in/android/backend-auth).

## Configuration and blockers

At your direction, the existing valid-format backend `GOOGLE_CLIENT_ID` was copied to mobile `.env.local` as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. This is a public OAuth identifier. No Google client secret, JWT signing secret, database URL or other backend credential was copied to mobile configuration.

**HTTPS follow-up:** the original HTTP endpoints were replaced only after verifying a Cloudflare HTTPS endpoint from both the computer and the Android phone. The current temporary URL and evidence are in the follow-up report. Authentication continues to refuse credentials over HTTP.

The Android OAuth client must register `com.favmusic` with the actual signing certificate SHA-1/SHA-256 in the same Google Cloud project as the Web client ID. You confirmed existing configuration is available, but cloud registration and a real Google login were not independently verified. This ID-token flow does not require a Google client secret or Firebase.

On 6 November, ADB reported no `com.favmusic` package installed for the current Android user. Google Sign-In and SecureStore require an auth-capable native APK; Metro export alone cannot add native modules. Environment files are excluded from the EAS archive, so any future build must receive the two public mobile variables through its approved build environment. No build or environment upload was triggered here.

**Correction after live metadata inspection:** the Prisma source already defines `User.googleSub`, email uniqueness and account-status columns, but the configured database does not contain `public."User"` or the other Aadat application tables. The earlier claim that no migration was needed was based on source definitions and was incorrect for this database. Only Neon-managed `neon_auth` tables were found; they must not be repurposed. An unapplied auth-only SQL draft is available for review. PostgreSQL/Redis connection configuration was not changed.

## Verification

| Check | Result |
| --- | --- |
| `pnpm run typecheck` | PASS — all four workspaces |
| `TEST_LIVE_CONNECTIVITY=false pnpm test` | PASS — 256 passed, 3 live-connectivity tests skipped |
| Android production `expo export:embed --eager --dev false` | PASS — 2,827 modules, 25 assets |
| Hermes bytecode compilation | PASS — standard RN/Reanimated global-reference warnings, no compilation error |
| AppRegistry deduplication | PASS — one `registerComponent` function definition and one `registerRootComponent` definition |
| Expo Android native autolinking discovery | PASS — `RNGoogleSigninPackage` and existing `TrackPlayer` package discovered |
| Expo configs | PASS — both project roots resolve; SecureStore plugin configured |
| Preservation checks | PASS — playback service/store/tests, player screen, icons, entry point, Metro configs and Prisma schema unchanged; app JSON changes limited to adding SecureStore |
| Mobile bundle secret scan | PASS — configured backend secret values absent |
| Live Google sign-in/device auth | BLOCKED — application database schema absent; no auth-capable native APK installed |

Regression coverage includes provider cancellation/missing tokens, secure storage failures, single-use refresh serialization, access expiry, offline restoration/logout, late login/logout races, malformed responses, guest/forged/expired/revoked access, suspended/deactivated accounts, refresh-family revocation, and rejection of client-supplied identity arguments. All 37 existing playback/store regressions still pass.

Local evidence: `/tmp/aadat-auth-phase1a-aao49h6n/verification-summary.json`, `typecheck.log`, `tests.log`, `metro-export.log`, `phase1a.hbc`, `phase1a-hermes.dump`, `native-autolinking.json`, and resolved Expo configurations. These artifacts contain no intentionally printed backend credential values.

## Changed files

Mobile feature files (new):

```text
apps/mobile/app/login.tsx
apps/mobile/app/profile.tsx
apps/mobile/src/auth/auth.module.ts
apps/mobile/src/auth/contracts/auth.contract.ts
apps/mobile/src/auth/controllers/auth.controller.ts
apps/mobile/src/auth/services/auth-config.ts
apps/mobile/src/auth/services/auth.service.ts
apps/mobile/src/auth/adapters/native-google-auth.provider.ts
apps/mobile/src/auth/repositories/graphql-auth.repository.ts
apps/mobile/src/auth/repositories/secure-session.repository.ts
apps/mobile/src/auth/components/auth.screen.tsx
apps/mobile/src/auth/components/auth-loading.screen.tsx
apps/mobile/src/auth/components/auth-session-lifecycle.tsx
apps/mobile/src/auth/components/google-signin.button.tsx
apps/mobile/src/auth/__tests__/auth-service.test.ts
apps/mobile/src/auth/__tests__/graphql-auth.test.ts
apps/mobile/src/auth/__tests__/native-adapters.test.ts
```

Mobile/workspace configuration and navigation:

```text
apps/mobile/app/_layout.tsx
apps/mobile/package.json
apps/mobile/.env.example
apps/mobile/.env.local                 (local public configuration only)
app.json
apps/mobile/app.json
pnpm-lock.yaml
```

The mobile manifest adds Google Sign-In, Expo SecureStore and an explicit React DOM 18.3.1 dependency to preserve the canonical React 18 Metro resolution. React, React DOM and React Native resolve to 18.3.1, 18.3.1 and 0.76.6 respectively; Expo remains SDK 52.

Backend/contracts:

```text
server/src/index.ts
server/src/infrastructure/config/server-environment.config.ts
server/src/modules/auth/auth.module.ts
server/src/modules/auth/adapters/google-token-verifier.ts
server/src/modules/auth/contracts/user-repository.contract.ts
server/src/modules/auth/controllers/auth-graphql.controller.ts       (new)
server/src/modules/auth/repositories/prisma-user.repository.ts
server/src/modules/auth/services/auth.service.ts
server/src/modules/auth/services/session.service.ts
server/src/shared/guards/implementations/jwt-auth.guard.ts
server/src/shared/graphql/contracts/graphql-resolver.contract.ts
server/src/shared/graphql/graphql-error-formatter.ts                 (new)
packages/contracts/src/graphql/schema.ts
packages/contracts/src/graphql/schema.graphql
packages/contracts/dist/graphql/schema.*                            (regenerated)
```

Backend tests/fixtures:

```text
server/src/__tests__/fixtures/auth-env.ts                            (new)
server/src/__tests__/application.test.ts
server/src/__tests__/server-integration.test.ts
server/src/modules/auth/__tests__/phase1a-graphql.test.ts             (new)
server/src/modules/auth/__tests__/auth-controller.test.ts
server/src/modules/auth/__tests__/auth-service.test.ts
server/src/modules/auth/__tests__/google-token-verifier.test.ts
server/src/modules/auth/__tests__/session-service.test.ts
server/src/modules/auth/__tests__/gate3c2-security-remediation.test.ts
server/src/modules/media/__tests__/media-storage.test.ts
```

Existing bootstrap tests now supply explicit test-only environment configuration after removal of runtime dummy credential fallbacks. Existing user fixtures now specify the required `ACTIVE` account status; media/playback behavior was not changed. This report is `docs/PHASE_1A_GOOGLE_AUTH.md`.
