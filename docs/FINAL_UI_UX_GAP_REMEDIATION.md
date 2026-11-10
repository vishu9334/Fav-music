# Final UI/UX gap remediation

7 November 2026. **Feasible local implementation: PASS. Android visual acceptance: PENDING. Full-app acceptance: BLOCKED by real-account prerequisites.**

Follow-up to [the failed readiness audit](FINAL_UI_UX_VISUAL_READINESS.md). No Git commands, database operations, backend/cloud changes, EAS builds or installations were performed. The installed APK predates these changes; previous playback evidence does not verify this interface.

## Six requested fixes

| Gap | Implemented and locally verified | Native acceptance / limits |
|---|---|---|
| Glass | SDK 52-compatible `expo-blur ~14.0.3`; bounded native capture, lens/rim highlights, existing press springs and SVG play/pause morph. Audio/video share `KobraPlaybackControls`. | Native appearance/performance pending. Optical pixel refraction is **not implemented or claimed**. |
| Diagnostic key entry | Entire locked form/header scrolls inside KeyboardAvoidingView. Submit clears private input and dismisses the keyboard. Short windows/large fonts put header/search/transport in scrolling content; dock hides while typing. | Real IME, small-screen and resized-window checks pending. |
| Landscape/accessibility | Default orientation and Android keyboard resize in both Expo configs; horizontal safe insets, wrapping headings/actions/tab labels. Short-window/large-font fullscreen video uses scrolling inline controls. Prior/default orientation restored on exit; reduced motion disables modal transitions. | Rotation, cutouts, actual font metrics, TalkBack and fullscreen/back acceptance pending. |
| Privacy caption | Shared caption `#BDB4C8` on `#09090B`: **9.9726:1**, exceeding 4.5:1. Regression checks actual token. | Color-pair PASS; whole-app/translucent-background WCAG certification not claimed. |
| Login/Profile review | Diagnostic hub before/after key entry renders shared Login/Loading/Profile fragments. Google/account actions disabled; optional name typing stays in memory. No identity, session, controller call or personal-data load is created by review. | Layouts reviewable without login. Genuine sign-in/profile operations remain guarded and held. |
| Original local video | Existing motion/colour clips connected to the actual native engine/session through diagnostic review and the normal Video empty-state action. Both exports contain unchanged clips. | Host decode PASS; native play/seek/carousel/fullscreen/audio handoff pending. Remote HTTPS video remains separately unverified. |

### Glass fidelity and performance policy

The reference remains [Kobra video](https://kobra.systems/components/video). Native backdrop blur with highlights and a lens rim is the implemented approximation, not pixel parity or a refraction shader.

Capture runs only for active, non-reduced-effect transport bubbles with area at most 16,384 square layout points, on Android API 31+ or iOS. Android intensity is 24 with reduction factor 4. Large cards/lists retain inexpensive tint. Background, reduced-motion/transparency, older Android and missing-module cases use an opaque fallback. A visual-review toggle exposes lightweight mode. No full-screen blur or per-frame blur-intensity animation was added.

SDK 52 exposes Android blur through experimental `dimezisBlurView`, using RenderEffect on API 31+ and RenderScript below it. The new policy avoids the legacy path. Sources: [SDK 52 props](https://raw.githubusercontent.com/expo/expo/sdk-52/packages/expo-blur/src/BlurView.types.ts), [native implementation](https://raw.githubusercontent.com/expo/expo/sdk-52/packages/expo-blur/android/src/main/java/expo/modules/blur/ExpoBlurView.kt). Native video-surface capture and actual low-end frame budgets require device measurement; neither is asserted here.

## Screen/navigation review

All entries were checked in route/component source, not newly screenshot/touch-verified on Android.

| Screen / feature | Entry | Remaining access/verification |
|---|---|---|
| Home | Home tab, categories and feature grid | Real-account gate preserved |
| Search | Search tab, filters/results/paging | Account/provider required; narrow heading wraps |
| Library / Likes / Favourites / Bookmarks | Library tab and collection links | Existing owner-bound stores/guards unchanged |
| Playlists | Library → playlist, create/rename/manage/share sheets | Account required; keyboard/insets updated |
| Warehouse | Warehouse tab, Active/Removed/Hidden and restore | Existing persistence/hold unchanged |
| InstaMus | Home feature link, link/manual matching/saved notes | Automatic recognition provider unavailable |
| Audio player | Track/mini-player → player, carousel/seek/shared transport | Native service/provider/queue logic unchanged |
| Mood/time/random/decades/seasons | Home links and global Discovery | Existing rule-based matching preserved |
| Listening history | New feature/Discovery links → guarded `/history` | Read-only existing last-100 events; unknown metadata references retained |
| Video | Home link → catalog video or explicit original-clip review | Original clips also reachable in diagnostic hub without account/key |
| Artists/albums/provider playlists | Explore catalog → browse/collection routes | Existing provider capabilities/account prerequisites |
| Sharing/deep links | Share actions/incoming links → guarded shared review | No automatic save/auth bypass added |
| Login/Profile/Loading | Real routes plus shared-layout diagnostic review | Account actions disabled in review; actual lifecycle unchanged |
| Offline | Existing redirect to Library | Unused technical OfflineAudioScreen is not a reachable production feature |

The diagnostic hub honestly lists guarded feature locations; it does not create fake personal screens. Full Home/Library/Playlists/Warehouse/collections acceptance still requires a legitimate account. This remediation does not claim that all screens are accessible in the diagnostic variant.

## Verification

| Check | Result |
|---|---|
| `pnpm run typecheck` | **PASS**, all four workspaces |
| `pnpm test` | **PASS**, 654 passed, 3 intentionally skipped live-connectivity tests, 0 failures; 63 passing files |
| Added regression coverage | 13 checks for blur/platform/budget/reduced/background policy; five short viewports/font scale; fullscreen collision policy; caption contrast; shared account layout rendering without controller access/enabled actions |
| Normal production Metro | **PASS**, 2,952 modules, 31 assets |
| Diagnostic production Metro | **PASS**, 2,957 modules, 31 assets |
| Hermes compilation/inspection | **PASS** both variants; one AppRegistry definition, one root registration; canonical `__r(167); __r(0);` startup |
| Expo local autolinking | **PASS**, Blur 14.0.3, Video 2.0.6, ScreenOrientation 8.0.4; native Gradle/APK build not run |
| Existing local video | **PASS**, ffprobe/full host ffmpeg decode: H.264/AAC 640×360, motion 8s and colour 6s; unchanged hashes present in both bundles |
| Preservation | **PASS**, 201 protected files unchanged, including backend/environment, auth services/boundaries, stores, native audio playback, entry/build profiles and all four icons. No existing dependency version selections changed; only blur added. Private developer key absent from bundles. |
| Updated Android rendering/gestures/performance | **NOT RUN** |

React host rendering tests use native presentation adapters; they verify structure/disabled actions, not native pixels/fonts/decoding. Layout-policy tests cover 320×568, 360×640, 640×360, 568×320 and 240×320, including font scale 2; they are not emulator screenshots. Contrast follows [WCAG normal-text guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

Evidence: [TypeScript](evidence/ui-gap-remediation/typecheck.log), [tests](evidence/ui-gap-remediation/tests.log), [bundle/runtime hashes](evidence/ui-gap-remediation/bundles.json), [contrast](evidence/ui-gap-remediation/contrast.json), [media](evidence/ui-gap-remediation/original-media.json), [bundled clips](evidence/ui-gap-remediation/bundled-video-assets.json), [preservation](evidence/ui-gap-remediation/preservation.json), [resolved config](evidence/ui-gap-remediation/config.json), [normal Metro](evidence/ui-gap-remediation/normal-metro.log), [diagnostic Metro](evidence/ui-gap-remediation/diagnostic-metro.log).

## Changed files

Exact inventory: [changed-files.json](evidence/ui-gap-remediation/changed-files.json).

- Native/shared presentation: `design/{NativeBackdrop,GlassSurface,controls,styles,glass-policy,layout-policy}`, `KobraPlaybackControls`, shared app `ui.tsx`.
- Account presentation: new `account-presentation`, existing AuthScreen/ProfileEditor/Google button/loading screen; isolated `AccountLayoutReview` and `VisualReviewHub`.
- Layout/navigation: diagnostic screen, tab/discovery bars, library sheets, Home/Search/Library/Playlist/Warehouse/InstaMus/Collection/Discovery screens; new History screen/route, feature link and root-stack declaration.
- Video: `VideoScreen`, `NativeVideoSession`. Original media, engine/service/coordinator and audio service unchanged.
- Configuration: root/mobile app.json only orientation/default and Android keyboard/resize; mobile package/lockfile add compatible blur. Icons, package/project IDs and EAS profiles unchanged.
- Tests: new layout/effect and account-review regressions; existing account-route presentation adapter extended for KeyboardAvoidingView/Platform. Local generated Expo route declarations refreshed for history.

## Exact Android acceptance blockers

1. **A new native APK is required** for ExpoBlur and updated configuration/UI. No build was approved/submitted in this task. The older installed APK cannot certify the changes. Native linking/manifest/startup need checking after separate approval.
2. **Visual acceptance on CPH2599 plus a small/resized viewport**: key form with keyboard, portrait/landscape, font scale 1/1.3/2, cutouts/system bars, labels/sheets and TalkBack. Capture actual screenshots, focus/touch and overlap results.
3. **Effects/media acceptance**: verify real backdrop/video capture, lightweight/reduced-motion fallback, carousel/morph frame time and memory, seek, fullscreen/back/orientation restoration. Exact optical refraction remains a fidelity gap.
4. **Audio/video handoff**: play real Saavn audio, open/play both original clips, verify audio pauses, seek/change clips/rotate/exit, explicitly resume retained audio queue. Coordination is unchanged/regression-tested; this newly reachable path still needs native evidence.
5. **Fresh HTTPS/key preflight for real-song checks**: existing development origin/key are temporary and may expire. Neither was renewed/reconfigured. Layouts/local clips do not require that key; no credentials belong in APK/report.
6. **Genuine-account prerequisites remain held**: presentation review does not verify real registration, sessions, personal collections or cloud sync. Authorized remote video is unavailable/unverified; automatic recognition and production music licensing remain external dependencies.

The source is ready for a **limited diagnostic visual-acceptance candidate** covering repaired key layout, real-song UI when access is valid, shared account presentation, native effects and original local video. This is not full-app acceptance or a production-ready declaration. No EAS action is requested here.
