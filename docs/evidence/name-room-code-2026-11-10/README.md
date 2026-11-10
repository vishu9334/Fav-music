Name-based six-character room IDs — 10 November 2026

New rooms use the first two ASCII letters of the host’s first and last display-name words, followed by two digits: Vishal Kumar -> VIKU42. Digits include leading zeroes. One-word names use their first four letters, short fragments are padded with X, Latin diacritics are folded, and names without ASCII letters use ROOM. IDs remain stable if a profile name changes later.

The existing Room primary key is TEXT. The repository supplies the new six-character ID directly, so no schema change, migration, existing-ID rewrite or database connection change was needed. It reads the verified host’s server profile, skips occupied suffixes, and retries database primary-key collisions. Exactly two digits provide 100 codes per four-letter prefix across all retained rooms; exhausting these returns a clear conflict without overwriting rooms or exceeding six characters.

Join accepts uppercase or lowercase codes, trims surrounding whitespace and preserves legacy UUID entry. Socket initial sync confirms the canonical ID, and the backend joins the canonical room channel so chat and playback stay on the same channel. Existing room IDs remain unchanged.

The room header shows the selectable code. The share screen presents the room code and private-room passcode without requiring usernames or account IDs. Discovery offers Join with room code and no longer shows the large own-account-ID card. Existing server invitation support remains available to older clients.

Validation: all four workspace typechecks passed; 1,158 tests passed with three existing connectivity skips; backend TypeScript build passed; signed local ARM64 Gradle build passed in 26 seconds. Package com.favmusic and the previous certificate are retained. Hermes still has two registerComponent definitions. No EAS build or Git command was run.

Installed via adb install -r on CPH2599. Created a private session-only room named Room code check with actual ID VIKU44. Confirmed the header and share view show VIKU44 without asking for a username. Left and successfully rejoined using lowercase viku44. No chat messages or invitations were sent. The private verification room remains available; no existing room was modified or deleted. The updated local-account API and previously approved ngrok tunnel are running.
