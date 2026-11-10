# Phase 2 Batch 4 — native video player

Verified **6 November 2026 (IST)**. **PASS: local implementation, TypeScript, regressions, actual local-media verification, production Metro and Hermes. BLOCKED: physical Android acceptance requires a native runtime containing the new modules. PENDING: authorized remote HTTPS streaming verification.** Stopped after Batch 4; Batch 5 has not started.

## Audit and dependencies

The [pre-implementation audit](PHASE_2_BATCH_4_AUDIT.md) found no installed video/orientation library and no video media. Existing audio queue/recovery, Kobra controls, Scrubber, local library and discovery were reused.

Installed `expo-video 2.0.6` and `expo-screen-orientation 8.0.4`, matching the installed Expo SDK 52 bundled-native-module requirements. APIs were checked against installed source/types and [Expo's SDK 52 video source](https://github.com/expo/expo/tree/sdk-52/packages/expo-video/src). Later-version APIs were excluded. Library installation ran with lifecycle scripts disabled; no prebuild or native/EAS build ran.

Lockfile review found only the mobile importer change, two new package entries and two new snapshots. All pre-existing package/snapshot resolutions are unchanged. Canonical mobile React 18.3.1, React DOM 18.3.1 and React Native 0.76.6 still resolve. Expo Android autolinking discovers both new modules; root TrackPlayer configuration remains present. No app config, Android source or icon changes were needed.

## Implemented features

| Requirement | Result | Actual implementation |
| --- | --- | --- |
| Native playback | PASS locally / device pending | Real `expo-video` VideoPlayer/VideoView adapter; no WebView or fabricated native module. `/videos` opens from Home and the audio player. Selection prepares silently; Play is explicit. |
| Glass controls | PASS locally | Reuses the exact KobraPlaybackControls component in audio and video, including fullscreen. Native translucent surfaces, borders, rounded buttons and spring interaction follow the existing [Kobra reference](https://kobra.systems/components/video). Added reduced-motion handling and generic playback accessibility wording. |
| Previous/Play/Pause/Next parity | PASS locally | Same component and touch targets. Both modes preserve pause state on navigation, wrap Previous/Next and restart the current item when Previous is pressed after three seconds. Rapid commands are serialized; obsolete autoplay is cancelled. |
| Seek/progress/duration/buffering/errors | PASS locally | Reuses Scrubber. Native events drive progress; seeks do not immediately publish an unconfirmed target position. Duration starts from native metadata. Handles loading, buffering, end/replay, bounded timeouts, errors and retry. Source URLs are redacted from surfaced command errors. |
| Fullscreen/orientation | PASS locally / device pending | React Native modal retains custom controls, hides the status bar, fits video without cropping and handles Android Back. Explicit landscape lock; captured prior orientation policy restored on exit, backgrounding and cleanup. Failures retain a retry path, including an in-modal message; cleanup retries one failed restoration. |
| Responsive carousel | PASS locally / device pending | Responsive snapping poster carousel, UI-thread card scaling, reduced-motion option and poster fade. Only the selected source is decoded. Selection preserves playing/paused state; cards do not create decoders. Smoothness and actual rendering await device checks. |
| Audio/video exclusivity | PASS under native-contract mocks / device pending | Shared MediaPlaybackCoordinator serializes ownership before either player starts. Video awaits audio pause and checks both native playing state and play-when-ready. Audio, including notification Play and discovery Play, awaits video mute/pause confirmation. No audio queue reset or seek loss. |
| Focus/background/navigation | PASS locally / device pending | Video uses non-mixing audio mode, no notification, no PiP and no background continuation. Route blur/unmount releases the player. App backgrounding pauses video. A focus return caused by video does not unexpectedly resume audio, including after video exits; explicit audio Play remains available. Audio background behavior/recovery regressions pass. |
| Authorized sources | PASS for local samples; remote pending | Two original generated local clips. An attributed HTTPS-source adapter validates URLs and maps them to native sources. No remote video URL or production music-video entry is configured. |
| Memory/rendering | PASS by implementation review; unmeasured on device | One player and one visible VideoView; fullscreen reuses that player. Three-card render window, 0.5-second progress events, 6-second forward-buffer target and 6 MiB buffer cap. Media is H.264 Baseline at 640×360/24 fps. No decoder per carousel card or speculative preloading. |

Opening the video route in a runtime missing ExpoVideo shows an unavailable message and actual local posters. The native adapter is required lazily after checking the genuine native module. Missing orientation support disables fullscreen while allowing inline video. The guards are implemented; older/newer APK behavior still requires device acceptance.

## Actual media verification

The user confirmed no authorized HTTPS URL is available and explicitly approved continuing with original local clips and the streaming adapter. The published Expo example returned HTTP 403 from this environment; it was not added as playable media. No third-party footage, music or remote media download was added.

| File | Verified media | Size | Verification |
| --- | --- | --- | --- |
| `motion-test.mp4` | 8.000 seconds; H.264 Constrained Baseline/yuv420p, 640×360; AAC-LC 44.1 kHz; generated motion pattern and 440 Hz tone | 461,764 bytes | FFprobe metadata, full FFmpeg decode, extracted-frame visual inspection, exported-byte comparison: PASS |
| `colour-test.mp4` | 6.000 seconds; same video/audio formats; generated colour bars and 660 Hz tone | 57,008 bytes | Same checks: PASS |

These are technical test clips, not music videos or a real catalog. [Generation instructions and media notes](../apps/mobile/assets/video/README.md) are included. The app contains no automatic music-download path.

Motion clip SHA-256: `f94e09e1fc052c68647af15dcea3e1ebf61ab571fdca2f74d63ca500e5e82b2a`.

Colour clip SHA-256: `818a0fd72e03763cc3d5fbe268286f5f58e4a1c1152a7db047fe676d3f9b9c7b`.

Host decoding verifies actual container/codec/media integrity. It does **not** establish Android native playback, audible phone output or hardware-decoder compatibility.

## Regression and build verification

| Check | Result | Evidence |
| --- | --- | --- |
| Workspace TypeScript | PASS | `pnpm run typecheck`: config, contracts, mobile and server passed. |
| Relevant regressions | PASS | Final suite contains **74 relevant passing tests**: video/controller/coordination/streaming/orientation 21, Expo adapter 5, real audio-service handoff 4, existing playback service 26, player store 16, discovery/native integration 2. Adapter/native-contract tests explicitly mock native modules. |
| Complete suite | PASS | `TEST_LIVE_CONNECTIVITY=false pnpm test`: **418 passed, 3 skipped**, 32 test files passed. Socket access enabled for existing localhost lifecycle tests; live connectivity disabled. |
| Coordination/races | PASS | Tests cover remote Play with queue/index/seek preservation, focus-return suppression, failed pause confirmation, concurrent audio/video requests without deadlock, superseded loads, rapid selection/Next/toggle, background cancellation, disposal and fullscreen restore/retry. |
| Actual sample media | PASS | Both full clips decode and contain verified video/audio streams. Both copied MP4s match source SHA-256 values. Android export normalizes asset names to `apps_mobile_assets_video_motiontest.mp4` and `apps_mobile_assets_video_colourtest.mp4`. |
| Production Metro | PASS | Root `expo export:embed --eager --reset-cache --platform android --dev false`; **2,879 modules**, 29 assets; `EXPO_NO_DOTENV=1`. |
| Hermes | PASS | Production bundle compiled. Exactly **2** `Function<registerComponent>` declarations; canonical tail `__r(167); __r(0);`. |
| Native dependency discovery | PASS configuration only | Expo autolinking finds expo-video 2.0.6 and expo-screen-orientation 8.0.4 Android projects; root dependency configuration has 24 roots and still includes TrackPlayer. No Gradle/native binary was compiled. |
| Preservation | PASS | **279 protected files** match their pre-task SHA-256 values: backend, Android/native source, icons, original demos, library, sharing/discovery and Metro/entry source. Both Expo configs are unchanged. Player store also matches the Batch 3 preservation hash. Audio-service changes are the ownership gate/focus handling listed below; queue/recovery code is retained and tested. |
| Secret literal scan | PASS | No matches against 14 configured secret values in the production bundle. |
| Android end-to-end | BLOCKED/PENDING | No new native runtime or APK was built/installed. Decoding, touch/seek, fullscreen/rotation/back, smooth carousel, buffering/errors, background/focus handoff and memory/performance need physical device verification. |
| Remote HTTPS streaming | PENDING | No authorized test URL supplied; user approved this remaining blocker. No successful remote playback claim. |

Evidence directory: `/tmp/aadat-phase2-batch4-MHLvYc`. Includes `typecheck.log`, `tests.log`, `relevant-final.log`, `focused-initial.log`, `metro.log`, `hermes.log`, `autolinking.json`, `lock-review.json`, protected snapshots, `local-media-verification.json`, `bundle-checks.json`, generated assets and bundle/bytecode/disassembly. Temporary artifacts may be cleaned by the OS.

Production bundle SHA-256: `7320e382282ceeb62fc368411bdc1be866f1b3158e408b774504b47d0206e518`.

Hermes SHA-256: `bd21e8ce049aed190441f317527b25472279ce1fef328c923b36ccd01d22d116`.

## Changed files

Paths relative to repository root; `(new)` indicates added files.

```text
apps/mobile/package.json
pnpm-lock.yaml
apps/mobile/app/_layout.tsx
apps/mobile/app/videos.tsx                                      (new)
apps/mobile/src/screens/HomeScreen.tsx
apps/mobile/src/screens/PlayerScreen.tsx
apps/mobile/src/screens/VideoScreen.tsx                         (new)
apps/mobile/src/components/kobra/KobraPlaybackControls.tsx
apps/mobile/src/services/playback/MediaPlaybackCoordinator.ts   (new)
apps/mobile/src/services/playback/AudioPlaybackService.ts
apps/mobile/src/services/playback/playback-service.ts
apps/mobile/src/services/playback/__tests__/media-handoff.test.ts (new)
apps/mobile/src/video/video.contract.ts                        (new)
apps/mobile/src/video/video-catalog.ts                         (new)
apps/mobile/src/video/VideoPlaybackService.ts                   (new)
apps/mobile/src/video/ExpoVideoEngine.ts                        (new)
apps/mobile/src/video/FullscreenController.ts                   (new)
apps/mobile/src/video/NativeVideoSession.tsx                    (new)
apps/mobile/src/video/VideoPosterCarousel.tsx                    (new)
apps/mobile/src/video/__tests__/video-service.test.ts           (new)
apps/mobile/src/video/__tests__/expo-video-engine.test.ts       (new)
apps/mobile/assets/video/motion-test.mp4                        (new)
apps/mobile/assets/video/colour-test.mp4                        (new)
apps/mobile/assets/video/motion-test.jpg                        (new)
apps/mobile/assets/video/colour-test.jpg                        (new)
apps/mobile/assets/video/README.md                              (new)
docs/PHASE_2_BATCH_4_AUDIT.md                                    (new)
docs/PHASE_2_BATCH_4.md                                          (new)
```

Generated Expo Router types were refreshed for `/videos`. No backend, database schema, app configuration, native Android source or app icon changes.

## Remaining blockers and features

1. **Native runtime:** an approved Android build containing the two new native modules is needed before physical verification. No EAS or local native build was run. Do not treat Metro, Hermes, autolinking or mocks as an APK playback test.
2. **Streaming:** supply an authorized HTTPS source, then verify response/range support, actual media and Android network playback. Until then, remote streaming remains unverified. Source attribution metadata does not itself prove distribution rights; the catalog provider must establish them.
3. **Device acceptance:** verify portrait/fullscreen/Back/restoration, seek, buffering/retry, rapid changes, audio-to-video/video-to-audio handoff through UI and notification, app backgrounding and low-end resource use.
4. Batch 5 real authorized catalog/S3/backend integration and Batch 6 authentication/profile/cloud data remain unstarted for this phase. Neon migration/live-write HOLD remains in effect. Prior InstaMus automation/share-intent/verified HTTPS App Link blockers remain unchanged.

No Git commands, database/backend changes, migrations/live writes, EAS builds, icon changes or unauthorized media were introduced. **Stopped after Batch 4 for review.**
