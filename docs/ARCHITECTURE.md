# Aadat Music Architecture Blueprint

Status: **Gate 1 Completed — Awaiting Gate 2 Approval**

## 1. Dynamic Controller & Room Authority Separation
- `hostUserId`: The creator/owner of the room. Retains permanent administrative powers (invites, kick, room settings).
- `originalControllerId`: The first participant granted playback control upon session start. Fallback destination if the active controller leaves while multiple listeners remain and the original controller is connected.
- `activeControllerId`: The sole user with authoritative command over playback (play, pause, seek, skip) without requesting permission. Atomically managed in Redis via CAS / Lua script.

## 2. Dynamic Controller Transfer & Takeover Lifecycle
1. **Departure Detection**: When `activeControllerId` disconnects:
   - If exactly 1 participant remains: Auto-transfers control to the sole participant immediately.
   - If >1 participants remain AND `originalControllerId` is connected: Reverts control to `originalControllerId` immediately.
   - If >1 participants remain AND `originalControllerId` is absent: Server broadcasts `control:takeover_prompt_started`.
2. **Takeover Popup Window**:
   - The takeover prompt is active for **15.0 seconds** (`TAKEOVER_PROMPT_TIMEOUT_MS = 15_000`).
   - First valid participant claim atomically captures control (via Redis `SET NX`).
3. **Timeout & Cleanup Countdown**:
   - If 15.0 seconds expire with no claim:
     - Server **immediately pauses playback** and broadcasts `player:playback_paused` (reason: `TAKEOVER_TIMEOUT`).
     - Server starts a strict **5.0-second cleanup countdown** (`FAILED_TAKEOVER_CLEANUP_INTERVAL_MS = 5_000`).
     - At the end of the 5.0 seconds, the transient playback session in Redis is cleared.
     - Ephemeral chat in Redis is pruned.
     - Persistent chat messages (consented users) and room definitions in PostgreSQL remain intact.

## 3. Explicit Chat Consent Rules & Persistence
- **User Preference**: `ChatRetentionPreference` (`EPHEMERAL_SESSION_ONLY` by default, or `PERSISTENT_HISTORY`).
- **Room Policy**: `RoomChatPolicy` (`EPHEMERAL_SESSION_ONLY` by default, or `PERSISTENT_LOG`).
- **Consent Protocol**:
  - `EPHEMERAL_SESSION_ONLY` Room: All messages are buffered in Redis with a TTL; **NEVER** written to PostgreSQL.
  - `PERSISTENT_LOG` Room: If a joining user has `EPHEMERAL_SESSION_ONLY` preference, the client displays an explicit consent prompt.
  - If consented: Messages written to `PersistentRoomMessage` in PostgreSQL.
  - If declined: Messages are marked ephemeral in Redis only and purged upon session conclusion.

## 4. Media Storage & InstaMus Ingestion Fallback
- **S3 Object Keys**: `Track.audioKey`, `Track.videoKey`, and `Track.artworkKey` store relative S3 keys (`tracks/audio/uuid.mp3`). Short-lived presigned URLs are generated on demand at the API presentation layer and never stored in the database.
- **InstaMus Pipeline**:
  - Statuses: `PENDING`, `MATCHED`, `UNMATCHED`, `EXTRACTION_FAILED`.
  - When confident match (>0.85): Status `MATCHED`, linked to canonical `Track`, auto-bookmarked.
  - When stream fails, copyright-muted, or unmatched: Status `UNMATCHED` / `EXTRACTION_FAILED`. Emits fallback metadata (scraped title/caption keywords) to client to immediately open the manual search modal.

