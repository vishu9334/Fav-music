# Phase 2 Batch 1 — audit before implementation

The mobile app currently opens directly into the player. Existing working pieces are the class-based AudioPlaybackService, serialized queue recovery, remote/background playback commands, native-state Zustand synchronization, artwork carousel, tap-to-seek Scrubber and KobraPlaybackControls. These will be reused. Existing playback/service regressions are the preservation baseline.

Incomplete: the player has no dismiss/navigation controls, collection actions or visible queue. Startup mounts AuthSessionLifecycle and exposes the account shortcut even though authentication is on HOLD. Login/profile routes mount the auth feature. Batch 1 will disconnect these entry points without changing the auth implementation or making backend calls.

Missing: Home/Search/Library/Warehouse navigation; demo search; decade/season browsing; separate Likes/Favourites/Bookmarks; local Warehouse; playlist create/add/remove/delete and durable local library state. No existing library persistence or equivalent store is available to reuse.

The old `src/index.ts` MobilePlaybackCoordinator is a foundation skeleton, not the app's active audio service. Batch 1 does not wire it into playback. Collaborative room/chat screens, a real backend catalog, cloud library sync and audio downloads are outside this local batch; existing contracts/backend modules do not by themselves constitute implemented mobile screens.

The catalog consists of exactly three existing SoundHelix demo tracks. URLs, playback metadata and audio service implementation will be preserved. No release years are provided, so decades must expose an honest undated demo collection and empty dated categories. Seasonal demo mixes are local curation, not verified release metadata. No regional/language or AI categories are included.

Design references found: the existing dark palette, rounded artwork carousel and glass playback control component, with its linked [Kobra video reference](https://kobra.systems/components/video). That reference describes liquid/blurred glass controls; use the existing native implementation, not web DOM/CSS packages. No separate local Kobra mockup files were found.

Persistence: expo-file-system 18.0.12 is already installed through Expo. Declare it explicitly for mobile and use SDK-52's installed API. A local document repository will persist only catalog IDs, flags and playlists using alternating revisioned files; no new native package or permission is needed. No audio downloads are implied.

Boundaries: no server/database changes, Git commands, EAS/native builds, icon/config changes, real-catalog claims or authentication. Validate TypeScript, regression tests and a production Metro/Hermes export. Device rendering/performance and listening checks require an authorized installed native app and are reported separately from local verification.
