/**
 * Listening Room & Dynamic Controller Constants
 * Strictly enforcing product specifications and approved timing intervals.
 */

/** Maximum room capacity including the host */
export const MAX_ROOM_PARTICIPANTS = 10;

/** Duration in milliseconds that the takeover prompt is active before timing out */
export const TAKEOVER_PROMPT_TIMEOUT_MS = 15_000;

/** Duration in milliseconds of cleanup countdown after a failed takeover before clearing session state */
export const FAILED_TAKEOVER_CLEANUP_INTERVAL_MS = 5_000;

/** Client heartbeat interval to maintain active presence in Redis */
export const ROOM_HEARTBEAT_INTERVAL_MS = 3_000;

/** Presence TTL threshold in Redis: participant marked departed if no heartbeat */
export const ROOM_HEARTBEAT_TIMEOUT_MS = 9_000;

/** Threshold in seconds for hard seek vs playback rate micro-adjustment */
export const SYNC_DRIFT_HARD_SEEK_THRESHOLD_SEC = 0.25;

/** Threshold in seconds for acceptable clock drift (below which no adjustment is made) */
export const SYNC_DRIFT_TOLERANCE_THRESHOLD_SEC = 0.05;

/** Micro-adjustment playback rates for smooth drift correction */
export const SYNC_RATE_SLIGHT_DECEL = 0.98;
export const SYNC_RATE_SLIGHT_ACCEL = 1.02;
export const SYNC_RATE_NORMAL = 1.0;

