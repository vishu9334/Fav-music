# Aadat Music — Unified UI/UX Master Specification

> **Document Type:** Master Design System, Visual Blueprint & Feature Interaction Guide  
> **Target Audience:** Design engineers, mobile client developers, and AI agents (Codex / Antigravity)  
> **Status:** Authoritative Local Specification (Aligned with Monorepo Source & Kobra Design References)  
> **Last Updated:** November 2026  

---

## 1. Visual Foundation & Clean UI Design System

Aadat Music implements an Android-first, dark-palette, glassmorphic design system. The visual identity fuses deep obsidian backgrounds with ethereal lavender accents and translucent frosted glass media transport controls adapted natively from Kobra references.

### 1.1 Color Palette & Semantic Tokens

All UI components and screens source their tokens exclusively from [`apps/mobile/src/design/theme.ts`](file:///Users/magicmac/Library/CloudStorage/GoogleDrive-vishalkumarptn32@gmail.com/My%20Drive/Aadat-music/apps/mobile/src/design/theme.ts).

```
#09090B  ██  Background (Obsidian Black)
#17151D  ██  Panel / Card Background
#211D2C  ██  Raised Surface / Selected Row
#393241  ██  Border / Divider Line
#392846  ██  Dark Accent / Orbit Ring
#D8B4FE  ██  Primary Accent (Lavender Glow)
#FAF7FF  ██  Primary Text (Pure Tint)
#BDB4C8  ██  Muted Text (Subtitle / Metadata)
#8E839F  ██  Tertiary Text (Attribution / Labels)
#352332  ██  Notice / Error Background
#F3CEDD  ██  Notice / Error Text
```

| Token | Value | Role & Usage | Contrast vs `#09090B` |
| :--- | :--- | :--- | :--- |
| `colors.bg` | `#09090B` | Root application background for all screens and sheets. | Base |
| `colors.panel` | `#17151D` | Surface for cards, list tiles, filter chips, and text inputs. | 1.15:1 (Subtle elevation) |
| `colors.raised` | `#211D2C` | Active row highlight, selected playlist item, icon containers. | 1.25:1 |
| `colors.line` | `#393241` | Structural borders (1px) around cards, search bars, and dividers. | 1.8:1 |
| `colors.darkAccent` | `#392846` | Orbit background rings, active tab icon pill background. | 1.6:1 |
| `colors.accent` | `#D8B4FE` | Primary CTA buttons, active tab indicators, timeline scrubbers. | **12.4:1** (WCAG AAA) |
| `colors.text` | `#FAF7FF` | High-emphasis headings, track titles, and primary action text. | **18.7:1** (WCAG AAA) |
| `colors.muted` | `#BDB4C8` | Subtitles, artist names, secondary metadata, inactive tab icons. | **9.97:1** (WCAG AAA) |
| `colors.glass` | `rgba(26,23,33,0.76)` | Base translucent fill for floating glass cards and sheet surfaces. | Translucent elevation |
| `colors.highlight`| `rgba(255,255,255,0.25)`| 1px top specular specular rim on cards and secondary buttons. | Highlight reflex |
| `bubble.base` | `rgba(200,194,215,0.13)`| Background for standard circular media controls (Previous / Next).| Glass bubble |
| `bubble.primary`| `rgba(235,229,247,0.18)`| Background for the primary central Play/Pause media control. | Enhanced bubble |
| `notice.bg` | `#352332` | Alert and notice container background. | Notice box |
| `notice.text` | `#F3CEDD` | Notice text color ensuring high legibility during playback errors. | **11.2:1** (WCAG AAA) |

---

### 1.2 Typography Hierarchy & Layout Spacing

Typography is clean, modern, and strictly hierarchical to maintain effortless readability over dark media backgrounds.

```
Find your rhythm.           [Title: 30pt / 700 / -0.7 spacing]
THROUGH THE DECADES         [Eyebrow: 10pt / 700 / +2.0 spacing]
Let the world slow down.    [Hero Title: 32pt / 700 / -1.0 spacing]
Now Playing · Catalog       [Context Eyebrow: 10pt / 600 / +1.7 spacing]
Levitating                  [Player Title: 28pt / 700 / -0.5 spacing]
Dua Lipa                    [Subtitle: 15pt / 400 / Normal]
03:24                       [Tabular Monospace Numerals]
```

* **Spatial Spacing:**
  * `spacing.xs`: `4px` — micro margins between inline icons and text.
  * `spacing.sm`: `8px` — gap between filter chips, inline action buttons.
  * `spacing.md`: `12px` — stack gap in cards, search bar internal padding.
  * `spacing.lg`: `16px` — card internal padding, button horizontal inset.
  * `spacing.page`: `20px` — standard screen horizontal padding.
  * `spacing.xl`: `24px` — section headers, modal sheet padding.
  * `spacing.section`: `32px` — separation between content modules.

* **Corner Radii (`radius`):**
  * `radius.small`: `12px` — badges, compact chips.
  * `radius.card`: `24px` — content cards, collection tiles, text inputs.
  * `radius.large`: `28px` — hero banners, modal sheets, full artwork framing.
  * `radius.pill`: `999px` — interactive buttons, Kobra media control bubbles.

---

### 1.3 Native Kobra Glass & Transport Architecture

Media controls draw direct inspiration from Kobra translucent design patterns ([Kobra Video](https://kobra.systems/components/video), [Kobra Morphing Icons](https://kobra.systems/components/morphing-icons)).

```
┌───────────────────────────────────────────────────────────────┐
│                    Kobra Glass Transport                      │
│                                                               │
│       ┌──────────┐         ┌──────────┐         ┌──────────┐  │
│       │   ⏮    │         │    ⏵     │         │   ⏭    │  │
│       │ Previous │         │Play/Pause│         │   Next   │  │
│       └──────────┘         └──────────┘         └──────────┘  │
│         (48x48)              (64x64)              (48x48)     │
│       glass bubble        primary bubble       glass bubble   │
└───────────────────────────────────────────────────────────────┘
```

1. **Circular Translucent Bubbles:**
   * Secondary controls (Skip Back, Skip Forward) are sized at `48×48px` (`borderRadius: 24`).
   * Primary center control (Play/Pause) is enlarged to `64×64px` (`borderRadius: 32`) with an accented border (`rgba(255, 255, 255, 0.42)`).
   * Bubbles feature a subtle specular lens rim that reflects light from the underlying artwork.

2. **Morphing SVG Play/Pause:**
   * Uses Reanimated on the UI thread to smoothly interpolate two equal-topology SVG paths: a Play triangle morphing into two Pause vertical bars.
   * Motion timing: Spring physics with `damping: 20` and `stiffness: 220`. On button press, scales dynamically down to `0.93` and springs back on release.

3. **Accessibility & Reduced Motion:**
   * `useReducedMotion`: Automatically respects the Android system-level reduced motion accessibility setting.
   * When enabled, spring transforms and path morphs are replaced with instantaneous crisp state transitions.

---

## 2. Global Navigation & Application Architecture

Aadat Music follows an Android-first single-activity model powered by Expo Router v4.

```
                             ┌─────────────────┐
                             │   Index Entry   │
                             │ (apps/mobile/)  │
                             └────────┬────────┘
                                      │
               ┌──────────────────────┴──────────────────────┐
               ▼                                             ▼
     ┌───────────────────┐                         ┌───────────────────┐
     │  (tabs) Shell     │                         │ Fullscreen Routes │
     ├───────────────────┤                         ├───────────────────┤
     │ • Home            │                         │ • /player         │
     │ • Search          │                         │ • /videos         │
     │ • Library         │                         │ • /instamus       │
     │ • Warehouse       │                         │ • /discovery      │
     └─────────┬─────────┘                         │ • /collection     │
               │                                   │ • /playlist       │
               ▼                                   │ • /history        │
     ┌───────────────────┐                         │ • /profile        │
     │ Floating MiniPlay │                         │ • /shared         │
     └───────────────────┘                         └───────────────────┘
```

* **Persistent Tab Bar:** Fixed bottom glass bar hosting the 4 core sections:
  1. `Home` (Dashboard, Hero, Discovery, Decades, Seasons, Loaded Music)
  2. `Search` (Catalog Query, Filtering, Provider Explorer)
  3. `Library` (Playlists, Likes, Favourites, Bookmarks)
  4. `Warehouse` (Account music aggregation, Active / Removed / Hidden status)
* **Floating Mini-Player Dock:**
  * Sits immediately above the bottom tabs.
  * Displays a `42×42px` rounded artwork thumbnail, track title, artist, morphing Play/Pause button, and Next button.
  * Tapping the mini-player body opens the fullscreen `/player` modal route with shared-element fluid motion.

---

## 3. Feature-by-Feature Visual Design & User Work Paths

---

### Feature 1: Home Dashboard (`/app/(tabs)/index.tsx`)

#### How it Looks Like
* **Header & Notice:**
  * Clean, distraction-free page header: *"Find your rhythm."* with subtitle *"Discover loaded music. A space that’s yours."*
  * Subtle `CatalogNotice` indicating stream provider state.
* **Glass Hero Banner:**
  * Elevated `GlassSurface` container with curved corner radius `28px`.
  * Decorative background orbit ring in `colors.darkAccent` (`#392846`).
  * Eyebrow tag: `YOUR MUSIC` in glowing lavender.
  * Title: *"Let the world slow down."* (32pt, bold, -1px letter-spacing).
  * Primary lavender CTA pill button: *"Play available music"*.
* **Feature Discovery Grid (2×3 layout):**
  * Six glass cards with high-contrast Lucide icons:
    1. *Your moment* (Compass icon) → `/discovery`
    2. *Music videos* (Video icon) → `/videos`
    3. *InstaMus* (Instagram icon) → `/instamus`
    4. *Explore catalog* (Disc3 icon) → `/provider-browse`
    5. *Listening history* (Clock3 icon) → `/history`
    6. *Your account* (UserCircle icon) → `/profile`
* **Through the Decades:**
  * Horizontally scrollable row of compact cards (`width: 128px`, `borderRadius: 22px`).
  * Labeled with decade string (e.g. `2020s`, `2010s`, `2000s`, `1990s`, `Undated`) with arrow glyph and loaded track count.
* **A Sound for Every Season:**
  * 2×2 grid of mood tiles (`Leaf`, `Sun`, `CloudRain`, `Wind`, `Snowflake`).
  * Features season name, accent icon, and available song count.
* **Loaded Music List:**
  * Infinite vertical song list with thumbnail artwork, title, artist, and trailing track menu trigger.

#### Work Path & User Journey
```
1. App Launch -> Home mounts -> Hero displays loaded collection summary.
2. User taps "Play available music" -> Initializes active queue -> Navigates to /player -> Track starts.
3. User scrolls horizontally -> Taps a Decade card (e.g. "2010s") -> Navigates to /collection?kind=decade&value=2010s.
4. User taps a Season card (e.g. "Monsoon") -> Navigates to /collection?kind=season&value=Monsoon.
5. User taps any song row -> PlayQueue begins with selected track -> Mini-player activates immediately.
```

---

### Feature 2: Fullscreen Audio Player & Carousel (`/app/player.tsx`)

#### How it Looks Like
* **Contextual Navigation Header:**
  * Left: Circular Back arrow button.
  * Center: Eyebrow label (`NOW PLAYING · CATALOG`) and active Queue name (e.g., *"Music mix"*, *"Liked tracks"*).
  * Right: Video shortcut button (opens `/videos` if track has video) + More options (`...`) button for `TrackActionsSheet`.
* **Artwork Carousel:**
  * Centered cover carousel measuring exact device viewport width.
  * High-resolution album artwork with `28px` corner rounding and subtle specular shadow.
  * Side items fade and scale slightly down (`scale: 0.88`, `opacity: 0.6`) to focus attention on the active track.
* **Metadata & Triage Action Row:**
  * Title: Bold 28pt centered white text with 2-line clamping.
  * Artist & Album: 15pt lavender/muted text.
  * Triage Icon Buttons:
    * `Heart` (Likes collection)
    * `Star` (Favourites collection)
    * `Bookmark` (Bookmarks collection)
    * Tapping immediately toggles active state (`colors.accent` fill).
* **Glass Transport Control Panel:**
  * Floating `GlassSurface` housing:
    1. **Scrubber Timeline:** Smooth progress bar with buffered audio line, elapsed timestamp (`01:24`), and total duration (`03:45`).
    2. **Kobra Controls:** Skip Previous (`48px`), Morphing Play/Pause (`64px`), Skip Next (`48px`).
    3. **Live State Pill:** Displays *Playing*, *Buffering…*, *Loading audio…*, or error recovery alert with *"Try playback again"* button.
* **Up Next Queue:**
  * Bottom list displaying queued tracks with tabular track numbers (`01`, `02`, `03`), title, and artist.
  * Active playing song is highlighted with `colors.raised` background.

#### Work Path & User Journey
```
1. User taps Mini-Player or song row -> Fullscreen Player slides up smoothly.
2. User swipes Carousel left/right -> Active track switches seamlessly -> Audio initiates.
3. User drags Scrubber thumb -> Seeking updates in real time -> Native bridge seeks to timestamp.
4. User taps Play/Pause -> Icon morphs SVG path smoothly -> Track toggles state.
5. User taps Heart -> Track is added to Likes in local/cloud store -> Heart fills with lavender accent.
6. User taps (...) -> Bottom sheet slides up -> Allows adding to custom playlist or removing.
```

---

### Feature 3: Music Discovery & Mood/Time Engine (`/app/discovery.tsx`)

#### How it Looks Like
* **Local Time & Period Glass Card:**
  * Dynamically computes device time: *"Morning on your device"*, *"Afternoon"*, *"Evening"*, or *"Night"*.
  * *"How mixes work"* expandable drawer: Explains time slot rules (Morning 5–12, Afternoon 12–17, Evening 17–21, Night 21–5).
* **Filter Rows:**
  * **Mood Row:** Scrollable horizontal pills: `Focus`, `Chill`, `Uplifting`, `Energy`, `Melancholy`, `Late Night`.
  * **Season Row:** `Spring`, `Summer`, `Monsoon`, `Autumn`, `Winter`.
  * **Release Years Row:** `2020s`, `2010s`, `2000s`, `1990s`, `Undated`.
* **Recently Played Replay:**
  * Horizontal row of quick-replay pills displaying the user’s recently confirmed tracks.
* **Mix Results Header:**
  * Displays dynamic matching count: e.g. *"Recommended tracks · 24"*.
  * Explains that matching uses strict category and keyword rules without probabilistic AI hallucination.

#### Work Path & User Journey
```
1. User taps "Your moment" on Home -> Enters /discovery.
2. User taps "Late Night" mood pill -> Filter activates -> Track list filters instantly.
3. User taps "Monsoon" season -> Refines candidates to monsoon nocturnal mix.
4. User taps a recommended track -> Full mix is enqueued -> Player opens and begins streaming.
5. User taps "Clear discovery filters" -> Mix resets to default time-of-day recommendation.
```

---

### Feature 4: Catalog Search & Filter Engine (`/app/(tabs)/search.tsx`)

#### How it Looks Like
* **Search Input Container:**
  * Rounded glass input (`minHeight: 52px`, `borderRadius: 18px`) with search icon and clear (`X`) button.
  * Placeholder: *"Songs, artists, albums"*.
* **Browse Shortcut Button:**
  * Secondary button: *"Browse albums, artists and provider playlists"* (direct route to `/provider-browse`).
* **Active Filter Rows:**
  * Quick Decade and Season selection rows to narrow search parameters without typing.
* **Results Header:**
  * Shows matching count: *"42 loaded tracks"*.
  * Includes *"Clear all filters"* text button when queries or chips are active.
* **Song Results List:**
  * Displays matching song rows with high-contrast typography.
  * End-of-list pagination button: *"Load more catalog tracks"* if provider has further pages.

#### Work Path & User Journey
```
1. User taps Search tab -> Focuses input -> Android soft keyboard displays.
2. User types "Dua" -> 300ms debounce fires -> Results list populates instantly.
3. User scrolls list -> Keyboard auto-dismisses smoothly on drag.
4. User taps a track row -> Active queue set to search results -> Playback begins.
5. User taps "Clear search" (X) -> Input empties -> Search returns to initial discovery view.
```

---

### Feature 5: Music Warehouse & Collection Triage (`/app/(tabs)/warehouse.tsx`)

#### How it Looks Like
* **Warehouse Information Glass Surface:**
  * Header: *"Music Warehouse"* with subtitle *"Your saved, liked, favourite and bookmarked tracks, together."*
  * Notice: Confirms that account collection IDs are preserved safely on device.
  * Direct CTA button: *"InstaMus discovery"* for adding new saved songs.
* **Status Filter Segmented Control:**
  * 3 segmented pill chips:
    1. `Active · [N]` (Default view of all live saved tracks)
    2. `Removed · [N]` (Tracks soft-removed from active library)
    3. `Hidden · [N]` (Tracks hidden from discovery/shuffle)
* **Song Rows with Warehouse Action Controls:**
  * Active tracks offer quick buttons to Hide or Remove.
  * Removed and Hidden views feature a dedicated *"Restore"* action button to bring songs back to the active library without losing their original identity.

#### Work Path & User Journey
```
1. User taps Warehouse tab -> View defaults to "Active" collection.
2. User spots a song they want to archive -> Taps "Remove" -> Song transitions to "Removed" state.
3. User taps "Removed · 1" chip -> View displays removed tracks.
4. User taps "Restore" -> Song returns immediately to Active collection.
```

---

### Feature 6: InstaMus Reel Audio Discovery (`/app/instamus.tsx`)

#### How it Looks Like
* **Discovery Form Surface (`GlassSurface`):**
  * Title: *"Find the song behind a reel"*.
  * Input 1: Instagram reel link (URL keyboard, e.g. `https://www.instagram.com/reel/...`).
  * Input 2: Song title, artist or discovery note (text input).
  * Primary Button: *"Save reel link and note"*.
  * Secondary Button: *"Open original reel"* (opens external Instagram application).
* **Live Catalog Match Results:**
  * If a query is entered, displays live matching songs from the catalog.
  * Each song card features a dedicated action: *"Link and bookmark [Song Title]"*.
* **Saved Reel Discovery Cards List:**
  * Card view of user’s saved reels showing:
    * Reel URL & Discovery Note.
    * Status tag: *"Manually linked: [Track Name]"* or *"Awaiting your manual selection"*.
    * Actions: *"Share discovery link"* + *"Remove saved reel link"*.

#### Work Path & User Journey
```
1. User copies an Instagram Reel URL -> Opens Aadat Music -> Taps InstaMus card.
2. URL automatically populates or user pastes link.
3. User enters lyrics/artist in the note field -> Catalog search returns matching candidates.
4. User recognizes the track -> Taps "Link and bookmark [Title]".
5. Track is permanently linked to the reel reference and added to Bookmarks.
```

---

### Feature 7: Library & Custom Playlists (`/app/(tabs)/library.tsx` & `/app/playlist.tsx`)

#### How it Looks Like
* **Library Screen:**
  * Primary Collection Rows:
    * `Likes` (Heart icon, count: *X tracks*)
    * `Favourites` (Star icon, count: *Y tracks*)
    * `Bookmarks` (Bookmark icon, count: *Z tracks*)
  * Playlists Section:
    * Header with *"New playlist"* button.
    * List of custom user playlists with album count and chevron navigation.
* **Playlist Detail Screen (`/app/playlist.tsx`):**
  * Title banner with playlist title, track count, and *"Play playlist"* primary CTA.
  * Action row:
    * *"Add or remove songs"* (toggles list editing mode with `+` and `−` controls)
    * *"Rename playlist"* (opens glass modal sheet)
    * *"Share playlist"* (generates deep share link)
    * *"Delete playlist"* (shows destructive confirmation dialog)

#### Work Path & User Journey
```
1. User taps Library tab -> Taps "New playlist".
2. Glass modal opens -> User enters "Late Night Vibes" -> Taps "Create".
3. Redirects to new Playlist screen -> Taps "Add or remove songs".
4. Catalog appears with (+) buttons -> User taps (+) on songs -> Items added instantly.
5. User taps "Play playlist" -> Queue begins playing customized list.
```

---

### Feature 8: Catalog Provider Exploration (`/app/provider-browse.tsx` & `/app/provider-collection.tsx`)

#### How it Looks Like
* **Browse Screen:**
  * Search bar for provider-backed collections.
  * Resource Kind Filter: Segmented tabs for `Albums`, `Artists`, `Playlists`.
  * Grid of provider cards: High-resolution artwork cover, collection title, and artist tag.
* **Provider Collection Detail Screen:**
  * Top banner: `112×112px` rounded collection artwork with provider metadata badge.
  * Primary CTA: *"Play this collection"*.
  * List of tracks reported by the provider with on-demand stream verification.

#### Work Path & User Journey
```
1. User taps "Explore catalog" on Home -> Navigates to /provider-browse.
2. User selects "Albums" tab -> Searches "Future Nostalgia".
3. Taps album card -> Opens /provider-collection?id=...
4. Views album tracks -> Taps "Play this collection" -> Album queues and starts.
```

---

### Feature 9: Native Video Player & Session (`/app/videos.tsx`)

#### How it Looks Like
* **Video Surface:**
  * Clean 16:9 rounded native video container.
  * Top bar: Back button + title overlay.
  * Video Transport: Floating translucent Kobra media controls overlaid on the lower third of the video.
  * Fullscreen Toggle: Button to rotate and enter edge-to-edge landscape mode.
* **Empty / Unsupported State:**
  * When no authorized stream exists: Clean glass card explaining status with buttons to *"Review original local video clips"* or *"Search music"*.

#### Work Path & User Journey
```
1. User taps "Music videos" on Home or Video icon on Player -> Navigates to /videos.
2. Active audio track pauses automatically to hand off audio focus to the video engine.
3. Video begins playing with overlay controls.
4. User taps Fullscreen -> Device orientation switches to landscape.
5. User exits video screen -> Audio focus restores cleanly.
```

---

### Feature 10: Listening History (`/app/history.tsx`)

#### How it Looks Like
* **History Header:**
  * Page title: *"Listening history"* with subtitle *"Your most recent 100 confirmed plays."*
* **History List:**
  * Chronological feed of played songs.
  * Each row shows: Artwork thumbnail, song title, artist, and formatted play timestamp (e.g. *"Today at 4:15 PM"*).
  * Tapping any row immediately replays the track.

---

### Feature 11: Real-Time Collaborative Rooms & Chat Consent

#### How it Looks Like
* **Room Authority Bar:**
  * Displays room role: `Host`, `Original Controller`, or `Participant`.
  * Active Controller indicator badge with pulsing broadcast dot.
* **15.0s Takeover Prompt Window:**
  * Pops up immediately if the active controller disconnects without a fallback:
    * Header: *"Controller disconnected"*
    * Prompt: *"Take over playback control? (15.0s remaining)"*
    * Progress timer bar smoothly depleting over 15.0s.
    * Lavender CTA button: *"Claim Control"*.
* **5.0s Timeout Cleanup Alert:**
  * If unclaimed after 15s: Alert appears *"Playback paused. Pruning session in 5s"*.
* **Explicit Chat Consent Dialog:**
  * Displayed when joining a `PERSISTENT_LOG` room if the user has `EPHEMERAL_SESSION_ONLY` preference:
    * Clear message: *"This room stores chat history in PostgreSQL. Allow your messages to be stored?"*
    * Options: *"Consent & Store"* vs *"Stay Ephemeral (Redis only)"*.

#### Work Path & User Journey
```
1. Users join collaborative listening room.
2. Active controller leaves -> Backend initiates 15.0s takeover prompt.
3. First participant taps "Claim Control" -> Redis SET NX captures control atomically -> Participant becomes activeController.
4. If unclaimed after 15s -> Playback pauses -> Ephemeral Redis state prunes after 5s countdown.
```

---

### Feature 12: Account Authentication & Profile Presentation (`/app/login.tsx` & `/app/profile.tsx`)

#### How it Looks Like
* **Login Screen:**
  * Top wordmark: *"AADAT MUSIC"* in bold uppercase letter-spaced typography.
  * Glass panel: *"Find your rhythm. Discover loaded music. A space that’s yours."*
  * Branded Google Sign-In button: High-contrast native button with Google icon.
  * Privacy footer: *"Your Google password stays with Google."* (exceeding WCAG AAA contrast).
* **Profile Screen:**
  * User Identity Card: Display name, Google email, and account status badge.
  * Profile Editor: Labeled input field to update display name with Save button.
  * Account Collections Panel: Summary of cloud-synced tracks across Likes, Favourites, Bookmarks, and Playlists.
  * Secondary button: *"Sign out of this device"*.

---

## 4. Micro-Interactions, Feedback & Responsive Policies

1. **Spring Press Feedback:**
   * All interactive cards, bubbles, and buttons respond to touch with spring physics (`damping: 20`, `stiffness: 220`, `scale: 0.93`).
2. **Keyboard Management:**
   * Forms wrap in `KeyboardAvoidingView` (`behavior: "height"` on Android).
   * Text inputs dismiss automatically when lists are scrolled or dragged.
3. **Small-Screen & Large-Font Policy:**
   * On short screens (<680pt) or when accessibility font scaling is ≥1.3×, transport panels transition into natural scroll flow rather than fixed docking, preventing layout truncation.
4. **Offline Resilience:**
   * When internet connectivity is interrupted, song rows display clear badges and error states without crashing or hanging the UI thread.

