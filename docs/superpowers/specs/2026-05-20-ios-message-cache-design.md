# iOS Local Message Cache — Design

**Status:** Approved 2026-05-20. Ready for implementation planning.

## Problem

Every time the iPhone app opens a thread, it hits `GET /channels/ios/messages?threadId=…&limit=50` and waits. Two failure modes for UX:

1. **Cold launch.** The chat screen sits empty until the server fetch returns. On a flaky LTE connection this is multiple seconds of blank.
2. **Thread switch.** `ChatStore.switchTo(threadId:)` wipes the in-memory `messages` array and re-fetches even when you tapped that thread 10 seconds ago. Every dock-bar tap is a round trip.

Modern messaging apps (iMessage, WhatsApp, Telegram, Signal) all solve this with a local cache that renders instantly on screen-paint and quietly reconciles with the server in the background.

## Goal

Switching to a thread (cold or warm) paints the last-known messages with **zero spinner**. The server fetch still happens — in the background — and merged messages slot in. The user only sees a loading state when the cache has nothing to show (first-ever launch on a thread).

## Scope

**In:**
- Persist messages per thread + the open/archived threads list across app launches.
- Cache-first render on every thread switch and cold launch.
- Background fetch + merge by Convex message `_id` on every render to catch missed messages.
- Live SSE updates continue to write into the cache.
- Wipe cache on unpair.

**Out (intentional):**
- Attachment blobs (image / PDF / doc bytes). Metadata is cached; bytes still re-fetch from the signed URL on tap. Signed URLs expire server-side, so caching them is pointless and bytes don't fit the messaging-app idiom.
- Offline send queue. Sending while offline still fails the same way it does today.
- Full-text search across cached threads.
- iCloud / cross-device cache sync.
- `?since=<ms>` server-side delta endpoint. Volumes are tiny (≤50 msgs per thread); always-refetching the latest 50 in the background is cheap. Revisit if a thread ever holds 1000+ messages.
- XCTest target. Verification stays manual.

## Architecture

A new `MessageCache` actor under `ios/Boop/Storage/` owns disk I/O. `ChatStore` and `ThreadsStore` call into it for read/write; views never touch it directly.

```
       ChatStore  ──────────┐                ┌──── ThreadsStore
   (per-thread messages)    │                │       (open + archived list)
                            ▼                ▼
                  ┌──────────────────────────────┐
                  │      MessageCache (actor)    │
                  │  read/write JSON, debounced  │
                  └──────┬──────────────┬────────┘
                         │              │
                  Caches/threads/       Caches/threads-list.json
                  ├─ <threadId>.json    (open + archived snapshot)
                  ├─ <threadId>.json
                  └─ …
```

**Location:** `FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)`. iOS may purge `Caches/` under storage pressure — fine, the server is source-of-truth, the next launch repaints empty and refills. Not backed up to iCloud (correct for cache data).

**Schema:**

```json
// <threadId>.json
{
  "schemaVersion": 1,
  "threadId": "k57…",
  "lastSyncedAt": 1716200000000,
  "messages": [ <Message>… ]
}

// threads-list.json
{
  "schemaVersion": 1,
  "open":     [ <ServerThread>… ],
  "archived": [ <ServerThread>… ]
}
```

`schemaVersion` lets future shape changes wipe-and-refetch cleanly instead of decoding into garbage.

## Data flow

### Cold launch (post-pair)

1. Once `PairingStore.phase == .paired` and the bearer is loaded, `RootView` calls `ThreadsStore.hydrateFromCache()` — synchronous-feeling read of `threads-list.json`. Paints the dock bar + sets `activeThreadId` to the last-active thread from cache. Hydration only runs post-pair so an unpaired install never paints stranded data.
2. In parallel, `ChatStore.switchTo(activeId)` reads `<activeId>.json` and assigns to `perThread[activeId]`. Chat paints immediately. **No spinner.**
3. Background tasks fire: `ThreadsStore.loadThreads()` and `ChatStore.refreshFromServer()`. Each merges by `_id`, then writes the updated cache back.

### Thread switch (warm)

- `ChatStore.switchTo(threadId:)` no longer wipes. It:
  - Updates the active threadId.
  - Returns instantly if `perThread[threadId]` is already populated (in-memory hit).
  - Otherwise reads the cache, hydrates `perThread[threadId]`, then triggers a background `refreshFromServer()`.
- `messages` (the public field views read) becomes a computed property over `perThread[activeThreadId]`. Switching = pointer swap, not wipe.

### Live updates (SSE)

- The existing `handle(event:)` paths (delta / message / ack / attachments) keep doing what they do today, but now operate on `perThread[activeThreadId]` instead of `messages`, and mark the active thread dirty so the cache writer flushes.

### Cache write semantics

- Per-thread debounced write — 500 ms after the last mutation, via a `DispatchSourceTimer` inside `MessageCache`. Avoids thrashing during streaming-delta bursts. Multiple mutations within the window coalesce into one write.
- Hard flush on `scenePhase` → `.background` so anything pending lands before suspension.
- Atomic replacement: write to `<threadId>.json.tmp`, then `FileManager.replaceItem(at:withItemAt:)`. Prevents partial writes from corrupting the file if iOS suspends mid-write.

### Merge rules (the only subtle bit)

Server messages have stable Convex `_id`. Local optimistic user sends today use `local-<uuid>` (see [`ChatStore.send`](ios/Boop/State/ChatStore.swift) — the local id is never reconciled with the server id). On merge:

1. For each server message with `_id = X`:
   - If `perThread[t]` already has a message with id `X`: replace in place (preserves position).
   - Else if there's a `local-…` message of `role = user` with the same `content` and `createdAt within ±5s`: replace its id with `X` (reconciles the optimistic send).
   - Else: insert sorted by `createdAt`.
2. After merge, if `perThread[t].count > 200`, drop the oldest by `createdAt` until back at 200. Hard cap per thread keeps storage bounded — the server still has the full history, so a deeper scroll could refetch on demand (not part of this scope).

To eliminate the ±5s heuristic long-term, **bundle a tiny server change** in this work:
- `POST /channels/ios/inbound` returns `{ ok, conversationId, threadId, userMessageId }` (new field).
- On `sendInbound` success, the client stamps the optimistic message's id with `userMessageId` immediately. The heuristic above becomes a safety net for replay / SSE-disconnect cases rather than the primary path.

## Components

### New files

| File | Role |
| --- | --- |
| `ios/Boop/Storage/MessageCache.swift` | `actor MessageCache` — disk I/O, debounced writes, atomic-replace, purge. ~150 lines. |
| `ios/Boop/Storage/CachedModels.swift` | Codable wrappers (`CachedThread`, `CachedThreadsList`) with `schemaVersion`. Decoupled from `Message` / `ServerThread` so a UI-side rename doesn't silently break old caches. |

### Changed files

| File | Change |
| --- | --- |
| `ios/Boop/State/ChatStore.swift` | `messages: [Message]` → `perThread: [String: [Message]]`. `messages` becomes a computed view of `perThread[activeThreadId]`. `switchTo` reads cache instead of wiping. `loadHistory` → `refreshFromServer` (merge-by-id). Cache write hook on every mutation. |
| `ios/Boop/State/ThreadsStore.swift` | `hydrateFromCache()`. `loadThreads()` + the archived path write back after each fetch. |
| `ios/Boop/State/PairingStore.swift` | On unpair: `await cache.purgeAll()`. |
| `ios/Boop/Views/RootView.swift` | Call `hydrateFromCache()` before `loadThreads()` on the post-pair entry. |
| `ios/Boop/Networking/BoopClient.swift` | `InboundResponse` gains `userMessageId: String?` (server bundles this change). |
| `server/ios/router.ts` | `POST /inbound` returns the persisted user message id so the client stamps optimistic sends. |
| `convex/messages.ts` (or wherever `runTurn` persists the iOS user message) | Thread the returned `_id` back through to the route handler. |

### Tests

- **Server.** `POST /inbound` returning `userMessageId` — extend `tests/ios-thread-routes.test.ts` with a smoke that asserts the new field is present and looks like a Convex id.
- **iOS.** XCTest target still doesn't exist (per the existing `Out of scope` in `ios/README.md`). Verification stays manual until that lands:
  1. Fresh paired install → send a few messages → kill the app from the app switcher → relaunch → cached messages paint instantly.
  2. Within a session, switch between 3 threads rapidly → no loading states after the first visit each.
  3. Send a message → assistant replies → background app → wait → cached state survives.
  4. Unpair → cache is wiped (re-pair shows empty).
  5. Airplane-mode the device → switch threads → cached state still paints, no errors surface other than the existing connection banner.

## Error handling

| Failure | Behavior |
| --- | --- |
| Cache file missing | Treat as empty (`perThread[t] = []`); server fetch fills it. |
| Cache file corrupt / malformed JSON | Log + treat as missing. No popup. |
| Cache file `schemaVersion` newer than the app expects | Treat as missing (forward-compat). |
| Cache file `schemaVersion` older | Treat as missing (no migrations defined for v1 → vN since v1 is the first). |
| Disk write fails (no space, permission denied) | Log. Server is SoT; next mutation will retry. The in-memory cache is unaffected. |
| iOS purges `Caches/` under storage pressure | Next launch shows the post-pair empty state for ~1s while the server fetch lands. Same code path as the corrupt-file branch. |
| Background flush races with foregrounding | Debouncer cancels its outstanding timer when a flush starts; foregrounding sees the persisted state. |

## Definition of done

- Kill the app from the app switcher after sending a few messages → relaunch → chat paints with the last messages **before** any spinner. (Manual.)
- In a session, switching from thread A → B → A is instant (no spinner). (Manual.)
- The `tests/ios-thread-routes.test.ts` `/inbound` smoke asserts `userMessageId` is returned.
- `xcodebuild` green; existing APNs hermetic tests stay 8/8.
- `ios/README.md`'s "Known gaps" loses the "No offline history cache" entry.

## Open questions (none)

All four key decisions made in brainstorming:

1. Scope: instant cold launch + instant thread switch.
2. Contents: messages + threads list. Attachment blobs out.
3. Storage: plain JSON files per thread under `Caches/`.
4. Sync: cache-first render + always background-sync, merge by `_id`.
