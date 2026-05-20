# iOS Local Message Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement cache-first message rendering on iOS — instant cold launch + instant thread switch, with merge-by-Convex-`_id` background sync.

**Architecture:** A new `MessageCache` actor under `ios/Boop/Storage/` owns disk I/O against plain JSON files in `Caches/threads/<threadId>.json` + `Caches/threads-list.json`. `ChatStore` swaps its `messages: [Message]` for a `perThread: [String: [Message]]` dict so switching threads doesn't wipe. Cache writes are debounced (500ms) per thread and hard-flushed on `scenePhase = .background`. A small server change makes `POST /channels/ios/inbound` return the persisted `userMessageId` so optimistic client sends can be stamped with the canonical id.

**Tech Stack:** SwiftUI (iOS 17+), Foundation `FileManager` + `JSONEncoder`/`JSONDecoder`, `DispatchSourceTimer` for debouncing, Convex + Express on the server, Node:test on the test runner.

**TDD note:** The iOS target has no XCTest setup (per `ios/README.md` Known gaps). Server changes get a hermetic test in `tests/ios-thread-routes.test.ts`. iOS tasks substitute `xcodebuild` + manual smoke for the unit-test step. Each iOS task ends with a specific manual verification step.

**Spec:** `docs/superpowers/specs/2026-05-20-ios-message-cache-design.md`

---

## Task 1: Server — `POST /inbound` returns `userMessageId`

**Why first:** every iOS task downstream depends on the server returning the stable id. Doing this first means the iOS side can stamp optimistic sends with the real id and the merge logic stays trivial.

**Files:**
- Modify: `server/channels/types.ts` (`ParsedInbound` gets an optional `precomputedUserMessageId` field)
- Modify: `server/interaction-agent.ts` (`HandleOpts` + `handleUserMessage` accept the same; skip persist + `user_message` broadcast when present)
- Modify: `server/channels/index.ts` (`runTurn` passes the field through to `handleUserMessage`)
- Modify: `server/ios/router.ts` (`/inbound` route persists inline, returns id, fires runTurn with the precomputed id)
- Test: `tests/ios-thread-routes.test.ts` (add an assertion to the existing `/inbound` smoke)

- [ ] **Step 1: Add the failing test assertion**

Edit `tests/ios-thread-routes.test.ts` around line 75-85 (the existing `POST /inbound without threadId uses the default thread` test). Replace the body type assertion with one that also expects `userMessageId`:

```ts
test("POST /inbound without threadId uses the default thread", async () => {
  const bearer = await pair(crypto.randomUUID());
  const res = await fetch(`${BASE}/channels/ios/inbound`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: "hello" }),
  });
  const body = (await res.json()) as {
    ok: boolean;
    threadId: string;
    userMessageId: string;
  };
  assert.equal(res.status, 200);
  assert.ok(body.threadId);
  assert.ok(
    typeof body.userMessageId === "string" && body.userMessageId.length > 0,
    "userMessageId should be a non-empty Convex id",
  );
});
```

- [ ] **Step 2: Run the test against a running dev server, verify it fails**

Start the dev server in another terminal: `npm run dev:server`. Then:

```
npx tsx --test tests/ios-thread-routes.test.ts --test-name-pattern="without threadId"
```

Expected: FAIL on the `userMessageId` assertion ("should be a non-empty Convex id").

- [ ] **Step 3: Thread the precomputed id through `ParsedInbound`**

Edit `server/channels/types.ts`. After the `threadId` field in `ParsedInbound` (around line 31), add:

```ts
  /**
   * If the calling channel already persisted the inbound user message
   * (e.g. iOS /inbound does this so it can return the id to the client),
   * pass the id here. handleUserMessage will skip its own persist +
   * `user_message` broadcast so we don't double-write the row.
   */
  precomputedUserMessageId?: string;
```

- [ ] **Step 4: Honor the precomputed id in `handleUserMessage`**

Edit `server/interaction-agent.ts`. Find the `HandleOpts` interface (search for `interface HandleOpts` — should be just above line 234) and add `precomputedUserMessageId?: string;` to it.

Then in `handleUserMessage` (line 234), replace the persist + broadcast block at lines 238-250 with:

```ts
  const inboundRole = opts.kind === "proactive" ? "system" : "user";

  // Skip the persist + broadcast when the calling channel already did
  // them (currently only iOS, so it can return the userMessageId to the
  // client synchronously from /inbound).
  if (!opts.precomputedUserMessageId) {
    await convex.mutation(api.messages.send, {
      conversationId: opts.conversationId,
      role: inboundRole,
      content: opts.content,
      attachments: opts.attachments,
      turnId,
      ...(opts.threadId ? { threadId: opts.threadId as any } : {}),
    });
    broadcast(opts.kind === "proactive" ? "proactive_notice" : "user_message", {
      conversationId: opts.conversationId,
      content: opts.content,
    });
  }
```

- [ ] **Step 5: Pass the field from `runTurn`**

Edit `server/channels/index.ts`. Find the `handleUserMessage` call inside `runTurn` (around line 91). Add `precomputedUserMessageId: inbound.precomputedUserMessageId,` to the opts object so it flows from `ParsedInbound` into `HandleOpts`:

```ts
    const reply = await handleUserMessage({
      conversationId,
      content,
      attachments,
      threadId,
      turnTag,
      precomputedUserMessageId: inbound.precomputedUserMessageId,
      onThinking: (t) => broadcast("thinking", { conversationId, t }),
    });
```

- [ ] **Step 6: Persist + broadcast + return id in the iOS `/inbound` route**

Edit `server/ios/router.ts`. Replace the existing `/inbound` handler body (around line 372-400) with:

```ts
  router.post("/inbound", requireBearer, async (req: AuthedRequest, res) => {
    const { text, threadId } = (req.body ?? {}) as { text?: string; threadId?: string };
    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "text required" });
      return;
    }
    const deviceId = req.deviceId!;

    let effectiveThreadId = threadId;
    if (!effectiveThreadId) {
      const { threadId: defaultId } = await convex.mutation(api.threads.ensureDefault, { deviceId });
      effectiveThreadId = defaultId;
    }

    const conversationId = `ios:${deviceId}:${effectiveThreadId}` as ConversationId;

    // Persist the inbound user message synchronously so we can return
    // the canonical Convex id to the client. The agent turn fires
    // fire-and-forget below — handleUserMessage skips its own persist
    // because we pass precomputedUserMessageId through.
    let userMessageId: string;
    try {
      userMessageId = await convex.mutation(api.messages.send, {
        conversationId,
        role: "user",
        content: text,
        threadId: effectiveThreadId as any,
      });
      broadcast("user_message", { conversationId, content: text });
    } catch (err) {
      console.error("[ios] /inbound persist failed", err);
      res.status(500).json({ error: "persist failed" });
      return;
    }

    runTurn({
      conversationId,
      from: `ios:${deviceId}`,
      content: text,
      threadId: effectiveThreadId,
      precomputedUserMessageId: userMessageId,
    }).catch((err) => console.error("[ios] runTurn failed", err));

    res.json({ ok: true, conversationId, threadId: effectiveThreadId, userMessageId });
  });
```

Note: if `broadcast` isn't already imported in `server/ios/router.ts`, add `import { broadcast } from "../broadcast.js";` at the top (check the existing import for the right path — `server/broadcast.ts` is where the function lives based on the rest of the codebase). Verify with `grep -n "export.*broadcast" server/broadcast.ts`.

- [ ] **Step 7: Run the test to verify it passes**

With the dev server still running:

```
npx tsx --test tests/ios-thread-routes.test.ts --test-name-pattern="without threadId"
```

Expected: PASS.

Then run the full ios-thread-routes suite to confirm nothing else broke:

```
npx tsx --test tests/ios-thread-routes.test.ts
```

Expected: all tests pass.

- [ ] **Step 8: Typecheck**

```
npx tsc --noEmit 2>&1 | grep -cE "(channels|interaction-agent|ios/router)\.ts"
```

Expected: `0` new errors (pre-existing `req.query` warnings in router.ts at lines ~451/474/484 are unrelated — those existed before this work).

- [ ] **Step 9: Commit**

```bash
git add server/channels/types.ts server/channels/index.ts server/interaction-agent.ts server/ios/router.ts tests/ios-thread-routes.test.ts
git commit -m "feat(ios): /inbound returns userMessageId for optimistic-send reconciliation

Splits the user-message persist out of the runTurn fire-and-forget so
the iOS route can return the canonical Convex message id synchronously.
handleUserMessage gains a precomputedUserMessageId opt — when set, it
skips its own persist + user_message broadcast (iOS already did them).
Other channels untouched.

Unblocks the iOS message cache (see
docs/superpowers/specs/2026-05-20-ios-message-cache-design.md):
optimistic local sends get stamped with the real id immediately, so
merge-by-id during background sync is trivial."
```

---

## Task 2: iOS — `CachedModels.swift` Codable wrappers

**Why:** Decoupled on-disk schema with `schemaVersion`. Renaming a `Message` field tomorrow doesn't silently corrupt old caches.

**Files:**
- Create: `ios/Boop/Storage/CachedModels.swift`

- [ ] **Step 1: Create the file**

Create `ios/Boop/Storage/CachedModels.swift`:

```swift
import Foundation

/// On-disk shape for a single thread's messages. Decoupled from
/// `Message` and `Attachment` (UI models) so a rename in the UI
/// layer doesn't silently break old caches — the cache decodes into
/// these structs first, then converts to UI models.
struct CachedThread: Codable {
    let schemaVersion: Int
    let threadId: String
    let lastSyncedAt: Double      // ms since epoch
    let messages: [CachedMessage]
}

struct CachedMessage: Codable {
    let id: String
    let threadId: String
    let role: String              // "user" | "assistant" | "system"
    let content: String
    let createdAt: Double         // ms since epoch
    let attachments: [CachedAttachment]
}

struct CachedAttachment: Codable {
    let kind: String              // "image" | "pdf" | "doc"
    let mimeType: String
    let sizeBytes: Int
    let storageId: String
    let signedUrl: String?
    let filename: String?
    let description: String?
}

/// On-disk shape for the threads list (open + archived).
struct CachedThreadsList: Codable {
    let schemaVersion: Int
    let lastSyncedAt: Double
    let open: [CachedThreadRow]
    let archived: [CachedThreadRow]
    /// Last active thread id, so cold launch can pick it back up.
    let activeThreadId: String?
}

struct CachedThreadRow: Codable {
    let id: String                // matches ServerThread._id
    let deviceId: String
    let icon: String?
    let label: String?
    let archived: Bool
    let createdAt: Double
    let lastMessageAt: Double?
}

enum CacheSchema {
    /// Bump this when CachedThread / CachedThreadsList shape changes
    /// in a backwards-incompatible way. `MessageCache.read*` returns
    /// nil on mismatch and the server fetch refills.
    static let currentVersion: Int = 1
}
```

- [ ] **Step 2: Add the file to the Xcode project + build**

XcodeGen auto-includes any `.swift` under `Boop/`. Regenerate + build:

```bash
cd ios && xcodegen generate --quiet
xcodebuild -project Boop.xcodeproj -scheme Boop -destination 'generic/platform=iOS Simulator' -configuration Debug build 2>&1 | tail -5
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 3: Commit**

```bash
git add ios/Boop/Storage/CachedModels.swift
git commit -m "feat(ios): CachedModels — Codable on-disk shapes for message cache

Decoupled from the UI models (Message/Attachment/ServerThread) so a
field rename in the UI layer doesn't silently corrupt old caches. Each
struct gets a schemaVersion via CacheSchema.currentVersion — mismatch
on read becomes a cache miss, server fetch refills."
```

---

## Task 3: iOS — `MessageCache.swift` actor

**Why:** Centralised disk I/O with debounced writes, atomic-replace semantics, and a single purge hook for unpair.

**Files:**
- Create: `ios/Boop/Storage/MessageCache.swift`

- [ ] **Step 1: Create the actor**

Create `ios/Boop/Storage/MessageCache.swift`:

```swift
import Foundation

/// Disk-backed cache for chat messages + the threads list. Owns the
/// filesystem layout under `Caches/`. Writes are debounced (500ms)
/// and use atomic replacement (`*.tmp` + replaceItem) to avoid torn
/// files when iOS suspends mid-write.
///
/// Design: one shared debounce timer for all threads, but the
/// latest payload per thread is held in `pendingPayloads`. Each
/// scheduleWrite refreshes the timer and overwrites the payload.
/// When the timer fires (or `flushAll` is called) every pending
/// payload writes. This means `flushAll` from
/// `scenePhase = .background` ACTUALLY persists what was pending —
/// the simpler "cancel the task" design we considered loses the
/// payload along with the timer.
///
/// All public methods are async so callers can `await` from any
/// context. The cache itself is a singleton.
actor MessageCache {
    static let shared = MessageCache()

    private let fm = FileManager.default
    private let threadsDir: URL
    private let threadsListURL: URL
    private var pendingPayloads: [String: CachedThread] = [:]
    private var debounceTask: Task<Void, Never>?
    private let debounceNanos: UInt64 = 500_000_000  // 500ms

    private init() {
        let caches = fm.urls(for: .cachesDirectory, in: .userDomainMask).first!
        self.threadsDir = caches.appendingPathComponent("threads", isDirectory: true)
        self.threadsListURL = caches.appendingPathComponent("threads-list.json")
        try? fm.createDirectory(at: threadsDir, withIntermediateDirectories: true)
    }

    // MARK: - Per-thread

    func readThread(_ threadId: String) async -> CachedThread? {
        let url = fileURL(for: threadId)
        guard let data = try? Data(contentsOf: url) else { return nil }
        guard let decoded = try? JSONDecoder().decode(CachedThread.self, from: data) else {
            return nil  // corrupt → caller treats as miss
        }
        guard decoded.schemaVersion == CacheSchema.currentVersion else {
            return nil  // forward/backward incompat → caller treats as miss
        }
        return decoded
    }

    /// Schedules a debounced write. The latest payload per thread
    /// wins; subsequent calls within the 500ms window coalesce into a
    /// single disk write. The global debounce timer resets on every
    /// call.
    func scheduleWrite(_ payload: CachedThread) {
        pendingPayloads[payload.threadId] = payload
        debounceTask?.cancel()
        debounceTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 500_000_000)
            if Task.isCancelled { return }
            await self?.flushAll()
        }
    }

    /// Force-flush every pending write. Synchronous on disk. Use
    /// from `scenePhase = .background` so anything pending lands
    /// before iOS suspends us.
    func flushAll() async {
        debounceTask?.cancel()
        debounceTask = nil
        let toWrite = pendingPayloads
        pendingPayloads.removeAll()
        for (_, payload) in toWrite {
            writeNow(payload)
        }
    }

    private func writeNow(_ payload: CachedThread) {
        let url = fileURL(for: payload.threadId)
        let tmp = url.appendingPathExtension("tmp")
        guard let data = try? JSONEncoder().encode(payload) else { return }
        do {
            try data.write(to: tmp, options: .atomic)
            _ = try fm.replaceItemAt(url, withItemAt: tmp)
        } catch {
            // Best-effort. Server is SoT; next mutation will retry.
            try? fm.removeItem(at: tmp)
        }
    }

    // MARK: - Threads list

    func readThreadsList() async -> CachedThreadsList? {
        guard let data = try? Data(contentsOf: threadsListURL) else { return nil }
        guard let decoded = try? JSONDecoder().decode(CachedThreadsList.self, from: data) else {
            return nil
        }
        guard decoded.schemaVersion == CacheSchema.currentVersion else { return nil }
        return decoded
    }

    func writeThreadsList(_ payload: CachedThreadsList) async {
        let tmp = threadsListURL.appendingPathExtension("tmp")
        guard let data = try? JSONEncoder().encode(payload) else { return }
        do {
            try data.write(to: tmp, options: .atomic)
            _ = try fm.replaceItemAt(threadsListURL, withItemAt: tmp)
        } catch {
            try? fm.removeItem(at: tmp)
        }
    }

    // MARK: - Purge

    /// Wipes the entire cache. Call on unpair so the next pair starts
    /// clean.
    func purgeAll() async {
        debounceTask?.cancel()
        debounceTask = nil
        pendingPayloads.removeAll()
        try? fm.removeItem(at: threadsDir)
        try? fm.removeItem(at: threadsListURL)
        try? fm.createDirectory(at: threadsDir, withIntermediateDirectories: true)
    }

    /// Purges a single thread's cache. Used when archive/delete makes
    /// the local file pointless (optional — server is SoT, leaving it
    /// is fine, but cleanup keeps Caches/ tidy).
    func purgeThread(_ threadId: String) async {
        pendingPayloads[threadId] = nil
        try? fm.removeItem(at: fileURL(for: threadId))
    }

    private func fileURL(for threadId: String) -> URL {
        threadsDir.appendingPathComponent("\(threadId).json")
    }
}
```

Why this design instead of one-Task-per-thread: a `Task` holds its payload via capture, so cancelling the Task to "force flush early" loses the payload. Holding payloads in `pendingPayloads` separately means `flushAll` can persist them even after the timer's been cancelled. The actor's serial execution guarantees no torn reads of the dict.

- [ ] **Step 2: Build**

```bash
cd ios && xcodebuild -project Boop.xcodeproj -scheme Boop -destination 'generic/platform=iOS Simulator' -configuration Debug build 2>&1 | tail -5
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 3: Commit**

```bash
git add ios/Boop/Storage/MessageCache.swift
git commit -m "feat(ios): MessageCache actor — debounced JSON-file disk cache

Singleton actor that owns the on-disk message cache under
Caches/threads/<threadId>.json + Caches/threads-list.json. Writes are
debounced 500ms via a shared timer + per-thread payload coalescing
(pendingPayloads dict), so flushAll on scenePhase=.background can
persist whatever's pending even after cancelling the timer. Atomic
replacement (.tmp + replaceItemAt) prevents torn files when iOS
suspends mid-write. Public surface: readThread / scheduleWrite per
thread, readThreadsList / writeThreadsList, flushAll for background,
purgeAll for unpair, purgeThread for cleanup."
```

---

## Task 4: iOS — `InboundResponse.userMessageId` + stamp optimistic sends

**Why:** Wires the new server field through to the client so optimistic local user messages get their canonical id immediately. Merge logic stays trivial after this.

**Files:**
- Modify: `ios/Boop/Models/Models.swift` (extend `InboundResponse`)
- Modify: `ios/Boop/State/ChatStore.swift` (`send` stamps the local id)

- [ ] **Step 1: Add `userMessageId` to `InboundResponse`**

Find `InboundResponse` (likely in `ios/Boop/Models/Models.swift`). Add the optional field:

```bash
grep -n "struct InboundResponse" ios/Boop/Models/*.swift
```

Then edit that file to add the field — example shape:

```swift
struct InboundResponse: Codable {
    let ok: Bool
    let conversationId: String
    let threadId: String
    let userMessageId: String?   // new — present on iOS /inbound responses
}
```

Make it `String?` to stay backwards-compat with any cached/stub response shapes.

- [ ] **Step 2: Stamp the local optimistic id in `ChatStore.send`**

Edit `ios/Boop/State/ChatStore.swift`. Replace the `send` function (around lines 199-217) with:

```swift
    func send(_ text: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let bearer, let baseURL = settings.serverBaseURL, let threadId else { return }

        sendError = nil
        isAwaitingReply = true

        let localId = "local-\(UUID().uuidString)"
        messages.append(Message(id: localId, threadId: threadId, role: .user,
                                content: trimmed, createdAt: Date()))

        let client = BoopClient(baseURL: baseURL, bearer: bearer)
        do {
            let response = try await client.sendInbound(text: trimmed, threadId: threadId)
            // Replace the optimistic local id with the canonical Convex id.
            // This keeps merge-by-id trivial during background sync.
            if let serverId = response.userMessageId,
               let idx = messages.firstIndex(where: { $0.id == localId }) {
                messages[idx].id = serverId
            }
        } catch {
            sendError = "Send failed: \(error.localizedDescription)"
            isAwaitingReply = false
        }
    }
```

If `Message.id` is currently `let` instead of `var`, change it to `var` in `Models.swift` so the stamp can mutate. Grep:

```bash
grep -n "let id\|var id" ios/Boop/Models/Models.swift | head -5
```

- [ ] **Step 3: Build + manual smoke**

```bash
cd ios && xcodebuild -project Boop.xcodeproj -scheme Boop -destination 'generic/platform=iOS Simulator' -configuration Debug build 2>&1 | tail -5
```

Expected: `** BUILD SUCCEEDED **`.

Manual smoke (later, once iOS is in a sim or device with the server running):
- Send a message. Open the dashboard or `/messages` route — the persisted user message should have an id matching what the client now stores.

- [ ] **Step 4: Commit**

```bash
git add ios/Boop/Models/Models.swift ios/Boop/State/ChatStore.swift
git commit -m "feat(ios): stamp optimistic user-send with server userMessageId

InboundResponse gains userMessageId; ChatStore.send replaces the
local-<uuid> id with the canonical Convex id as soon as /inbound
returns. Merge-by-id during background cache sync becomes trivial."
```

---

## Task 5: iOS — `ChatStore` refactor: `perThread` dict + computed `messages`

**Why:** Today `switchTo` wipes `messages` on every thread change. The dict-based shape lets switching be a pointer swap. This task is the structural refactor — cache I/O comes in the next task.

**Files:**
- Modify: `ios/Boop/State/ChatStore.swift`

- [ ] **Step 1: Replace `messages` with `perThread`**

Edit `ios/Boop/State/ChatStore.swift`. At the top of the class (around line 11), replace:

```swift
    private(set) var messages: [Message] = []
```

with:

```swift
    /// Per-thread message buffers. The view layer reads `messages`
    /// (computed below) which projects the active thread's array.
    /// Switching threads is now a pointer swap, not a wipe.
    private(set) var perThread: [String: [Message]] = [:]

    var messages: [Message] {
        get { threadId.flatMap { perThread[$0] } ?? [] }
    }
```

- [ ] **Step 2: Replace every direct `messages` mutation with a per-thread helper**

Add at the bottom of the class, before the closing brace:

```swift
    // MARK: - Per-thread mutation helpers

    private func mutateActive(_ block: (inout [Message]) -> Void) {
        guard let tid = threadId else { return }
        var buf = perThread[tid] ?? []
        block(&buf)
        perThread[tid] = buf
    }

    private func appendActive(_ message: Message) {
        mutateActive { $0.append(message) }
    }
```

Then replace every site that mutates `messages` in this file:

- `unbind()` (around line 50): `messages.removeAll()` → `perThread.removeAll()`
- `switchTo` (around line 64): remove the `messages.removeAll()` line — switching no longer wipes. (Full rewrite of `switchTo` is in Task 6.)
- `loadHistory` (around line 79-86): the `messages = response.messages.reversed()...` line becomes:

```swift
            let mapped = response.messages
                .reversed()
                .map { $0.toMessage(defaultThreadId: threadId) }
            perThread[threadId] = mapped
```

- `attachToLatestAssistant` (around line 157-166): rewrite to mutate the active thread's buffer:

```swift
    private func attachToLatestAssistant(_ attachments: [Attachment]) {
        mutateActive { msgs in
            guard let idx = msgs.lastIndex(where: { $0.role == .assistant }) else { return }
            var current = msgs[idx].attachments
            for a in attachments where !current.contains(where: { $0.id == a.id }) {
                current.append(a)
            }
            msgs[idx].attachments = current
        }
    }
```

- `appendDelta` (around line 168): rewrite using `mutateActive`:

```swift
    private func appendDelta(_ chunk: String) {
        guard let threadId else { return }
        mutateActive { msgs in
            if let id = streamingMessageId, let idx = msgs.firstIndex(where: { $0.id == id }) {
                msgs[idx].content.append(chunk)
            } else {
                let id = "stream-\(UUID().uuidString)"
                streamingMessageId = id
                msgs.append(Message(id: id, threadId: threadId, role: .assistant,
                                    content: chunk, createdAt: Date(), isStreaming: true))
            }
        }
    }
```

- `finalizeMessage` (around line 180): same treatment:

```swift
    private func finalizeMessage(_ content: String) {
        guard let threadId else { return }
        mutateActive { msgs in
            if let id = streamingMessageId, let idx = msgs.firstIndex(where: { $0.id == id }) {
                msgs[idx].content = content
                msgs[idx].isStreaming = false
                streamingMessageId = nil
                return
            }
            msgs.append(Message(id: "final-\(UUID().uuidString)", threadId: threadId, role: .assistant,
                                content: content, createdAt: Date()))
        }
    }
```

- `appendAck` (around line 193): same:

```swift
    private func appendAck(_ content: String) {
        guard let threadId else { return }
        mutateActive { msgs in
            msgs.append(Message(id: "ack-\(UUID().uuidString)", threadId: threadId, role: .assistant,
                                content: content, createdAt: Date()))
        }
    }
```

- `send` (around line 199): change the `messages.append(...)` call to `appendActive(...)`. Same for the `messages[idx].id = serverId` stamp from Task 4 — wrap in `mutateActive`:

```swift
        appendActive(Message(id: localId, threadId: threadId, role: .user,
                             content: trimmed, createdAt: Date()))

        let client = BoopClient(baseURL: baseURL, bearer: bearer)
        do {
            let response = try await client.sendInbound(text: trimmed, threadId: threadId)
            if let serverId = response.userMessageId {
                mutateActive { msgs in
                    if let idx = msgs.firstIndex(where: { $0.id == localId }) {
                        msgs[idx].id = serverId
                    }
                }
            }
        } catch { ... }
```

- [ ] **Step 3: Build**

```bash
cd ios && xcodebuild -project Boop.xcodeproj -scheme Boop -destination 'generic/platform=iOS Simulator' -configuration Debug build 2>&1 | tail -5
```

Expected: `** BUILD SUCCEEDED **`.

If the compiler complains about `messages` being a stored property in a `@Observable` class but you've made it computed — the @Observable macro tracks computed properties via their underlying storage, but you need to ensure SwiftUI re-renders by reading `perThread` somewhere or by exposing `messages` via a different mechanism. Check by running the app: if the chat doesn't re-render on stream events, fall back to making `messages` a stored `private(set)` and updating it inside `mutateActive` (set `messages = perThread[activeId] ?? []`). The Observable machinery in Swift 5.10 should handle the dict-based path — verify by running.

- [ ] **Step 4: Manual smoke**

Run the app in the simulator. Send a message. Confirm:
- The user message bubble shows.
- Streaming delta arrives and renders into a bubble.
- Final message replaces the streaming bubble.

If the chat view does NOT re-render on events, the @Observable change-tracking isn't firing through the dict. Quick fix: in each `mutateActive` call, also do `_ = perThread.keys` to nudge tracking, or revert to stored-array + `perThread` cache underneath. Decide based on what you observe.

- [ ] **Step 5: Commit**

```bash
git add ios/Boop/State/ChatStore.swift
git commit -m "refactor(ios): ChatStore — perThread dict, computed messages

Drops the wipe-on-switch behavior in favor of a per-thread message
buffer dict. \`messages\` becomes a computed view of the active
thread, so switching is a pointer swap. Mutation goes through a
small mutateActive helper so the @Observable machinery still picks
up changes. No behavior change in the chat itself yet — Task 6
makes switchTo actually use the dict."
```

---

## Task 6: iOS — `ChatStore.switchTo` cache-first read + `refreshFromServer` merge

**Why:** This is where the user-facing UX win lands. switchTo no longer fetches synchronously — it reads cache, paints, then refreshes in the background and merges.

**Files:**
- Modify: `ios/Boop/State/ChatStore.swift`

- [ ] **Step 1: Replace `switchTo` and rename `loadHistory`**

Edit `ios/Boop/State/ChatStore.swift`. Replace `switchTo(threadId:)` (around lines 62-73) and `loadHistory()` (around 75-86) with:

```swift
    /// Switch the active thread. Reads cache for instant paint, then
    /// fires a background server refresh that merges by message id.
    /// Idempotent on same-thread tap (no-op).
    func switchTo(threadId: String) async {
        guard threadId != self.threadId else { return }
        streamTask?.cancel()
        streamTask = nil
        self.threadId = threadId
        streamingMessageId = nil

        // Cache-first paint: if we already have it in memory, nothing
        // to do. Otherwise hydrate from disk synchronously (relative
        // to the calling view's task) so the chat shows immediately.
        if perThread[threadId] == nil {
            if let cached = await MessageCache.shared.readThread(threadId) {
                perThread[threadId] = cached.messages.map { $0.toMessage() }
            } else {
                perThread[threadId] = []
            }
        }

        // Background sync — does NOT block the UI. SSE picks up the
        // stream in parallel.
        Task { await refreshFromServer(threadId: threadId) }
        startStreaming()
    }

    /// Background sync: fetch the latest 50 messages and merge into
    /// the cache by Convex `_id`. Falls back to a content+timestamp
    /// match for any leftover `local-…` optimistic ids (defense in
    /// depth — Task 4 already stamps them at send-time).
    func refreshFromServer(threadId: String) async {
        guard let bearer, let baseURL = settings.serverBaseURL else { return }
        let client = BoopClient(baseURL: baseURL, bearer: bearer)
        let response: MessagesResponse
        do {
            response = try await client.fetchMessages(threadId: threadId, limit: 50)
        } catch {
            // Cache stays as-is; SSE will keep painting new ones.
            return
        }

        let server = response.messages.map { $0.toMessage(defaultThreadId: threadId) }
        let merged = mergeMessages(local: perThread[threadId] ?? [], server: server)
        perThread[threadId] = merged

        // Schedule a debounced cache write — fire and forget.
        Task { await writeCacheForThread(threadId) }
    }

    /// Merge server-fetched messages into the local buffer.
    /// 1. For each server message: if local has the id, replace.
    ///    Else if local has a `local-…` user message with the same
    ///    content within ±5s, replace its id with the server one.
    ///    Else insert sorted by createdAt.
    /// 2. Cap at 200; drop oldest by createdAt if over.
    private func mergeMessages(local: [Message], server: [Message]) -> [Message] {
        var out = local
        let byId = Dictionary(uniqueKeysWithValues: out.enumerated().map { ($1.id, $0) })
        for s in server {
            if let idx = byId[s.id] {
                out[idx] = s
                continue
            }
            // Heuristic match for local-prefixed user messages.
            if s.role == .user,
               let idx = out.firstIndex(where: { m in
                   m.id.hasPrefix("local-")
                       && m.role == .user
                       && m.content == s.content
                       && abs(m.createdAt.timeIntervalSince(s.createdAt)) < 5
               }) {
                out[idx] = s
                continue
            }
            // Otherwise insert sorted.
            let insertion = out.firstIndex(where: { $0.createdAt > s.createdAt }) ?? out.count
            out.insert(s, at: insertion)
        }
        // Cap at 200; drop oldest first.
        if out.count > 200 {
            out.sort { $0.createdAt < $1.createdAt }
            out = Array(out.suffix(200))
        }
        return out
    }

    private func writeCacheForThread(_ threadId: String) async {
        let msgs = perThread[threadId] ?? []
        let payload = CachedThread(
            schemaVersion: CacheSchema.currentVersion,
            threadId: threadId,
            lastSyncedAt: Date().timeIntervalSince1970 * 1000,
            messages: msgs.map { $0.toCached() },
        )
        await MessageCache.shared.scheduleWrite(payload)
    }
```

This references `CachedMessage` ↔ `Message` converters. Add them to `Models.swift` (or a small extension file):

```swift
// In ios/Boop/Models/Models.swift, near the Message struct:

extension Message {
    func toCached() -> CachedMessage {
        CachedMessage(
            id: id,
            threadId: threadId,
            role: role.rawValue,
            content: content,
            createdAt: createdAt.timeIntervalSince1970 * 1000,
            attachments: attachments.map { $0.toCached() },
        )
    }
}

extension CachedMessage {
    func toMessage() -> Message {
        Message(
            id: id,
            threadId: threadId,
            role: MessageRole(rawValue: role) ?? .assistant,
            content: content,
            createdAt: Date(timeIntervalSince1970: createdAt / 1000),
            attachments: attachments.map { $0.toAttachment() },
        )
    }
}

extension Attachment {
    func toCached() -> CachedAttachment {
        CachedAttachment(
            kind: kind.rawValue,
            mimeType: mimeType,
            sizeBytes: sizeBytes,
            storageId: storageId,
            signedUrl: signedUrl,
            filename: filename,
            description: description,
        )
    }
}

extension CachedAttachment {
    func toAttachment() -> Attachment {
        Attachment(
            kind: AttachmentKind(rawValue: kind) ?? .doc,
            mimeType: mimeType,
            sizeBytes: sizeBytes,
            storageId: storageId,
            signedUrl: signedUrl,
            filename: filename,
            description: description,
        )
    }
}
```

Adjust the actual `Message` / `Attachment` initializer signatures to match what's in `Models.swift`. Run:

```bash
grep -n "struct Message\b\|struct Attachment\b" ios/Boop/Models/Models.swift
```

to confirm field names.

- [ ] **Step 2: Add cache writes on SSE events**

Edit `handle(event:)` (around line 119). At the bottom, after the switch, add:

```swift
        // After applying the event, schedule a cache write for the
        // active thread. Metadata-only events (thread_icon, agent_*)
        // don't change `messages` so don't bother.
        switch event {
        case .delta, .message, .ack, .attachments:
            if let tid = threadId { Task { await writeCacheForThread(tid) } }
        default:
            break
        }
```

- [ ] **Step 3: Build + smoke**

```bash
cd ios && xcodebuild -project Boop.xcodeproj -scheme Boop -destination 'generic/platform=iOS Simulator' -configuration Debug build 2>&1 | tail -5
```

Expected: `** BUILD SUCCEEDED **`.

Manual smoke:
- Send a message and wait for the assistant reply.
- Kill the app from the app switcher.
- Relaunch.
- The last few messages should paint **instantly** before any spinner/connection state shows.
- Within a session: switch from thread A → B → A. After the first visit, the second visit to A should paint instantly with no loading state.

- [ ] **Step 4: Commit**

```bash
git add ios/Boop/State/ChatStore.swift ios/Boop/Models/Models.swift
git commit -m "feat(ios): cache-first switchTo + background refreshFromServer

switchTo no longer fetches synchronously. Reads cache (in-memory →
disk → empty) and paints immediately, then fires a background sync
that merges by Convex \`_id\` with a fallback heuristic for any
stragglers (content + role + ±5s). Cache writes go through the
debounced MessageCache actor."
```

---

## Task 7: iOS — `ThreadsStore.hydrateFromCache` + write-back

**Why:** The dock bar also needs cache-first paint. Without this, the user sees an empty dock for ~1s on cold launch.

**Files:**
- Modify: `ios/Boop/State/ThreadsStore.swift`

- [ ] **Step 1: Add hydrate + write-back to ThreadsStore**

Edit `ios/Boop/State/ThreadsStore.swift`. Add after `bind(bearer:)` (around line 24):

```swift
    /// Loads the open + archived threads list from disk and paints
    /// the dock bar instantly. Safe to call before the bearer is set
    /// — paints local UI only, doesn't touch the network. Server
    /// fetch via loadThreads() should fire right after.
    func hydrateFromCache() async {
        guard let cached = await MessageCache.shared.readThreadsList() else { return }
        self.threads = cached.open.map { $0.toThread() }
        if let active = cached.activeThreadId,
           threads.contains(where: { $0.id == active }) {
            self.activeThreadId = active
        } else {
            self.activeThreadId = threads.first?.id
        }
    }

    /// Persists the current open/archived list to disk. Called after
    /// every successful server fetch + when the active thread changes.
    func writeListCache(archived: [ServerThread] = []) async {
        let payload = CachedThreadsList(
            schemaVersion: CacheSchema.currentVersion,
            lastSyncedAt: Date().timeIntervalSince1970 * 1000,
            open: threads.map { $0.toCachedRow() },
            archived: archived.map { $0.toCachedRow() },
            activeThreadId: activeThreadId,
        )
        await MessageCache.shared.writeThreadsList(payload)
    }
```

Add the `toCachedRow()` converters. In `ios/Boop/Models/Thread.swift` (or wherever `BoopThread` / `ServerThread` live):

```swift
extension BoopThread {
    func toCachedRow() -> CachedThreadRow {
        CachedThreadRow(
            id: id,
            deviceId: "",          // local model doesn't carry deviceId; leave empty, server fetch refills
            icon: icon,
            label: label,
            archived: false,
            createdAt: createdAt.timeIntervalSince1970 * 1000,
            lastMessageAt: lastMessageAt.map { $0.timeIntervalSince1970 * 1000 },
        )
    }
}

extension ServerThread {
    func toCachedRow() -> CachedThreadRow {
        CachedThreadRow(
            id: _id,
            deviceId: deviceId,
            icon: icon,
            label: label,
            archived: archived,
            createdAt: Double(createdAt),
            lastMessageAt: lastMessageAt.map { Double($0) },
        )
    }
}

extension CachedThreadRow {
    func toThread() -> BoopThread {
        BoopThread(
            id: id,
            icon: icon,
            label: label,
            createdAt: Date(timeIntervalSince1970: createdAt / 1000),
            lastMessageAt: lastMessageAt.map { Date(timeIntervalSince1970: $0 / 1000) },
            unread: false,
        )
    }
}
```

Confirm the actual `BoopThread` / `ServerThread` field shapes with:

```bash
grep -nE "struct (BoopThread|ServerThread)" ios/Boop/Models/Thread.swift
```

Adjust the converters to match.

- [ ] **Step 2: Write back after every successful server fetch**

Edit `loadThreads()` (around line 35). At the very end of the `do` block (after `activeThreadId` is set), add:

```swift
            Task { await writeListCache() }
```

In `unarchiveThread(_:)` (around line 134), after `await loadThreads(); activeThreadId = id`, the cache write fires automatically from inside `loadThreads`. No extra change needed.

For `archiveThread(_:)` (around line 153), after `threads.removeAll { $0.id == id }`, add:

```swift
            Task { await writeListCache() }
```

For `deleteThread(_:)` (around line 132), same — add a `writeListCache` after the local removal block.

For `selectThread(_:)` (around line 62), add:

```swift
        Task { await writeListCache() }
```

at the end, so `activeThreadId` persists.

- [ ] **Step 3: Build**

```bash
cd ios && xcodebuild -project Boop.xcodeproj -scheme Boop -destination 'generic/platform=iOS Simulator' -configuration Debug build 2>&1 | tail -5
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 4: Commit**

```bash
git add ios/Boop/State/ThreadsStore.swift ios/Boop/Models/Thread.swift
git commit -m "feat(ios): ThreadsStore hydrates from + writes back to MessageCache

hydrateFromCache reads threads-list.json and paints the dock bar
instantly. Every successful server fetch + every list mutation
(archive/unarchive/delete/select) schedules a write-back. The active
thread id persists too, so cold launch picks up the last-active
thread."
```

---

## Task 8: iOS — `RootView` post-pair hydration + `PairingStore.unpair` purge

**Why:** Wire the hydration into the actual app lifecycle and ensure unpair leaves no stranded data behind.

**Files:**
- Modify: `ios/Boop/Views/RootView.swift`
- Modify: `ios/Boop/State/PairingStore.swift`
- Modify: `ios/Boop/BoopApp.swift` (scenePhase flush hook)

- [ ] **Step 1: Hydrate from cache in RootView once paired**

Edit `ios/Boop/Views/RootView.swift`. Find where it switches between `PairingView` and `ChatView` based on `pairing.phase` (search for `.paired`). When transitioning to the paired branch, add a `.task` that hydrates the cache before kicking off network fetches:

```swift
            ChatView(showMenu: $showMenu)
                .task {
                    // Cache-first paint: hydrate before any server
                    // fetch so the dock bar shows instantly.
                    await threadsStore.hydrateFromCache()
                    // Hydrate the active thread's messages too, so the
                    // first ChatView render is non-empty.
                    if let active = threadsStore.activeThreadId {
                        await chatStore.switchTo(threadId: active)
                    }
                    // Then sync with the server.
                    await threadsStore.loadThreads()
                }
```

Adjust to match the actual binding shape of RootView. If RootView already has a `.task` on the paired branch, prepend the hydrate calls inside that existing task.

- [ ] **Step 2: Purge cache on unpair**

Edit `ios/Boop/State/PairingStore.swift`. Find `unpair()` (search for `func unpair`). At the start of the function, add:

```swift
        Task.detached { await MessageCache.shared.purgeAll() }
```

`Task.detached` so the cache wipe doesn't block UI; it doesn't matter if it lands slightly after the rest of the unpair tear-down.

- [ ] **Step 3: Flush on background**

Edit `ios/Boop/BoopApp.swift`. Find the `Scene` body (top-level `WindowGroup`). Add `@Environment(\.scenePhase)` and an `.onChange`:

```swift
@main
struct BoopApp: App {
    // ... existing state objects ...
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                // ... existing modifiers ...
                .onChange(of: scenePhase) { _, new in
                    if new == .background {
                        Task { await MessageCache.shared.flushAll() }
                    }
                }
        }
    }
}
```

If `BoopApp` is more complex (delegate adaptor lives there for APNs), keep `@UIApplicationDelegateAdaptor` and just add the `@Environment` + `.onChange`.

- [ ] **Step 4: Build + smoke**

```bash
cd ios && xcodebuild -project Boop.xcodeproj -scheme Boop -destination 'generic/platform=iOS Simulator' -configuration Debug build 2>&1 | tail -5
```

Expected: `** BUILD SUCCEEDED **`.

Manual smoke (the big one — this is the user-facing payoff):
1. Pair, send a few messages, get an assistant reply.
2. Background the app (swipe up to home).
3. Kill from app switcher.
4. Relaunch.
5. **Expected:** dock bar and active thread's chat are painted before any spinner/connection banner. The connection banner may flicker `connecting…` briefly while SSE reconnects, but the messages themselves are there immediately.
6. Unpair. Re-pair as a different device. **Expected:** chat is empty (cache wiped).

- [ ] **Step 5: Commit**

```bash
git add ios/Boop/Views/RootView.swift ios/Boop/State/PairingStore.swift ios/Boop/BoopApp.swift
git commit -m "feat(ios): wire cache hydration into RootView + scenePhase flush

Once PairingStore.phase == .paired, RootView calls hydrateFromCache
on ThreadsStore + switchTo on ChatStore before any server fetch,
giving cold launches a zero-spinner paint. scenePhase = .background
hard-flushes pending writes. unpair() purges the cache so re-pair
starts clean."
```

---

## Task 9: iOS — Docs, final verification, CHANGELOG

**Files:**
- Modify: `ios/README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Drop the offline-cache gap from README**

Edit `ios/README.md`. In the "Known gaps" section, remove the bullet about offline history cache. Update the top-of-README "Status" line — it currently says "Still ahead: offline history cache, …". Drop "offline history cache" from that list.

Also update the Architecture table — add a row for `MessageCache`:

```markdown
| `Storage/MessageCache.swift` | Singleton actor backing the on-disk message cache. Per-thread JSON files under `Caches/threads/`, plus `Caches/threads-list.json`. Debounced 500ms writes, atomic replacement, hard-flush on background, purge-all on unpair. |
| `Storage/CachedModels.swift` | Codable shapes (`CachedThread`, `CachedThreadsList`) decoupled from the UI models. `schemaVersion` lets future shape changes wipe-and-refetch cleanly. |
```

Pick the right spot in the table to keep alphabetical-ish order.

- [ ] **Step 2: CHANGELOG entry**

Edit `CHANGELOG.md`. Insert at the top of the `Unreleased` block (above the existing `iOS permanent thread deletion` entry):

```markdown
## Unreleased — iOS local message cache

Chat history paints **instantly** on cold launch and every thread switch. Backed by per-thread JSON files under `Caches/threads/<threadId>.json` plus `Caches/threads-list.json` for the dock state. Server stays source-of-truth; cache renders first, then a background `/messages?threadId=...&limit=50` fetch merges by Convex `_id`. SSE continues to write into the cache in real time. Implementation plan: `docs/superpowers/plans/2026-05-20-ios-message-cache.md`. Design spec: `docs/superpowers/specs/2026-05-20-ios-message-cache-design.md`.

**Server**
- Changed: `POST /channels/ios/inbound` now returns `userMessageId` — the canonical Convex id of the persisted user message — so the client can stamp its optimistic `local-<uuid>` send and merge-by-id is trivial on the next refresh. `handleUserMessage` gains a `precomputedUserMessageId` opt that lets the iOS route persist + broadcast inline (the route awaits persistence to get the id; the rest of the turn fires fire-and-forget as before). Other channels (Sendblue, Telegram) unchanged.
- Added: assertion in `tests/ios-thread-routes.test.ts` that `/inbound` returns a non-empty `userMessageId`.

**iOS**
- Added: `Boop/Storage/MessageCache.swift` — singleton actor. Per-thread debounced writes (500ms), atomic replacement via `FileManager.replaceItemAt`, hard-flush on `scenePhase = .background`, `purgeAll` on unpair.
- Added: `Boop/Storage/CachedModels.swift` — Codable shapes (`CachedThread`, `CachedThreadsList`, `CachedMessage`, `CachedAttachment`, `CachedThreadRow`) with a `schemaVersion` field so shape changes don't silently corrupt old caches.
- Changed: `ChatStore.messages` becomes a computed view over `perThread: [String: [Message]]`. `switchTo(threadId:)` reads cache-first (memory → disk → empty), paints immediately, then fires `refreshFromServer(threadId:)` in the background. The refresh merges by Convex `_id` with a content+role+±5s fallback for the rare unstamped optimistic send.
- Changed: `ChatStore.send` now stamps the optimistic `local-<uuid>` with the canonical id from `/inbound`'s response, so the heuristic merge is a defense-in-depth path rather than the primary one.
- Changed: `ThreadsStore` gains `hydrateFromCache()` (called from `RootView` once paired) + `writeListCache()` after every list-affecting mutation (loadThreads, archive, unarchive, delete, selectThread). The active thread id persists across launches.
- Changed: `PairingStore.unpair` purges the cache so re-pair starts clean.
- Changed: `BoopApp` watches `scenePhase`; transitioning to `.background` triggers `MessageCache.flushAll()` so pending debounced writes land before suspension.

**Out of scope (intentional)**
- Attachment blob caching — kind/mimeType/storageId stays cached, but image/PDF bytes still re-fetch from the signed URL on tap. Signed URLs expire server-side; caching them would be pointless.
- Offline send queue. Sending while offline still fails the same way it does today.
- `GET /messages?since=<ms>` server-side delta endpoint. Volumes are tiny (≤50 msgs per thread) — always-refetching the latest 50 in the background is cheap.
- XCTest target. Verification was manual per the existing iOS testing gap.
```

- [ ] **Step 3: Final verification — full xcodebuild + APNs hermetic tests + typecheck**

```bash
cd /Users/lakunle/project/boop-agent
npx tsx --test tests/apns.test.ts 2>&1 | tail -5
```

Expected: 8/8 pass.

```bash
cd ios && xcodegen generate --quiet
xcodebuild -project Boop.xcodeproj -scheme Boop -destination 'generic/platform=iOS Simulator' -configuration Debug build 2>&1 | tail -5
```

Expected: `** BUILD SUCCEEDED **`.

```bash
cd /Users/lakunle/project/boop-agent
npx tsc --noEmit 2>&1 | grep -cE "error TS"
```

Expected: same baseline error count as before the cache work began (8 pre-existing errors). No new errors.

- [ ] **Step 4: End-to-end manual verification matrix**

With the dev server running and the app on a simulator:

1. **Cold launch zero-spinner.** Fresh paired install → send a few messages → background → kill from app switcher → relaunch. Dock bar paints + active thread paints **before** any spinner.
2. **Thread switch zero-spinner (warm).** Visit thread A, then B, then A. Second visit to A paints instantly.
3. **Thread switch zero-spinner (cold).** Kill the app, relaunch, immediately switch to a non-active thread → that thread's cached messages paint instantly while background sync fires.
4. **Background sync merges.** Have someone send a proactive notice via the dashboard while the app is closed. Reopen → cached state appears first, then the new message slots in within a few seconds.
5. **Optimistic id stamping.** Send a message; immediately after the bubble appears, check the dashboard's message log — the persisted user message should have an id, and `/messages` returning that id should match what the app shows (no duplicate user bubbles after sync).
6. **Airplane mode.** Toggle airplane mode → switch threads → cached state still paints. Connection banner shows `disconnected…` but messages are visible. Disable airplane mode → SSE reconnects, sync runs.
7. **Unpair wipe.** Send some messages → unpair from Settings → re-pair as a fresh device → chat is empty.
8. **Storage pressure simulation.** Manually delete `~/Library/Developer/CoreSimulator/.../Caches/<bundle-id>/threads/` while the app is foregrounded → next thread switch silently refills from the server, no error popup.

- [ ] **Step 5: Commit + push**

```bash
git add ios/README.md CHANGELOG.md
git commit -m "docs: iOS message cache — CHANGELOG + README updates

Drops the offline-history-cache gap from README and adds the cache
section to CHANGELOG."
git push
```

---

## Failure modes

| # | Failure | Coverage |
|---|---------|----------|
| 1 | iOS purges `Caches/` under storage pressure | `readThread` / `readThreadsList` return `nil`; cold launch shows empty briefly while server fetch lands. Same code path as a corrupt file. |
| 2 | Corrupt JSON on disk | `JSONDecoder.decode` throws; `readThread` returns `nil`; treated as cache miss. |
| 3 | `schemaVersion` mismatch (after future change) | Reader returns `nil`; cache rebuilds from server. No migration needed at v1. |
| 4 | App killed mid-write | Atomic `replaceItemAt` semantics mean we either see the old file or the new one — never a torn write. Pending debounced timer is just cancelled on launch. |
| 5 | Send fails after the optimistic bubble was appended | Local message stays in `perThread`. On next refresh the server returns nothing matching it (id is still `local-…`), so the heuristic doesn't fire, the orphan persists. Same UX as today — `sendError` banner shows. (Future: retry-send sweep.) |
| 6 | Server returns a user message whose content matches a different local optimistic send | The ±5s window keeps mis-merges rare. If two unstamped sends happened within 5s with identical content, we might mis-stamp — extremely unlikely in practice + the userMessageId stamping in Task 4 makes the heuristic a fallback, not the primary path. |
| 7 | iOS clock skew vs server | The ±5s window covers normal drift. If a device's clock is hours off (rare), the heuristic falls through and the server message gets inserted as a new row — visually a duplicate, but the next manual page-down or refresh corrects it (server `_id` dedupes on subsequent merges). |
| 8 | SSE delivers a message before the background `/messages` fetch returns | SSE writes go through `appendDelta` / `finalizeMessage` which work in-memory. The background merge re-encounters the same id and replaces in place (idempotent). |
| 9 | Two threads receive simultaneous SSE deltas | Each delta is keyed to the active thread; non-active threads receive `thread_activity` via the fanout (Plan B) and just light up an unread dot. The cache is only written for the active thread, which is what we want. |
| 10 | Re-paired device finds stale cache (didn't go through unpair flow) | `PairingStore.unpair` purges the cache on the normal logout path. If the user re-pairs without unpairing (rare), the previous device's threads-list will paint briefly, but the next `loadThreads()` will return the new device's threads and overwrite the cache. Single-flicker UX bug, not data loss.

## Definition of done

- All 9 commits land. `xcodebuild` green, `tests/apns.test.ts` 8/8, `tests/ios-thread-routes.test.ts` includes the `userMessageId` assertion and passes against a running dev server.
- The manual verification matrix (Task 9 Step 4) passes end-to-end on a simulator.
- `ios/README.md` no longer lists offline-history as a Known gap.
- The branch is pushed and ready for the next thing (Live Activities / widgets, or whatever's next on the iOS roadmap).
