Room playback client fixes — 10 November 2026

The bottom mini-player is hidden on Listening rooms; playback controls remain above chat. The top player explicitly labels the empty-room SoundHelix stream as Audio demo. Demo streams no longer enter the bundled-local-audio resolver. Unknown or unavailable songs are never substituted with unrelated demo audio.

The socket client now handles queue:updated, allowing server-confirmed songs to reach the room store. A controller selection starts playback only after confirmation and carries the exact song ID in command_play. Listener suggestions only queue songs. Removed the competing direct audio and player-store queue replacements from song search; the room bridge serializes queue changes with server events. Controllers also start new native queues after server-driven track changes. Errors are visible instead of silently discarded. Disconnect cleanup clears the native queue even when the bridge detaches first.

All four workspace typechecks passed. Full test suite: 1,139 passed, three existing connectivity skips. Regression tests cover demo streaming with the real audio service and a stateful native mock, pause/resume, one queue addition, disconnect cleanup, selected song IDs, controller authority, server queue confirmation, and pending-play cancellation.

A signed ARM64 APK was built locally with Gradle in 42 seconds and installed on CPH2599 with adb install -r, preserving app data. Package/signing identity matches the previous APK. Compiled Hermes retains two registerComponent function definitions. No EAS build, Git command, backend code edit, schema or connection-setting change was made.

Live room/audio acceptance remains unverified. The configured ngrok URL returns HTTP 404 / ERR_NGROK_3200 (endpoint offline), no local backend listens on port 4000, and the phone shows authentication service unavailable. This is separate from passing the client regression tests. Backend/tunnel operation must be restored before genuine room playback can be tested; no server or tunnel was started by this change.
