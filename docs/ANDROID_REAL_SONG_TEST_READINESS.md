# Android real-song test readiness — as-configured preview FAIL

7 November 2026, Asia/Calcutta. **One EAS APK built as currently configured cannot meaningfully test real songs. No build was submitted.** Provider media is accessible and the development HTTPS endpoint works, but the current app flow is correctly blocked by real-account policy and the EAS preview does not receive the required public configuration.

## Actual PASS/FAIL matrix

| Area | Evidence | Result |
| --- | --- | --- |
| Development mobile URL | apps/mobile/.env.local points to https://anyway-pdf-obligation-suggests.trycloudflare.com/graphql; fresh service health query returns 200 | PASS for local development configuration |
| Actual EAS preview settings | Root/mobile preview profiles have no env values; fresh project and account preview env reads return no variables | FAIL for real-song build readiness |
| Actual-preview bundle | Production export with matching empty preview variables contains no working HTTPS URL | Confirms preview configuration blocker |
| Mobile-development bundle | Export with the real mobile development public values contains the working HTTPS URL | PASS for development bundling, not functional access |
| API availability | health ok; authenticationEnabled=false; cloudCollectionsEnabled=false | PASS transport; account services remain held |
| Actual catalog request shape | Sent the same fields/query shape as GraphQLCatalogRepository without credentials or fabricated context; HTTP 401 UNAUTHORIZED | Functional flow BLOCKED; authentication guard works |
| Protected user API | me without credentials returns HTTP 401 UNAUTHORIZED | PASS security boundary |
| Saavn adapter metadata | Fresh real Believer, Levitating and Enemy metadata with durations/years/artists | PASS provider control |
| Selected audio sources | Each exact adapter-returned source returns HTTP 206, audio/mp4, 1,024 bytes, MP4 ftyp header | PASS bounded source access only |
| Real source delivered through current intended mobile flow | No valid real account; client/route/backend guards prevent delivery | **FAIL / NOT VERIFIED**, not replaced by the direct-provider control |
| Proposed diagnostic solution | Explicit new read-only, expiring-key catalog namespace and standalone internal playback variant reviewed below | Prepared design only; NOT IMPLEMENTED/ACTIVATED |
| TypeScript | All four workspaces pass | PASS |
| Full local regression suite | 609 passed, 3 live-database tests skipped | PASS |
| Production Metro, both configurations | 2,932 modules / 29 assets each | PASS |
| Hermes, both configurations | Bytecode compilation, one registerComponent definition each, canonical __r(167); __r(0); tail | PASS |
| Real APK/Android audible output | No build/install/launch in this task | NOT RUN |

[Machine-readable audit](evidence/android-real-song-readiness-current/verification.json), [live API responses](evidence/android-real-song-readiness-current/current-flow.json), [provider and stream controls](evidence/android-real-song-readiness-current/provider-control.json), [test summary](evidence/android-real-song-readiness-current/tests-summary.txt), [TypeScript output](evidence/android-real-song-readiness-current/typecheck.log).

The normal API query used no bearer token, developer key, dummy user ID or mocked authentication. The provider diagnostic did not call a protected user API or replace its authorization policy. These are distinct controls: accessible upstream audio does not prove a successful Aadat application flow.

## Why the app cannot access catalog songs

There are four independent gates:

1. **Preview configuration:** EAS excludes local env files, and its current preview has no matching public variables. The mobile .env.local change alone is not a cloud APK configuration. Server/root environment still preserves its old public URL as explicitly requested; none of those settings were altered here.
2. **Client catalog flag:** catalogEnabled() requires EXPO_PUBLIC_CATALOG_ENABLED=true; it is absent/false in the current development and preview settings.
3. **UI and transport account guards:** normal tabs, player and provider-browse routes use withAccountScreen; authenticatedCatalogTransport first requires an approved enabled AuthConfig credential endpoint, then a genuinely authenticated user/session. Auth enablement and the exact verified-auth marker are absent/false. HTTPS health success does not satisfy account/session policy.
4. **Backend authorization:** CatalogModule creates CatalogGraphQLController with authenticatedOnly=true. Its budget method rejects missing context.userId before catalog/provider execution. Live catalogPage and me both return 401. The preceding approved preflight found no application User table/history; migrations/account/session writes remain held.

Turning on the catalog flag alone cannot fix this. Turning off server authentication, inventing a user context/JWT, or opening all account-gated routes would violate the requested security boundary and was not done.

Source references: [catalog runtime](../apps/mobile/src/catalog/catalog-runtime.ts), [catalog request transport](../apps/mobile/src/catalog/graphql-catalog.repository.ts), [account route guards](../apps/mobile/src/auth/components/account-access.tsx), [AuthConfig](../apps/mobile/src/auth/services/auth-config.ts), [backend catalog composition](../server/src/modules/catalog/catalog.module.ts), [backend controller authorization](../server/src/modules/catalog/controllers/catalog-graphql.controller.ts).

## Fresh real-song control results

| Track | Native ID | Real metadata | Exact returned source |
| --- | --- | --- | --- |
| Believer — Imagine Dragons | BeXBcbVK | 204 seconds, year 2018 | HTTP 206; 1,024 bytes; audio/mp4 |
| Levitating — Dua Lipa | 3IoDK8qI | 203 seconds, year 2020 | HTTP 206; 1,024 bytes; audio/mp4 |
| Enemy (from the series Arcane League of Legends) — Jid, Imagine Dragons, Arcane, League of Legends | drvhW8ob | 173 seconds, year 2021 | HTTP 206; 1,024 bytes; audio/mp4 |

Direct provider checks used the existing JioSaavnMusicProviderService, supported exact ID lookups and the exact HTTPS URL it returned; no hostname/suffix/quality manipulation, redirect following or restriction bypass. Each request used Range bytes=0-1023, inspected and received exactly 1,024 bytes, then cancelled. Total inspected: 3,072 bytes; no audio files saved. Public evidence contains URL SHA-256 fingerprints instead of opaque source URLs.

These responses prove container/body accessibility, not full-track integrity, Android decoding, audible output or a successful protected mobile flow. No copyrighted media was bulk downloaded/copied or uploaded to S3. This remains the approved development provider, not licensed production distribution.

## Secure development-only solution prepared for approval

[Exact implementation/activation scope](real-song-preview-candidate/DEVELOPMENT_PLAYBACK_SCOPE.md) and [inactive draft internal preview profile](real-song-preview-candidate/preview-profile.json).

The proposed design adds a **separate read-only diagnostic catalog endpoint** using the same existing provider/catalog services and a short-lived private developer access key. That key authorizes only diagnostic reads; it is never treated as an application account, role, user ID or session. No account/user/collection resolvers or mutation schema are exposed there. Main /graphql and protected personal APIs remain unchanged.

A clearly labeled standalone internal playback-check variant would use this scoped endpoint and existing secure transport/catalog/lease/TrackPlayer/Kobra components. It would not mount normal account/collection lifecycles, open guest journals or offer personal collection buttons. The developer key would be entered explicitly and kept in memory, never baked into EXPO_PUBLIC/EAS/URLs/logs. Production activation must fail closed; ordinary preview/production entry and guards remain unchanged. Existing canonical IDs, icons and native registration are preserved.

This can make a **future separately approved internal APK** meaningful for real Search/queue/audio/background/control tests without account writes. It cannot certify Google login, personal Playlists/Warehouse/favourites/history or cloud sync; those still require real approved accounts. The design is not implemented and has no live-flow PASS yet. Exposing its new authorization surface and activating the new app variant require approval before source/policy/runtime changes.

The inactive profile intentionally leaves the normal catalog/auth/cloud flags false, while proposing separate explicit diagnostic mode/endpoint variables. Those new variables and the development route do not exist in runtime today; the draft must not be copied or treated as a working configuration before implementation and verification.

## Verification scope and preservation

Both production export variants used dotenv disabled and explicit public environment selection, reset Metro cache with CI unset, and compiled successfully with Hermes. Actual-preview bytecode is 5,670,303 bytes; mobile-development bytecode is 5,670,430 bytes. Neither bundle contains a SoundHelix demo-stream string. SDK/native dependency, signing, decoder and hardware behavior are not certified by bytecode success.

No app/backend source, guard, production environment, mobile config, EAS config, icon, entry point, Metro, lockfile or Prisma schema changed during this audit. Read-only EAS environment calls and live HTTP/provider diagnostics were performed. HTTP checks generated only the existing approved local Redis rate-limit counters; no PostgreSQL SQL, account/session data, migration, new cloud resource, S3 action or EAS job was used.

Changed repository files are this report, docs/evidence/android-real-song-readiness-current/, the two draft files in docs/real-song-preview-candidate/, and a current-status link in the prior build-readiness report. Full logs/bundles and private EAS read output remain under /tmp/aadat-real-song-readiness/; sensitive output is not published.

**Decision:** keep the EAS build unspent. Request approval for the explicit separate read-only development diagnostic implementation/conditional local activation; rerun real scoped-flow checks and regression/Metro/Hermes after implementation, then request any APK build separately. No migration, fake login or protected user API bypass is needed or approved for that diagnostic approach.
