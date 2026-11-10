# Final UI/UX visual readiness audit

Follow-up: [Final UI/UX gap remediation](FINAL_UI_UX_GAP_REMEDIATION.md) implements the feasible fixes and records fresh local evidence. This document retains the historical pre-remediation findings; native acceptance remains pending.

**7 November 2026 — full visual readiness: FAIL. Local compilation/regressions: PASS.**

This was an audit and verification pass. No implementation, account guard, provider, backend, environment, icon or build-profile change was made. No database operation, cloud configuration change, Git command, EAS build or APK installation was performed.

**One current-profile APK cannot cover acceptance of the complete app.** A `preview-real-songs` candidate is locally compilable and could test the diagnostic audio UI after separate build approval and fresh endpoint/key checks. It deliberately cannot navigate to the authenticated main application or its account collections. It also has a small-screen key-entry layout risk. A normal preview presents the real authentication screen while account setup remains held. Neither is a complete 16-route visual acceptance environment.

## Scope and evidence limits

Reviewed all 16 file-based routes, 14 screen implementation files (one unused technical-audio screen), shared navigation/forms/sheets, account/loading states, the standalone diagnostic view, native audio/video controls, morph geometry, both carousels, safe-area/orientation choices and current preview configuration.

References: [Kobra video](https://kobra.systems/components/video), [carousel](https://kobra.systems/components/carousel), [morphing icons](https://kobra.systems/components/morphing-icons), plus the existing Aadat/Batch 1–4 requirements and [remediation report](UI_UX_REMEDIATION.md). Video and carousel pages were reopened in this audit. Fresh morphing-icons retrieval returned an internal tool access error; its previously inspected reference and current native implementation were reviewed, without claiming a fresh external visual comparison.

There is no new APK with these changes and no native rendering screenshot from this audit. Source checks, computed contrast and carousel geometry tests are evidence of implementation properties, not measured Android layout, animation smoothness or TalkBack results. Source-based layout risks below have not been presented as device-observed failures.

## Exact remaining findings

### V1 — P1: full-screen acceptance is blocked by the existing app modes/account hold

Evidence: [entry selection](../apps/mobile/index.tsx:27), [tab account gate](../apps/mobile/app/(tabs)/_layout.tsx:13), [account guard](../apps/mobile/src/auth/components/account-access.tsx:16), [preview configuration](../eas.json:32).

`preview-real-songs` selects `DevelopmentPlaybackScreen` instead of ExpoRoot and explicitly sets normal authentication/catalog/account-persistence flags false. There is no diagnostic navigation into Home, Library, Playlists, Warehouse, InstaMus or Profile. The key is not an account identity. Ordinary routes retain their real-account guard. This boundary is correct security behavior, but **all planned screens are not visible and accessible in a single current candidate**. Do not remove the guard or fabricate a user for visual tests.

### V2 — P1: native video controls cannot be reached with the present provider/content path

Evidence: [catalog-only video selection](../apps/mobile/src/screens/VideoScreen.tsx:24), [empty-state early return](../apps/mobile/src/screens/VideoScreen.tsx:36), [provider capabilities](../server/src/modules/catalog/services/provider-catalog.service.ts:16), [original test clips](../apps/mobile/src/video/video-catalog.ts:4).

The current provider reports `videoSupported:false`; the route creates items only from catalog tracks with video metadata. `VIDEO_ITEMS` contains original local clips but is not imported by a runtime route. Consequently having the ExpoVideo module does not make the player/carousel/fullscreen controls available for this acceptance scope. A deliberately approved original-media test entry or an authorized real video catalog is needed. No URL or source was invented.

Also, `/offline` [redirects to Library](../apps/mobile/app/offline.tsx:3); it does not render `OfflineAudioScreen`. The previous remediation report's technical-audio styling row described an existing source file, not a reachable screen. Technical samples are not a production catalog.

### V3 — P1: diagnostic key entry lacks overflow/keyboard protection

Evidence: [locked form](../apps/mobile/src/development/DevelopmentPlaybackScreen.tsx:45), [centered access/card styles](../apps/mobile/src/development/DevelopmentPlaybackScreen.tsx:61).

The locked view is a centered `View`/GlassSurface with multiple text blocks, a 52-point input, a 48-point button, 20-point gaps and padding. It has no ScrollView or KeyboardAvoidingView. Hiding the dock only applies to the unlocked branch. Small/resized windows, increased font scale and an open keyboard can leave insufficient height without a way to scroll to Verify. The source lacks robust overflow handling; actual clipping has not been captured on a new APK.

Before spending a visual acceptance build, make locked key entry scrollable and keyboard-safe, then test 320×568 and 360×640 layouts with keyboard and increased font scale.

### V4 — P2: liquid refraction and real backdrop blur are absent

Evidence: [GlassSurface](../apps/mobile/src/design/GlassSurface.tsx:7).

The native surface is a translucent background, border and static linear SVG highlight. It does not sample/distort the backdrop, blur live media, refract pixels, or implement the optical liquid effect in the Kobra reference. This is an intentional lightweight native interpretation, but **exact liquid-glass fidelity is incomplete**. No refraction or blur PASS is claimed. The reference supports liquid and blurred treatments. [Kobra video](https://kobra.systems/components/video).

Audio/video transport shape grouping and components match each other. Non-fullscreen video's title and timeline are outside the media frame, whereas Kobra's demonstrated controls/timeline are overlays. Current carousels use scale/fade or scale transitions rather than reproducing every visual detail of the web demo. These differences must be reviewed explicitly, not called pixel parity.

### V5 — P2: landscape/short-window coverage is incomplete

Evidence: [portrait configuration](../app.json:7), [diagnostic compact condition](../apps/mobile/src/development/DevelopmentPlaybackScreen.tsx:55), [video absolute overlays](../apps/mobile/src/video/NativeVideoSession.tsx:82), [fullscreen panel styles](../apps/mobile/src/video/NativeVideoSession.tsx:104).

- Both app configs lock ordinary activity orientation to portrait. The diagnostic compact landscape branch therefore is not reached by ordinary phone rotation; it mainly helps resized/otherwise landscape windows. Main-screen landscape behavior is not verified by its existence.
- Diagnostic header/search/dock remain outside the scrolling results. A short landscape/resized window can leave little height for results even with the compact dock. There is no height-budget regression for the complete screen.
- Fullscreen video places center transport and bottom timeline/status/error panels absolutely. They have no collision rule for short heights or larger text; an expanded error/retry panel increases overlap risk. This is a source-based risk, not a captured device overlap.
- Eight main screen implementations and the non-fullscreen video session specify only `edges=['top']`, and the custom tab bar/global discovery bar do not apply horizontal safe insets. This matters if portrait lock is overridden or the activity is resized into a landscape cutout/navigation configuration. Fullscreen video and the standalone diagnostic use default all-edge SafeAreaViews.

Need native checks for portrait/landscape video transitions, back/orientation restoration, cutouts, gesture and three-button navigation, split/resized windows and large fonts. Bottom-inset ownership remains centralized in the global discovery bar; no duplicate bottom padding was introduced by this audit.

### V6 — P2: keyboard and font-scale consistency still needs work

Evidence: [account scroll view](../apps/mobile/src/auth/components/auth.screen.tsx:37), [playlist sheet keyboard policy](../apps/mobile/src/components/library/LibrarySheets.tsx:24), [Library heading](../apps/mobile/src/screens/LibraryScreen.tsx:36).

Profile inputs are in a ScrollView with no explicit keyboard-avoidance or keyboardShouldPersistTaps policy. Sheet KeyboardAvoidingView only sets a behavior on iOS. Android resize may make these usable, but reliable input/button reachability has not been demonstrated. The Library playlist heading is a non-wrapping row containing text and a full button, which can overflow at narrow widths with larger text. Search result-heading rows and the diagnostic header also need large-font checks.

Most primary text shares the Aadat hierarchy, but small 10–12-point captions and one-line labels still need actual device readability/truncation review. Existing scrollable lists, wrapping feature/category grids and 44/48-point button minimums are positive source findings, not a blanket accessibility PASS.

### V7 — P2: one known text contrast shortfall

Evidence: [privacy caption](../apps/mobile/src/auth/components/auth.screen.tsx:86), [computed ratios](evidence/ui-visual-readiness/contrast.json).

The 12-point privacy caption uses `#71717A` over `#09090B`: computed contrast **4.117:1**. This falls below the 4.5:1 normal-text benchmark in [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Shared primary/muted/accent text on the same background computes to 18.771/9.973/11.255:1 respectively. This calculation is not an audit of all translucent/media backgrounds or a claim of native WCAG certification.

### V8 — P2/P3: motion and discovery coverage are partial

The shared transport and audio carousel support reduced motion. Video posters honor reduced motion too, but the fullscreen Modal [always requests fade](../apps/mobile/src/video/NativeVideoSession.tsx:57), unlike the library sheet. OS animation settings may still suppress this; source consistency needs review. Only play/pause paths morph; other glyphs use their existing static/selected states. No additional morphing set was claimed or silently required.

[Discovery](../apps/mobile/src/screens/DiscoveryScreen.tsx:28) exposes at most five unique recent tracks, with no complete history-browser route. This is limited history visibility, not missing history storage. Automatic recognition and cloud synchronization remain unavailable/held and are labeled accordingly. Existing original sample media is not reachable through the normal video UI as described in V2.

## Screen-by-screen source review

All rows require new native visual acceptance. “PASS source” below means the intended layout/entry exists and no additional definite source defect was found in that row; it is not a device PASS.

| Screen / route | Source review | Access / remaining issue |
|---|---|---|
| Home `/` | PASS source: shared header, glass hero, wrapping category grid and feature links | Real account required; conditional horizontal-inset and large-font checks |
| Search `/search` | PASS source: labeled field, filters, results and pagination | Real account; narrow/large-text heading and keyboard checks |
| Library `/library` | PARTIAL: collection/playlist entries and creation visible | Account hold; non-wrapping playlist heading (V6) |
| Playlist `/playlist` | PASS source: wrapping action group, naming/rename/share/manage controls | Account hold; Android sheet keyboard checks |
| Warehouse `/warehouse` | PASS source: Active/Removed/Hidden and restore/source context | Account hold; landscape horizontal safe areas |
| InstaMus `/instamus` | PASS source: visible labeled link/search/manual-match workflow | Account hold; automatic recognition unavailable |
| Login `/login` | PARTIAL: genuine loading/error/unavailable/sign-in states | Secure services held; contrast shortfall V7 |
| Profile `/profile` | PARTIAL: real-identity editor, collections and logout | Account hold; keyboard behavior V6 |
| Audio player `/player` | PASS source: one shared transport, measured-width artwork, queue/actions | Account hold; native morph/touch/animation acceptance pending |
| Video `/videos` | PARTIAL source: shared overlay transport, timeline, native fullscreen and carousel | Current provider supplies no usable video; V2/V4/V5/V8 |
| Discovery `/discovery` | PARTIAL: mood/time/season/decade/random entries visible | Account hold; history limited to five entries |
| Collections `/collection` | PASS source: existing category/saved-track routes and shared list | Account hold; horizontal insets |
| Provider browse `/provider-browse` | PASS source: consistent real resource cards and field | Account/provider capabilities required |
| Provider collection `/provider-collection` | PASS source: metadata/artwork, play collection and pagination | Account/provider prerequisites required |
| Shared review `/shared` | PASS source: review/play/save with explicit actions | Account required; no automatic writes |
| Offline `/offline` | NOT an offline-player screen: redirects to Library | Technical OfflineAudioScreen source is unused |
| Standalone diagnostic | PARTIAL: actual catalog/artwork, carousel and fixed transport dock | V3/V5; no account navigation or video |
| Shared navigation/sheets | PASS source for four tabs, mini player and feature links | Native focus order, modal keyboard and large-font checks pending |

Planned-feature entry audit: search/discovery/categories, likes/favourites/bookmarks, playlist naming/manage actions, Warehouse, manual InstaMus, sharing, Profile and audio controls have source entry points in the authenticated app. Mood/random is reachable via feature links/global discovery. Full listening history, working automatic recognition, cloud-sync acceptance and video content are incomplete or blocked. The diagnostic exposes only its approved catalog/audio surface. Therefore **“all planned features visible and accessible now” = FAIL**.

## Fresh verification

- **TypeScript: PASS** — all four workspaces.
- **Regression suite: PASS** — 641 passed, 3 intentionally skipped live-connectivity tests, 0 failures; 61 passing files.
- **Normal production Metro/Hermes: PASS** — 2,939 modules, 29 assets, valid HBC.
- **Diagnostic production Metro/Hermes: PASS** — 2,942 modules, 29 assets, valid HBC.
- Each variant contains one AppRegistry registerComponent definition and one root registration; InitializeCore precedes the entry. Source hashes and artifact hashes are recorded in [verification.json](evidence/ui-visual-readiness/verification.json).
- **Preservation: PASS** — 343 implementation/configuration/assets files hashed unchanged across this audit, including native playback, Saavn transport, auth guards, data stores, backend source, environment/build settings and all four icons. No user-record or database access was needed.
- **Native visual/gesture/frame-rate acceptance: NOT RUN.** Geometry tests cover six carousel widths, not full screen height, keyboard, font metrics or native SVG rendering.

Evidence: [tests](evidence/ui-visual-readiness/tests.log), [TypeScript](evidence/ui-visual-readiness/typecheck.log), [route inventory](evidence/ui-visual-readiness/routes.json), [contrast](evidence/ui-visual-readiness/contrast.json), [normal Metro](evidence/ui-visual-readiness/normal-metro.log), [diagnostic Metro](evidence/ui-visual-readiness/diagnostic-metro.log).

## APK decision and minimum next work

**Full-app visual acceptance APK: NOT READY.** First resolve key-form overflow, validate short-window/keyboard/font-scale handling, correct the known caption contrast and agree how the incomplete liquid effect is to be accepted. Full main-screen testing needs the real-account prerequisites; video needs authorized content or a separately approved scoped original-clip entry. Do not use fake authentication to remove those blockers.

**Limited diagnostic candidate: technically buildable, conditionally useful, not full visual acceptance.** It can exercise real-song search, artwork, native audio controls and the new diagnostic layout. It cannot certify Home/Library/Playlists/Warehouse/Profile/video. Recommend fixing V3 before consuming another APK build. Any later build still requires explicit approval and fresh verification of the temporary HTTPS origin and expiring private key; no key belongs in the APK. No build is requested or submitted by this audit.
