# Phase 2 Batch 1 — local implementation and verification

Verified 6 November 2026. **PASS for local implementation, TypeScript, regression tests and production Android Metro/Hermes verification. Physical-device acceptance of these new screens is pending.** Stopped after Batch 1 for review; no EAS or native build was run.

## Completed behavior

- Four lazy-loaded tabs: Home, Search, Library and Music Warehouse. A persistent mini-player opens the full player; collection and playlist screens support back navigation.
- Player reuses the existing native Kobra controls and artwork carousel. Added queue context, track actions, visible Up next, playback-error retry and a scrollable layout. The seek target now supports accessibility adjustments and a 44-point touch area.
- Search matches title, artist and album in the existing three-track SoundHelix demo catalog. Decade and seasonal filters combine with search. No regional/language categories or AI features were added.
- Decade categories cover the 1960s–2020s plus Undated. Existing demos have no verified release years: dated categories show empty states and Undated holds all three. Seasonal tags are clearly described as demo mood curation.
- Likes, Favourites, Bookmarks and Warehouse are independent saved collections. Warehouse saves shortcuts; streamed audio still requires internet.
- Create local playlists, add/remove tracks, play tracks in playlist order and delete playlists. Membership is deduplicated. Local names are limited to 60 characters and playlists to 100.
- App-private persistence stores catalog IDs and library metadata in two alternating revisioned JSON files. Hydration and edits are serialized. A failed save does not publish a successful UI state; partial-write recovery retains the last valid snapshot. Unreadable or unsupported files are preserved and edits fail safely with a retryable message.
- Collection queue selection is serialized in the existing Zustand player store. Re-selecting the same track preserves seek position. The existing AudioPlaybackService remains the authority for native state, background commands and empty-queue recovery.
- Authentication startup is disconnected; login/profile routes display a hold screen without invoking authentication. Existing auth implementation remains available in source for a later phase.

## Reuse and Android performance

Playback service implementation, remote notification commands, native registration and demo stream URLs are byte-for-byte unchanged. Progress updates subscribe inside the timeline; artwork, song lists and the mini-player do not subscribe to position updates. Lists use bounded render windows; search is memoized/deferred; thumbnails request smaller existing artwork URLs. Existing reduced-motion support is retained. Device frame rate, memory use and visual layout have not been measured for these new screens.

`expo-file-system ~18.0.12` is now an explicit mobile dependency using the already installed SDK-52-compatible package; the lockfile importer matches. No new native package was installed or built.

## Verification evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Workspace TypeScript | PASS | `pnpm run typecheck`; config, contracts, mobile and server all passed. |
| Focused regressions | PASS | 60/60: catalog 5, library/persistence 13, player store 16, playback service 26. |
| Complete suite | PASS | `TEST_LIVE_CONNECTIVITY=false pnpm test`: 299 passed, 3 intentionally skipped live-connectivity tests; 23 test files passed. Initial restricted run hit `listen EPERM` in two existing localhost listener tests; rerun with socket access passed. |
| Production Metro | PASS | Root Expo `export:embed --eager --reset-cache --platform android --dev false`; 2,830 modules and 25 assets. `EXPO_NO_DOTENV=1` prevented unnecessary environment loading. |
| Hermes compilation | PASS | Production bundle compiled to bytecode; exactly 2 `Function<registerComponent>` declarations, matching the existing singleton invariant. Standard dependency/global warnings did not prevent compilation. |
| Native entry | PASS | One `registerRootComponent(App)` call; bundle executes `__r(167); __r(0);`. Native registration source and Metro configuration are unchanged. |
| Bundle content | PASS | All six new screens and local repository present; `AuthSessionLifecycle` and Google sign-in configuration absent. Literal comparisons against 14 configured secrets found no matches. |
| Preservation | PASS | SHA-256 comparison of 228 protected files found zero changes: backend source/schema/config, app configs/icons, Metro configs, native entry, sample tracks and playback service files. |
| Native dependency configuration | PASS | Existing RN config resolves 22 dependency roots, including TrackPlayer and Expo file system. This is configuration inspection, not verification of a newly installed APK. |
| Physical Android acceptance | PENDING | No new APK installed; new-screen rendering, storage across device restart, notification/background listening and low-end performance still require device acceptance. Prior manual device verification confirmed seek working; this batch's seek evidence is automated regression verification. |

Evidence directory: `/var/folders/kn/51qtp42s3djbbb7hflzc630m0000gn/T/aadat-phase2-batch1-WGIuYu` (local temporary artifacts; may be cleaned by the OS). It contains `typecheck.log`, `tests.log`, `focused-tests.log`, `metro.log`, `protected-before.json`, `protected-after.json`, `bundle-checks.json`, the production bundle, Hermes bytecode/disassembly and copied assets.

Bundle SHA-256: `93064fd20f092926f69112c796b48b717c8f592ef3722217aabf4b33367194a4`.

Hermes SHA-256: `2e5f3e1f2a6002a1462f93f36c0a65c7c4075d5193bff23830c2e24bd614b81b`.

## Changed files

All paths below are relative to the repository root.

Routing:

```text
apps/mobile/app/_layout.tsx
apps/mobile/app/index.tsx                         removed; Home is now (tabs)/index
apps/mobile/app/(tabs)/_layout.tsx                 new
apps/mobile/app/(tabs)/index.tsx                   new
apps/mobile/app/(tabs)/search.tsx                  new
apps/mobile/app/(tabs)/library.tsx                 new
apps/mobile/app/(tabs)/warehouse.tsx               new
apps/mobile/app/player.tsx                        new
apps/mobile/app/collection.tsx                    new
apps/mobile/app/playlist.tsx                      new
apps/mobile/app/login.tsx
apps/mobile/app/profile.tsx
```

Screens and reusable components:

```text
apps/mobile/src/screens/HomeScreen.tsx            new
apps/mobile/src/screens/SearchScreen.tsx          new
apps/mobile/src/screens/LibraryScreen.tsx         new
apps/mobile/src/screens/CollectionScreen.tsx      new
apps/mobile/src/screens/PlaylistScreen.tsx        new
apps/mobile/src/screens/PlayerScreen.tsx          new
apps/mobile/src/components/app/ui.tsx             new
apps/mobile/src/components/app/AppLifecycle.tsx   new
apps/mobile/src/components/app/AppTabBar.tsx      new
apps/mobile/src/components/app/AuthHoldScreen.tsx new
apps/mobile/src/components/catalog/SongList.tsx   new
apps/mobile/src/components/library/LibrarySheets.tsx new
apps/mobile/src/components/player/Scrubber.tsx
```

Catalog, persistence, state and tests:

```text
apps/mobile/src/catalog/demo-catalog.ts           new
apps/mobile/src/library/library.contract.ts       new
apps/mobile/src/library/file-library.repository.ts new
apps/mobile/src/library/library.service.ts        new
apps/mobile/src/store/useLibraryStore.ts          new
apps/mobile/src/store/usePlayerStore.ts
apps/mobile/src/catalog/__tests__/demo-catalog.test.ts new
apps/mobile/src/library/__tests__/local-library.test.ts new
apps/mobile/src/store/__tests__/usePlayerStore.test.ts
apps/mobile/package.json
pnpm-lock.yaml
docs/PHASE_2_BATCH_1_AUDIT.md                      new
docs/PHASE_2_BATCH_1.md                            new
```

Expo's generated `apps/mobile/.expo/types/router.d.ts` was refreshed with its installed route generator to reflect the new routes.

## Remaining work and boundaries

1. Review Batch 1 and perform physical-device acceptance when an appropriate native runtime is authorized. Verify navigation/back behavior, playlist persistence after restart, accessibility/keyboard layouts, streaming errors, seek and background/notification playback on the phone.
2. Obtain verified release-year metadata to populate dated categories; expand beyond the three demos only with an authorized catalog source.
3. Real catalog access, audio downloads, cloud library sync and collaborative room/chat screens remain future work. Local library data stays on this installation and can be removed by clearing app data or uninstalling.
4. Google Authentication and Neon migration/recovery work remain on HOLD. No database connections, database writes, backend changes, Git commands, icon changes or EAS builds were performed for this batch.
