# Proposed development playback verification — approval scope

**Approved and locally implemented on 7 November 2026.** The user approved this exact scope; local activation and verification are complete. See [implementation evidence](../DEVELOPMENT_PLAYBACK_VERIFICATION.md). No EAS build has been submitted. The design below records the reviewed boundaries; references to proposed changes describe the original approval request.

## Purpose and boundary

Allow one separately approved internal APK to test real provider search/streams and existing TrackPlayer controls while the application account database remains on HOLD. This is a diagnostic variant, not Guest Mode, a signed-in account, a replacement authentication system or a production feature claim. Personal playlists, Warehouse, likes/bookmarks/history, profile and cloud synchronization remain behind their existing real-account gates and are outside this diagnostic mode.

Never remove withAccountScreen/AccountOnly from ordinary navigation, set a dummy user ID, generate a test user JWT, change the main CatalogModule's authenticated controller to anonymous, or enable AUTH_ENABLED to simulate readiness.

## A. Separate read-only development API

Approved route: **POST /development/catalog/graphql** on the existing local backend/tunnel. This path is now conditionally registered in the approved development mode. The ordinary /graphql and account/auth APIs remain unchanged and protected.

- Register only after an explicit development-only server flag, NODE_ENV=development, the selected approved Saavn development adapter, and a valid private development access key are all present. Reject activation in production. No missing-key fallback.
- A cryptographically random key authorizes only this diagnostic catalog surface. It is not a Google/access/refresh token, user identity, role or account session. Keep it server-side in memory/private mode-0600 local file, with a maximum two-hour lifetime and constant-time comparison. Do not write an account/session record to PostgreSQL or Redis.
- The new controller checks that key before executing a dedicated query-only schema. Register **no User/account/collection resolvers and no Mutation type**. Do not synthesize userId in GraphQL context or reuse the normal controller with authentication disabled.
- Allow only catalogPage, track, catalogMedia(AUDIO/ARTWORK), catalogProviderInfo and provider-resource/collection reads. Reuse the existing ICatalogService/ProviderCatalogService, MusicProvider adapter, canonical identity mapping, leases, parsing, pagination and error handling.
- Preserve strict input/page/media limits, a bounded request budget, timeouts, normal rate limits, generic/redacted errors and no arbitrary URL-fetch endpoint. Unsupported video and automatic recognition remain unavailable.
- Preserve stable provider-independent IDs. Only existing local catalog identity/metadata cache updates and local expiring rate-limit counters are permitted; no account documents or live database records are read/written.
- Requests without a valid, unexpired diagnostic key fail 401. The same key must not grant access to the ordinary /graphql me, playlists, Warehouse or any mutation. Expiration/revocation stops new catalog requests honestly.

## B. Explicit standalone diagnostic mobile mode

- Add a clearly labeled **Development playback verification** view, reachable only in a dedicated internal variant. It does not open ordinary signed-out Home/Library or impersonate a user.
- Keep canonical synchronous registerRootComponent and headless playback registration order unchanged. Select the diagnostic app only after the existing main registration; no duplicate AppRegistry and no NativeModules polyfills. Do not mount normal account/session/collection lifecycle machinery in this standalone diagnostic variant.
- Reuse GraphQLCatalogRepository through a separate endpoint-scoped transport, CatalogClientService/MediaLeaseService and AudioPlaybackService.configureSourceResolver. The existing secure native HTTPS transport can carry the diagnostic authorization header without an account session. It must reject a wrong host/path or redirect before sending the key.
- Obtain the developer key through explicit tester entry; keep it in memory, redact it and clear it on exit/expiry. Do not place it in EXPO_PUBLIC variables, the APK/EAS profile, URLs, logs, AsyncStorage or account SecureStore records. Process death can require re-entry; do not claim production session restoration.
- Fetch real metadata and fresh source leases through the new API; never embed stream URLs or fabricated catalog entries. Use an isolated metadata cache/queue context without opening guest/account journals or recording personal history.
- Reuse existing Kobra controls, scrubber/progress, queue service, background notification handlers and error/recovery behavior. Preserve icons, normal navigation/UI, user collections and metadata IDs. No new native dependency is proposed.
- Scope actual testing to real Search → song/lease → TrackPlayer, Play/Pause, Next/Previous, Seek, Stop/Play, buffering/error/retry and background/notification behavior. Personal collection testing still needs a real approved account later.

## C. Internal preview configuration and production guard

See [draft profile](preview-profile.json). Proposed new local EAS profile **preview-real-songs**, extending the unchanged preview APK settings, supplies only public mode/endpoint/hold flags. Existing preview/production profiles and remote EAS variables are not changed by this proposal.

The approved variables are implemented locally. The main catalog/auth/cloud flags stay false in this diagnostic profile; the separate explicit development-catalog mode uses its own scoped client. A build-time variant guard must reject this mode for production distribution. Do not rely on __DEV__: an internal preview uses a production Metro/Hermes bundle, so __DEV__ is false there too.

The public diagnostic endpoint has passed fresh host and Android HTTPS verification. Reverify the temporary hostname before any build. No developer access key belongs in this profile.

## D. Proposed local changes after approval

- New backend development-catalog configuration/controller/module and security tests, wired conditionally to the existing catalog service. Normal CatalogGraphQLController/account guards remain intact.
- New mobile diagnostic module/screen, endpoint-scoped transport and tests, reusing existing catalog/playback services/components. Add only the necessary explicit entry-variant selection and production-build guard.
- New internal local EAS profile/dynamic configuration guard, preserving current app package, icons, signing/native dependencies and production defaults.
- Extend the explicit local development launcher for the approved diagnostic server mode, with a private expiring read-only key; preserve server/.env and the ordinary local profile defaults.
- After local security/TypeScript/regression/Metro/Hermes checks pass, restart only the owned local backend in this mode and verify the new read-only path over the existing tunnel. No new tunnel/resource or remote environment edit.

Acceptance conditions before requesting an APK: correct/incorrect/expired keys tested; production activation rejected; user APIs/mutations still denied; no fake account or account writes; real returned tracks/leases pass from the scoped mobile client through the new API; bounded stream bodies are accessible; native queue regression passes; exact preview bundle contains the approved public endpoint, no secret/demo media, one canonical registry. A real Android APK is still needed for audible playback, decoding, seek, focus, notifications and background acceptance.

## Exact approval requested

Approve **implementation and conditional local activation of this development-only read-only diagnostic design**, including local metadata/identity caches and normal local Redis rate-limit counters, the explicit public preview profile and a local backend restart after its checks pass. Do not grant an EAS build, migration/baselining, account/user/session write, guest transfer, S3 action, new cloud resource, remote variable edit or production API/authentication relaxation. No secret is requested in chat.

The readiness audit stopped here because exposing a new catalog authorization surface and making it reachable in a diagnostic variant are security/configuration changes requiring the user's approval. Current app/backend policy was not changed in order to manufacture a successful flow.
