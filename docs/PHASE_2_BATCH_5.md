# Phase 2 Batch 5 — Catalog and streaming architecture

6 November 2026. **Local implementation and verification: PASS. Live production catalog/streaming readiness: BLOCKED.** This batch stops at local source changes and verification. It does not establish that licensed music is present or that a production stream plays on Android.

## Implemented locally

- Replaced placeholder catalog resolvers with class-based Controller → Service → Repository contracts and Prisma reads. Added `catalogPage`, `catalogMedia`, and functional existing `track`/`searchCatalog` queries. Reused existing S3 GET signing; no content upload, deployment or storage mutation.
- Catalog metadata includes stable UUID, song title, existing artist/album names, duration, nullable verified release year, public attribution, video availability and manually curated discovery tags. Thumbnail URLs are obtained separately from trusted artwork keys. No invented artist/album records, years, tracks or streaming addresses were populated.
- Only PUBLISHED records explicitly marked for public streaming, with private rights evidence, public attribution, valid verification dates and an unexpired licence can be discovered or signed. Private evidence and storage keys are absent from public metadata. The existing authenticated media repository now enforces this gate too, and its stream TTL cannot exceed the remaining licence lifetime.
- Search combines title/artist/album terms and strict mood, season, decade or Undated filters. Pagination uses stable ascending UUID keysets and filter-scoped opaque cursors. Pages default to 20 and are capped at 50; media batches are capped at 50 with four concurrent signing operations; a GraphQL request budget limits alias work.
- Public catalog access requires an HTTPS GraphQL endpoint. Mobile sends no session/Google credentials, follows no redirects and uses a bounded timeout. Responses are checked for identities, metadata, secure URLs, lease kind and expiry. Query values use GraphQL variables.
- S3 media leases last at most 300 seconds and are shortened at licence expiry. Mobile leases stay in memory, expire 30 seconds early, coalesce identical requests and renew before Play or on one automatic 403/410/signature-expiry recovery. Recovery preserves queue order, selection and seek. A newer Pause or video intent prevents obsolete automatic playback. Errors redact media URLs.
- Video obtains leases by real catalog ID through the existing native video adapter. A native error forces fresh authorization on retry. Existing shared audio/video ownership, glass controls, seek, fullscreen and sample carousel are retained. Thumbnail failures have a bounded refresh and a placeholder; signed URL query strings are never resized or rewritten.
- Existing Home, Search, categories, discovery, playlists, Warehouse, likes/favourites/bookmarks, deep links and player reuse the shared metadata registry. Loaded real metadata participates in existing rule-based recommendations and history. Automatic discovery excludes real sources after a failed catalog request and keeps demo fallback. No AI/provider integration was added.
- Saved UUID references survive missing metadata, API outages and cache eviction. Unresolved collection references remain saved and are reported honestly; unavailable playlist references can be removed. Shared links contain names/IDs, never signed URLs or private local playlist IDs. Existing demo links remain compatible.
- Public metadata uses a separate two-slot local journal, limited to 500 songs. Partial/corrupt writes preserve the last valid revision; unreadable journals are not overwritten. Cache entries contain neither URLs nor private licence fields. Page caches are bounded to 20 with a 60-second TTL; concurrent searches are bounded to four, results ignore obsolete requests, and returning to an evicted cached page restores its metadata. The UI keeps at most 500 recent result IDs and virtualized rows.
- Both backend and mobile production-catalog flags default off. Example configuration documents them; actual environment files were not changed.

## Demo and offline boundary

The three existing SoundHelix demo songs and their URLs are unchanged. They are internet streams, not bundled offline music. Backend outages do not remove them, and they are always labelled DEMO.

Two clearly labelled **original technical tone samples**, extracted without re-encoding from the already approved local Batch 4 test clips, now provide actual bundled offline audio. They are not presented as licensed production songs or recommended music. The new Offline test audio route uses the existing player and collections. AAC mono 44.1 kHz, durations 6 and 8 seconds; full FFmpeg decoding succeeded. Both exported Android assets exactly match their source SHA-256 hashes. No music was downloaded.

The offline adapter resolves existing assets through React Native and converts Android release raw-resource names to `android.resource://com.favmusic/raw/<resolved-name>` URIs. Metro and file URIs remain intact. This conversion is regression-tested; playback in a new installed APK remains pending.

## Database and configuration HOLD

`server/prisma/schema.prisma` contains an **UNAPPLIED local proposal**: seven Track fields (`releaseYear`, `moodTags`, `licenseReference`, `licenseAttribution`, `licenseVerifiedAt`, `licenseExpiresAt`, `publicStreamingAllowed`) and one composite index on publication/public-streaming flag/ID. The local generated Prisma client was regenerated to typecheck these fields. No migration SQL, migration history entry, schema push, baseline or live database read/write was executed. Existing migration artifacts match their pre-batch hashes.

Server `CATALOG_ENABLED` and mobile `EXPO_PUBLIC_CATALOG_ENABLED` remain false unless explicitly set to `true`. Root/mobile environment inspection found no enabled catalog flag and did find an HTTPS endpoint configuration; its current reachability and identity were **not** verified this batch. S3 region/bucket configuration exists, but runtime IAM/default-provider credentials and actual object read access were not verified. Presence of configuration is not connectivity evidence.

Google authentication and Neon migrations remain on HOLD. Catalog endpoints cover explicitly public licensed content; this batch adds no fake identity, user sync or private/subscription entitlements.

## Verification evidence

All commands ran from the repository root. Tests use injected/mock database and storage dependencies. The three opt-in live-connectivity tests were deliberately disabled.

| Check | Result | Evidence |
| --- | --- | --- |
| Shared contracts build | PASS | `pnpm --filter @aadat/contracts build` |
| Prisma generation and schema validation | PASS, local only | `pnpm --filter @aadat/server exec prisma generate`; `pnpm --filter @aadat/server exec prisma validate` |
| TypeScript | PASS | `pnpm run typecheck`, all four workspaces |
| Full regression suite | PASS | `TEST_LIVE_CONNECTIVITY=false pnpm test`: **482 passed, 3 skipped**, 35 files passed / one live-only file skipped |
| Production Android Metro export | PASS | export:embed, eager, reset-cache, dev false; **2,895 modules, 31 assets**, exit 0 |
| Hermes | PASS | emit-binary and bytecode disassembly exit 0; ordinary RN/Reanimated compiler warnings remain |
| Canonical runtime entry | PASS, static bundle evidence | Tail `__r(167); __r(0);`; one `registerComponent` function definition, two symbol references (closure + definition) |
| Offline media | PASS, media/export evidence | Both source clips decode; exact source/export asset hashes match; Android raw-URI mapping unit-tested |
| Protected files | PASS | **52 files unchanged**: icons, app/native config, entry/Metro files, actual envs, original video assets and existing migration artifacts |
| Sensitive literals in bundle | PASS, limited check | 7 unique configured sensitive literals checked; 0 matches; no values printed |
| Actual licensed S3/API/Android streaming | **BLOCKED / not tested** | No verified licensed content/objects; no enabled production API/schema; no new APK |

New/extended regressions cover licence denial/publication, scoped cursors, malformed metadata/leases, media request limits, legacy media authorization and licence expiry, GraphQL transport, cache privacy/recovery/eviction, request races, persistent UUID collections/sharing, catalogue Stop → Play/Next/Previous/Seek, URL renewal/seek preservation, bounded retries, late Pause/video cancellation, video authorization/retry, and Android offline URI conversion. Prior Batches 1–4 and auth/backend unit suites also pass. Fixtures use reserved `example.test` hosts only inside tests and are never seeded or exposed as production catalog content.

Production export command used `pnpm exec expo export:embed --eager --reset-cache --platform android --dev false`, with bundle/assets written outside the repo. Dotenv loading was disabled and CI/eager override variables removed for this verification. This is a JavaScript export, not an EAS or native APK build.

Temporary evidence directory: `/tmp/aadat-phase2-batch5-ghvDQG`. It contains Metro/Hermes logs, the bundle/bytecode, protected-file hashes, offline-media inspection and integrity JSON. Full TypeScript/test/Prisma logs are `/tmp/aadat-phase2-batch5-*.log`.

Final bundle SHA-256: `70c771c34718e302973c9a1759b9408ddfb53ad669b0f327a5121a1a906246dd`. Hermes SHA-256: `694db246153dacb5d685206205f9e0f61e94372b9b81496c07dd98dcbd9595d0`.

## Remaining blockers and approval boundaries

1. **Licensed catalog content:** provide rights-cleared songs/video, genuine artist/album/year metadata, public attribution and private evidence, plus authorized media objects. No content was invented, fetched or imported. Any import is a separate authorized data/storage write.
2. **Database approval:** review an appropriate Track/enums/relations migration and Prisma history strategy before any migration or data import. The previous empty-public-schema/auth-only readiness work does not make the seven-field Track proposal executable against production. Existing auth migration artifacts were not rewritten; the catalog schema must be reconciled with that HOLD separately.
3. **Verified backend/media configuration:** establish a verified device-reachable HTTPS GraphQL endpoint and valid least-privilege S3 credentials/object access. Review intended `GetObject`, range requests, real MIME/codec support and object existence with authorized content before enabling either catalog flag. No infrastructure/IAM/bucket/CDN change has been made or authorized here.
4. **Physical Android validation:** a compatible native runtime and explicitly approved build, if needed, are required before claiming actual catalog audio/video playback, expiry recovery, range/seek, background continuity or offline sample playback on device. Existing Batch 4 native module and remote HTTPS verification blockers remain. Earlier user-confirmed working audio seek is historical evidence, not validation of these new paths.
5. **Scale and lease limits:** search uses case-insensitive substring matching with bounded keyset pages; no live query-plan/load benchmark was run. Existing title/artist B-tree indexes do not solve large-scale substring search; any trigram/index addition requires later schema review/approval. Signed URLs are bearer capabilities and cannot promise immediate revocation or termination of an already-open stream; credentials may expire earlier than the nominal TTL. Native retry can obtain a fresh authorized lease, but actual network/codec/device behavior remains unverified.
6. **Batch 6:** authentication, profiles and cloud-persistent user data remain on HOLD; nothing advances to Batch 6 automatically.

No Git commands, EAS/native builds, live SQL, Neon snapshots/branches/computes, database writes, migrations, infrastructure deployment or cloud-storage changes were performed. Icons and existing UI structure are preserved. No approval for any such future action is inferred from this local implementation.

## Changed files

Source/configuration/test/documentation inventory for this batch:

```text
.env.example
apps/mobile/.env.example
apps/mobile/app/_layout.tsx
apps/mobile/app/offline.tsx
apps/mobile/assets/audio/colour-tone.m4a
apps/mobile/assets/audio/motion-tone.m4a
apps/mobile/src/catalog/__tests__/catalog-streaming.test.ts
apps/mobile/src/catalog/catalog-api.ts
apps/mobile/src/catalog/catalog-cache.ts
apps/mobile/src/catalog/catalog-client.service.ts
apps/mobile/src/catalog/catalog-query.ts
apps/mobile/src/catalog/catalog-runtime.ts
apps/mobile/src/catalog/demo-catalog.ts
apps/mobile/src/catalog/graphql-catalog.repository.ts
apps/mobile/src/catalog/media-lease.service.ts
apps/mobile/src/catalog/native-audio-asset.ts
apps/mobile/src/catalog/offline-samples.ts
apps/mobile/src/components/app/AppLifecycle.tsx
apps/mobile/src/components/app/AppTabBar.tsx
apps/mobile/src/components/carousel/ArtworkCarousel.tsx
apps/mobile/src/components/catalog/CatalogNotice.tsx
apps/mobile/src/components/catalog/SongList.tsx
apps/mobile/src/components/discovery/DiscoverySummary.tsx
apps/mobile/src/components/discovery/GlobalDiscoveryBar.tsx
apps/mobile/src/components/library/LibrarySheets.tsx
apps/mobile/src/data/sample-tracks.ts
apps/mobile/src/discovery/recommendation.service.ts
apps/mobile/src/library/library.service.ts
apps/mobile/src/screens/CollectionScreen.tsx
apps/mobile/src/screens/DiscoveryScreen.tsx
apps/mobile/src/screens/HomeScreen.tsx
apps/mobile/src/screens/InstaMusScreen.tsx
apps/mobile/src/screens/LibraryScreen.tsx
apps/mobile/src/screens/OfflineAudioScreen.tsx
apps/mobile/src/screens/PlayerScreen.tsx
apps/mobile/src/screens/PlaylistScreen.tsx
apps/mobile/src/screens/SearchScreen.tsx
apps/mobile/src/screens/SharedContentScreen.tsx
apps/mobile/src/screens/VideoScreen.tsx
apps/mobile/src/screens/WarehouseScreen.tsx
apps/mobile/src/services/playback/AudioPlaybackService.ts
apps/mobile/src/services/playback/MediaPlaybackCoordinator.ts
apps/mobile/src/services/playback/__tests__/AudioPlaybackService.test.ts
apps/mobile/src/sharing/share-link.service.ts
apps/mobile/src/store/__tests__/catalog-store.test.ts
apps/mobile/src/store/__tests__/discovery-store.test.ts
apps/mobile/src/store/__tests__/usePlayerStore.test.ts
apps/mobile/src/store/createDiscoveryStore.ts
apps/mobile/src/store/useCatalogStore.ts
apps/mobile/src/store/useDiscoveryStore.ts
apps/mobile/src/store/usePlayerStore.ts
apps/mobile/src/video/ExpoVideoEngine.ts
apps/mobile/src/video/NativeVideoSession.tsx
apps/mobile/src/video/VideoPlaybackService.ts
apps/mobile/src/video/VideoPosterCarousel.tsx
apps/mobile/src/video/__tests__/expo-video-engine.test.ts
apps/mobile/src/video/video.contract.ts
docs/PHASE_2_BATCH_5.md
docs/PHASE_2_BATCH_5_AUDIT.md
packages/contracts/src/dtos/catalog-api.dto.ts
packages/contracts/src/dtos/index.ts
packages/contracts/src/graphql/schema.graphql
packages/contracts/src/graphql/schema.ts
server/prisma/schema.prisma
server/src/__tests__/server-integration.test.ts
server/src/index.ts
server/src/modules/catalog/__tests__/catalog.test.ts
server/src/modules/catalog/catalog.module.ts
server/src/modules/catalog/contracts/catalog.contract.ts
server/src/modules/catalog/controllers/catalog-graphql.controller.ts
server/src/modules/catalog/repositories/prisma-catalog.repository.ts
server/src/modules/catalog/services/catalog.service.ts
server/src/modules/media/__tests__/media-storage.test.ts
server/src/modules/media/contracts/track-media-repository.contract.ts
server/src/modules/media/repositories/prisma-track-media.repository.ts
server/src/modules/media/services/media.service.ts
```

Local generated outputs were refreshed under `packages/contracts/dist/**` and `server/src/generated/prisma/**`; these are derived from the contracts/local Prisma proposal, not migration artifacts.

## References

- [AWS S3 presigned URL semantics](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html): bearer capability, credential-dependent expiry and expiry behavior during existing transfers.
- [Android ExoPlayer raw resource handling](https://android.googlesource.com/platform/external/exoplayer/+/59dca420eb07ff86d3e7238cb16b02334c0a2740/tree_410ddf458c4daebcf3f997084891c82f2dbd6805/library/core/src/main/java/com/google/android/exoplayer2/upstream/RawResourceDataSource.java): named Android resource URIs. Installed RN 0.76.6 asset resolution and RNTP native `BundleUtils.kt`/`Track.kt` were also inspected directly.

**Stopped after Batch 5 for review.**
