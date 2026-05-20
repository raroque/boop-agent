# iOS Redesign — Plan B (Finish) Implementation Plan

**Goal:** Close out the work that Plan A deferred. After this plan: the MenuSheet "Archived" card works (browse + restore archived threads); inactive open threads light up an unread dot when an assistant message lands on them; README + CHANGELOG reflect the post-Plan-B state.

**What Plan A left open** (per `CHANGELOG.md` and the Plan A doc):
- Archived threads UI — `MenuSheet` already has the "Archived" card; `RootView` still has `onArchived: { /* Plan B */ }`.
- iOS-side unread badges on inactive threads — server fires per-thread events but `ChatStore` only listens to the active thread, so dots never fire.

**Out of scope (separate work, not Plan B):**
- APNs / push (M4 in the original office-hours plan; bigger scope).
- Offline history cache.
- XCTest target setup.
- Permanent deletion of archived threads — archive is enough for now; reopen them to read.

**Tech:** Convex, Express, TypeScript, SwiftUI (iOS 17+). No new dependencies.

---

## Architecture

**Archived threads** — symmetrical to the existing open-threads flow.
- `convex/threads.ts` gets `listArchived(deviceId)` (newest-archived-first) and `unarchive(threadId)` (rejects when device already has 4 open).
- `server/ios/router.ts` exposes `GET /threads/archived` and `POST /threads/:id/unarchive`.
- iOS gets `ArchivedScreen.swift` (sheet, identical scaffolding to `FilesScreen`) and two `BoopClient` methods.

**Unread fan-out** — second SSE per device. Existing per-thread `/stream` keeps doing what it does for the active thread (deltas, attachments, agent events). The new `/channels/ios/fanout` subscribes to every broadcast for any `ios:<deviceId>:*` conversationId on the authed device and re-emits a single `thread_activity` event with `{ threadId, kind }` for `assistant_message` and `thread_icon`. iOS `ThreadsStore` opens this on `bind(bearer:)` and feeds it into the existing `noteIncomingMessage` / `applyIconUpdate` methods. ChatStore is unchanged — the fanout listener is purely additive.

Why a separate fanout SSE rather than widening the existing `/stream`:
1. The existing `/stream` is thread-scoped (`?threadId=...`); the URL contract is part of the iOS spec we shipped — don't break it.
2. ChatStore drops and re-subscribes on every thread switch. We don't want unread-dot tracking to flicker every time the user taps a different thread.
3. The fanout payload is minimal — no deltas, no agent events, no attachments — so it stays cheap to keep open even when the app is backgrounded.

---

## File structure

### Server (TypeScript)
- **Modify**:
  - `convex/threads.ts` — add `listArchived`, `unarchive` (4-open check)
  - `server/ios/router.ts` — add `GET /threads/archived`, `POST /threads/:threadId/unarchive`, `GET /fanout`

### Server tests
- **Modify**: `tests/ios-thread-routes.test.ts` — archive + restore smoke + 4-open guard

### iOS (SwiftUI)
- **Create**:
  - `ios/Boop/Views/ArchivedScreen.swift`
  - `ios/Boop/Networking/FanoutConnection.swift` *(or extend `BoopClient`; we'll inline for now)*
- **Modify**:
  - `ios/Boop/Networking/BoopClient.swift` — `listArchivedThreads`, `unarchiveThread`, `FanoutConnection`
  - `ios/Boop/State/ThreadsStore.swift` — open fanout SSE on `bind`, dispatch thread_activity
  - `ios/Boop/Views/RootView.swift` — wire `onArchived` to present the sheet
  - `ios/Boop/Models/Thread.swift` — `ArchivedServerThread` / response shape

### Docs
- `README.md` — update iOS status section (now multi-thread, markdown, files, agents, archived)
- `CHANGELOG.md` — new "Unreleased — iOS redesign Plan B (Finish)" section

---

## Task ordering

1. Server: `listArchived`, `unarchive` in `convex/threads.ts`
2. Server: `/threads/archived`, `/threads/:id/unarchive` routes
3. Server: `/fanout` SSE — subscribe + re-emit `thread_activity`
4. Server: smoke tests
5. iOS: `BoopClient` archived endpoints
6. iOS: `FanoutConnection` (SSE subscriber that emits `(threadId, kind)`)
7. iOS: `ThreadsStore` opens fanout on `bind`, applies thread_activity
8. iOS: `ArchivedScreen.swift`
9. iOS: `RootView` wires `onArchived`
10. Typecheck + tests
11. README + CHANGELOG

## Failure modes

| # | Failure | Coverage |
|---|---------|----------|
| 1 | User unarchives when 4 already open | Server returns 409; iOS surfaces "max open threads reached" toast on the screen |
| 2 | Fanout SSE drops on backgrounding | ThreadsStore reconnects with the same exponential backoff pattern as ChatStore |
| 3 | Double-count when active thread also fires fanout | `noteIncomingMessage` already skips marking unread when `threadId == activeThreadId` |
| 4 | Re-archive flow leaves messages orphaned | Messages stay attached via `threadId`; archived threads still surface in `listFilesForDevice` (cross-thread files screen) |
| 5 | Unarchived thread has no historical `unread` state | Fresh `unread=false` on hydration is correct — the user just re-opened it |

## Definition of done

- Tap MenuSheet → Archived → see archived threads with last-message-time and icon. Tap one → it's restored and becomes the active thread.
- Send a message to thread A while thread B is active → thread B's tab shows the unread dot. Tap thread A → dot clears.
- 4 open threads → archive one → unarchive a previously-archived one → state stays consistent.
- README iOS status section accurately reflects what's shipped.
