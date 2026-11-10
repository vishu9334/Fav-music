# Aadat Music UI/UX remediation

Follow-up: [Final UI/UX gap remediation](FINAL_UI_UX_GAP_REMEDIATION.md) records native-blur integration, responsive layout repairs, safe account presentation review and original-video entry points, with updated local verification and native acceptance limits.

**7 November 2026 — local implementation/TypeScript/regressions/Metro/Hermes PASS. New native visual acceptance PENDING.**

The user redirected the completed diagnostic-build session to UI/UX remediation and prohibited further EAS builds. Changes are local source only. The APK already installed on CPH2599 remains the earlier read-only diagnostic build; no OTA update, new APK, backend restart or cloud change was performed for this remediation.

## Reference audit

Reviewed the existing Batch 1–4 and Phase 3 reports, all 16 file-based screen routes and their implementations, the standalone diagnostic view, shared controls, sheets, tab navigation and account gates. No separate original Figma file, screen mockup or screen-by-screen visual specification was found in the repository. The concrete existing requirements are the dark/lavender Aadat palette, four tabs, native shared glass controls, carousel, morphing icons, account protection and existing feature set.

Primary references: [Kobra video](https://kobra.systems/components/video), [Kobra carousel](https://kobra.systems/components/carousel), [Kobra morphing icons](https://kobra.systems/components/morphing-icons). The video reference was inspected in a temporary unsigned-in browser, including its hover state. It has separate circular translucent controls, a larger central control, rounded media framing and an overlaid timeline. The reference offers liquid and blurred variants. Native components were adapted to these visual principles; no web player/library or reference media was imported into the app.

The former diagnostic UI was a test form, not the main application's Home/Library UI. It had a tall header that pushed playback and results below the fold. Main screens already had working features, but had uneven card/input treatment, limited feature entry points, fixed-width audio artwork and an immediate play/pause icon swap. Authentication gates were intentional and have not been removed to make the main screens appear available.

## Screen-by-screen results

**Implemented** below means source implementation and local checks pass; it does not mean new Android pixels, touch layout, frame rate or account integration have passed device acceptance.

| Screen/view | Remediation and result | Remaining verification/dependency |
|---|---|---|
| Home | Implemented: glass hero, existing brand palette, responsive category tiles, shared header/Profile shortcut, feature cards for discovery, video, InstaMus, catalog browsing and account | Device visual review; account required |
| Search | Implemented: shared typography/input treatment, keyboard dismissal on list drag, explicit submit/retry flow, existing decade/season filters, pagination and provider-browse entry retained | Main authenticated catalog flow remains held; diagnostic search already worked on the preceding APK |
| Library | Implemented: consistent collection/playlist cards, named accessible playlist entries, feature links and account entry; counts and creation/smart naming behavior retained | Real account/persistence approval needed for device collection acceptance |
| Playlist | Implemented: shared title/list, grouped add/remove/rename/share actions, shared glass naming/action sheets; account-switch guards and deletion confirmation retained | Real account; no collection writes performed |
| Music Warehouse | Implemented: glass collection summary, consistent Active/Removed/Hidden filters and row actions, InstaMus entry, removed misleading Guest copy | Account/cloud hold remains; saved IDs and restore logic unchanged |
| InstaMus | Implemented: compact glass link/search form, persistent field labels, shared result rows and saved-note cards | Automatic recognition still unavailable; manual linking remains explicit and guarded |
| Login | Implemented: shared palette/typography/spacing and glass panel treatment; native branded Google button and controller states retained | OAuth/HTTPS/database prerequisites unchanged; no fake login or Guest Mode |
| Profile | Implemented: same account design, consistent labeled editor/input, account collection panel and sign-out preserved | Real user and approved account persistence required; no profile changes sent |
| Authentication loading/error/hold | Implemented: shared colors, meaningful existing retry/error states, legacy hold copy no longer promises demo/guest access | Services remain genuinely held; no success simulated |
| Audio player | Implemented: responsive bounded artwork carousel with accessible card selection, shared glass transport panel, true SVG play/pause path morph, empty transport/seek disabled, saved actions and queue retained | New native rendering/accessibility/performance review pending |
| Video | Implemented: same transport component over the video, rounded native media surface, glass timeline panel, shared fullscreen controls and existing source/error handling; empty catalog now has useful Search/Retry actions | Provider supplies no authorized video; local rendering/fullscreen/orientation acceptance pending |
| Video carousel | Implemented: existing snapping/selected-state behavior retained with live reduced-motion preference | Native frame-rate/memory measurement pending; one decoder policy unchanged |
| Discovery / mood player | Implemented: glass local-time summary, expandable rule details, consistent filters and existing history/random controls | Matching/repeat-avoidance rules unchanged; account/catalog prerequisites remain |
| Decade/season/saved collections | Implemented through shared header, typography, song rows, empty states and pagination; category business rules unchanged | Metadata coverage and account restrictions unchanged |
| Provider albums/artists/playlists | Implemented: consistent resource cards, real artwork with neutral missing-image fallback, shared search input | Supported provider endpoints only; no invented catalog entries |
| Provider collection detail | Implemented: artwork/metadata hierarchy and explicit Play collection entry reusing the existing player; pagination/availability states retained | Account/catalog prerequisites unchanged |
| Shared song/playlist review | Implemented: glass review panel and consistent existing save/play actions; explicit review and identity checks retained | No automatic saving or cloud success claim; real account needed |
| Offline technical audio | Shared list/header treatment retained; obsolete “three music demos” wording corrected | Original technical tones remain clearly labeled and are not presented as provider songs |
| Standalone diagnostic | Rebuilt: compact access header, focused real search/results, actual provider artwork, carousel and a persistent transport dock; keyboard hides dock while editing, landscape uses a compact layout; progress updates only rerender dock | Private expiring key/read-only scope preserved; new layout not installed on phone |
| Tabs / mini player / sheets | Implemented: actual mini-player artwork fallback, matching morphing play/pause icon, named tabs/actions, glass sheet/card treatment and reduced-motion sheet behavior | Global discovery bar remains sole owner of bottom safe-area padding; native touch/font-scale review pending |

## Native implementation and preservation

- Existing dark/lavender brand retained, with improved text/line contrast and shared spacing/radii. Inputs have a 52-point minimum; primary buttons 48; icon controls at least 44. Labels remain available to screen readers; destructive confirmation flows are retained.
- Audio and video import the **same KobraPlaybackControls**. Its three separate glass circles match the reference's grouping. Two equal-topology SVG paths interpolate from a play triangle into pause bars on the Reanimated UI thread. Reduced motion applies immediately and listens for Android accessibility preference changes.
- Glass is implemented with bounded translucent views, a subtle SVG highlight and a rim. No native module, new dependency, live blur pass, web player or fake NativeModules shim was added.
- Audio artwork measures its actual container, responds to width changes, clamps selection and renders a three-item window with fixed item layout. External track changes, drags that end without momentum and direct accessible card selection all use the existing selection callback.
- Diagnostic catalog artwork uses only the existing ARTWORK lease endpoint. Its presentation cache is bounded to 200 references. Artwork/selection does not replace the native queue or open personal stores. Expired/closed access cannot fetch new artwork.
- Diagnostic progress subscriptions are isolated from search/list/header rendering. Search explicitly blurs/dismisses the keyboard; playback controls remain separate from scrolling results. There are no fake personal collection buttons in the diagnostic.
- Hash checks confirm **170 backend source files**, native audio service/background handler, main player/library stores, catalog client/transport/runtime, auth module/config/guards, environment/build configuration, lockfile and **all four icon assets** unchanged. Personal collection data was not read, migrated, transferred or deleted.

## Verification evidence

- `pnpm run typecheck`: PASS, all four workspaces.
- `TEST_LIVE_CONNECTIVITY=false pnpm test`: **641 passed, 3 intentionally skipped, 0 failed**; 61 passing files. The earlier 632 tests remain, with eight geometry cases and one diagnostic artwork/queue case added. The existing account-route test only gained a presentation-only SVG boundary mock; authentication assertions remain intact.
- New regression coverage: carousel centering/selection across six viewport widths, overscroll/invalid geometry, finite stable icon topology over a transition, diagnostic artwork and carousel selection without queue resets or account storage. Existing auth/isolation, catalog, playback Stop/Play/empty-queue recovery/seek, collections, sharing and video tests pass.
- Production Metro and Hermes: both normal and diagnostic variants checked; module counts, HBC hashes, canonical registry and entry-order results are in [verification.json](evidence/ui-ux-remediation/verification.json). Each has 29 assets, one AppRegistry registerComponent definition and one root registration. No private diagnostic key in either bundle.
- Evidence: [TypeScript](evidence/ui-ux-remediation/typecheck.log), [tests](evidence/ui-ux-remediation/tests.log), [preservation](evidence/ui-ux-remediation/preservation.json), [changed files](evidence/ui-ux-remediation/changed-files.json), [normal Metro](evidence/ui-ux-remediation/normal-metro.log), [diagnostic Metro](evidence/ui-ux-remediation/diagnostic-metro.log).
- No Git commands, database changes, cloud configuration changes or EAS builds during remediation.

## Remaining design gaps and acceptance

1. **New Android visual/touch acceptance is pending.** The currently installed APK contains the earlier diagnostic layout. No new UI screenshot, visual parity, animation FPS, memory benchmark or TalkBack acceptance is claimed. Review the new source in an authorized native runtime later, including narrow portrait, landscape, keyboard, large fonts, reduced motion, carousel swipes, fullscreen and notification/background regressions.
2. **Exact optical liquid refraction/backdrop blur is not implemented.** This is a native translucent/specular interpretation of Kobra, not a pixel-identical web liquid filter. The reference's physics/optical treatment remains a visual gap; adding a native filter would require separate compatibility/performance review and a later authorized native build.
3. Full main-app navigation/account collections cannot be exercised through the read-only diagnostic key. Real authentication/account infrastructure remains on HOLD. Main features now have explicit entry points, but protected APIs are not bypassed for screenshots or demos.
4. Authorized real video content and a recognition provider are still unavailable. Empty/error/unsupported states are designed; unavailable integrations are not presented as working.

The user confirmed existing real-song Android playback controls work. Earlier controlled evidence includes installed-app search, AAC decoding, native media states and Levitating background/Pause response; [the runtime report](REAL_SONG_ANDROID_VERIFICATION.md) records those limits separately. That evidence applies to the earlier APK and is not claimed as verification of this new UI.
