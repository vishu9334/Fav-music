# Phase 3 — Android device end-to-end checklist

**Plan only. No device case below was executed in this audit. Every checkbox is NOT RUN or BLOCKED.** A unit/JVM/mock/Metro result cannot check a device box. Use `docs/PHASE_3_FEATURE_COMPLETENESS_AUDIT.md` for actual local results and `PHASE_3_BLOCKERS.md` for approval boundaries.

The primary known device is CPH2599; record the actual connected device rather than assuming it is present. Test the exact final `com.favmusic` APK. No EAS/native build, installation, app-data clear or real login is authorized by this checklist. Database/cloud gates stay closed until separately approved. A new APK containing ExpoVideo, orientation and AadatAuthTransport must be approved and verified first.

For every case record: APK/build/hash, device/Android/API/ABI, public flags, test data provenance, timestamp, expected result, actual result, PASS/FAIL/BLOCKED/NOT RUN and sanitized screenshot/video/Logcat reference. Record native audible/visible playback, not merely a Playing label. Use isolated approved test data; preserve personal collection files. No unapproved system-wide clock/network changes, production corruption, uninstall/clear-data or music downloads.

Historical user-confirmed seek is prior evidence only. It does not pre-check any current APK case. Account/cloud tests can write PostgreSQL/Redis and must remain BLOCKED while HOLD persists; guest local journal tests do not grant that permission.

## G — Preconditions and artifact identity

Gate: APK approval; no database permission implied.

- [ ] **G01** — Record APK source/build ID, download link, SHA-256, versionCode/versionName, device model/Android/API/ABI and test date. Expected: All results are tied to this exact APK; the source bundle or an earlier installed APK is insufficient.
- [ ] **G02** — Inspect actual application ID, launch component and signing certificate. Expected: Package is com.favmusic; OAuth certificate registrations match this APK. Do not build/use the excluded com.aadat.music legacy target.
- [ ] **G03** — Verify TrackPlayer, ExpoVideo, ExpoScreenOrientation, SecureStore, RNGoogleSignin and AadatAuthTransport version 1 in the actual runtime. Expected: Required native modules are genuine and callable; absence is a visible fail-closed state, never a polyfill.
- [ ] **G04** — Record public feature flags and endpoint approval status without credentials. Expected: Guest suite has auth/catalog off; account/catalog suites remain blocked until their separate gates pass.
- [ ] **G05** — Preserve existing personal collections before install/upgrade testing; use an authorized isolated test profile/device when possible. Expected: No uninstall, clear-data, destructive corruption or real-user loss without separate approval and backup.
- [ ] **G06** — Start fresh timestamped Logcat capture and screenshots/screen recording for each group. Expected: Evidence is sanitized: no ID/access/refresh tokens, cookies, signed URLs, account PII or connection strings.

## S — Startup, icons and navigation

Gate: Approved APK; guest mode.

- [ ] **S01** — Cold launch, warm resume and force-stop/relaunch; leave Home open at least 60 seconds. Expected: main registers once; no native-null, HostObject, duplicate-runtime, React-hook or startup crash.
- [ ] **S02** — Inspect launcher icon at circle/squircle/rounded masks and splash-to-app transition. Expected: Correct Aadat artwork, safe adaptive padding/background; no clipping or stale stock icon. Web favicon is a separate config check.
- [ ] **S03** — Navigate Home → Search → Library → Warehouse and back, then open player/collections/playlists/discovery/videos/offline. Expected: Correct routes and Android Back behavior, no duplicate player/service initialization.
- [ ] **S04** — Open Profile and Login from Library. Expected: After A1 is fixed, both render the implemented AuthScreen. With HOLD active, show an honest hold/guest view and send no credentials; not the obsolete unreachable stub.
- [ ] **S05** — Navigate between tabs/modals while audio plays, then tap the mini-player and global discovery bar. Expected: One native queue continues, active track/progress stays correct; controls remain accessible.

## A — Audio controls and queue recovery

Gate: Approved APK; original local samples; network music only with source authorization.

- [ ] **A01** — Play each bundled 6-second and 8-second technical audio sample with airplane mode enabled. Expected: Actual audible tones and correct durations; no network required; labels say technical/local sample, not real music.
- [ ] **A02** — Play approved demo/real music with network, then Play/Pause repeatedly through screen and mini-player. Expected: Audible output and native state/UI agree; no duplicate audio or false Playing state.
- [ ] **A03** — Next/Previous through first/middle/last queue positions and after playing more than three seconds. Expected: Next wraps; Previous restarts current after threshold, otherwise selects previous; queue order is retained.
- [ ] **A04** — Seek near start/middle/end; drag, tap and use TalkBack accessibility adjustments. Expected: Audible position, progress/duration and buffer agree; no invalid seek or accidental queue reset.
- [ ] **A05** — Notification Stop → Play, repeated quickly and after a delay. Expected: Queue/index/seek survive; the native queue is not cleared by RemoteStop.
- [ ] **A06** — Use an explicitly approved test harness to reproduce an externally empty native queue, then Play/Next/Previous/Seek. Expected: Correct intended tracks/index recover once; no native fake module, duplicate add or empty-queue silent Play.
- [ ] **A07** — Select another track/playlist rapidly, including reselecting the currently playing item. Expected: Commands serialize, selected queue matches UI; same selection does not unnecessarily rewind.
- [ ] **A08** — Disable network or use an authorized failing source during playback. Expected: Buffering/error is truthful and retryable; no infinite autoplay/error loop and no raw signed URL appears in the UI/logs.

## B — Background, focus and notification

Gate: Approved APK; audio source permitted.

- [ ] **B01** — Background and lock the phone for at least ten minutes and across a track transition. Expected: Audio persists as supported, foreground media notification remains; timestamped audible/progress evidence collected.
- [ ] **B02** — Use lock-screen/notification Play/Pause/Next/Previous/Seek/Stop and return to the app. Expected: Native/UI queue, position and playback state agree; no second player starts.
- [ ] **B03** — Exercise temporary/permanent audio-focus interruption, phone call and other app audio. Expected: Pause/stop/resume matches policy; no surprise resume after video has taken ownership.
- [ ] **B04** — Disconnect wired/Bluetooth audio output and reconnect; test headset media buttons when available. Expected: No crash or overlapping output; interruption and remote-command behavior documented.
- [ ] **B05** — Test the device’s ordinary battery policy, task swipe-away and force-stop separately. Expected: Record OEM behavior. Force-stop is expected to stop the app; do not mislabel that as failed background playback.
- [ ] **B06** — Repeat startup/play/pause after background service attachment and process recreation. Expected: main and headless registration remain safe; document actual restart behavior without promising queue persistence after app-data loss.

## C — Search and categories

Gate: Guest catalog now; real backend cases need catalog gate.

- [ ] **C01** — Search by title, artist, album, multiple terms, mixed case, whitespace and a missing result; clear query. Expected: Correct filtered results and honest empty state; no claim that three demos form a real music catalog.
- [ ] **C02** — Combine seasons and decade filters, then clear each filter and all filters. Expected: Filters intersect and clear correctly; no regional/language category or AI behavior.
- [ ] **C03** — Check 1990/1999, 2000/2010, 2011/2020, 2021/current-year and missing-year fixtures in an authorized test catalog. Expected: Non-overlapping required ranges, missing years in Undated; never invent demo release years.
- [ ] **C04** — With approved real catalog, type/change filters rapidly during slow responses. Expected: Latest search wins, stale responses do not replace it; cursor cannot leak across filters.
- [ ] **C05** — Paginate beyond 20, 50 and 500 records; return to evicted/cached pages and category screens. Expected: No skipped/duplicated identities; bounded UI is explained. A4 must be addressed before claiming complete category browsing.
- [ ] **C06** — Take backend offline with internet otherwise available; restart with cached metadata. Expected: Existing demos remain selectable; cached metadata is honest, unavailable streams fail safely, offline tones still play.

## L — Collections, Warehouse and playlists

Gate: Approved APK; local storage only.

- [ ] **L01** — Like/favourite/bookmark/save the same track independently, then remove each flag. Expected: Independent memberships persist; Warehouse union deduplicates and source labels/counts are correct.
- [ ] **L02** — Archive, hide and restore tracks from Active/Removed/Hidden views. Expected: Catalog/other collections/current playback are not deleted; discovery excludes removed/hidden choices.
- [ ] **L03** — Create/rename/delete playlists; add/remove duplicates and unavailable UUID references; play in saved order. Expected: Durable ordered membership, no duplicate IDs; missing metadata disclosed and IDs preserved until explicit removal.
- [ ] **L04** — Try blank/long names, duplicate names and deterministic suggested-name collisions; test 100-playlist boundary in an isolated fixture. Expected: Editable names and limits enforced without truncating saved collections or silently renaming unrelated playlists.
- [ ] **L05** — Restart process/device after saved edits, including legacy guest documents. Expected: Guest journal paths and account namespaces restore correctly; failed saves never claim success.
- [ ] **L06** — Exercise interrupted/full/corrupt storage only in separately approved disposable local fixtures. Expected: Last valid journal recovers; unreadable data is preserved and mutations fail closed. Never corrupt real user files.
- [ ] **L07** — Browse a large queue/library on the target low-end device while progress updates. Expected: Measure memory/frame behavior; identify PlayerScreen’s unvirtualized Up next cost and agree acceptance limits.

## I — InstaMus and account isolation

Gate: Manual demo path now; authenticated scope tests need auth gate and A2 fix.

- [ ] **I01** — Paste a supported HTTPS Instagram reel with tracking; try malformed URLs, deceptive hosts, userinfo and unsupported paths. Expected: Normalize permitted reel links only; invalid links do not open or persist.
- [ ] **I02** — Save/reload/remove a note, manually search a demo, explicitly link/bookmark it and share its discovery link. Expected: No automatic recognition/extraction claim or unauthorized download; removing a note keeps its bookmark.
- [ ] **I03** — Search a known real catalog title in InstaMus. Expected: Current source intentionally excludes catalog entries. Mark unavailable/partial until A5 is implemented, not PASS for real search.
- [ ] **I04** — After A2 fix, load a private account note/form then expire/logout the account. Expected: Guest view must not retain the old account’s reel, query, pending selection or success message.
- [ ] **I05** — After A2 fix, open a Remove note dialog under an account, switch to guest via session expiry, then confirm. Expected: The stale callback must not delete a guest note with the same reel URL; current audit logic probe FAILS this invariant.
- [ ] **I06** — Attempt the same boundary with delayed save/link/bookmark, shared payload and account switching. Expected: Every deferred action binds to the original scope/version or is cancelled; no cross-account data is copied/deleted.

## H — Sharing and deep links

Gate: Approved APK; no cloud writes.

- [ ] **H01** — Share track, playlist and reel, dismiss/cancel the native sheet, double tap and retry failure. Expected: Only explicit native sharing; coalesced taps; no stream/credential/private local playlist ID in payload.
- [ ] **H02** — Open custom links while app is cold, warm, backgrounded and already showing another shared item. Expected: Correct route/review state; no automatic play/save/login.
- [ ] **H03** — Open malformed/oversized/unknown-version payloads, duplicate IDs and unavailable real UUIDs. Expected: Reject invalid input; explain unavailable tracks; preserve valid references in an explicit local copy.
- [ ] **H04** — Save a shared playlist and reopen it, then change account while a save/review is pending. Expected: Fresh confirmation per payload/scope; no saved-ID or late callback leaks into another account.
- [ ] **H05** — Try Android ACTION_SEND from Instagram and owned HTTPS App Links only if those features are later implemented. Expected: Currently MISSING: record NOT IMPLEMENTED, not a pass. Existing supported path is paste/custom scheme.

## D — Time, mood, season and recent history

Gate: Approved APK; no AI/external recommendation service.

- [ ] **D01** — Record local hour/timezone and displayed Morning/Afternoon/Evening/Night; resume after a real boundary. Expected: 5–12 / 12–17 / 17–21 / 21–5. Automated boundary tests supplement but do not replace current device display evidence.
- [ ] **D02** — Use the global suitable-random button from each major screen and repeatedly tap it. Expected: One choice/queue operation; matching rules apply, no overlapping player setup.
- [ ] **D03** — Select every mood/season/decade combination with matches and with no match. Expected: Explicit filters are never silently escaped; unknown metadata gets graceful empty/fallback messaging.
- [ ] **D04** — Observe recent plays and current-track avoidance over repeat selections, then reduce to a one-track pool. Expected: Avoid repeats when possible; explain unavoidable repeats instead of promising uniqueness.
- [ ] **D05** — Pause/resume, rapidly change selections, restart and restore history. Expected: Only confirmed native plays enter bounded device history; queue selection alone is not recorded.
- [ ] **D06** — Archive/hide all matching tracks, then restore one and retry discovery. Expected: No removed/hidden track is selected automatically; loaded-catalog sampling is disclosed, not global catalog randomness.

## V — Native video and audio/video handoff

Gate: Approved APK with ExpoVideo/ScreenOrientation; local clips; remote cases need content gate.

- [ ] **V01** — Play both original bundled MP4 clips offline and compare title/duration/poster with actual output. Expected: Visible moving patterns and audible tones; source is labelled technical sample.
- [ ] **V02** — Previous/Play/Pause/Next, seek/progress/buffer/EOF and rapid repeated controls. Expected: Shared Kobra controls behave consistently with audio; appropriate queue wrap/restart behavior, no duplicate engine.
- [ ] **V03** — Swipe/tap the poster carousel repeatedly while paused/playing/loading. Expected: Correct selected item and autoplay intent; no stale-load autoplay or expanding decoder count.
- [ ] **V04** — Enter/exit landscape fullscreen, rotate, Android Back, background, refocus and rapid repeated toggles. Expected: Orientation policy and normal layout restore; only one video surface/audio owner; errors remain recoverable.
- [ ] **V05** — Start audio then video; resume audio from notification during video and reverse direction. Expected: Previous owner is paused/muted and confirmed before new audio; queue/index/seek remain available.
- [ ] **V06** — Leave the video route, interrupt loading and reopen it repeatedly. Expected: Video pauses/releases; no audio resume without intent, orphan timer/player, memory leak or late callback.
- [ ] **V07** — With approved real video URL, test real decode, 206/ranges, network loss, buffering, HTTP error, expiry and retry. Expected: No unverified URL or mocked adapter is counted as playback evidence. Current retry reload starts at zero; confirm/define desired resume policy.
- [ ] **V08** — Open videos through real catalog track actions and verify multi-item discovery requirements. Expected: Current catalog route is single-item; original two-sample carousel does not prove real catalog carousel completion.

## R — Real catalog, S3 and licensing

Gate: Separate catalog/content/endpoint approvals; no invented remote URLs.

- [ ] **R01** — Verify approved HTTPS GraphQL endpoint and licensed metadata from actual backend, including pagination/search. Expected: Genuine IDs/artist/album/year/attribution; no test fixture represented as production.
- [ ] **R02** — Inspect catalog metadata vs media leases and public legacy Track fields. Expected: Private licence reference stays server-side; explicitly review legacy relative-key exposure; signed URLs are not stored in library/cache JSON or shared links.
- [ ] **R03** — Attempt draft, non-public, unverified, expired and absent media using an approved isolated test dataset. Expected: Deny before signing; no client-supplied storage key can authorize an object.
- [ ] **R04** — Verify signed GET delivery, HTTPS final origin, MIME/codecs, byte ranges/seek, actual object and credential permissions. Expected: Real successful media output required; S3 signing alone is insufficient.
- [ ] **R05** — Wait for real URL expiry and simulate permitted credential expiry/network reconnect in a controlled environment. Expected: One bounded fresh authorization; audio selection/seek preserved; no retry loop, late autoplay after Pause, or takeover from video.
- [ ] **R06** — Cause thumbnail expiry/missing art and unavailable metadata; revisit cached pages after eviction. Expected: Placeholder and bounded refresh; audio is not blocked by artwork, signed query strings are unchanged.
- [ ] **R07** — Log into an account whose saved UUID metadata is absent from the local cache. Expected: A6 must restore metadata after scope activation without losing IDs; current source has no dedicated scope-change trigger.
- [ ] **R08** — Test API HTTPS-to-HTTP and cross-origin redirects on a controlled approved endpoint. Expected: Credential auth rejects redirects; public catalog final-origin policy must be verified/remediated (A7). No uncontrolled redirect target or live credential experiment.

## U — Google identity, session and local account collections

Gate: A1/A2 fixes, approved secure native APK/OAuth/HTTPS and explicit PostgreSQL/Redis write permission.

- [ ] **U01** — With HOLD active, open login/profile and attempt sign-in, restore and revocation retry. Expected: No credential transmission or fake success; preserve guest access and pending secure revocation.
- [ ] **U02** — Perform a real Google sign-in with a newly approved test account and an existing account. Expected: Backend verifies ID token, creates/loads correct account, rejects unverified/wrong-audience identity; profile uses server identity only.
- [ ] **U03** — Cancel Google selection, remove Play Services availability, go offline and retry rate-limit/server failures. Expected: Clear cancellation/offline/provider/configuration states; no fake authenticated profile or lost guest data.
- [ ] **U04** — Restart app/device, background/foreground, wait across 30-second early refresh and access expiry. Expected: Refresh token is Keystore-backed, access token memory-only, one rotation; me/account identity remains bound.
- [ ] **U05** — Try invalid/revoked/expired/replayed access/refresh tokens and suspended/deactivated accounts in an approved test environment. Expected: Server denies access, revokes appropriately, UI returns to safe guest state; no client-provided userId can impersonate another owner.
- [ ] **U06** — Logout online/offline/under server HOLD; interrupt secure storage and an in-flight login/request only in disposable fixtures. Expected: No late profile resurrection; durable revocation intent retained; local storage failure is not falsely called complete logout.
- [ ] **U07** — Create distinct favourites/playlists/Warehouse under guest, account A and account B, then switch/restart. Expected: Namespaces remain isolated; old dialogs/routes/actions cannot mutate another scope; original guest files restore unchanged.
- [ ] **U08** — Preview/cancel/confirm guest collection copy with conflicts, missing UUIDs and playlist limit. Expected: Preview writes nothing; explicit one-time account copy keeps both playlists/account Warehouse choices; guest data remains unchanged.
- [ ] **U09** — Interrupt copy write, restart, retry fresh preview, remove copied content and attempt repeated import. Expected: One durable receipt with account data; last valid snapshot recovers; repeated import cannot resurrect removals.
- [ ] **U10** — Inspect diagnostics/local files safely, without publishing personal data. Expected: No Google/client secret or access credential in UI/plain JSON/logs; account collection files are app-private metadata, not claimed encrypted separately.

## Y — Cloud synchronization and broader missing features

Gate: NOT IMPLEMENTED; explicit future implementation/schema/resource/write approval required.

- [ ] **Y01** — After implementation, sync first import and later edits across two real devices and two owners. Expected: Owner-derived access, server revision/CAS and committed receipt; do not relabel local guest copy as cloud sync.
- [ ] **Y02** — Exercise duplicate/reordered operations, rename/delete races, tombstones, offline outbox, lost acknowledgements and logout/account switch. Expected: Idempotent recovery, no lost edits or resurrected deletions, no account-A operations replayed under B.
- [ ] **Y03** — If room/chat scope is approved, test host/controller permissions, disconnect fallback, 15-second takeover and 5-second cleanup. Expected: Actual sockets/atomic authority required; constants, Prisma models and empty room lists are not implementation.
- [ ] **Y04** — If persistent chat scope is approved, test ephemeral/persistent consent and cleanup with isolated records. Expected: Explicit consent and retention policy, no ephemeral PostgreSQL writes. Current mobile/backend room/chat flows are missing.
- [ ] **Y05** — If InstaMus automation is approved, test licensed authorized recognition, >0.85 matching, bookmark and fallback states. Expected: No scraping/extraction/recognition success assumed from current manual note UI; unauthorized downloads remain excluded.

## P — Low-end performance and final acceptance

Gate: Approved final APK; agreed device budget; no production data destruction.

- [ ] **P01** — Measure cold/warm startup, long-list scrolling/search, queue rendering, seek response and playback stutter under constrained memory. Expected: Record device/refresh-rate/memory/thermal context and agreed thresholds; test windows alone do not prove performance.
- [ ] **P02** — Repeat 20+ audio/video/fullscreen/navigation cycles and observe memory/decoder/thread growth. Expected: No persistent growth, ANR, crash or simultaneous audio; collect native memory/frame evidence.
- [ ] **P03** — Test large font, TalkBack, reduced motion, keyboard, notches/gestures, small screens and portrait/landscape. Expected: Controls remain labelled, reachable and adequately sized; compare screenshots with approved Kobra-inspired visual reference.
- [ ] **P04** — Review sanitized Logcat and recordings for each case and rerun any failed path after a fix. Expected: Each PASS has actual APK/device evidence; blocked/missing/not-run cases remain explicit.
- [ ] **P05** — Approve final release only after mandatory defects, source scope and gated E2E cases are closed. Expected: A passing mocked/unit/Metro/Hermes suite is never sufficient production verification.

