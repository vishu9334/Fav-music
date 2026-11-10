# Phase 2 Batch 4 — audit and implementation scope

No video player, video dependency, orientation dependency or local video asset existed. Reuse the existing native KobraPlaybackControls, Scrubber, audio service serialization and Expo Router navigation. Preserve library/discovery data, icons, Metro singleton setup and native registration.

Installed Expo 52.0.49 declares `expo-video ~2.0.6` and `expo-screen-orientation ~8.0.4` in bundledNativeModules.json. Install those compatible versions. The online v52 documentation redirects to current documentation; use installed 2.0.6 source/types and Expo's sdk-52 source for API compatibility. Do not use later APIs such as replaceAsync, fullscreenOptions or Android textureView when absent in this version.

Use one native decoder and one visible VideoView, poster-only carousel cards, bounded buffers and event-based progress. Reuse the exact same transport component for audio and video. Use a React Native fullscreen modal so custom controls remain available, with explicit landscape lock and restoration of the previous orientation policy on exit/blur.

Audio/video exclusivity requires a shared playback authority at command entry. Video must await confirmed TrackPlayer pause before playing; all audio starts/toggles, including remote commands, must pause/mute and confirm video first. The coordinator must not acquire its lock from inside an audio operation that video pause waits on. Preserve audio queue/progress and never auto-resume audio merely because video exits.

The published Expo HTTPS Big Buck Bunny example returned HTTP 403 in this environment. The user confirmed no authorized remote URL is available and approved **original local test clips plus a streaming adapter**, with remote verification pending. Generate two small H.264/AAC test-pattern clips locally with synthetic tones; verify container, streams, decoding and frame content. No third-party footage or music is added. Do not invent a remote catalog entry.

New native libraries require an updated native runtime before device testing. Missing-module guards must keep the audio app usable in an older installed runtime. No EAS/native build, backend/database change or Git operation is authorized. Verify TypeScript, regressions, Metro, Hermes, media and preservation; then stop after Batch 4.
