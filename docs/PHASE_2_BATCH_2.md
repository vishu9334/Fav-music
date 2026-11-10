# Phase 2 Batch 2 — Warehouse, discovery and sharing

Verified 6 November 2026. **PASS: implemented local Batch 2 features and local verification. BLOCKED: automatic InstaMus recognition, cloud persistence and native/device acceptance.** Batch 3 has not started.

## Scope and completed behavior

The pre-implementation audit is in [PHASE_2_BATCH_2_AUDIT.md](PHASE_2_BATCH_2_AUDIT.md). Batch 1 playback, navigation, search, local collections and persistence were reused. The user confirmed Hybrid Warehouse means local collections with future cloud sync; local audio-file import was excluded.

| Feature | Result | Actual behavior |
| --- | --- | --- |
| Hybrid local Warehouse | PASS | Combines explicit saves, Likes, Favourites and Bookmarks without duplicate tracks. Each song shows its collection sources. Cloud sync is visibly on hold. |
| Remove, hide and restore songs | PASS | Active, Removed and Hidden views persist the shared ACTIVE/ARCHIVED/HIDDEN state vocabulary. Removal retains a personal Warehouse entry for restore. Likes, other collections, playlists and the current playback queue stay intact. Catalog tracks are never deleted. |
| Smart playlist naming | PASS | Editable, deterministic suggestions use existing artist/album metadata, with case-insensitive collision suffixes and a 60-character limit. Empty playlists receive generic suggestions. Added durable rename support. No AI or automatic renaming. |
| InstaMus manual discovery | PASS | Paste and validate an individual HTTPS Instagram reel URL; strip tracking; save up to 100 reel links/notes; search the existing demo catalog; explicitly link and bookmark a recognized demo track. Notes persist locally and can be removed. Removing a note preserves its song bookmark. |
| Automatic InstaMus recognition | BLOCKED | Existing backend modules only wire dependencies. No recognition, scraping, audio extraction, confidence result or production match is claimed. The screen clearly explains manual discovery. |
| Track/playlist/reel sharing | PASS locally | React Native Share opens on user request. Shares contain custom app links and demo labels. Playlist links contain a name and ordered catalog IDs; they omit private playlist IDs, stream URLs and credentials. Duplicate requests share one pending native operation; dismissed share sheets are normal results. Actual Android sheet dispatch is pending device acceptance. |
| Custom-scheme deep links | PASS locally | Existing `aadatmusic` scheme opens `/shared` review or prefilled `/instamus` routes through Expo Router. Shared content is bounded/versioned and validated. Nothing plays, saves or imports automatically. Explicit playlist import creates a local copy atomically; unavailable IDs are disclosed and excluded from that copy. Unknown/malformed payloads show an error. Cold/warm device dispatch is pending. |

All playable content remains the existing three-track demo catalog. Warehouse stores shortcuts and metadata; audio still requires internet. Shared links require Aadat Music with these routes installed.

## Architecture, storage and performance

- Extended the existing `LibraryService`, repository contract and Zustand store. Reused the alternating-file repository; no second persistence mechanism was introduced.
- Batch 1 v1 local documents load with safe defaults. The in-memory document is v2, persisted only after an explicit successful edit. The existing file envelope and two slot filenames stay unchanged. Older Batch 1 code rejects the new data version, preventing silent loss of new metadata after a downgrade. Reverting an APK does not reverse the document version.
- All library mutations remain serialized and publish only after a successful save. Failed archive, rename, import and note writes preserve the previous visible state and expose errors. Playlist import captures the ID list before waiting for hydration.
- Pure Warehouse selectors combine memberships in linear time. Discovery history uses a bounded FlatList window and has a 100-note limit. No new native dependency, permission, download path, background job or progress polling was added.
- Reel validation uses a narrow HTTPS Instagram URL grammar. The installed React Native 0.76 URL implementation has unimplemented protocol/hostname accessors; the new feature does not depend on those accessors or add a polyfill.
- Existing player store, audio/background service implementation, native entry and singleton Metro configuration are unchanged. Warehouse removal changes personal collection state; current playback continues until a playback action is requested.

## PASS/FAIL evidence

| Verification | Result | Evidence |
| --- | --- | --- |
| Strict workspace TypeScript | PASS | `pnpm run typecheck`: config, contracts, mobile and server all passed. |
| Relevant regressions | PASS | Final full-suite run includes 100 relevant passing tests: catalog 5, library 26, sharing/reel validation 27, player store 16, playback service 26. |
| Complete regression suite | PASS | `TEST_LIVE_CONNECTIVITY=false pnpm test`: **339 passed, 3 skipped**, 25 files passed. Socket access was enabled for existing localhost lifecycle tests. Live-connectivity tests stayed disabled. |
| Compatibility and recovery | PASS | Tests cover legacy v1 hydration, v2 edits, persisted removal/restore, failed-save behavior, metadata sanitization, independent collections, atomic playlist copy/rename and captured request IDs. Existing interrupted-write recovery regressions still pass. |
| Discovery and link safety | PASS | Tests cover normalization/tracking removal, deceptive hosts/userinfo, unsupported schemes/paths, oversized/control-character input, invalid payload versions/catalogs, unavailable IDs, duplicate IDs, manual-only bookmarking and share failure/retry/coalescing. Parsing does not call a native share gateway. |
| Production Android Metro | PASS | `expo export:embed --eager --reset-cache --platform android --dev false`: **2,841 modules**, 25 copied assets. Environment loading disabled with `EXPO_NO_DOTENV=1`. |
| Hermes/runtime structure | PASS | Production bundle compiles. Exactly **2** `Function<registerComponent>` declarations; canonical execution tail remains `__r(167); __r(0);`. A verification script's initial trailing-newline assumption was corrected; the entry sequence itself was unchanged. |
| Preservation | PASS | SHA-256 comparison of **269 protected files** found zero changes, including backend files, Android/native files, icons/configs, Metro, entry point, original demos and player store/playback services. |
| Bundle environment check | PASS | Literal comparison against 14 configured secret values found no matches. New screens are bundled; authentication startup and Google sign-in configuration remain absent. |
| Native Android acceptance | PENDING | No APK or EAS build was created or installed. New layout/keyboard behavior, persisted data after process restart, native share sheet, custom links while cold/warm, and continued background playback require device tests later. |

Evidence directory: `/tmp/aadat-phase2-batch2-jNzhaB`. Includes `typecheck.log`, `tests.log`, `focused-initial.log`, `metro.log`, `hermes.log`, protected-file snapshots, `bundle-checks.json`, production bundle, bytecode/disassembly and assets. Temporary files may be removed by the OS. The initial focused run passed 99 tests; the final suite includes one additional request-capture/version regression, for 100 relevant tests.

Production bundle SHA-256: `fa1316df64a2382a7bf07837b679ad360ed712c54bbad7b5754c1254efd115b0`.

Hermes SHA-256: `d8010d6a015647fa5b769fe7984b79893e66431e02beb6a6a7971ba140c998d1`.

## Changed files

Paths are relative to the repository root; `(new)` identifies added files.

```text
apps/mobile/app/_layout.tsx
apps/mobile/app/(tabs)/warehouse.tsx
apps/mobile/app/instamus.tsx                                      (new)
apps/mobile/app/shared.tsx                                        (new)
apps/mobile/src/screens/WarehouseScreen.tsx                       (new)
apps/mobile/src/screens/InstaMusScreen.tsx                        (new)
apps/mobile/src/screens/SharedContentScreen.tsx                   (new)
apps/mobile/src/screens/PlaylistScreen.tsx
apps/mobile/src/screens/CollectionScreen.tsx
apps/mobile/src/components/app/ShareButton.tsx                    (new)
apps/mobile/src/components/catalog/SongList.tsx
apps/mobile/src/components/library/LibrarySheets.tsx
apps/mobile/src/library/library.contract.ts
apps/mobile/src/library/library.service.ts
apps/mobile/src/library/warehouse.ts                              (new)
apps/mobile/src/library/playlist-naming.service.ts                (new)
apps/mobile/src/store/useLibraryStore.ts
apps/mobile/src/discovery/instagram-link.ts                       (new)
apps/mobile/src/sharing/share-link.service.ts                     (new)
apps/mobile/src/sharing/sharing.ts                                (new)
apps/mobile/src/library/__tests__/local-library.test.ts
apps/mobile/src/library/__tests__/batch2-library.test.ts           (new)
apps/mobile/src/sharing/__tests__/share-links.test.ts              (new)
docs/PHASE_2_BATCH_2_AUDIT.md                                      (new)
docs/PHASE_2_BATCH_2.md                                            (new)
```

Generated Expo Router types in `apps/mobile/.expo/types/router.d.ts` were refreshed for the two new routes. No package manifest or lockfile changes were needed.

## Remaining blockers and next review

1. Automatic reel recognition needs an implemented authorized backend ingestion/matching flow, an authorized catalog and usable authenticated persistence. Those services are not available in the current source/runtime. Manual notes and explicitly chosen demo tracks are the implemented path.
2. Cloud Warehouse/user-data synchronization remains blocked by the authentication and Neon write HOLD. Local data is not represented as synchronized. No live schema or data writes were performed.
3. Direct reception from Instagram's Android Share menu (`ACTION_SEND`) is not implemented. Paste links or use Aadat custom discovery links. Native share-intent integration requires separate implementation and a native runtime containing it.
4. Verified HTTPS App Links require an owned domain and hosted Android association files. No domain was configured; this batch implements the existing custom scheme only.
5. Physical Android acceptance remains for the final approved testing phase. Existing manual seek verification predates this batch; playback regression tests passed here, and playback source stayed unchanged.

No Git commands, backend changes, database connections/writes/migrations, EAS/native builds, icon changes, unauthorized music downloads or AI functionality were introduced. **Stopped after Batch 2 for review; Batch 3 requires the user's approval.**
