# Phase 2 Batch 3 — audit before implementation

Batch 1–2 already provide the native audio service, serialized queue selection, playlist/collection persistence, Warehouse state, seasonal demo tags, text search and sharing. Reuse these. No listening-history store or time/mood recommendation engine exists in mobile source. The three demo tracks have no verified release years.

Implement manually curated demo mood/time tags and deterministic matching, with randomness only for selection among equally suitable candidates. Detect the phone's local time: Morning 05:00–11:59, Afternoon 12:00–16:59, Evening 17:00–20:59, Night 21:00–04:59. Refresh in the foreground and when the app resumes; recheck on a random-play request. Seasons are manually selected because geography/hemisphere cannot be inferred from the device clock alone.

Use the requested categories: 90s (1990–1999), 2000–2010 inclusive, 2011–2020 inclusive, 2021 onwards, plus Undated for missing/invalid years. Preserve old decade filter values as compatible legacy filters, but show the requested ranges in current UI. Do not fabricate release years.

A global discovery action will use the existing player store's playQueue command. Explicit mood/season/year filters remain strict; local time ranks suitable candidates. Avoid current/recent tracks when alternatives exist; use least-recent choices after the small demo pool is exhausted. Removed/hidden Warehouse songs are excluded from automatic discovery, while direct catalog playback remains available.

Listening history is a separate bounded local journal. Observe confirmed native playing state and track identity, not selected UI tracks or every progress tick. Do not rewrite Batch 1–2 library documents. Preserve unavailable history IDs, and fail safely on unreadable history. No historical plays will be invented for sessions before this feature existed.

Keep native playback service, player store, app icons, backend, native config and Metro singleton setup unchanged. Run strict TypeScript, regression tests, production Metro and Hermes checks. Physical-device acceptance remains pending; implement Batch 3 only and stop.
