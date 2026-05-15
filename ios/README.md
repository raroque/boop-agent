# Boop iOS

Native iOS client for the Boop agent. Pairs with the server over HTTP, streams replies via SSE.

## Status

**M1** — pairing, chat, streaming, history. No push notifications, no markdown rendering, no attachments yet.

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
| `BoopApp.swift` | App entry, owns `AppSettings`. |
| `Models/Models.swift` | `Message`, `ServerMessage`, pairing response shapes. |
| `Storage/AppSettings.swift` | UserDefaults-backed server URL + persistent deviceId. |
| `Storage/KeychainStore.swift` | Bearer token storage (Keychain Services). |
| `Networking/BoopClient.swift` | HTTP client (`pair/create`, `pair/check`, `inbound`, `messages`) + `SSEConnection` actor that parses `event:`/`data:` lines from `/channels/ios/stream`. |
| `State/PairingStore.swift` | `@Observable` state machine for pairing flow. Polls `/pair/check` every 2s. |
| `State/ChatStore.swift` | `@Observable` chat state. Loads history, streams `assistant_delta` into a live bubble, finalizes on `assistant_message`, appends `assistant_ack`. Auto-reconnect with exponential backoff. |
| `Views/RootView.swift` | Routes between `PairingView` and `ChatView` based on `PairingStore.phase`. |
| `Views/PairingView.swift` | Pair-flow UI. |
| `Views/ChatView.swift` | Message list + composer + connection-status dot. |
| `Views/SettingsView.swift` | Server URL + unpair. |

## Endpoint contract

Everything under `<serverURL>/channels/ios`:

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/pair/create` | none | Phone-initiated. Returns `{ deviceId, code, expiresAt }`. Rate-limited 3/IP/hr. |
| POST | `/pair/check` | none | Phone polls. Returns `{ paired: false }` or `{ paired: true, bearerToken }`. One-shot bearer pickup. |
| POST | `/pair/consume` | none | Dashboard-initiated (the iPhone never calls this). |
| POST | `/inbound` | bearer | `{ text }` → `{ ok, conversationId }`. |
| GET | `/messages?limit=N` | bearer | Newest-first history fetch. |
| GET | `/stream` | bearer | SSE. Events: `assistant_delta`, `assistant_message`, `assistant_ack`, `thinking`, `error`. |

## Known gaps

- **No APNs / push.** The app only receives messages while the SSE stream is live in the foreground. M2.
- **No markdown rendering.** Replies render as plain text. Code blocks, lists, links all show as raw markdown.
- **No attachment support.** Inbound photos/PDFs (server feature) aren't yet rendered in the iOS UI.
- **No offline history.** Messages are fetched fresh from the server on launch; nothing is cached locally.
- **No multi-device UX.** Each install gets its own `deviceId`. Two paired phones for the same user appear as two separate `ios:<deviceId>` conversations on the server.

## Generating the xcodeproj non-interactively

```sh
cd ios
xcodegen generate --quiet
```

CI builds (if you set them up): use the same command, then `xcodebuild -project Boop.xcodeproj -scheme Boop -destination 'generic/platform=iOS Simulator' build`.
