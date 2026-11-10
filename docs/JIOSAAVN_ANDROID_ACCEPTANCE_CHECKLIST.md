# JioSaavn development — Android acceptance gate

6 November 2026. **NOT EXECUTED.** The earlier recorded device check found CPH2599 connected and com.favmusic absent; no fresh device check was made during the Bycom switch. No build or installation is approved by the provider-switch approval.

Before build: review the [Bycom bounded stream PASS evidence](JIOSAAVN_BYCOM_DEVELOPMENT_SWITCH.md) for three real songs at 96/160/320 kbps; V3 404 failures are historical. Reconfirm authorized source access for the acceptance run; complete separately approved account/schema/session/HTTPS prerequisites; verify source identity-journal persistence. Review the APK build/native module/signing scope and obtain explicit approval. Never enable fake auth or a guest bypass to make this checklist appear successful.

After approved build/install:

- [ ] Verify package/signature/icons and genuine RNGoogleSignin, SecureStore, AadatAuthTransport/AadatShare, TrackPlayer and ExpoVideo native modules.
- [ ] Cold start: synchronous main registration, no dual AppRegistry/startup failure; capture fresh Logcat.
- [ ] Real Google login, cancellation/offline/error/expiry/refresh/logout/restore; no credentials on HTTP/redirects; no session copied into React state/logs.
- [ ] Real provider search, album, artist and provider-playlist browsing; compare visible metadata to actual responses and verify paging beyond ten items. Video/recognition limitations must be explained accurately.
- [ ] Browse full returned result windows, back/forward, rapid query/filter changes, empty/missing data, network loss/retry; stale responses must not replace the current query/account.
- [ ] Play a verified working source; verify audible output, loading/buffering/error states and no misleading success for 404 sources.
- [ ] Play/Pause, Next/Previous, seek before/after pause/stop, native empty-queue recovery, notification/media buttons and background/lock-screen playback.
- [ ] Forced URL renewal during playback preserves selected ID/index/seek and does not restart after pause, logout or video ownership.
- [ ] Like/favourite/bookmark; create/rename playlist, add/remove/reorder where supported; restart and verify IDs persist; unavailable references stay preserved.
- [ ] Warehouse save/archive/hide/restore; no catalog/global deletion and no unauthorized media download.
- [ ] Decade categories use supplied years; mood/time/season mixes show keyword-rule basis; empty categories and recent-repeat avoidance work honestly.
- [ ] InstaMus real title search/manual linking/bookmarking; no fabricated automatic recognition or Instagram extraction.
- [ ] Share/open song and playlist IDs; review before saving/playing; native Instagram text share reception; stale dialogs/account-switch callbacks cannot touch another owner.
- [ ] Account A → logout/expiry → B: no old collections/history/pending work/player queue crosses owners. Legacy files remain quarantined until explicit transfer/disposal.
- [ ] Cloud sync only after approved backend writes: offline edits, retries, uncertain acknowledgement, conflicts/removals, identity restart and two-device resolution without loss.
- [ ] Native video with separately authorized real media: seek/fullscreen/orientation/carousel/audio exclusion; do not label AAC audio/preview links as video.
- [ ] Measure startup, memory, frame rate, search responsiveness, decoder/buffering and battery behavior on target low-end Android hardware.

Record source IDs, build/APK ID, signing/config hashes, timings, screenshots, native events and sanitized Logcat per case. No source/unit/Metro PASS substitutes for these device results.
