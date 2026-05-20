# Boop iOS

Native iOS client for the Boop agent. Pairs with the server over HTTP, streams replies via SSE.

## Status

**M1 + Redesign Plans A & B + APNs push + permanent delete + local message cache** — pairing, multi-thread chat (up to 4 open), per-thread Lucide icons and tints, Markdown bubbles, inbound + outbound attachments (image / PDF / doc) with full-screen preview, cross-thread Files browser, Live Agents watcher, archived threads browser with long-press → delete-forever, unread badges on inactive threads (device-wide SSE fanout), lock-screen / banner push when the app is backgrounded, and an on-disk message cache so cold launch + thread switching paint instantly. Still ahead: Live Activities / widgets, attachment-blob cleanup.

## What you'll need

- macOS with **Xcode 17+** (the project targets iOS 17)
- **XcodeGen** to generate `Boop.xcodeproj` from `project.yml`:
  ```sh
  brew install xcodegen
  ```

The xcodeproj is intentionally not committed — it's regenerated from `project.yml` whenever you run XcodeGen.

## First-time setup

```sh
cd ios
xcodegen generate
open Boop.xcodeproj
```

In Xcode:
1. Select the **Boop** target → Signing & Capabilities.
2. Pick your personal team (or change the bundle ID under `project.yml` → `PRODUCT_BUNDLE_IDENTIFIER`).
3. Build & run (⌘R) — simulator or device both work.

## Pairing the app

1. Make sure the Boop server is running (`npm run dev` at the repo root).
2. Launch the app. Tap the gear icon → set **Server URL** to your server's public URL (or `http://localhost:3456` for simulator on the same Mac).
3. Tap **Start pairing**. The app shows a 6-digit code.
4. Open the Boop dashboard → **Connections** → **Devices** card. Paste the code, give the device a label, hit pair.
5. The app should flip to the chat screen within ~2 seconds. The bearer token is saved in the iOS Keychain.

If you want to start over: gear icon → **Unpair this device**. (Also revoke the row from the dashboard if you want the server-side record gone.)

## Architecture

| File | Role |
| --- | --- |
| `BoopApp.swift` | App entry, owns `AppSettings`, registers bundled Inter + JetBrains Mono fonts at launch. |
| `Models/Models.swift` | `Message`, `ServerMessage`, `Attachment`, `FileEntry`, pairing response shapes. |
| `Models/Thread.swift` | `BoopThread` (open & archived) + `ServerThread` wire shape. |
| `Models/Agent.swift` | `AgentRun` + `AgentLogEntry` for the Live Agents sheet. |
| `DesignSystem/` | `BoopColor`, `BoopFont`, `BoopSpacing`, `BoopRadius`, `ThreadTints` (8-color FNV-1a-hashed palette), `LucideIcon` (~60 bundled PDFs). |
| `Storage/AppSettings.swift` | UserDefaults-backed server URL + persistent deviceId. |
| `Storage/CachedModels.swift` | Codable shapes (`CachedThread`, `CachedThreadsList`, `CachedMessage`, `CachedAttachment`, `CachedThreadRow`) decoupled from the UI models via a `schemaVersion` field. Mismatch on read becomes a cache miss; server fetch refills. |
| `Storage/KeychainStore.swift` | Bearer token storage (Keychain Services). |
| `Storage/MessageCache.swift` | Singleton actor backing the on-disk message cache. Per-thread JSON files under `Caches/threads/`, plus `Caches/threads-list.json`. Debounced 500ms writes (per-thread payload coalescing + shared timer), atomic replacement, hard-flush on `scenePhase = .background`, `purgeAll` on unpair. |
| `Networking/BoopClient.swift` | HTTP client (pair, threads CRUD, archived, files, agents, inbound, messages) + `SSEConnection` (per-thread stream) + `FanoutConnection` (device-wide stream for unread + icon updates). |
| `State/PairingStore.swift` | `@Observable` state machine for pairing flow. Polls `/pair/check` every 2s. |
| `State/ThreadsStore.swift` | List of open threads, active selection, unread flags, fanout subscription. Calls into `BoopClient` for create/archive/unarchive. |
| `State/ChatStore.swift` | Per-thread chat state. Switches threads via `switchTo(threadId:)`, streams `assistant_delta` into a live bubble, finalizes on `assistant_message`, merges `assistant_attachments`, forwards `thread_icon` + `agent_*` to listeners. Auto-reconnect with exponential backoff. |
| `State/AgentsStore.swift` | Execution-agent timeline for the Live Agents sheet. Receives `agent_spawned` / `agent_tool` / `agent_done`. |
| `Views/RootView.swift` | Routes between `PairingView` and `ChatView` based on `PairingStore.phase`. Wires the Files / Agents / Archived / Settings sheets. |
| `Views/ChatView.swift` | Dock + dot-grid header + scrolling message list. |
| `Views/MenuSheet.swift` | Bottom-sheet 2×2 cards (Files / Live agents / Archived / Settings). |
| `Views/FilesScreen.swift` | Cross-thread files browser (search + kind / source / thread filters). |
| `Views/AgentView.swift` | Live Agents sheet — status badges + tool timeline, deep-linkable. |
| `Views/ArchivedScreen.swift` | Browse + restore archived threads. |
| `Views/AttachmentPreviewSheet.swift` | Full-screen viewer (image, PDF via `PDFKit`, doc placeholder) with share + open-in-thread. |
| `Views/PairingView.swift` | Pair-flow UI. |
| `Views/SettingsView.swift` | Server URL + unpair. |

## Endpoint contract

Everything under `<serverURL>/channels/ios`:

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/pair/create` | none | Phone-initiated. Returns `{ deviceId, code, expiresAt }`. Rate-limited 10/IP/hr. |
| POST | `/pair/check` | none | Phone polls. Returns `{ paired: false }` or `{ paired: true, bearerToken }`. One-shot bearer pickup. |
| POST | `/pair/consume` | none | Dashboard-initiated (the iPhone never calls this). |
| GET | `/threads` | bearer | List open threads for this device. |
| POST | `/threads/create` | bearer | Create a new open thread (4-open cap → 409). |
| POST | `/threads/:id/archive` | bearer | Archive a thread. |
| GET | `/threads/archived` | bearer | List archived threads, newest-first. |
| POST | `/threads/:id/unarchive` | bearer | Restore an archived thread (4-open cap → 409). |
| DELETE | `/threads/:id` | bearer | Permanently drop a thread + its messages + agent rows. Idempotent. 403 on cross-device. |
| PATCH | `/threads/:id/icon` | bearer | Set the thread's Lucide icon (used by the `set_thread_icon` self-tool). |
| GET | `/files?limit=N` | bearer | Cross-thread file attachments for this device. |
| GET | `/agents?threadId=...` | bearer | Execution-agent rows for the thread. |
| GET | `/agents/:id/logs` | bearer | Per-agent tool log. |
| POST | `/inbound` | bearer | `{ text, threadId? }` → `{ ok, conversationId, threadId }`. |
| GET | `/messages?threadId=...&limit=N` | bearer | Newest-first history fetch for one thread. |
| GET | `/stream?threadId=...` | bearer | Per-thread SSE. Events: `assistant_delta`, `assistant_message`, `assistant_ack`, `assistant_attachments`, `thinking`, `error`, `thread_icon`, `agent_spawned`, `agent_tool`, `agent_done`. |
| GET | `/fanout` | bearer | Device-wide SSE for unread badges + icon updates. Single event kind: `thread_activity` with `{ threadId, kind: "message" \| "icon", icon? }`. |

## Push notifications

When `APNS_TEAM_ID` / `APNS_KEY_ID` / `APNS_PRIVATE_KEY` are set in the server's `.env.local`, the server pushes an APNs alert to the paired device whenever an assistant message or proactive notice lands. The phone shows it on the lock screen / banner while the app is backgrounded; tapping deep-links to the right thread. While the app is foregrounded the banner is suppressed (SSE is already painting the same content).

Server-side setup is in `.env.example` under "APNs". iOS-side:

1. Make sure the bundle ID + signing team in Xcode have **Push Notifications** capability enabled at https://developer.apple.com/account/resources/identifiers — toggling APNs in your App ID is a one-time thing.
2. The repo ships `Boop/Resources/Boop.entitlements` with `aps-environment = development` (sandbox). Switch the value to `production` before archiving for TestFlight / Release. The matching server env (`APNS_*`) targets `api.sandbox.push.apple.com` for `development`-environment tokens and `api.push.apple.com` for `production`.
3. First launch after pair, iOS prompts for notification permission. The token registration with the server happens automatically.

If you don't set the APNs env vars, the server logs `[apns] disabled (config missing)` at boot and everything else works as before.

## Known gaps

- **No Live Activities / widgets / Siri shortcuts.** Plain push notifications only.
- **No multi-device UX.** Each install gets its own `deviceId`. Two paired phones for the same user appear as two separate `ios:<deviceId>` conversations on the server.
- **No attachment-blob cleanup.** Deleting a thread removes the message rows but leaves the underlying attachment storage objects (image / PDF / doc) in Convex `_storage`. There's no other code path that purges those either, so until there's a retention policy this is consistent rather than a regression.

## Generating the xcodeproj non-interactively

```sh
cd ios
xcodegen generate --quiet
```

CI builds (if you set them up): use the same command, then `xcodebuild -project Boop.xcodeproj -scheme Boop -destination 'generic/platform=iOS Simulator' build`.
