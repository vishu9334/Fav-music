# AGENTS.md — Aadat Music Engineering & Codex Handover Guide

> **Target Audience:** OpenAI Codex, autonomous AI agents, and pair engineers.  
> **Repository:** Aadat Music Monorepo (`com.favmusic`)  
> **Status:** Gates 5F–5K implemented & locally verified. Unresolved physical device startup verification awaiting EAS build approval.  
> **Last Updated:** November 2026

---

## 1. System Architecture & Domain Specifications

Aadat Music is an Android-first music streaming and collaborative listening platform built with a high-performance Fastify backend and an Expo SDK 52 (React Native 0.76.6) mobile client.

### 1.1 Real-Time Collaborative Room Authority
* **Role Hierarchy:**
  * `hostUserId`: Room creator/owner. Retains administrative authority (invites, kicks, room configuration).
  * `originalControllerId`: First user granted playback control upon session start. Acts as the default fallback target.
  * `activeControllerId`: The sole user with authoritative playback command (play, pause, seek, skip). Managed atomically in Redis using compare-and-swap (CAS) / Lua scripts.
* **Controller Transfer & Takeover Lifecycle:**
  * When `activeControllerId` disconnects:
    * **1 Participant Remaining:** Control transfers automatically and immediately to that participant.
    * **>1 Participants & `originalControllerId` Connected:** Control reverts immediately to `originalControllerId`.
    * **>1 Participants & `originalControllerId` Absent:** Backend broadcasts `control:takeover_prompt_started`.
  * **Takeover Window:** Active for exactly **15.0 seconds** (`TAKEOVER_PROMPT_TIMEOUT_MS = 15_000`). First participant claim atomically captures control (`SET NX`).
  * **Cleanup Countdown:** If no claim occurs within 15.0s, backend pauses playback (`TAKEOVER_TIMEOUT`) and triggers a **5.0-second countdown** (`FAILED_TAKEOVER_CLEANUP_INTERVAL_MS = 5_000`). If still unclaimed, ephemeral Redis room state is pruned.

### 1.2 Privacy & Chat Consent Protocol
* **Policies:** `ChatRetentionPreference` (`EPHEMERAL_SESSION_ONLY` vs `PERSISTENT_HISTORY`) and `RoomChatPolicy` (`EPHEMERAL_SESSION_ONLY` vs `PERSISTENT_LOG`).
* **Storage Rules:**
  * `EPHEMERAL_SESSION_ONLY`: Messages buffered in Redis with TTL; **never** written to PostgreSQL.
  * `PERSISTENT_LOG`: If a joining user prefers ephemeral mode, the client displays an explicit consent prompt. Only consented messages are written to `PersistentRoomMessage` in PostgreSQL. Unconsented messages remain ephemeral in Redis and are purged upon session termination.

### 1.3 Media Storage & InstaMus Ingestion Pipeline
* **Media Storage:** Track assets (`audioKey`, `videoKey`, `artworkKey`) store relative S3 keys (`tracks/audio/<uuid>.mp3`). Short-lived presigned URLs are generated dynamically at the API layer and never persisted in database columns.
* **InstaMus Pipeline:** Status transitions: `PENDING` -> `MATCHED` | `UNMATCHED` | `EXTRACTION_FAILED`.
  * Confidence match (>0.85): Status `MATCHED`, linked to canonical `Track`, auto-bookmarked.
  * Failures/Mutes/Unmatched: Emits fallback metadata (scraped title/caption keywords) allowing the client to immediately present the manual search modal.

---

## 2. Monorepo Structure & Package Manifest

Package management is governed by `pnpm@9.15.5` with strict workspace resolution defined in `pnpm-workspace.yaml`.

```
.
├── apps/
│   └── mobile/                       # Android-first React Native / Expo application
│       ├── app/                      # Expo Router (v4) file-based routes (_layout.tsx, index.tsx)
│       ├── src/
│       │   ├── components/           # UI components
│       │   ├── services/playback/    # AudioPlaybackService, playback-service.ts, types.ts
│       │   └── store/                # Zustand player store (usePlayerStore.ts)
│       ├── app.json                  # Expo config (package: com.favmusic, projectId: be1ffc50-...)
│       ├── index.tsx                 # Mobile application root entry point
│       ├── metro.config.js           # Mobile Metro config (symmetrical to root)
│       └── package.json              # Mobile dependencies & EAS scripts
├── packages/
│   ├── config/                       # Shared tsconfig and tooling configs (@aadat/config)
│   └── contracts/                    # Shared TypeScript DTOs, enums, events (@aadat/contracts)
├── server/                           # Modular monolith backend (@aadat/server)
│   ├── prisma/                       # Prisma schema & migrations (PostgreSQL + @prisma/adapter-pg)
│   ├── src/
│   │   ├── infrastructure/           # Database, Redis, and S3 clients
│   │   └── modules/                  # admin, analytics, auth, catalog, global-play,
│   │                                 # health, instamus, media, rooms, warehouse
│   └── package.json
├── docs/                             # Architecture blueprint and specifications
├── app.json                          # Root Expo app definition
├── eas.json                          # EAS Build configuration (preview: apk, production: aab)
├── metro.config.js                   # Root Metro config with singleton deduplication
├── react-native.config.js            # Monorepo Android autolinking configuration
├── package.json                      # Monorepo root with pnpm.overrides
├── pnpm-workspace.yaml               # Workspace definitions
├── .easignore                        # EAS cloud upload archive filter (excludes secrets & server)
└── AGENTS.md                         # This file
```

---

## 3. Current Implementation Details

### 3.1 Mobile Entry Point (`apps/mobile/index.tsx`)
* Calls `registerRootComponent(App)` **synchronously at the top level** to ensure the `"main"` component key is registered in `AppRegistry` before the Android native bridge executes `runApplication`.
* Registers the background headless playback service inside a protected `try/catch` block:
  ```typescript
  import React from 'react';
  import { registerRootComponent } from 'expo';
  import { ExpoRoot } from 'expo-router';
  import TrackPlayer from 'react-native-track-player';
  import { playbackService } from './src/services/playback/playback-service';

  export function App(): React.JSX.Element {
    const ctx = require.context('./app');
    return <ExpoRoot context={ctx} />;
  }

  // 1. MUST register root component first so "main" is immediately available to Android runtime
  registerRootComponent(App);

  // 2. Register background headless playback service for Android Media Notification
  try {
    TrackPlayer.registerPlaybackService(() => playbackService);
  } catch (error) {
    console.error('[PlaybackService] Failed to register playback service:', error);
  }
  ```

### 3.2 Monorepo Autolinking (`react-native.config.js`)
* Configures the React Native CLI to recognize Android source code under `./apps/mobile/android`.
* Dynamically resolves community native dependencies from `apps/mobile/package.json` so EAS and Gradle include them in `PackageList.java`:
  ```javascript
  const path = require('path');
  const mobilePkg = require('./apps/mobile/package.json');

  const dependencies = {};
  for (const name of Object.keys(mobilePkg.dependencies)) {
    try {
      const pkgPath = require.resolve(`${name}/package.json`, {
        paths: [path.resolve(__dirname, 'apps/mobile'), __dirname],
      });
      dependencies[name] = { root: path.dirname(pkgPath) };
    } catch {
      // Skip workspace packages or packages without native modules
    }
  }

  module.exports = {
    project: {
      android: {
        sourceDir: './apps/mobile/android',
        appName: 'app',
        packageName: 'com.favmusic',
      },
    },
    dependencies,
  };
  ```

### 3.3 Metro Deduplication & Canonical Runtime (`metro.config.js`)
* Monorepo pnpm structures link multiple versions of React and React Native when dependencies drag transitive versions (e.g. Prisma Studio dragging React 19).
* Configured `disableHierarchicalLookup = true`, ordered `nodeModulesPaths`, mapped `extraNodeModules`, and added a custom `resolveRequest` hook to redirect all core singletons (`react`, `react-native`, `react-dom`, `expo`, `react-native-track-player`, etc.) to `apps/mobile/node_modules`.
* Configured `getModulesRunBeforeMainModule` to load canonical `InitializeCore.js` from `apps/mobile/node_modules/react-native`.

---

## 4. Chronicle of Gates 5F – 5K (Findings, Causes & Fixes)

| Gate | Target / Build ID | Observed Error / Symptom | Root Cause | Implemented & Verified Fix |
| :--- | :--- | :--- | :--- | :--- |
| **5F** | Build `2f449849` | `HostObject::set for prop 'TrackPlayerModule'` | Fake `NativeModules.TrackPlayerModule = ...` JS polyfill attempted to mutate frozen JSI HostObjects in React Native 0.76. | Completely deleted the fake polyfill; relied on genuine native autolinking. |
| **5G** | Build `21fd1bde` | `Cannot read property 'CAPABILITY_PLAY' of null` (immediate crash) | EAS monorepo build ran React Native CLI from root without dependencies mapped; generated `PackageList.java` with 0 community modules. `TrackPlayerModule` was null. | Created root `react-native.config.js` mapping `sourceDir: './apps/mobile/android'` and populating `dependencies` from `apps/mobile/package.json`. |
| **5H** | Build `c8b13991` | `Invariant Violation: "main" has not been registered` | Autolinking succeeded (native modules present), but app failed on startup before UI mounted. | Moved to Gate 5I entry-point lifecycle analysis. |
| **5I** | Local Analysis | Race condition during headless service registration | `TrackPlayer.registerPlaybackService` ran before `registerRootComponent(App)` in `apps/mobile/index.tsx`. Any rejection aborted `"main"` registration. | Reordered `index.tsx`: `registerRootComponent(App)` runs first; `registerPlaybackService` wrapped in `try/catch`. |
| **5J** | Build `c827de69` | `Invariant Violation: "main" has not been registered` persisted at runtime | `"main"` was registered in JS, but Android native bridge invoked `AppRegistry.runApplication("main")` and threw "not registered". | Initiated deep bytecode and runtime analysis under Gate 5K. |
| **5K** | Local Verification | Dual React Native / AppRegistry runtime instances | Bytecode disassembly of `/tmp/apk-bundle-5j.hbc` showed **8,326 modules** and **28 copies of `registerComponent`**. Root `InitializeCore` initialized one `AppRegistry` for the native bridge, while `index.tsx` registered `"main"` in a second isolated `AppRegistry` from `.pnpm/`. | 1. Added `pnpm.overrides` pinning `react: 18.3.1`, `react-dom: 18.3.1`, `react-native: 0.76.6`.<br>2. Set `disableHierarchicalLookup: true` in Metro configs.<br>3. Enforced singleton redirection in `resolveRequest` and `extraNodeModules`.<br>4. Pointed `getModulesRunBeforeMainModule` to canonical `InitializeCore`. |

### Gate 5K Quantitative Verification Results
* **Module Count:** Reduced from **8,326** to **2,798 modules** (-66% duplicate bloat eliminated).
* **Hermes Bytecode Inspection:** `Function<registerComponent>` occurrences dropped from **28** to exactly **2** (`AppRegistry` declaration + `registerRootComponent` call).
* **Bundle Entry Execution:** Verified bundle ends with canonical `__r(167); __r(0);` (`InitializeCore` followed by `index.tsx`).
* **AppRegistry Resolution:** Executing bundle in Node environment confirmed `AppRegistry.getAppKeys()` contains `['LogBox', 'main']`, and `AppRegistry.runApplication('main', ...)` succeeds.
* **Typecheck & Tests:** `pnpm run typecheck` passed (all 4 projects). `pnpm test` passed (181 passed, 3 skipped). Native autolinking verified (18 packages).

---

## 5. Latest Build Status & Unresolved Android Startup Verification

* **Latest Completed Remote Build:** `c827de69-d41c-43f1-b846-5654527715b7` (Gate 5J preview APK, crashed due to the dual runtime issue resolved in Gate 5K).
* **Current Workspace State:** Gate 5K deduplication fix is implemented in source and verified in local production bundle tests.
* **Unresolved Item (Pending User Approval):**
  * The deduplicated bundle has **NOT** yet been compiled into an EAS preview APK or verified on physical hardware.
  * **Target Test Hardware:** OnePlus / Oppo `CPH2599` (ADB Serial: `X4GACUMZMVEQY5XO`).
  * **Target Application Package:** `com.favmusic`.
* **Required Procedure Once User Approves EAS Build:**
  1. Trigger build: `EAS_NO_VCS=1 eas build --profile preview --platform android`
  2. Download resulting preview APK to `/tmp/`.
  3. Install onto device: `adb -s X4GACUMZMVEQY5XO install -r /path/to/new.apk`
  4. Launch app: `adb -s X4GACUMZMVEQY5XO shell am start -n com.favmusic/.MainActivity`
  5. Inspect live Logcat: `adb -s X4GACUMZMVEQY5XO logcat *:E ReactNative:V ReactNativeJS:V`
  6. Verify UI loads, audio plays, media notification renders, and background playback persists.

---

## 6. Standard Test & Verification Commands

All agents must execute commands from the repository root:

```bash
# 1. Monorepo TypeScript Verification (all workspaces)
pnpm run typecheck

# 2. Vitest Suite (Unit & Integration tests)
pnpm test

# 3. Production Metro Bundle Verification (Mobile entry point)
npx expo export:embed --eager --platform android --dev false --bundle-output /tmp/test-bundle.bundle --assets-dest /tmp

# 4. Hermes Bytecode Compilation Check
./node_modules/react-native/sdks/hermesc/osx-bin/hermesc -emit-binary -out /tmp/test-bundle.hbc /tmp/test-bundle.bundle

# 5. Native Module Autolinking Discovery Check
node -e "const c = require('./react-native.config.js'); console.log('Autolinked count:', Object.keys(c.dependencies).length); console.log(Object.keys(c.dependencies));"

# 6. Physical Android Device Inspection (when device connected)
adb -s X4GACUMZMVEQY5XO shell getprop ro.product.model
adb -s X4GACUMZMVEQY5XO logcat -c
adb -s X4GACUMZMVEQY5XO shell am start -n com.favmusic/.MainActivity
adb -s X4GACUMZMVEQY5XO logcat *:E ReactNative:V ReactNativeJS:V
```

---

## 7. Strict Project Invariants & Agent Rules

Any agent modifying or interacting with this codebase must adhere strictly to these constraints:

1. **NO GIT COMMANDS:**  
   Never execute `git status`, `git add`, `git commit`, `git diff`, `git push`, or any other Git command. Git operations are managed exclusively by the user outside this environment.
2. **NO DATABASE OR BACKEND MODIFICATIONS:**  
   Do not run database migrations, execute schema changes, alter PostgreSQL/Redis connections, or modify backend code in `server/` unless explicitly requested by the user.
3. **NO UNAUTHORIZED EAS BUILDS:**  
   Never trigger `eas build` without direct, explicit user instruction and approval. Builds consume cloud credits and require human confirmation.
4. **NO FAKE NATIVE MODULE POLYFILLS:**  
   Never inject fake `NativeModules` polyfills (e.g., `NativeModules.TrackPlayerModule = ...`). Modern React Native JSI freezes host objects, and polyfills cause fatal runtime crashes. Always resolve native integration through proper autolinking.
5. **NO DUPLICATE REGISTRATIONS:**  
   Never add duplicate `AppRegistry.registerComponent` calls. Component `"main"` must be registered solely through `registerRootComponent(App)` in `apps/mobile/index.tsx`.
6. **PRESERVE CONFIGURATION INVARIANTS:**  
   Maintain `package: "com.favmusic"`, EAS Project ID `be1ffc50-0de2-4b0e-a0d1-ad3ea5e543ee`, Expo SDK 52 compatibility, and pnpm workspace topology.

