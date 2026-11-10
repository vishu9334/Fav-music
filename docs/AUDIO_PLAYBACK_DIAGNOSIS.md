# Audio playback diagnosis and icon audit — 5 November 2026

The confirmed failure is an empty native TrackPlayer queue while the JavaScript service and UI still retain the three demo tracks. Play does not restore the native queue, so playback silently remains stopped. A controlled remote Stop → Play sequence reproduces this failure on the installed APK.

No playback code, icon configurations, backend/database settings or installed APK files were modified. No Git commands or EAS builds were run. This document proposes a fix for review before implementation.

## Installed app and initial failure

- Device: CPH2599, Android 16, serial `X4GACUMZMVEQY5XO`.
- Installed APK SHA-256: `76a428cde459c769d480f6ff00db66cbbbfa0cae18d5fd541ed6ec99ba00d852`, identical to Gate 5L build `573b0bb4-9c28-4413-8fc8-594c484ac5b2`.
- Last package update: 5 November 2026 at 20:11:17 device time. The later workspace icon configuration changes are not present in this installed APK.
- Initial app process: PID 24384, the same process previously tested at Gate 5L.
- Before playback, Android reported `STOPPED(1)`, position 0, buffered position 0, active item `-1`, `queueTitle=null, size=0`, and `error=null`.
- The visible UI nevertheless displayed SoundHelix Cadence 3. Pressing Play left the native queue empty and stopped after both 3s and 10s. Pressing Next changed the UI to SoundHelix Ambience 1 while the native queue remained empty.

## Controlled reproduction and isolation

| Step | Native evidence |
| --- | --- |
| Restart the existing installed app | TrackPlayer initializes, native queue contains three tracks; `Running "main"` appears in fresh Logcat |
| Explicit Play, then Pause | `PLAYING(3)` observed; paused position advances from 1.367s to 9.869s |
| Send remote Stop using Android media controls | Queue changes from three tracks to zero, metadata is cleared, active item becomes `-1` |
| Send remote Play | `STOPPED(1)`, position 0, buffer 0, queue size 0, active item `-1`, `error=null` |
| Restore through another app restart and check all streams | All three tracks reach `PLAYING(3)`; Pause records positions 4.132s, 4.117s and 4.130s respectively |

The logs did not retain the event that originally cleared the queue. Remote Stop is a directly reproduced trigger, rather than proof of which earlier user/system action occurred. The original failure state and its missing queue are directly observed.

### TrackPlayer initialization and errors

Cold initialization loads all three tracks and starts decoding MP3 audio. Fresh Logcat contains `Running "main"` at 21:14:24.753 and 21:17:11.183. The captured failure produces no JavaScript initialization error, ExoPlayer playback exception, fatal exception, HTTP playback error or media-session error string. Android reports `error=null`: the observed failure is silent empty-queue playback, not an exception whose message can be quoted.

### Audio focus and output

Android grants Aadat `GAIN` with `loss: none`. Music output is the speaker, unmuted, at index 100/160. AudioTrack startup is recorded for the app with 44.1 kHz stereo audio. During restored playback, Android reports active app audio configurations. Native position advancement and audio output state were verified; audible output was not independently recorded.

### Streaming URLs

All three existing SoundHelix MP3 URLs return HTTP `206`, `audio/mpeg`, and 1,024 bytes for a range request from the development computer. Each corresponding stream also successfully buffers and advances playback on the phone after queue restoration. These checks do not support changing the URLs as the fix for the captured failure.

## Code path causing the reproduced failure

1. `apps/mobile/src/services/playback/playback-service.ts:48` handles `Event.RemoteStop` by calling `TrackPlayer.reset()` at line 50.
2. The installed RNTP native implementation maps remote Stop to the JavaScript `remote-stop` event. Its `reset()` implementation stops the player, waits 300ms, and clears the native queue.
3. `AudioPlaybackService.play()` at `apps/mobile/src/services/playback/AudioPlaybackService.ts:139` only calls `TrackPlayer.play()`; it does not inspect or restore the native queue.
4. Queue loading occurs through `initializePlayer()` and the screen's mount effect. Bringing an existing activity to the foreground does not rerun that effect. The JavaScript track list survives the native reset, so the UI can continue displaying or selecting tracks that no longer exist in the native queue.

The reviewed playback service, store, screen and sample-track files match the source archived for the installed Gate 5L APK.

## Proposed fix — not implemented

- Make remote Stop preserve the native queue using the non-clearing stop operation, unless queue deletion is explicitly intended. If deletion is intentional, mark the queue unloaded and synchronize the displayed state.
- Route UI Play and remote Play through a shared playback-service method that checks the native queue and active item, restores the intended tracks and selection when missing, and then plays. Do not rely solely on JavaScript's retained track list or initialization flag.
- Keep UI/native queue state synchronized so an empty native queue cannot appear ready to play.
- Validate Stop → Play, UI and notification controls, reopening the activity, and all three streams after implementation. Preserve the existing app-killed playback policy and Gate 5K registration/Metro fixes.

A full app restart is a verified temporary recovery. At the end of diagnosis the app was left paused on SoundHelix Cadence 3 at 4.130s with all three tracks in the native queue.

## Audit of all four existing icon assets

Both root and mobile `expo config --type public --json` checks pass and resolve to the same existing files in `assest/`.

| Existing asset | Dimensions and transparency | Expo purpose and audit result |
| --- | --- | --- |
| `assest/icon.png` | 1024 × 1024; fully opaque | Correctly assigned to `expo.icon` in both configs |
| `assest/adaptive-icon.png` | 1024 × 1024; transparent background and centered padded artwork | Correctly assigned to `expo.android.adaptiveIcon.foregroundImage`; background color `#09090b`; acceptable from asset inspection |
| `assest/favicon.png` | 32 × 32; fully opaque | Correctly assigned to `expo.web.favicon` in both configs |
| `assest/Fav music.png` | 2048 × 2048; transparent | Original source artwork, intentionally not assigned to a runtime Expo field; the purpose-specific derived assets above are configured |

Root config paths begin `./assest/`; mobile config paths begin `../../assest/`. No assets are missing or assigned to incompatible purposes. Actual launcher-mask appearance remains unverified in a native build containing the new icon settings.

## Evidence

Raw artifacts are retained locally in `/tmp/aadat-audio-diagnosis-hs15zbto/`:

- `evidence-summary.json`: combined findings, stream results and audio configurations.
- `live-logcat.txt`: live capture spanning the failed warm session, cold initialization, reproduction and restored streaming checks.
- `before-media-session.txt`, `after-play-3s-media-session.txt`, `after-play-10s-media-session.txt`, and screenshots: original empty-queue failure.
- `stop-reproduction.json`, `repro-before-stop-media-session.txt`, `repro-after-stop-media-session.txt`, `repro-play-after-stop-media-session.txt`: three-track queue → Stop → zero-track queue → failed Play.
- `controlled-events.json`, `all-tracks-device-results.json`, `track-*-playing-audio.txt`: restored playback, position advancement and Android audio state.
- `url-*-headers.txt`, `url-*-result.json`, `url-*-sample.bin`: streaming HTTP checks.
- `installed-apk-sha256.txt`, `installed-package.txt`, `icon-audit.json`: installed APK identity and all four icon assets/configuration assignments.
