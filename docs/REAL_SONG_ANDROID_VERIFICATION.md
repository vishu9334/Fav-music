# Real-song Android verification

7 November 2026. **Build, installation, main startup, real search and native audio decoding PASS. Device acceptance remains partial; user redirected work to UI/UX remediation.**

The user approved exactly one `preview-real-songs` EAS Android APK build, installation on CPH2599, and physical runtime checks. No additional build, account/API relaxation, migration, S3 or cloud configuration changes are authorized.

Build ID: `2c1c8465-9aec-46fc-abe2-4867c3174682`.
[Build page](https://expo.dev/accounts/vishalkumarptn32/projects/aadat-music/builds/2c1c8465-9aec-46fc-abe2-4867c3174682).

[Download the built APK](https://expo.dev/artifacts/eas/UVVaVNJadXtjyQSTrFWqss7GlDgmim5r5RTgdZueC-c.apk).

APK size: **74,229,108 bytes**. SHA-256: `95804c382b74d04775eb730530c63a7f7065c6f10e51b4b6f27f621378f8d199`.

Submission used EAS_NO_VCS=1, explicit absolute EAS_PROJECT_ROOT, the reviewed archive, existing remote signing credentials, and public profile flags only. A local exclusive-create marker prevents a second submission from this workflow.

Fresh pre-build checks passed: connected/authorized CPH2599, 100% battery, real HTTPS metadata and bounded returned stream bodies for Believer, Levitating and Enemy, protected account API denial. The diagnostic key had 114 minutes remaining before submission. The phone was unlocked; its media volume was already above zero and was not changed.

| Acceptance item | Current status |
|---|---|
| Approved build | PASS: FINISHED, exactly one submission; existing signing credentials |
| APK native modules / Hermes / package / secret inspection | PASS: TrackPlayer module/service, secure HTTP module, Reanimated/SVG/gesture handler, arm64 libraries, Hermes bundle and approved diagnostic endpoint; package com.favmusic; signature verified; one registerComponent definition; zero private-key/secret-path hits |
| Install and main startup | PASS after reconnection: install -r Success, cold launch 445 ms, PID 6374, fresh Running "main" |
| Real song search | PASS on APK: real Believer and Levitating results; manual additional searches observed |
| Believer, Levitating, Enemy audible | PARTIAL: native Believer/Levitating media states and AAC decoding observed. Enemy and per-track speaker confirmation not completed before task changed |
| Play/Pause, Next/Previous, Seek | User confirmed real-song playback controls working. Controlled ADB Pause verified at 68.497 s; complete isolated per-control evidence not captured |
| Background and notification controls | Native background state PASS across 24.6 s and Pause response. Media notification exists with Previous/Play/Next/Stop actions; actual notification-button taps not independently verified |
| Playlists, Favourites, Music Warehouse | BLOCKED in approved diagnostic: require real-account APIs; no account bypass or local impersonation permitted |
| Fresh Logcat | PASS: main registration, AAC decoder, AudioTrack start/pause, no critical runtime exception detected |

The standalone diagnostic intentionally provides only scoped catalog search and existing native playback controls. The previously approved scope leaves real personal collections inaccessible without a real approved account. This verification must report that boundary rather than simulate success.

## Device verification evidence and task transition

Initial installation was blocked by USB disconnection. The user reconnected the phone, the same APK installed successfully with `-r`, and a cold launch registered `main`. No uninstall/data clear or second build occurred.

An initial coordinate-based selection reached a Believer acoustic cover; that observation is not counted as verification of the named Imagine Dragons version. Later native state showed Believer and Levitating; the latter followed an explicit accessibility-based selection of the Dua Lipa result. Unrecorded track/search/pause changes were observed while the user was manually testing, so they are not attributed to automated actions.

For controlled background verification, Levitating stayed PLAYING from 02:34:19.812 to 02:34:44.378 UTC with the app backgrounded. A standard Android media Pause command then produced PAUSED at 68,497 ms. The app remained alive with AAC decoding and no critical exception detected. Speaker output is not inferred from these states.

The user then stated **“The real-song Android playback controls are working”** and explicitly redirected the task to UI/UX remediation with **no EAS builds**. Further device actions stopped; Logcat capture processes were stopped and app-specific logs retained. The new UI work does not update this APK.

Evidence: [installed APK inspection](evidence/real-song-android/apk-inspection.json), [cold launch](evidence/real-song-android/launch.json), [Levitating native state](evidence/real-song-android/levitating-playing-media.json), [background state](evidence/real-song-android/background-after-media.json), [background pause](evidence/real-song-android/background-paused-media.json), [fresh Logcat](evidence/real-song-android/app-logcat.log). The previous "not started" note in preinstall-verification.json describes the initial disconnected attempt only; install.log contains the successful retry after reconnection.
