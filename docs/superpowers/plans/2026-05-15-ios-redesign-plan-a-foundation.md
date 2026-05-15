# iOS Redesign — Plan A (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the M1 iOS app with the redesigned, multi-thread, Markdown-rich, file-aware chat client. After this plan, the app reflects the approved design (`ios_app_design.pen`) and supports up to 4 concurrent threads with per-thread tints. Files browser screen and Live agents screen are stubs (Plan B fills them in).

**Architecture:** ConversationId becomes `ios:<deviceId>:<threadId>`. New Convex `threads` table; existing chats migrate to a default thread. iOS app gets a from-scratch design system (color tokens, typography, Lucide icon bundle, per-thread tints), a new dock component (composer + thread bar), a Markdown-rendering message bubble, file cards, a full-screen file preview, and a bottom-sheet menu. The current pairing/keychain/SSE infrastructure carries over with thread-aware endpoints.

**Tech Stack:** Convex, Express, TypeScript, SwiftUI (iOS 17+), Inter + JetBrains Mono (bundled), Lucide icons (SVG, bundled).

**Reference design:** [`/Users/lakunle/project/boop-agent/ios_app_design.pen`](../../../ios_app_design.pen) + spec at [`docs/superpowers/specs/2026-05-15-ios-redesign-brief.md`](../specs/2026-05-15-ios-redesign-brief.md).

---

## File structure

### Server (TypeScript)

- **Create**:
  - `convex/threads.ts` — thread mutations/queries (create, list, setIcon, archive, default-thread-for-device)
- **Modify**:
  - `convex/schema.ts` — add `threads` table
  - `convex/messages.ts` — `send` accepts optional `threadId`; `list` and `recentAcrossChannels` honor it
  - `server/channels/types.ts` — `ConversationId` regex / parser supports optional `:threadId` suffix
  - `server/channels/index.ts` — `runTurn` writes `threadId` on persisted messages
  - `server/ios/router.ts` — new thread endpoints; `/inbound`, `/messages`, `/stream` become thread-scoped
  - `server/self-tools.ts` — add `set_thread_icon` tool
  - `server/interaction-agent.ts` — system-prompt addendum about thread-icon picking

### Server tests (Node `node:test` via tsx)

- **Create**:
  - `tests/threads.test.ts` — Convex `threads` table contract
  - `tests/ios-thread-routes.test.ts` — HTTP-level smoke for `/channels/ios/threads/*`

### iOS (SwiftUI)

- **Create — design system**:
  - `ios/Boop/DesignSystem/Colors.swift` — color tokens (matches `.pen` variables)
  - `ios/Boop/DesignSystem/Typography.swift` — `BoopFont` + scale + font-loader
  - `ios/Boop/DesignSystem/Spacing.swift` — constants for 4–28pt scale
  - `ios/Boop/DesignSystem/ThreadTints.swift` — 8-color palette + hash function
  - `ios/Boop/DesignSystem/LucideIcon.swift` — icon view + curated name list

- **Create — bundled resources**:
  - `ios/Boop/Resources/Fonts/Inter-Regular.ttf`
  - `ios/Boop/Resources/Fonts/Inter-Medium.ttf`
  - `ios/Boop/Resources/Fonts/Inter-SemiBold.ttf`
  - `ios/Boop/Resources/Fonts/JetBrainsMono-Regular.ttf`
  - `ios/Boop/Resources/Fonts/JetBrainsMono-Medium.ttf`
  - `ios/Boop/Resources/Lucide/<icon-name>.svg` × ~50

- **Create — components**:
  - `ios/Boop/Views/Components/Dock.swift` — composer + thread bar in one rounded surface
  - `ios/Boop/Views/Components/MessageBubble.swift` — agent / user / file-card variants with Markdown
  - `ios/Boop/Views/Components/FileCard.swift` — file row used in chat + later in files browser
  - `ios/Boop/Views/Components/SubAgentPill.swift` — inline running-agent pill
  - `ios/Boop/Views/Components/TypingBubble.swift` — three-dot animation
  - `ios/Boop/Views/Components/MarkdownView.swift` — internal Markdown renderer for bubbles + previews
  - `ios/Boop/Views/MenuSheet.swift` — bottom sheet 2×2 cards (Files / Live Agents / Archived / Settings)
  - `ios/Boop/Views/FilePreviewScreen.swift` — full-screen .md/.pdf/.image viewer

- **Create — state**:
  - `ios/Boop/State/ThreadsStore.swift` — manages list of open threads
  - `ios/Boop/Models/Thread.swift` — `BoopThread` model

- **Modify**:
  - `ios/Boop/BoopApp.swift` — register custom fonts on launch
  - `ios/Boop/Models/Models.swift` — `Message` gains `threadId`; `ServerMessage` likewise
  - `ios/Boop/Storage/AppSettings.swift` — track active `threadId`
  - `ios/Boop/Networking/BoopClient.swift` — thread-aware methods + new thread endpoints
  - `ios/Boop/State/ChatStore.swift` — now scoped per thread, plus thread-switching logic
  - `ios/Boop/State/PairingStore.swift` — unchanged (left as-is)
  - `ios/Boop/Views/RootView.swift` — wires ThreadsStore + ChatStore + MenuSheet
  - `ios/Boop/Views/ChatView.swift` — full redesign to match `.pen`
  - `ios/Boop/Views/PairingView.swift` — restyled to match new design system
  - `ios/Boop/Views/SettingsView.swift` — restyled to match new design system

- **Delete**: none (all M1 files evolve)

- **XcodeGen**:
  - `ios/project.yml` — register font files + Lucide resources in the build

---

## Task ordering and dependencies

Tasks are ordered so the engineer always has compile-able code:
1. Tasks 1–5: server data model and endpoints (thread-aware, backwards-compatible with current M1 conversationId)
2. Task 6: server-side `set_thread_icon` tool and dispatcher prompt
3. Tasks 7–9: iOS font bundling + design system
4. Task 10: Lucide icon component + curated set
5. Tasks 11–12: state refactor (ThreadsStore + ChatStore + Models)
6. Task 13: BoopClient endpoints
7. Tasks 14–18: new components (TypingBubble, MarkdownView, MessageBubble, FileCard, SubAgentPill, Dock)
8. Tasks 19–22: screens (MenuSheet, FilePreviewScreen, ChatView, PairingView/SettingsView refresh)
9. Task 23: end-to-end on simulator + verify
10. Task 24: design brief + plan diff doc + commit + push

---

### Task 1: Add `threads` Convex table + helpers

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/threads.ts`
- Test: `tests/threads.test.ts`

- [ ] **Step 1: Add the `threads` table to schema**

Open `convex/schema.ts` and add a new table definition alongside the existing ones (after `devices`):

```typescript
  threads: defineTable({
    deviceId: v.string(),
    icon: v.optional(v.string()),       // e.g. "calendar", "lightbulb" — name in Lucide subset
    label: v.optional(v.string()),      // optional human-readable label (M2; agent may also set this)
    archived: v.boolean(),
    createdAt: v.number(),
    lastMessageAt: v.optional(v.number()),
  })
    .index("by_device", ["deviceId", "archived"])
    .index("by_device_lastMessageAt", ["deviceId", "lastMessageAt"]),
```

- [ ] **Step 2: Create `convex/threads.ts` with `createThread`, `listOpen`, `setIcon`, `archive`, `ensureDefault`**

Create `convex/threads.ts`:

```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/** Maximum number of OPEN threads per device. Older ones must be archived
 *  before a new one can be created. Matches the spec. */
const MAX_OPEN_THREADS = 4;

export const createThread = mutation({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const open = await ctx.db
      .query("threads")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId).eq("archived", false))
      .collect();
    if (open.length >= MAX_OPEN_THREADS) {
      throw new Error(`Cannot have more than ${MAX_OPEN_THREADS} open threads`);
    }
    const now = Date.now();
    const id = await ctx.db.insert("threads", {
      deviceId,
      archived: false,
      createdAt: now,
      lastMessageAt: now,
    });
    return { threadId: id };
  },
});

export const listOpen = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    return await ctx.db
      .query("threads")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId).eq("archived", false))
      .order("asc")
      .collect();
  },
});

export const setIcon = mutation({
  args: { threadId: v.id("threads"), icon: v.string() },
  handler: async (ctx, { threadId, icon }) => {
    await ctx.db.patch(threadId, { icon });
  },
});

export const archive = mutation({
  args: { threadId: v.id("threads") },
  handler: async (ctx, { threadId }) => {
    await ctx.db.patch(threadId, { archived: true });
  },
});

/** Returns an id for the default thread of this device. Creates one if none exist.
 *  Used to backfill the M1 single-thread conversations into the new schema. */
export const ensureDefault = mutation({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const existing = await ctx.db
      .query("threads")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId).eq("archived", false))
      .first();
    if (existing) return { threadId: existing._id };
    const now = Date.now();
    const id = await ctx.db.insert("threads", {
      deviceId,
      archived: false,
      createdAt: now,
      lastMessageAt: now,
    });
    return { threadId: id };
  },
});

export const touchLastMessageAt = mutation({
  args: { threadId: v.id("threads"), at: v.number() },
  handler: async (ctx, { threadId, at }) => {
    await ctx.db.patch(threadId, { lastMessageAt: at });
  },
});
```

- [ ] **Step 3: Write threads contract test**

Create `tests/threads.test.ts`:

```typescript
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

/**
 * These tests assume `npx convex dev --once` has been run so the
 * convex/threads functions are deployed. They run against the deployment
 * URL in .env.local, so they create + clean real rows. We tag deviceId
 * with a fresh UUID per run so we don't collide with prod data.
 */

function client() {
  const url = process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL;
  if (!url) throw new Error("CONVEX_URL not set");
  return new ConvexHttpClient(url);
}

test("ensureDefault creates a thread on first call, reuses on second", async () => {
  const c = client();
  const deviceId = `test-${crypto.randomUUID()}`;
  const a = await c.mutation(api.threads.ensureDefault, { deviceId });
  const b = await c.mutation(api.threads.ensureDefault, { deviceId });
  assert.equal(a.threadId, b.threadId);
});

test("listOpen returns threads ordered, max 4 open enforced", async () => {
  const c = client();
  const deviceId = `test-${crypto.randomUUID()}`;
  for (let i = 0; i < 4; i++) {
    await c.mutation(api.threads.createThread, { deviceId });
  }
  const open = await c.query(api.threads.listOpen, { deviceId });
  assert.equal(open.length, 4);
  await assert.rejects(
    c.mutation(api.threads.createThread, { deviceId }),
    /no more than 4 open/i,
  );
});

test("setIcon updates a thread", async () => {
  const c = client();
  const deviceId = `test-${crypto.randomUUID()}`;
  const { threadId } = await c.mutation(api.threads.createThread, { deviceId });
  await c.mutation(api.threads.setIcon, { threadId, icon: "calendar" });
  const open = await c.query(api.threads.listOpen, { deviceId });
  assert.equal(open[0].icon, "calendar");
});

test("archive hides thread from listOpen", async () => {
  const c = client();
  const deviceId = `test-${crypto.randomUUID()}`;
  const { threadId } = await c.mutation(api.threads.createThread, { deviceId });
  await c.mutation(api.threads.archive, { threadId });
  const open = await c.query(api.threads.listOpen, { deviceId });
  assert.equal(open.length, 0);
});
```

- [ ] **Step 4: Push Convex functions + run tests**

```bash
npx convex dev --once
npx tsx --test tests/threads.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts convex/threads.ts tests/threads.test.ts
git commit -m "feat(threads): convex threads table + CRUD helpers"
```

---

### Task 2: Add `threadId` to messages schema and queries

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/messages.ts`
- Modify: `convex/validators.ts` (if any shared validators)

- [ ] **Step 1: Add `threadId` to the messages table**

In `convex/schema.ts`, find the `messages` table definition and add `threadId`:

```typescript
  messages: defineTable({
    conversationId: v.string(),
    threadId: v.optional(v.id("threads")),   // ← NEW: undefined for pre-multi-thread rows
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.string(),
    turnId: v.optional(v.string()),
    attachments: v.optional(v.array(/* existing validator */)),
    // ... existing fields ...
  })
    .index("by_conversation", ["conversationId"])
    .index("by_thread", ["threadId"])
    .index("by_conversation_creationTime", ["conversationId", "_creationTime"]),
```

- [ ] **Step 2: Make `messages:send` accept optional threadId**

In `convex/messages.ts`, update the `send` mutation args:

```typescript
export const send = mutation({
  args: {
    conversationId: v.string(),
    threadId: v.optional(v.id("threads")),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.string(),
    turnId: v.optional(v.string()),
    attachments: v.optional(/* existing */),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("messages", { ... args });
    if (args.threadId) {
      await ctx.db.patch(args.threadId, { lastMessageAt: Date.now() });
    }
    return id;
  },
});
```

- [ ] **Step 3: Add `messages:listForThread`**

In `convex/messages.ts`, add:

```typescript
export const listForThread = query({
  args: { threadId: v.id("threads"), limit: v.optional(v.number()) },
  handler: async (ctx, { threadId, limit = 50 }) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .order("desc")
      .take(limit);
  },
});
```

- [ ] **Step 4: Push + verify types**

```bash
npx convex dev --once
npx tsc --noEmit 2>&1 | tail -10
```

Expected: zero new TypeScript errors (existing pre-existing errors carry over).

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts convex/messages.ts
git commit -m "feat(threads): messages table tracks threadId"
```

---

### Task 3: Conversation-id parser handles threadId suffix

**Files:**
- Modify: `server/channels/types.ts`

- [ ] **Step 1: Update `ConversationId` template + parser**

Open `server/channels/types.ts` and update:

```typescript
/** Identifier for each channel. */
export type ChannelId = "sms" | "tg" | "ios";

/** Conversation IDs are channel-prefixed:
 *    sms:+15551234567
 *    tg:123456789
 *    ios:<deviceUuid>           (legacy / M1 — treated as default thread)
 *    ios:<deviceUuid>:<threadId>  (multi-thread)
 */
export type ConversationId = `${ChannelId}:${string}`;

/** Parse an iOS conversationId. Returns null if not iOS. */
export function parseIosConversationId(
  cid: string,
): { deviceId: string; threadId: string | null } | null {
  if (!cid.startsWith("ios:")) return null;
  const rest = cid.slice("ios:".length);
  const sep = rest.indexOf(":");
  if (sep === -1) return { deviceId: rest, threadId: null };
  return { deviceId: rest.slice(0, sep), threadId: rest.slice(sep + 1) };
}

export function iosConversationId(deviceId: string, threadId: string): ConversationId {
  return `ios:${deviceId}:${threadId}` as ConversationId;
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep "channels/types" | head -5
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add server/channels/types.ts
git commit -m "feat(channels): parse ios:<deviceId>:<threadId> conversation ids"
```

---

### Task 4: iOS HTTP thread endpoints

**Files:**
- Modify: `server/ios/router.ts`

- [ ] **Step 1: Add `/threads/create`, `/threads`, `/threads/:id/archive`, `/threads/:id/icon` to the router**

In `server/ios/router.ts`, after the existing `requireBearer` middleware and before any other routes:

```typescript
import { api } from "../../convex/_generated/api.js";
// ...existing imports...

/** GET /channels/ios/threads — list open threads for the authed device. */
router.get("/threads", requireBearer, async (req: AuthedRequest, res) => {
  try {
    const threads = await convex.query(api.threads.listOpen, {
      deviceId: req.deviceId!,
    });
    res.json({ threads });
  } catch (err) {
    console.error("[ios] threads:list failed", err);
    res.status(500).json({ error: "list threads failed" });
  }
});

/** POST /channels/ios/threads/create — create a new open thread (max 4). */
router.post("/threads/create", requireBearer, async (req: AuthedRequest, res) => {
  try {
    const { threadId } = await convex.mutation(api.threads.createThread, {
      deviceId: req.deviceId!,
    });
    res.json({ threadId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("no more than 4")) {
      res.status(409).json({ error: "max open threads reached" });
      return;
    }
    console.error("[ios] threads:create failed", err);
    res.status(500).json({ error: "create thread failed" });
  }
});

/** POST /channels/ios/threads/:threadId/archive */
router.post("/threads/:threadId/archive", requireBearer, async (req: AuthedRequest, res) => {
  try {
    await convex.mutation(api.threads.archive, {
      threadId: req.params.threadId as any,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[ios] threads:archive failed", err);
    res.status(500).json({ error: "archive thread failed" });
  }
});

/** PATCH /channels/ios/threads/:threadId/icon — called by the dispatcher
 *  via the set_thread_icon self-tool, NOT by the iOS client. We still
 *  authenticate the device bearer to keep it consistent with the rest. */
router.patch("/threads/:threadId/icon", requireBearer, async (req: AuthedRequest, res) => {
  const { icon } = (req.body ?? {}) as { icon?: string };
  if (!icon || typeof icon !== "string") {
    res.status(400).json({ error: "icon required" });
    return;
  }
  try {
    await convex.mutation(api.threads.setIcon, {
      threadId: req.params.threadId as any,
      icon,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[ios] threads:setIcon failed", err);
    res.status(500).json({ error: "set icon failed" });
  }
});
```

- [ ] **Step 2: Update `/inbound` to require threadId; default to ensureDefault when missing for backwards-compat**

Find the existing `POST /inbound` handler in `server/ios/router.ts` and replace its body:

```typescript
router.post("/inbound", requireBearer, async (req: AuthedRequest, res) => {
  const { text, threadId } = (req.body ?? {}) as { text?: string; threadId?: string };
  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "text required" });
    return;
  }
  const deviceId = req.deviceId!;

  // For backwards compatibility with pre-multi-thread iOS builds, an
  // /inbound POST without threadId routes to the device's default thread.
  let effectiveThreadId = threadId;
  if (!effectiveThreadId) {
    const { threadId: defaultId } = await convex.mutation(api.threads.ensureDefault, { deviceId });
    effectiveThreadId = defaultId;
  }

  const conversationId = `ios:${deviceId}:${effectiveThreadId}` as ConversationId;
  runTurn({
    conversationId,
    from: `ios:${deviceId}`,
    content: text,
    threadId: effectiveThreadId,
  }).catch((err) => console.error("[ios] runTurn failed", err));
  res.json({ ok: true, conversationId, threadId: effectiveThreadId });
});
```

- [ ] **Step 3: Update `/messages` to take threadId from query, fall back to default thread**

```typescript
router.get("/messages", requireBearer, async (req: AuthedRequest, res) => {
  const deviceId = req.deviceId!;
  const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
  const queryThreadId = typeof req.query.threadId === "string" ? req.query.threadId : null;

  try {
    let threadId = queryThreadId;
    if (!threadId) {
      const r = await convex.mutation(api.threads.ensureDefault, { deviceId });
      threadId = r.threadId;
    }
    const messages = await convex.query(api.messages.listForThread, {
      threadId: threadId as any,
      limit,
    });
    res.json({ threadId, messages });
  } catch (err) {
    console.error("[ios] messages:list failed", err);
    res.status(500).json({ error: "history fetch failed" });
  }
});
```

- [ ] **Step 4: Update `/stream` to filter by `conversationId` that includes threadId**

```typescript
router.get("/stream", requireBearer, (req: AuthedRequest, res) => {
  const deviceId = req.deviceId!;
  const threadId = typeof req.query.threadId === "string" ? req.query.threadId : null;
  if (!threadId) {
    res.status(400).json({ error: "threadId required" });
    return;
  }
  const conversationId = `ios:${deviceId}:${threadId}`;
  // ...existing SSE setup (headers, subscribe, heartbeat)...
  // The filter `data.conversationId !== conversationId` now naturally matches.
});
```

- [ ] **Step 5: Update `runTurn` signature to accept threadId**

In `server/channels/index.ts`, edit `runTurn` to thread it through:

```typescript
export interface RunTurnArgs {
  conversationId: ConversationId;
  from: string;
  content: string;
  attachments?: Doc<"messages">["attachments"];
  threadId?: string;  // ← NEW
}

export async function runTurn(args: RunTurnArgs): Promise<void> {
  // ...existing setup...
  const reply = await handleUserMessage({
    conversationId: args.conversationId,
    content: args.content,
    attachments: args.attachments,
    threadId: args.threadId,  // ← passed through
    turnTag,
    onThinking: (t) => broadcast("thinking", { conversationId: args.conversationId, t }),
  });
  // ...
  // When persisting the assistant reply, include threadId:
  await convex.mutation(api.messages.send, {
    conversationId: args.conversationId,
    threadId: args.threadId as any,
    role: "assistant",
    content: reply,
  });
}
```

- [ ] **Step 6: Update `handleUserMessage` to persist user message with threadId**

In `server/interaction-agent.ts`, find where the user message is persisted at the start of `handleUserMessage` and add `threadId`:

```typescript
await convex.mutation(api.messages.send, {
  conversationId: opts.conversationId,
  threadId: opts.threadId as any,
  role: opts.kind === "proactive" ? "system" : "user",
  content: opts.content,
  attachments: opts.attachments,
});
```

And add `threadId?: string` to `HandleOpts`.

- [ ] **Step 7: Restart server + verify still boots**

```bash
pkill -f "tsx watch server/index.ts" 2>/dev/null
sleep 2
npm run dev:server &
sleep 12
curl -s http://localhost:3456/health
```

Expected: `{"ok":true,"service":"boop-agent"}`.

- [ ] **Step 8: Commit**

```bash
git add server/ios/router.ts server/channels/index.ts server/interaction-agent.ts
git commit -m "feat(ios): thread-aware endpoints (/threads, /inbound, /messages, /stream)"
```

---

### Task 5: `set_thread_icon` self-tool + dispatcher prompt

**Files:**
- Modify: `server/self-tools.ts`
- Modify: `server/interaction-agent.ts`

- [ ] **Step 1: Add the `set_thread_icon` tool**

In `server/self-tools.ts`, add after `set_active_channel`:

```typescript
import { iosConversationId, parseIosConversationId } from "./channels/types.js";

// Inside the self-tools registration block:
tool(
  "set_thread_icon",
  `Pick the Lucide icon name that best represents the topic of the current
   iOS thread. Call this ONCE per thread, on the first reply, before any
   other text. Choose from the curated set:
   calendar, clock, lightbulb, sparkles, search, telescope, mail,
   message-circle, send, code, terminal, git-branch, briefcase, building,
   file-text, shopping-cart, dollar-sign, credit-card, plane, map,
   compass, book, book-open, bookmark, music, headphones, heart, smile,
   dumbbell, salad, car, train-front, graduation-cap, phone-call, video,
   utensils, coffee, list-todo, check-square, globe, languages, baby,
   paw-print.
   Only effective when the user is on iOS. Pass the threadId that was
   captured at handleUserMessage call time. Returns success or no-op.`,
  {
    icon: z.string().describe("One of the curated Lucide icon names."),
  },
  async (args, ctx) => {
    // ctx is the MCP server context; threadId is on the conversation
    // we're handling — passed through via a module-level set on each turn.
    // Implementation reads it from interaction-agent.ts's currentThreadIdRef.
    const threadId = getCurrentTurnThreadId();
    if (!threadId) {
      return {
        content: [{ type: "text" as const, text: "Not an iOS thread — no-op." }],
      };
    }
    await convex.mutation(api.threads.setIcon, {
      threadId: threadId as any,
      icon: args.icon,
    });
    return {
      content: [
        { type: "text" as const, text: `Thread icon set to ${args.icon}.` },
      ],
    };
  },
),
```

- [ ] **Step 2: Plumb `currentTurnThreadId` ref through the interaction agent**

At the top of `server/self-tools.ts`, add:

```typescript
let currentTurnThreadId: string | null = null;

export function setCurrentTurnThreadId(threadId: string | null): void {
  currentTurnThreadId = threadId;
}

function getCurrentTurnThreadId(): string | null {
  return currentTurnThreadId;
}
```

In `server/interaction-agent.ts`'s `handleUserMessage`, before the `for await (const msg of query(...))` loop, call:

```typescript
import { setCurrentTurnThreadId } from "./self-tools.js";
// ...
setCurrentTurnThreadId(opts.threadId ?? null);
try {
  for await (const msg of query({...})) { ... }
} finally {
  setCurrentTurnThreadId(null);
}
```

- [ ] **Step 3: Update dispatcher system prompt with thread-icon instruction**

In `server/interaction-agent.ts`, find the `INTERACTION_SYSTEM` constant and add this section near the top (after the channel-specific guidance):

```typescript
// (inside INTERACTION_SYSTEM, after the channel/active-channel section)
`
Threads (iOS only):
The user may have multiple threads open at once on iOS. Each thread is its own
chat with its own message history; user memories (recall/write_memory) are
shared across all threads.

When you reply for the FIRST TIME in a brand-new thread (no prior assistant
messages in this conversation), call set_thread_icon with one Lucide icon
name that captures the thread's topic. Call it BEFORE your first text reply.
Example: user says "what's on my calendar?" → call set_thread_icon({"icon":"calendar"}),
then reply.

Skip this on subsequent turns. Skip it on non-iOS channels (no-op anyway).
`
```

- [ ] **Step 4: Verify the dispatcher prompt + tool registration compile**

```bash
npx tsc --noEmit 2>&1 | grep -E "self-tools|interaction-agent" | head -5
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add server/self-tools.ts server/interaction-agent.ts
git commit -m "feat(ios): set_thread_icon self-tool + dispatcher prompt addendum"
```

---

### Task 6: Server-side smoke test for thread endpoints

**Files:**
- Create: `tests/ios-thread-routes.test.ts`

- [ ] **Step 1: Write the route smoke test**

Create `tests/ios-thread-routes.test.ts`:

```typescript
import { test } from "node:test";
import { strict as assert } from "node:assert";

/** End-to-end against a running dev server.
 *  Requires `npm run dev:server` to be running on :3456. */

const BASE = "http://localhost:3456";

async function pair(deviceIdSeed: string): Promise<string> {
  const deviceId = `test-${deviceIdSeed}`;
  const code = await fetch(`${BASE}/channels/ios/pair/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId }),
  }).then((r) => r.json());

  await fetch(`${BASE}/channels/ios/pair/consume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: (code as any).code, label: "test" }),
  });

  const checked = await fetch(`${BASE}/channels/ios/pair/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId }),
  }).then((r) => r.json());

  return (checked as any).bearerToken;
}

test("GET /threads returns empty list initially", async () => {
  const bearer = await pair(crypto.randomUUID());
  const res = await fetch(`${BASE}/channels/ios/threads`, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  const body = (await res.json()) as { threads: unknown[] };
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(body.threads));
});

test("POST /threads/create yields a threadId, GET /threads reflects it", async () => {
  const bearer = await pair(crypto.randomUUID());
  const create = await fetch(`${BASE}/channels/ios/threads/create`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}` },
  });
  assert.equal(create.status, 200);
  const { threadId } = (await create.json()) as { threadId: string };
  assert.ok(threadId);

  const list = await fetch(`${BASE}/channels/ios/threads`, {
    headers: { Authorization: `Bearer ${bearer}` },
  }).then((r) => r.json());
  assert.equal((list as any).threads.length, 1);
  assert.equal((list as any).threads[0]._id, threadId);
});

test("creating a 5th thread returns 409", async () => {
  const bearer = await pair(crypto.randomUUID());
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`${BASE}/channels/ios/threads/create`, {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}` },
    });
    assert.equal(r.status, 200, `thread ${i + 1} should succeed`);
  }
  const fifth = await fetch(`${BASE}/channels/ios/threads/create`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}` },
  });
  assert.equal(fifth.status, 409);
});

test("POST /inbound without threadId uses the default thread", async () => {
  const bearer = await pair(crypto.randomUUID());
  const res = await fetch(`${BASE}/channels/ios/inbound`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: "hello" }),
  });
  const body = (await res.json()) as { ok: boolean; threadId: string };
  assert.equal(res.status, 200);
  assert.ok(body.threadId);
});
```

- [ ] **Step 2: Run it**

```bash
npm run dev:server &
sleep 12
npx tsx --test tests/ios-thread-routes.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/ios-thread-routes.test.ts
git commit -m "test(ios): HTTP smoke for /channels/ios/threads"
```

---

### Task 7: Bundle Inter and JetBrains Mono fonts

**Files:**
- Create: `ios/Boop/Resources/Fonts/Inter-Regular.ttf`
- Create: `ios/Boop/Resources/Fonts/Inter-Medium.ttf`
- Create: `ios/Boop/Resources/Fonts/Inter-SemiBold.ttf`
- Create: `ios/Boop/Resources/Fonts/JetBrainsMono-Regular.ttf`
- Create: `ios/Boop/Resources/Fonts/JetBrainsMono-Medium.ttf`
- Modify: `ios/Boop/Resources/Info.plist`
- Modify: `ios/project.yml`

- [ ] **Step 1: Download Inter (3 weights) and JetBrains Mono (2 weights)**

```bash
mkdir -p ios/Boop/Resources/Fonts
cd ios/Boop/Resources/Fonts

# Inter v4.0 (SIL OFL)
curl -L -o Inter.zip https://github.com/rsms/inter/releases/download/v4.0/Inter-4.0.zip
unzip -o Inter.zip "Inter Desktop/Inter-Regular.otf" -d /tmp/inter
unzip -o Inter.zip "Inter Desktop/Inter-Medium.otf" -d /tmp/inter
unzip -o Inter.zip "Inter Desktop/Inter-SemiBold.otf" -d /tmp/inter
cp "/tmp/inter/Inter Desktop/Inter-Regular.otf"  Inter-Regular.otf
cp "/tmp/inter/Inter Desktop/Inter-Medium.otf"   Inter-Medium.otf
cp "/tmp/inter/Inter Desktop/Inter-SemiBold.otf" Inter-SemiBold.otf
rm -f Inter.zip
rm -rf /tmp/inter

# JetBrains Mono v2.304 (SIL OFL)
curl -L -o JBMono.zip https://github.com/JetBrains/JetBrainsMono/releases/download/v2.304/JetBrainsMono-2.304.zip
unzip -o JBMono.zip "fonts/ttf/JetBrainsMono-Regular.ttf" -d /tmp/jbm
unzip -o JBMono.zip "fonts/ttf/JetBrainsMono-Medium.ttf"  -d /tmp/jbm
cp /tmp/jbm/fonts/ttf/JetBrainsMono-Regular.ttf .
cp /tmp/jbm/fonts/ttf/JetBrainsMono-Medium.ttf  .
rm -f JBMono.zip
rm -rf /tmp/jbm

ls -la
cd -
```

Expected: 5 font files in `ios/Boop/Resources/Fonts/`.

- [ ] **Step 2: Register fonts in Info.plist**

Open `ios/Boop/Resources/Info.plist` and add inside the top `<dict>`:

```xml
<key>UIAppFonts</key>
<array>
    <string>Fonts/Inter-Regular.otf</string>
    <string>Fonts/Inter-Medium.otf</string>
    <string>Fonts/Inter-SemiBold.otf</string>
    <string>Fonts/JetBrainsMono-Regular.ttf</string>
    <string>Fonts/JetBrainsMono-Medium.ttf</string>
</array>
```

- [ ] **Step 3: Make project.yml copy the Fonts directory as a resource bundle**

The existing `sources: - path: Boop` already picks them up because they live under `Boop/Resources/`. To confirm, regenerate the xcodeproj:

```bash
cd ios && xcodegen generate && cd -
```

Expected: `Created project at .../Boop.xcodeproj`.

- [ ] **Step 4: Commit**

```bash
git add ios/Boop/Resources/Fonts/ ios/Boop/Resources/Info.plist
git commit -m "feat(ios): bundle Inter + JetBrains Mono fonts"
```

---

### Task 8: Design system — Colors, Typography, Spacing

**Files:**
- Create: `ios/Boop/DesignSystem/Colors.swift`
- Create: `ios/Boop/DesignSystem/Typography.swift`
- Create: `ios/Boop/DesignSystem/Spacing.swift`

- [ ] **Step 1: Create `Colors.swift`**

```swift
import SwiftUI

enum BoopColor {
    // Surface scale (dark mode primary)
    static let bg            = Color(hex: "#08090a")
    static let surface       = Color(hex: "#0d0e10")
    static let surfaceElev   = Color(hex: "#131418")

    // Borders & dividers
    static let border        = Color(hex: "#1f2024")
    static let borderStrong  = Color(hex: "#2a2b2f")

    // Text
    static let textPrimary   = Color(hex: "#f7f8f8")
    static let textSecondary = Color(hex: "#8b909a")
    static let textTertiary  = Color(hex: "#62666d")

    // Brand
    static let accent        = Color(hex: "#ff5a1f")
    static let accentGlow    = Color(hex: "#ff5a1f").opacity(0.40)

    // Semantic
    static let success       = Color(hex: "#5dd5a0")
    static let error         = Color(hex: "#ff7882")

    // Bubble glass
    static let bubbleAgentBg     = Color.white.opacity(0.05)
    static let bubbleAgentBorder = Color.white.opacity(0.08)
    static let glassBg     = Color(hex: "#14161a").opacity(0.55)
    static let glassBorder = Color.white.opacity(0.10)

    // Code
    static let codeBg       = Color(hex: "#0c0d10")
    static let codeFg       = Color(hex: "#c8cad0")
    static let codeKeyword  = Color(hex: "#ff8358")
    static let codeString   = Color(hex: "#5dd5a0")
    static let codeFunction = Color(hex: "#7aa2ff")
    static let codeComment  = Color(hex: "#62666d")
}

private extension Color {
    init(hex: String) {
        let cleaned = hex.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "#", with: "")
        var value: UInt64 = 0
        Scanner(string: cleaned).scanHexInt64(&value)
        let r = Double((value & 0xFF0000) >> 16) / 255
        let g = Double((value & 0x00FF00) >> 8) / 255
        let b = Double(value & 0x0000FF) / 255
        self.init(red: r, green: g, blue: b)
    }
}
```

- [ ] **Step 2: Create `Typography.swift`**

```swift
import SwiftUI

enum BoopFont {
    static func regular(_ size: CGFloat) -> Font { .custom("Inter-Regular",  size: size) }
    static func medium(_ size: CGFloat) -> Font  { .custom("Inter-Medium",   size: size) }
    static func semibold(_ size: CGFloat) -> Font{ .custom("Inter-SemiBold", size: size) }
    static func mono(_ size: CGFloat) -> Font    { .custom("JetBrainsMono-Regular", size: size) }
    static func monoMedium(_ size: CGFloat) -> Font { .custom("JetBrainsMono-Medium", size: size) }

    // Named tokens (match brief §3.1)
    static let heroH1   = semibold(22)
    static let heroH2   = semibold(16)
    static let heroH3   = semibold(14)
    static let bodyLarge  = regular(14.5)
    static let bodyMedium = regular(13.5)
    static let label      = medium(12.5)
    static let meta       = regular(11)
    static let metaCaps   = semibold(10.5)
    static let monoSmall  = mono(10.5)
    static let monoBody   = mono(12)
}
```

- [ ] **Step 3: Create `Spacing.swift`**

```swift
import SwiftUI

enum BoopSpacing {
    static let xs: CGFloat = 4
    static let s: CGFloat = 6
    static let m: CGFloat = 8
    static let mPlus: CGFloat = 10
    static let l: CGFloat = 12
    static let lPlus: CGFloat = 14
    static let xl: CGFloat = 16
    static let edge: CGFloat = 18      // screen edge gutter
    static let sheetPad: CGFloat = 22
    static let dockFromBottom: CGFloat = 28
}

enum BoopRadius {
    static let xs: CGFloat = 4
    static let s: CGFloat = 6
    static let m: CGFloat = 8
    static let l: CGFloat = 12
    static let lPlus: CGFloat = 14
    static let card: CGFloat = 16
    static let bubble: CGFloat = 14
    static let composer: CGFloat = 18
    static let dock: CGFloat = 24
    static let sheet: CGFloat = 24
}
```

- [ ] **Step 4: Verify it compiles**

```bash
cd ios
xcrun --sdk iphonesimulator swiftc -target arm64-apple-ios17.0-simulator -typecheck \
  Boop/DesignSystem/Colors.swift Boop/DesignSystem/Typography.swift Boop/DesignSystem/Spacing.swift
cd -
```

Expected: exit 0.

- [ ] **Step 5: Register fonts on app launch**

Modify `ios/Boop/BoopApp.swift`:

```swift
import SwiftUI
import CoreText

@main
struct BoopApp: App {
    @State private var settings = AppSettings()

    init() {
        Self.registerBundledFonts()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(settings)
                .preferredColorScheme(.dark)        // M1 ships dark-only
        }
    }

    /// Registers the bundled .otf / .ttf font files so SwiftUI's
    /// `.custom(...)` can resolve them. Logs which files succeed / fail
    /// so Plan A's font references can be debugged at runtime.
    private static func registerBundledFonts() {
        let names = [
            "Inter-Regular",
            "Inter-Medium",
            "Inter-SemiBold",
            "JetBrainsMono-Regular",
            "JetBrainsMono-Medium",
        ]
        for name in names {
            // try .otf first, then .ttf
            for ext in ["otf", "ttf"] {
                guard let url = Bundle.main.url(forResource: name, withExtension: ext) else { continue }
                var error: Unmanaged<CFError>?
                if CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error) {
                    print("[fonts] registered \(name).\(ext)")
                } else {
                    print("[fonts] FAILED \(name).\(ext): \(error?.takeRetainedValue().localizedDescription ?? "?")")
                }
                break
            }
        }
    }
}
```

- [ ] **Step 6: Commit**

```bash
git add ios/Boop/DesignSystem/ ios/Boop/BoopApp.swift
git commit -m "feat(ios): design-system tokens — Colors, Typography, Spacing + font registration"
```

---

### Task 9: Per-thread tint palette + hash

**Files:**
- Create: `ios/Boop/DesignSystem/ThreadTints.swift`
- Test: `tests/ios/ThreadTints.swift` (unit test alongside code; iOS testing infra deferred — see §Note)

- [ ] **Step 1: Create the tint enum and palette**

```swift
import SwiftUI

enum ThreadTint: String, CaseIterable, Sendable {
    case amber, sky, emerald, violet, pink, citrine, mint, crimson

    var solid: Color {
        switch self {
        case .amber:   return Color(hex: "#ff6432")
        case .sky:     return Color(hex: "#7aa2ff")
        case .emerald: return Color(hex: "#5dd5a0")
        case .violet:  return Color(hex: "#b482f0")
        case .pink:    return Color(hex: "#f082b4")
        case .citrine: return Color(hex: "#f0c864")
        case .mint:    return Color(hex: "#64dcc8")
        case .crimson: return Color(hex: "#ff7882")
        }
    }
    var fill: Color    { solid.opacity(0.10) }
    var border: Color  { solid.opacity(0.30) }
    var text: Color    { solid.opacity(0.85) }   // brightened for dark mode legibility

    /// Deterministic mapping from threadId → tint. Always returns the
    /// same tint for the same id. Uses FNV-1a so two threads created
    /// back-to-back land in different tints rather than clustering.
    static func forThreadId(_ id: String) -> ThreadTint {
        var hash: UInt64 = 14695981039346656037
        for b in id.utf8 {
            hash ^= UInt64(b)
            hash &*= 1099511628211
        }
        let idx = Int(hash % UInt64(ThreadTint.allCases.count))
        return ThreadTint.allCases[idx]
    }
}

private extension Color {
    init(hex: String) {
        let cleaned = hex.replacingOccurrences(of: "#", with: "")
        var value: UInt64 = 0
        Scanner(string: cleaned).scanHexInt64(&value)
        let r = Double((value & 0xFF0000) >> 16) / 255
        let g = Double((value & 0x00FF00) >> 8) / 255
        let b = Double(value & 0x0000FF) / 255
        self.init(red: r, green: g, blue: b)
    }
}
```

- [ ] **Step 2: Quick visual smoke**

Run a one-shot REPL check (no formal XCTest harness in M1):

```bash
cd ios
xcrun --sdk iphonesimulator swift -e '
let ids = ["mn79g3stxdjett8peh2926ptd986swgs", "another-thread-id", "calendar-thread", "calendar-thread"]
import Foundation
func hash(_ id: String) -> Int {
    var h: UInt64 = 14695981039346656037
    for b in id.utf8 { h ^= UInt64(b); h &*= 1099511628211 }
    return Int(h % 8)
}
for i in ids { print(i, "→", hash(i)) }
' 2>&1
cd -
```

Expected: same id maps to same number; different ids map to different numbers.

- [ ] **Step 3: Commit**

```bash
git add ios/Boop/DesignSystem/ThreadTints.swift
git commit -m "feat(ios): 8-color per-thread tint palette w/ FNV-1a hash"
```

**Note on iOS testing:** Plan A doesn't introduce an XCTest target — that's a meaningful build-system change that deserves its own task in Plan B. Hash logic that needs verification is checked with a `swift` REPL spike (above). Server logic continues to be tested with `node:test` via tsx.

---

### Task 10: Lucide icon bundle + view component

**Files:**
- Create: `ios/Boop/Resources/Lucide/<icon-name>.svg` × ~50
- Create: `ios/Boop/DesignSystem/LucideIcon.swift`

- [ ] **Step 1: Download the curated set of Lucide icons**

```bash
mkdir -p ios/Boop/Resources/Lucide
cd ios/Boop/Resources/Lucide

ICONS=(
  # menu/structural
  menu x send plus settings folder zap archive search arrow-up
  paperclip more-horizontal chevron-up chevron-down arrow-left download share
  # curated thread icons
  calendar clock alarm-clock
  lightbulb sparkles palette brush
  search telescope microscope
  mail message-circle send
  code terminal git-branch
  briefcase building file-text
  shopping-cart dollar-sign credit-card
  plane map compass
  book book-open bookmark
  music headphones
  heart smile party-popper
  dumbbell salad
  car train-front
  graduation-cap
  phone-call video
  utensils coffee
  list-todo check-square
  globe languages
  baby paw-print
  # status / state
  check circle alert-circle
)

for name in "${ICONS[@]}"; do
  curl -fsSL "https://cdn.jsdelivr.net/npm/lucide-static@latest/icons/${name}.svg" -o "${name}.svg" \
    && echo "✓ ${name}" \
    || echo "✗ ${name}"
done

ls | wc -l
cd -
```

Expected: ~60 SVG files in `ios/Boop/Resources/Lucide/`.

- [ ] **Step 2: Create `LucideIcon.swift`**

SwiftUI doesn't render SVG natively, but iOS 17+'s `Image(systemName:)` won't help us — Lucide icons aren't system symbols. We use a lightweight SVG → bezier-path converter: the `WebKit`-free approach is to convert SVGs to single-`Path` shapes at build time, or to load them as PNG. **For M1 we ship them as PDF assets, which scale and tint natively.** That requires converting SVG → PDF. Use `rsvg-convert` (via Homebrew) at design-system build time and commit the .pdfs.

If the engineer hasn't installed `rsvg-convert`:

```bash
brew install librsvg
```

Then convert all SVGs to single-page PDFs (vector, tintable):

```bash
cd ios/Boop/Resources/Lucide
for f in *.svg; do
  rsvg-convert -f pdf -o "${f%.svg}.pdf" "$f"
done
rm -f *.svg
ls | head
cd -
```

- [ ] **Step 3: Add PDFs to `Assets.xcassets` as Image Sets with "Preserve Vector Data" + "Single Scale"**

Create `ios/Boop/Resources/Assets.xcassets/Lucide` directory and for each icon, create a `.imageset` subdirectory with a `Contents.json`. Script it:

```bash
cd ios/Boop/Resources/Assets.xcassets
mkdir -p Lucide
cd Lucide
for f in ../../Lucide/*.pdf; do
  name="$(basename "${f%.pdf}")"
  mkdir -p "${name}.imageset"
  cp "$f" "${name}.imageset/${name}.pdf"
  cat > "${name}.imageset/Contents.json" <<JSON
{
  "images": [{ "filename": "${name}.pdf", "idiom": "universal" }],
  "info": { "author": "xcode", "version": 1 },
  "properties": { "preserves-vector-representation": true, "template-rendering-intent": "template" }
}
JSON
done
ls | wc -l
cd ../../../../..
```

Expected: ~60 .imageset folders inside `Assets.xcassets/Lucide/`.

- [ ] **Step 4: Create `LucideIcon.swift` view**

```swift
import SwiftUI

/// Curated, type-safe list of Lucide icons we bundle. The agent's
/// set_thread_icon tool returns one of these names; we match against
/// .knownByName(_:) to validate.
enum LucideName: String, CaseIterable, Sendable {
    // structural
    case menu, x, send, plus, settings, folder, zap, archive, search
    case arrowUp = "arrow-up"
    case paperclip
    case moreHorizontal = "more-horizontal"
    case chevronUp = "chevron-up"
    case chevronDown = "chevron-down"
    case arrowLeft = "arrow-left"
    case download, share
    case check, circle
    case alertCircle = "alert-circle"

    // thread-topic
    case calendar, clock
    case alarmClock = "alarm-clock"
    case lightbulb, sparkles, palette, brush
    case telescope, microscope
    case mail
    case messageCircle = "message-circle"
    case code, terminal
    case gitBranch = "git-branch"
    case briefcase, building
    case fileText = "file-text"
    case shoppingCart = "shopping-cart"
    case dollarSign = "dollar-sign"
    case creditCard = "credit-card"
    case plane, map, compass
    case book
    case bookOpen = "book-open"
    case bookmark, music, headphones, heart, smile
    case partyPopper = "party-popper"
    case dumbbell, salad, car
    case trainFront = "train-front"
    case graduationCap = "graduation-cap"
    case phoneCall = "phone-call"
    case video, utensils, coffee
    case listTodo = "list-todo"
    case checkSquare = "check-square"
    case globe, languages, baby
    case pawPrint = "paw-print"

    /// Fallback used when the agent picks a name we don't have bundled.
    static let fallback: LucideName = .sparkles
}

/// SwiftUI view rendering a Lucide icon from our asset catalog.
/// Uses the asset-catalog template-rendering mode so we can tint with
/// .foregroundStyle.
struct LucideIcon: View {
    let name: LucideName
    var size: CGFloat = 22

    var body: some View {
        Image("Lucide/\(name.rawValue)")
            .resizable()
            .renderingMode(.template)
            .scaledToFit()
            .frame(width: size, height: size)
    }
}

extension LucideName {
    /// Look up by the string the agent passed us. Returns fallback if unknown.
    static func knownByName(_ name: String) -> LucideName {
        LucideName.allCases.first { $0.rawValue == name } ?? .fallback
    }
}
```

- [ ] **Step 5: Verify**

Regenerate Xcode project + spot-check:

```bash
cd ios && xcodegen generate && cd -
xcodebuild -project ios/Boop.xcodeproj -target Boop -sdk iphonesimulator -configuration Debug build CODE_SIGNING_ALLOWED=NO 2>&1 | grep -E "error:|BUILD SUCCEEDED" | tail -3
```

Expected: BUILD SUCCEEDED.

- [ ] **Step 6: Commit**

```bash
git add ios/Boop/Resources/Lucide ios/Boop/Resources/Assets.xcassets/Lucide ios/Boop/DesignSystem/LucideIcon.swift
git commit -m "feat(ios): bundle Lucide icons as vector PDF assets + LucideIcon view"
```

---

### Task 11: Models & ThreadsStore

**Files:**
- Create: `ios/Boop/Models/Thread.swift`
- Modify: `ios/Boop/Models/Models.swift`
- Create: `ios/Boop/State/ThreadsStore.swift`

- [ ] **Step 1: Create `Thread.swift`**

```swift
import Foundation

struct BoopThread: Identifiable, Equatable {
    let id: String              // Convex doc id, used as threadId everywhere
    var icon: String?           // Lucide name; nil until the agent picks one
    var label: String?
    var lastMessageAt: Date?
    var unread: Bool = false    // local-only flag for UI

    /// Convenience that resolves the bundled Lucide icon name, falling
    /// back to .sparkles when the agent hasn't set one yet.
    var lucide: LucideName {
        guard let icon else { return .fallback }
        return LucideName.knownByName(icon)
    }
}

/// Wire shape returned by GET /channels/ios/threads.
struct ServerThread: Decodable {
    let _id: String
    let icon: String?
    let label: String?
    let lastMessageAt: Double?

    func toThread() -> BoopThread {
        BoopThread(
            id: _id,
            icon: icon,
            label: label,
            lastMessageAt: lastMessageAt.map { Date(timeIntervalSince1970: $0 / 1000) },
        )
    }
}

struct ThreadsResponse: Decodable {
    let threads: [ServerThread]
}

struct CreateThreadResponse: Decodable {
    let threadId: String
}
```

- [ ] **Step 2: Add `threadId` to `Message` and `ServerMessage`**

Edit `ios/Boop/Models/Models.swift` and replace the `Message` struct and `ServerMessage`:

```swift
struct Message: Identifiable, Equatable {
    enum Role: String, Codable { case user, assistant, system }

    let id: String
    let threadId: String
    let role: Role
    var content: String
    let createdAt: Date
    var isStreaming: Bool = false
}

struct ServerMessage: Decodable {
    let _id: String
    let threadId: String?    // tolerate older rows that don't have it
    let role: String
    let content: String
    let _creationTime: Double

    func toMessage(defaultThreadId: String) -> Message {
        Message(
            id: _id,
            threadId: threadId ?? defaultThreadId,
            role: Message.Role(rawValue: role) ?? .system,
            content: content,
            createdAt: Date(timeIntervalSince1970: _creationTime / 1000),
        )
    }
}
```

Also update `MessagesResponse`:

```swift
struct MessagesResponse: Decodable {
    let threadId: String
    let messages: [ServerMessage]
}
```

- [ ] **Step 3: Create `ThreadsStore.swift`**

```swift
import Foundation
import Observation

/// Single source of truth for the list of open threads on this device.
/// One per app session; loads on bind, refreshes after thread events.
@MainActor
@Observable
final class ThreadsStore {
    private(set) var threads: [BoopThread] = []
    private(set) var activeThreadId: String?
    private(set) var loadError: String?

    private let settings: AppSettings
    private var bearer: String?

    init(settings: AppSettings) {
        self.settings = settings
    }

    func bind(bearer: String) {
        self.bearer = bearer
    }

    func unbind() {
        bearer = nil
        threads.removeAll()
        activeThreadId = nil
        loadError = nil
    }

    func loadThreads() async {
        guard let bearer, let baseURL = settings.serverBaseURL else { return }
        let client = BoopClient(baseURL: baseURL, bearer: bearer)
        do {
            let response = try await client.listThreads()
            let mapped = response.threads.map { $0.toThread() }
            self.threads = mapped
            if activeThreadId == nil || !mapped.contains(where: { $0.id == activeThreadId }) {
                activeThreadId = mapped.first?.id
            }
        } catch {
            loadError = "Couldn't load threads: \(error.localizedDescription)"
        }
    }

    func selectThread(_ id: String) {
        activeThreadId = id
        if let idx = threads.firstIndex(where: { $0.id == id }) {
            threads[idx].unread = false
        }
    }

    func createNewThread() async {
        guard let bearer, let baseURL = settings.serverBaseURL else { return }
        guard threads.count < 4 else { return } // mirrors server cap
        let client = BoopClient(baseURL: baseURL, bearer: bearer)
        do {
            let created = try await client.createThread()
            await loadThreads()
            activeThreadId = created.threadId
        } catch {
            loadError = "Couldn't create thread: \(error.localizedDescription)"
        }
    }

    /// Called when an SSE event for some thread arrives. Updates the local
    /// thread's lastMessageAt and unread flag if it's not the active thread.
    func noteIncomingMessage(threadId: String) {
        guard let idx = threads.firstIndex(where: { $0.id == threadId }) else { return }
        threads[idx].lastMessageAt = Date()
        if threadId != activeThreadId {
            threads[idx].unread = true
        }
    }

    /// Called when the agent sets a thread's icon (via SSE thread_updated event
    /// or by re-fetching the list).
    func applyIconUpdate(threadId: String, icon: String) {
        guard let idx = threads.firstIndex(where: { $0.id == threadId }) else { return }
        threads[idx].icon = icon
    }
}
```

- [ ] **Step 4: Verify it compiles**

```bash
cd ios
xcrun --sdk iphonesimulator swiftc -target arm64-apple-ios17.0-simulator -typecheck \
  Boop/Models/Thread.swift Boop/Models/Models.swift Boop/State/ThreadsStore.swift \
  Boop/Storage/AppSettings.swift Boop/Networking/BoopClient.swift \
  Boop/DesignSystem/Colors.swift Boop/DesignSystem/Typography.swift Boop/DesignSystem/Spacing.swift \
  Boop/DesignSystem/ThreadTints.swift Boop/DesignSystem/LucideIcon.swift
cd -
```

It will fail because `BoopClient` doesn't have `listThreads`/`createThread` yet. That's fixed in the next task. **Continue without committing**; commit after Task 12 makes it compile.

---

### Task 12: BoopClient — thread-aware methods

**Files:**
- Modify: `ios/Boop/Networking/BoopClient.swift`

- [ ] **Step 1: Add the new endpoints to `BoopClient`**

Add inside the `BoopClient` struct, alongside existing methods:

```swift
// MARK: - Threads

func listThreads() async throws -> ThreadsResponse {
    guard let bearer else { throw ClientError.bearerMissing }
    var req = URLRequest(url: baseURL.appendingPathComponent("/channels/ios/threads"))
    req.httpMethod = "GET"
    req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
    return try await perform(req)
}

func createThread() async throws -> CreateThreadResponse {
    guard let bearer else { throw ClientError.bearerMissing }
    var req = URLRequest(url: baseURL.appendingPathComponent("/channels/ios/threads/create"))
    req.httpMethod = "POST"
    req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
    return try await perform(req)
}

func archiveThread(threadId: String) async throws {
    guard let bearer else { throw ClientError.bearerMissing }
    var req = URLRequest(
        url: baseURL.appendingPathComponent("/channels/ios/threads/\(threadId)/archive"),
    )
    req.httpMethod = "POST"
    req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
    let _: EmptyResponse = try await perform(req)
}

private struct EmptyResponse: Decodable { let ok: Bool? }
```

- [ ] **Step 2: Update `sendInbound` and `fetchMessages` to take threadId**

Replace the existing `sendInbound(text:)` with:

```swift
func sendInbound(text: String, threadId: String) async throws -> InboundResponse {
    try await postJSON(
        path: "/channels/ios/inbound",
        body: ["text": text, "threadId": threadId],
        authorized: true,
    )
}

func fetchMessages(threadId: String, limit: Int = 50) async throws -> MessagesResponse {
    guard let bearer else { throw ClientError.bearerMissing }
    var components = URLComponents(
        url: baseURL.appendingPathComponent("/channels/ios/messages"),
        resolvingAgainstBaseURL: false,
    )!
    components.queryItems = [
        URLQueryItem(name: "threadId", value: threadId),
        URLQueryItem(name: "limit", value: String(limit)),
    ]
    var req = URLRequest(url: components.url!)
    req.httpMethod = "GET"
    req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
    return try await perform(req)
}
```

- [ ] **Step 3: Update `SSEConnection` to take threadId**

```swift
struct SSEConnection {
    let baseURL: URL
    let bearer: String
    let threadId: String     // ← NEW

    func subscribe() -> AsyncStream<StreamEvent> {
        let baseURL = self.baseURL
        let bearer = self.bearer
        let threadId = self.threadId
        return AsyncStream<StreamEvent>(StreamEvent.self, bufferingPolicy: .unbounded) { continuation in
            let delegate = SSEDelegate(onEvent: { event in
                continuation.yield(event)
            }, onFinish: {
                continuation.finish()
            })
            let configuration = URLSessionConfiguration.ephemeral
            // ...existing config (proxy bypass, timeouts, etc.)...
            let session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)

            var components = URLComponents(
                url: baseURL.appendingPathComponent("/channels/ios/stream"),
                resolvingAgainstBaseURL: false,
            )!
            components.queryItems = [URLQueryItem(name: "threadId", value: threadId)]
            var request = URLRequest(url: components.url!)
            request.httpMethod = "GET"
            request.networkServiceType = .responsiveData
            request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
            request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
            request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")

            let task = session.dataTask(with: request)
            task.resume()
            continuation.onTermination = { @Sendable _ in
                task.cancel()
                session.invalidateAndCancel()
            }
        }
    }
}
```

- [ ] **Step 4: Typecheck full iOS source set**

```bash
cd ios
xcrun --sdk iphonesimulator swiftc -target arm64-apple-ios17.0-simulator -typecheck \
  Boop/BoopApp.swift Boop/Models/Models.swift Boop/Models/Thread.swift \
  Boop/Networking/BoopClient.swift Boop/State/ChatStore.swift Boop/State/PairingStore.swift \
  Boop/State/ThreadsStore.swift Boop/Storage/AppSettings.swift Boop/Storage/KeychainStore.swift \
  Boop/Views/ChatView.swift Boop/Views/PairingView.swift Boop/Views/RootView.swift Boop/Views/SettingsView.swift \
  Boop/DesignSystem/Colors.swift Boop/DesignSystem/Typography.swift Boop/DesignSystem/Spacing.swift \
  Boop/DesignSystem/ThreadTints.swift Boop/DesignSystem/LucideIcon.swift
cd -
```

It still fails because `ChatStore.swift` calls `sendInbound(text:)` and `fetchMessages(limit:)` — old signatures. The next task fixes ChatStore. Continue.

---

### Task 13: ChatStore — thread-aware refactor

**Files:**
- Modify: `ios/Boop/State/ChatStore.swift`

- [ ] **Step 1: Refactor ChatStore to track threadId**

Replace the `bind` / `loadHistory` / `startStreaming` / `send` methods:

```swift
@MainActor
@Observable
final class ChatStore {
    private(set) var messages: [Message] = []
    private(set) var connectionState: ConnectionState = .idle
    private(set) var sendError: String?
    private(set) var isAwaitingReply: Bool = false

    enum ConnectionState: Equatable { case idle, connecting, connected, disconnected(String?) }

    private let settings: AppSettings
    private var bearer: String?
    private var threadId: String?
    private var streamTask: Task<Void, Never>?
    private var streamingMessageId: String?

    init(settings: AppSettings) { self.settings = settings }

    func bind(bearer: String) { self.bearer = bearer }

    func unbind() {
        streamTask?.cancel()
        streamTask = nil
        bearer = nil
        threadId = nil
        messages.removeAll()
        connectionState = .idle
        sendError = nil
        streamingMessageId = nil
        isAwaitingReply = false
    }

    /// Switch the active thread. Cancels the current stream, clears
    /// messages, fetches history for the new thread, restarts the stream.
    func switchTo(threadId: String) async {
        guard threadId != self.threadId else { return }
        streamTask?.cancel()
        streamTask = nil
        self.threadId = threadId
        messages.removeAll()
        streamingMessageId = nil
        await loadHistory()
        startStreaming()
    }

    private func loadHistory() async {
        guard let bearer, let baseURL = settings.serverBaseURL, let threadId else { return }
        let client = BoopClient(baseURL: baseURL, bearer: bearer)
        do {
            let response = try await client.fetchMessages(threadId: threadId, limit: 50)
            messages = response.messages
                .reversed()
                .map { $0.toMessage(defaultThreadId: threadId) }
        } catch {
            sendError = "Couldn't load history: \(error.localizedDescription)"
        }
    }

    private func startStreaming() {
        streamTask?.cancel()
        guard let bearer, let baseURL = settings.serverBaseURL, let threadId else { return }
        let bearerCopy = bearer
        let threadIdCopy = threadId
        connectionState = .connecting
        streamTask = Task { [weak self] in
            await self?.streamLoop(baseURL: baseURL, bearer: bearerCopy, threadId: threadIdCopy)
        }
    }

    private func streamLoop(baseURL: URL, bearer: String, threadId: String) async {
        var backoff: UInt64 = 1_000_000_000
        while !Task.isCancelled {
            connectionState = .connecting
            let stream = SSEConnection(baseURL: baseURL, bearer: bearer, threadId: threadId).subscribe()
            connectionState = .connected
            backoff = 1_000_000_000
            for await event in stream {
                if Task.isCancelled { return }
                handle(event: event)
            }
            if Task.isCancelled { return }
            connectionState = .disconnected("reconnecting…")
            try? await Task.sleep(nanoseconds: backoff)
            backoff = min(backoff * 2, 30_000_000_000)
        }
    }

    private func handle(event: StreamEvent) {
        let expected = "ios:\(settings.deviceId):\(threadId ?? "")"
        guard event.conversationId == expected else { return }
        isAwaitingReply = false
        switch event {
        case .delta(_, let text, _): appendDelta(text)
        case .message(_, let content): finalizeMessage(content)
        case .ack(_, let content): appendAck(content)
        case .error(_, _, let message): sendError = message
        case .thinking: break
        }
    }

    private func appendDelta(_ chunk: String) {
        guard let threadId else { return }
        if let id = streamingMessageId, let idx = messages.firstIndex(where: { $0.id == id }) {
            messages[idx].content.append(chunk)
        } else {
            let id = "stream-\(UUID().uuidString)"
            streamingMessageId = id
            messages.append(Message(id: id, threadId: threadId, role: .assistant,
                                    content: chunk, createdAt: Date(), isStreaming: true))
        }
    }

    private func finalizeMessage(_ content: String) {
        guard let threadId else { return }
        if let id = streamingMessageId, let idx = messages.firstIndex(where: { $0.id == id }) {
            messages[idx].content = content
            messages[idx].isStreaming = false
            streamingMessageId = nil
            return
        }
        messages.append(Message(id: "final-\(UUID().uuidString)", threadId: threadId, role: .assistant,
                                content: content, createdAt: Date()))
    }

    private func appendAck(_ content: String) {
        guard let threadId else { return }
        messages.append(Message(id: "ack-\(UUID().uuidString)", threadId: threadId, role: .assistant,
                                content: content, createdAt: Date()))
    }

    func send(_ text: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let bearer, let baseURL = settings.serverBaseURL, let threadId else { return }
        sendError = nil
        isAwaitingReply = true
        messages.append(Message(id: "local-\(UUID().uuidString)", threadId: threadId, role: .user,
                                content: trimmed, createdAt: Date()))
        let client = BoopClient(baseURL: baseURL, bearer: bearer)
        do {
            _ = try await client.sendInbound(text: trimmed, threadId: threadId)
        } catch {
            sendError = "Send failed: \(error.localizedDescription)"
            isAwaitingReply = false
        }
    }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd ios
xcrun --sdk iphonesimulator swiftc -target arm64-apple-ios17.0-simulator -typecheck \
  Boop/BoopApp.swift Boop/Models/Models.swift Boop/Models/Thread.swift \
  Boop/Networking/BoopClient.swift Boop/State/ChatStore.swift Boop/State/PairingStore.swift \
  Boop/State/ThreadsStore.swift Boop/Storage/AppSettings.swift Boop/Storage/KeychainStore.swift \
  Boop/Views/PairingView.swift Boop/Views/RootView.swift Boop/Views/SettingsView.swift \
  Boop/DesignSystem/Colors.swift Boop/DesignSystem/Typography.swift Boop/DesignSystem/Spacing.swift \
  Boop/DesignSystem/ThreadTints.swift Boop/DesignSystem/LucideIcon.swift
cd -
```

ChatView.swift is intentionally skipped — it's about to be rewritten in Task 18. Other files should compile.

- [ ] **Step 3: Commit the network + state refactor batch**

```bash
git add ios/Boop/Models/Thread.swift ios/Boop/Models/Models.swift \
        ios/Boop/State/ThreadsStore.swift ios/Boop/State/ChatStore.swift \
        ios/Boop/Networking/BoopClient.swift
git commit -m "feat(ios): thread-aware Models / ThreadsStore / ChatStore / BoopClient"
```

---

### Task 14: TypingBubble component

**Files:**
- Create: `ios/Boop/Views/Components/TypingBubble.swift`

- [ ] **Step 1: Move + refresh the existing TypingBubble from ChatView**

Create `ios/Boop/Views/Components/TypingBubble.swift`:

```swift
import SwiftUI

/// Three-dot agent-is-thinking indicator. Used in chat between user-tap-send
/// and the first SSE delta. Matches the design's typing indicator in
/// `Chat Screen → Typing Indicator`.
struct TypingBubble: View {
    @State private var phase: Int = 0
    private let timer = Timer.publish(every: 0.35, on: .main, in: .common).autoconnect()

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<3) { i in
                Circle()
                    .fill(phase == i ? BoopColor.textSecondary : BoopColor.textTertiary.opacity(0.55))
                    .frame(width: 7, height: 7)
                    .animation(.easeInOut(duration: 0.30), value: phase)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(BoopColor.bubbleAgentBg, in: RoundedRectangle(cornerRadius: BoopRadius.bubble))
        .overlay(
            RoundedRectangle(cornerRadius: BoopRadius.bubble)
                .strokeBorder(BoopColor.bubbleAgentBorder, lineWidth: 1),
        )
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.trailing, 40)
        .onReceive(timer) { _ in phase = (phase + 1) % 3 }
        .accessibilityLabel("Agent is thinking")
    }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd ios && xcrun --sdk iphonesimulator swiftc -target arm64-apple-ios17.0-simulator -typecheck Boop/Views/Components/TypingBubble.swift Boop/DesignSystem/*.swift && cd -
```

- [ ] **Step 3: Commit**

```bash
git add ios/Boop/Views/Components/TypingBubble.swift
git commit -m "feat(ios): TypingBubble component matching design"
```

---

### Task 15: MarkdownView (in-bubble markdown renderer)

**Files:**
- Create: `ios/Boop/Views/Components/MarkdownView.swift`

- [ ] **Step 1: Use AttributedString to render markdown**

iOS 17+'s built-in `AttributedString(markdown:)` covers bold/italic/links/inline-code in one pass. Block-level constructs (headers, bullet lists, fenced code blocks) we render ourselves with a tiny line-based parser. Create `MarkdownView.swift`:

```swift
import SwiftUI

/// Lightweight markdown renderer purpose-built for chat bubbles + .md preview.
/// Supports:
///   • Inline: **bold**, _italic_, [link](href), `inline code`
///   • Block: H1/H2/H3, bullet lists, ordered lists, fenced code (```), blockquote, paragraphs
struct MarkdownView: View {
    let source: String
    var sheetMode: Bool = false   // true in the full file preview, false inside chat bubble

    var body: some View {
        VStack(alignment: .leading, spacing: sheetMode ? 8 : 6) {
            ForEach(Array(parsedBlocks.enumerated()), id: \.offset) { _, block in
                view(for: block)
            }
        }
    }

    @ViewBuilder
    private func view(for block: Block) -> some View {
        switch block {
        case .paragraph(let s):
            Text(inline(s))
                .font(sheetMode ? BoopFont.bodyMedium : BoopFont.bodyLarge)
                .foregroundStyle(BoopColor.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
        case .heading(let level, let s):
            Text(inline(s))
                .font(headingFont(level: level))
                .foregroundStyle(BoopColor.textPrimary)
                .padding(.top, sheetMode ? 8 : 4)
        case .bullet(let items):
            VStack(alignment: .leading, spacing: sheetMode ? 3 : 2) {
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    HStack(alignment: .top, spacing: 8) {
                        Text("•").foregroundStyle(BoopColor.textSecondary)
                        Text(inline(item))
                            .font(sheetMode ? BoopFont.bodyMedium : BoopFont.bodyLarge)
                            .foregroundStyle(BoopColor.textPrimary)
                    }
                }
            }
        case .ordered(let items):
            VStack(alignment: .leading, spacing: sheetMode ? 3 : 2) {
                ForEach(Array(items.enumerated()), id: \.offset) { i, item in
                    HStack(alignment: .top, spacing: 8) {
                        Text("\(i + 1).")
                            .font(BoopFont.monoSmall)
                            .foregroundStyle(BoopColor.textSecondary)
                        Text(inline(item))
                            .font(sheetMode ? BoopFont.bodyMedium : BoopFont.bodyLarge)
                            .foregroundStyle(BoopColor.textPrimary)
                    }
                }
            }
        case .codeBlock(let s):
            Text(s)
                .font(BoopFont.monoBody)
                .foregroundStyle(BoopColor.codeFg)
                .padding(.horizontal, 12).padding(.vertical, 10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(BoopColor.codeBg, in: RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(BoopColor.border, lineWidth: 1))
        case .quote(let s):
            HStack(alignment: .top, spacing: 0) {
                Rectangle().fill(BoopColor.accent).frame(width: 2)
                Text(inline(s))
                    .font(sheetMode ? BoopFont.bodyMedium : BoopFont.bodyLarge)
                    .italic()
                    .foregroundStyle(BoopColor.textSecondary)
                    .padding(.horizontal, 12).padding(.vertical, 2)
            }
        }
    }

    private func headingFont(level: Int) -> Font {
        switch level {
        case 1: return BoopFont.heroH1
        case 2: return BoopFont.heroH2
        default: return BoopFont.heroH3
        }
    }

    private func inline(_ s: String) -> AttributedString {
        // AttributedString(markdown:) handles **bold**, _italic_, `code`, [link](url).
        do {
            var attr = try AttributedString(markdown: s, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))
            // Recolor `code` runs.
            for run in attr.runs where run.inlinePresentationIntent == .code {
                attr[run.range].foregroundColor = BoopColor.codeKeyword
                attr[run.range].backgroundColor = BoopColor.codeBg
                attr[run.range].font = BoopFont.monoBody
            }
            return attr
        } catch {
            return AttributedString(s)
        }
    }

    // MARK: - Parser

    private enum Block: Equatable {
        case paragraph(String)
        case heading(Int, String)
        case bullet([String])
        case ordered([String])
        case codeBlock(String)
        case quote(String)
    }

    private var parsedBlocks: [Block] {
        Self.parse(source)
    }

    /// One-pass line-based parser. Good enough for chat content; we don't
    /// support nested lists, tables, HTML, or footnotes (M2).
    static func parse(_ input: String) -> [Block] {
        let lines = input.components(separatedBy: "\n")
        var blocks: [Block] = []
        var i = 0
        while i < lines.count {
            let line = lines[i]
            let trimmed = line.trimmingCharacters(in: .whitespaces)

            // Fenced code
            if trimmed.hasPrefix("```") {
                var content: [String] = []
                i += 1
                while i < lines.count, !lines[i].trimmingCharacters(in: .whitespaces).hasPrefix("```") {
                    content.append(lines[i])
                    i += 1
                }
                blocks.append(.codeBlock(content.joined(separator: "\n")))
                if i < lines.count { i += 1 }   // skip closing fence
                continue
            }

            // Headings
            if trimmed.hasPrefix("### ")  { blocks.append(.heading(3, String(trimmed.dropFirst(4)))); i += 1; continue }
            if trimmed.hasPrefix("## ")   { blocks.append(.heading(2, String(trimmed.dropFirst(3)))); i += 1; continue }
            if trimmed.hasPrefix("# ")    { blocks.append(.heading(1, String(trimmed.dropFirst(2)))); i += 1; continue }

            // Blockquote
            if trimmed.hasPrefix("> ") {
                var quoted: [String] = []
                while i < lines.count, lines[i].trimmingCharacters(in: .whitespaces).hasPrefix("> ") {
                    quoted.append(String(lines[i].trimmingCharacters(in: .whitespaces).dropFirst(2)))
                    i += 1
                }
                blocks.append(.quote(quoted.joined(separator: " ")))
                continue
            }

            // Unordered list
            if trimmed.hasPrefix("- ") || trimmed.hasPrefix("* ") {
                var items: [String] = []
                while i < lines.count,
                      let prefix = ["- ", "* "].first(where: { lines[i].trimmingCharacters(in: .whitespaces).hasPrefix($0) }) {
                    items.append(String(lines[i].trimmingCharacters(in: .whitespaces).dropFirst(prefix.count)))
                    i += 1
                }
                blocks.append(.bullet(items))
                continue
            }

            // Ordered list ("1. foo")
            if let r = trimmed.range(of: #"^\d+\.\s"#, options: .regularExpression) {
                var items: [String] = []
                while i < lines.count,
                      let rr = lines[i].trimmingCharacters(in: .whitespaces)
                                       .range(of: #"^\d+\.\s"#, options: .regularExpression) {
                    let body = lines[i].trimmingCharacters(in: .whitespaces)
                    items.append(String(body[rr.upperBound...]))
                    i += 1
                }
                _ = r
                blocks.append(.ordered(items))
                continue
            }

            // Blank line
            if trimmed.isEmpty { i += 1; continue }

            // Paragraph — gather adjacent non-blank lines into one
            var paraLines: [String] = []
            while i < lines.count, !lines[i].trimmingCharacters(in: .whitespaces).isEmpty,
                  !lines[i].trimmingCharacters(in: .whitespaces).hasPrefix("```"),
                  !["- ", "* ", "> ", "# ", "## ", "### "].contains(where: { lines[i].trimmingCharacters(in: .whitespaces).hasPrefix($0) }),
                  lines[i].trimmingCharacters(in: .whitespaces).range(of: #"^\d+\.\s"#, options: .regularExpression) == nil {
                paraLines.append(lines[i])
                i += 1
            }
            if !paraLines.isEmpty {
                blocks.append(.paragraph(paraLines.joined(separator: " ")))
            }
        }
        return blocks
    }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd ios && xcrun --sdk iphonesimulator swiftc -target arm64-apple-ios17.0-simulator -typecheck Boop/Views/Components/MarkdownView.swift Boop/DesignSystem/*.swift && cd -
```

- [ ] **Step 3: Commit**

```bash
git add ios/Boop/Views/Components/MarkdownView.swift
git commit -m "feat(ios): MarkdownView — block-level + AttributedString inline"
```

---

### Task 16: MessageBubble + FileCard

**Files:**
- Create: `ios/Boop/Views/Components/MessageBubble.swift`
- Create: `ios/Boop/Views/Components/FileCard.swift`

- [ ] **Step 1: Create `MessageBubble.swift`**

```swift
import SwiftUI

struct MessageBubble: View {
    let message: Message

    var body: some View {
        HStack {
            if message.role == .user { Spacer(minLength: 40) }
            content
                .padding(.horizontal, 13)
                .padding(.vertical, 9)
                .background(background)
                .clipShape(shape)
                .overlay(borderOverlay)
                .frame(maxWidth: 320, alignment: message.role == .user ? .trailing : .leading)
            if message.role != .user { Spacer(minLength: 40) }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch message.role {
        case .user:
            Text(message.content)
                .font(BoopFont.bodyLarge)
                .foregroundStyle(.white)
                .textSelection(.enabled)
        case .assistant, .system:
            MarkdownView(source: message.content)
                .textSelection(.enabled)
        }
    }

    private var background: some View {
        switch message.role {
        case .user: return AnyView(BoopColor.accent)
        default:    return AnyView(BoopColor.bubbleAgentBg)
        }
    }

    private var shape: some Shape {
        let r = BoopRadius.bubble
        return UnevenRoundedRectangle(
            topLeadingRadius: r,
            bottomLeadingRadius: message.role == .user ? r : 5,
            bottomTrailingRadius: message.role == .user ? 5 : r,
            topTrailingRadius: r,
        )
    }

    @ViewBuilder
    private var borderOverlay: some View {
        if message.role != .user {
            shape.strokeBorder(BoopColor.bubbleAgentBorder, lineWidth: 1)
        }
    }
}
```

- [ ] **Step 2: Create `FileCard.swift`**

```swift
import SwiftUI

/// A file in the chat (sent by user OR produced by the agent). Tap → opens
/// the full-screen FilePreviewScreen.
struct FileCard: View {
    let filename: String
    let kind: String        // "md" | "pdf" | "jpg" | "txt" | etc.
    let sizeBytes: Int
    let source: Source
    let createdAt: Date
    var threadTint: ThreadTint? = nil   // shown as a small chip on right in files browser; nil in chat
    var onTap: () -> Void = {}

    enum Source { case agent, user }

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 10) {
                glyph
                VStack(alignment: .leading, spacing: 2) {
                    Text(filename)
                        .font(BoopFont.medium(13.5))
                        .foregroundStyle(BoopColor.textPrimary)
                        .lineLimit(1)
                    Text(metaString)
                        .font(BoopFont.meta)
                        .foregroundStyle(BoopColor.textTertiary)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                if let threadTint { tintChip(threadTint) }
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(BoopColor.textTertiary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
        }
        .buttonStyle(.plain)
        .background(BoopColor.surfaceElev, in: RoundedRectangle(cornerRadius: BoopRadius.l))
        .overlay(
            RoundedRectangle(cornerRadius: BoopRadius.l)
                .strokeBorder(BoopColor.border, lineWidth: 1),
        )
        .frame(maxWidth: 320, alignment: .leading)
    }

    private var glyph: some View {
        Text(kind.lowercased())
            .font(BoopFont.monoMedium(12))
            .foregroundStyle(glyphFG)
            .frame(width: 36, height: 36)
            .background(glyphBG, in: RoundedRectangle(cornerRadius: 8))
    }

    private var glyphBG: Color {
        switch kind.lowercased() {
        case "md": return BoopColor.surface
        case "pdf": return BoopColor.accent
        case "jpg", "jpeg", "png", "heic", "gif": return BoopColor.success
        default: return BoopColor.border
        }
    }
    private var glyphFG: Color {
        switch kind.lowercased() {
        case "md": return BoopColor.textPrimary
        case "pdf", "jpg", "jpeg", "png", "heic", "gif": return .white
        default: return BoopColor.textPrimary
        }
    }

    private var metaString: String {
        let parts = [Self.size(sizeBytes), sourceLabel, Self.relativeTime(createdAt)]
        return parts.joined(separator: " · ")
    }
    private var sourceLabel: String { source == .agent ? "agent" : "you" }

    private func tintChip(_ t: ThreadTint) -> some View {
        RoundedRectangle(cornerRadius: 6)
            .fill(t.fill).overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(t.border, lineWidth: 1))
            .frame(width: 22, height: 22)
    }

    static func size(_ bytes: Int) -> String {
        if bytes < 1024 { return "\(bytes) B" }
        if bytes < 1024 * 1024 { return String(format: "%.1f kB", Double(bytes) / 1024) }
        return String(format: "%.1f MB", Double(bytes) / 1024 / 1024)
    }
    static func relativeTime(_ d: Date) -> String {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .abbreviated
        return f.localizedString(for: d, relativeTo: Date())
    }
}
```

- [ ] **Step 3: Typecheck**

```bash
cd ios && xcrun --sdk iphonesimulator swiftc -target arm64-apple-ios17.0-simulator -typecheck \
  Boop/Views/Components/MessageBubble.swift Boop/Views/Components/FileCard.swift \
  Boop/Views/Components/MarkdownView.swift Boop/DesignSystem/*.swift Boop/Models/*.swift && cd -
```

- [ ] **Step 4: Commit**

```bash
git add ios/Boop/Views/Components/MessageBubble.swift ios/Boop/Views/Components/FileCard.swift
git commit -m "feat(ios): MessageBubble (markdown) + FileCard components"
```

---

### Task 17: SubAgentPill

**Files:**
- Create: `ios/Boop/Views/Components/SubAgentPill.swift`

- [ ] **Step 1: Create the pill**

```swift
import SwiftUI

struct SubAgentPill: View {
    let agentName: String
    let toolCount: Int
    var onTap: () -> Void = {}

    @State private var pulse = false

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 10) {
                Circle().fill(BoopColor.accent).frame(width: 7, height: 7)
                    .opacity(pulse ? 0.30 : 1.0)
                    .animation(.easeInOut(duration: 0.70).repeatForever(autoreverses: true), value: pulse)
                Text(agentName)
                    .font(BoopFont.medium(13))
                    .foregroundStyle(BoopColor.textPrimary)
                    + Text(" · \(toolCount) tools")
                    .font(BoopFont.regular(13))
                    .foregroundStyle(BoopColor.textSecondary)
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(BoopColor.textTertiary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .buttonStyle(.plain)
        .background(BoopColor.accent.opacity(0.08))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(BoopColor.accent.opacity(0.30), lineWidth: 1),
        )
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .onAppear { pulse = true }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd ios && xcrun --sdk iphonesimulator swiftc -target arm64-apple-ios17.0-simulator -typecheck \
  Boop/Views/Components/SubAgentPill.swift Boop/DesignSystem/*.swift && cd -
git add ios/Boop/Views/Components/SubAgentPill.swift
git commit -m "feat(ios): SubAgentPill component"
```

---

### Task 18: Dock — the hero component

**Files:**
- Create: `ios/Boop/Views/Components/Dock.swift`

- [ ] **Step 1: Build the dock**

The dock matches the `.pen` design: a single 24pt-radius surface containing a 76pt composer row + a 40pt thread bar. The active tab is a 36pt circle inside the thread bar; inactive icons are 20pt; new-thread button is 28pt circle.

```swift
import SwiftUI

struct Dock: View {
    @Environment(ThreadsStore.self) private var threads
    @Binding var draft: String
    var onSend: (String) -> Void

    var body: some View {
        VStack(spacing: 0) {
            composerRow
            Divider().background(BoopColor.border)
            threadBar
        }
        .background(BoopColor.glassBg)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: BoopRadius.dock))
        .overlay(
            RoundedRectangle(cornerRadius: BoopRadius.dock)
                .strokeBorder(BoopColor.glassBorder, lineWidth: 1),
        )
        .shadow(color: .black.opacity(0.45), radius: 14, x: 0, y: 8)
        .padding(.horizontal, BoopSpacing.l)
        .padding(.bottom, 18)
    }

    private var composerRow: some View {
        HStack(spacing: 8) {
            Button(action: { /* attach picker — M2 */ }) {
                LucideIcon(name: .paperclip, size: 18)
                    .foregroundStyle(BoopColor.textSecondary)
                    .frame(width: 32, height: 32)
            }
            TextField("", text: $draft, prompt: Text("Message Boop").foregroundStyle(BoopColor.textTertiary), axis: .vertical)
                .font(BoopFont.bodyLarge)
                .foregroundStyle(BoopColor.textPrimary)
                .lineLimit(1...6)
            Button(action: send) {
                LucideIcon(name: .arrowUp, size: 18)
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(BoopColor.accent, in: Circle())
            }
            .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(.horizontal, BoopSpacing.l)
        .frame(height: 76)
    }

    private var threadBar: some View {
        HStack(spacing: 8) {
            if let activeId = threads.activeThreadId,
               let active = threads.threads.first(where: { $0.id == activeId }) {
                activeTab(active)
            }
            ForEach(threads.threads.filter { $0.id != threads.activeThreadId }) { thread in
                inactiveIcon(thread)
            }
            Spacer(minLength: 0)
            newThreadButton
        }
        .padding(.horizontal, BoopSpacing.l)
        .frame(height: 40)
    }

    private func activeTab(_ t: BoopThread) -> some View {
        let tint = ThreadTint.forThreadId(t.id)
        return Button(action: {}) {
            LucideIcon(name: t.lucide, size: 18)
                .foregroundStyle(tint.text)
                .frame(width: 36, height: 36)
                .background(tint.fill, in: Circle())
                .overlay(Circle().strokeBorder(tint.border, lineWidth: 1))
                .shadow(color: tint.solid.opacity(0.35), radius: 6, y: 2)
        }
        .buttonStyle(.plain)
    }

    private func inactiveIcon(_ t: BoopThread) -> some View {
        let tint = ThreadTint.forThreadId(t.id)
        return Button(action: { Task { @MainActor in threads.selectThread(t.id) } }) {
            ZStack(alignment: .topTrailing) {
                LucideIcon(name: t.lucide, size: 20)
                    .foregroundStyle(tint.text.opacity(0.55))
                    .frame(width: 32, height: 32)
                if t.unread {
                    Circle().fill(BoopColor.accent).frame(width: 6, height: 6)
                        .overlay(Circle().strokeBorder(BoopColor.bg, lineWidth: 2))
                        .padding(.top, 2).padding(.trailing, 2)
                }
            }
        }
        .buttonStyle(.plain)
    }

    private var newThreadButton: some View {
        Button(action: { Task { await threads.createNewThread() } }) {
            LucideIcon(name: .plus, size: 16)
                .foregroundStyle(BoopColor.textTertiary)
                .frame(width: 28, height: 28)
                .background(.clear, in: Circle())
                .overlay(Circle().strokeBorder(BoopColor.borderStrong, style: StrokeStyle(lineWidth: 1.5, dash: [3, 3])))
        }
        .buttonStyle(.plain)
        .disabled(threads.threads.count >= 4)
        .opacity(threads.threads.count >= 4 ? 0.30 : 1.0)
    }

    private func send() {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        draft = ""
        onSend(trimmed)
    }
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd ios && xcrun --sdk iphonesimulator swiftc -target arm64-apple-ios17.0-simulator -typecheck \
  Boop/Views/Components/Dock.swift Boop/DesignSystem/*.swift Boop/Models/*.swift \
  Boop/State/ThreadsStore.swift Boop/Storage/AppSettings.swift Boop/Networking/BoopClient.swift && cd -
git add ios/Boop/Views/Components/Dock.swift
git commit -m "feat(ios): Dock — composer + thread bar in one 24-radius glass surface"
```

---

### Task 19: MenuSheet — bottom sheet with 2×2 cards

**Files:**
- Create: `ios/Boop/Views/MenuSheet.swift`

- [ ] **Step 1: Build the menu sheet matching the `.pen` design**

```swift
import SwiftUI

struct MenuSheet: View {
    var onFiles: () -> Void
    var onLiveAgents: () -> Void
    var onArchived: () -> Void
    var onSettings: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            // drag handle
            Capsule().fill(BoopColor.borderStrong).frame(width: 36, height: 4).padding(.vertical, 8)
            Text("Menu")
                .font(BoopFont.semibold(16))
                .foregroundStyle(BoopColor.textPrimary)
                .padding(.bottom, 12)

            VStack(spacing: 10) {
                HStack(spacing: 10) {
                    card(title: "Files",        icon: .folder)  { onFiles() }
                    card(title: "Live agents",  icon: .zap)     { onLiveAgents() }
                }
                HStack(spacing: 10) {
                    card(title: "Archived",     icon: .archive) { onArchived() }
                    card(title: "Settings",     icon: .settings){ onSettings() }
                }
            }
            .padding(.horizontal, BoopSpacing.edge)
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .background(BoopColor.surface)
        .presentationDetents([.height(384)])
        .presentationDragIndicator(.hidden)
        .presentationCornerRadius(BoopRadius.sheet)
    }

    private func card(title: String, icon: LucideName, action: @escaping () -> Void) -> some View {
        Button(action: { action(); dismiss() }) {
            VStack(alignment: .leading, spacing: 12) {
                LucideIcon(name: icon, size: 24)
                    .foregroundStyle(BoopColor.textPrimary)
                    .frame(width: 36, height: 36)
                    .background(BoopColor.surfaceElev, in: RoundedRectangle(cornerRadius: 10))
                Text(title)
                    .font(BoopFont.medium(14))
                    .foregroundStyle(BoopColor.textPrimary)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(height: 100)
        }
        .buttonStyle(.plain)
        .background(BoopColor.surfaceElev, in: RoundedRectangle(cornerRadius: BoopRadius.card))
        .overlay(
            RoundedRectangle(cornerRadius: BoopRadius.card)
                .strokeBorder(BoopColor.border, lineWidth: 1),
        )
    }
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd ios && xcrun --sdk iphonesimulator swiftc -target arm64-apple-ios17.0-simulator -typecheck \
  Boop/Views/MenuSheet.swift Boop/DesignSystem/*.swift && cd -
git add ios/Boop/Views/MenuSheet.swift
git commit -m "feat(ios): MenuSheet — bottom sheet 2x2 cards"
```

---

### Task 20: FilePreviewScreen (full-screen viewer)

**Files:**
- Create: `ios/Boop/Views/FilePreviewScreen.swift`

- [ ] **Step 1: Build the full-screen file preview**

```swift
import SwiftUI

struct FilePreviewScreen: View {
    let filename: String
    let kind: String         // "md" | "pdf" | "jpg" | etc.
    let sizeBytes: Int
    let threadIcon: LucideName
    let threadTint: ThreadTint
    let content: String      // for md/txt — the file body; for pdf/img — a URL string handled separately
    var onClose: () -> Void
    var onOpenInThread: () -> Void
    var onDownload: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            header
            fileInfoCard
                .padding(.horizontal, BoopSpacing.edge)
                .padding(.top, 14)
            Divider().background(BoopColor.border).padding(.top, 14)
            ScrollView { contentBody.padding(BoopSpacing.edge) }
            Divider().background(BoopColor.border)
            actionBar
        }
        .background(BoopColor.bg.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
    }

    private var header: some View {
        HStack {
            Button(action: onClose) {
                HStack(spacing: 4) {
                    LucideIcon(name: .arrowLeft, size: 18)
                    Text("Back").font(BoopFont.medium(13))
                }
                .foregroundStyle(BoopColor.textPrimary)
            }
            Spacer()
            HStack(spacing: 14) {
                Button(action: { /* share — M2 */ }) {
                    LucideIcon(name: .share, size: 18).foregroundStyle(BoopColor.textSecondary)
                }
                Button(action: { /* more — M2 */ }) {
                    LucideIcon(name: .moreHorizontal, size: 18).foregroundStyle(BoopColor.textSecondary)
                }
            }
        }
        .padding(.horizontal, BoopSpacing.edge)
        .padding(.top, 14).padding(.bottom, 8)
    }

    private var fileInfoCard: some View {
        HStack(spacing: 12) {
            Text(kind.lowercased())
                .font(BoopFont.monoMedium(13))
                .foregroundStyle(.white)
                .frame(width: 48, height: 48)
                .background(BoopColor.accent, in: RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 2) {
                Text(filename).font(BoopFont.semibold(14)).foregroundStyle(BoopColor.textPrimary)
                Text(FileCard.size(sizeBytes)).font(BoopFont.meta).foregroundStyle(BoopColor.textTertiary)
            }
            Spacer()
            HStack(spacing: 6) {
                LucideIcon(name: threadIcon, size: 14).foregroundStyle(threadTint.text)
                Text(threadTint.rawValue.capitalized).font(BoopFont.meta).foregroundStyle(threadTint.text)
            }
            .padding(.horizontal, 10).padding(.vertical, 6)
            .background(threadTint.fill, in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(threadTint.border, lineWidth: 1))
        }
        .padding(12)
        .background(BoopColor.surfaceElev, in: RoundedRectangle(cornerRadius: BoopRadius.l))
        .overlay(RoundedRectangle(cornerRadius: BoopRadius.l).strokeBorder(BoopColor.border, lineWidth: 1))
    }

    @ViewBuilder
    private var contentBody: some View {
        switch kind.lowercased() {
        case "md", "txt":
            MarkdownView(source: content, sheetMode: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        case "pdf":
            // Real PDF preview is wired in once we add PDFKit. Placeholder for M1.
            Text("PDF preview coming in M2").font(BoopFont.bodyMedium).foregroundStyle(BoopColor.textSecondary)
        default:
            Text("Preview not supported for .\(kind)").font(BoopFont.bodyMedium).foregroundStyle(BoopColor.textSecondary)
        }
    }

    private var actionBar: some View {
        HStack(spacing: 10) {
            Button(action: onOpenInThread) {
                HStack(spacing: 8) {
                    LucideIcon(name: threadIcon, size: 16)
                    Text("Open in thread").font(BoopFont.medium(14))
                }
                .foregroundStyle(BoopColor.textPrimary)
                .frame(maxWidth: .infinity)
                .frame(height: 44)
                .background(BoopColor.surfaceElev, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(BoopColor.border, lineWidth: 1))
            }
            Button(action: onDownload) {
                HStack(spacing: 8) {
                    LucideIcon(name: .download, size: 16)
                    Text("Download").font(BoopFont.medium(14))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 44)
                .background(BoopColor.accent, in: RoundedRectangle(cornerRadius: 12))
            }
        }
        .padding(.horizontal, BoopSpacing.edge)
        .padding(.vertical, 12)
    }
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd ios && xcrun --sdk iphonesimulator swiftc -target arm64-apple-ios17.0-simulator -typecheck \
  Boop/Views/FilePreviewScreen.swift Boop/Views/Components/*.swift Boop/DesignSystem/*.swift && cd -
git add ios/Boop/Views/FilePreviewScreen.swift
git commit -m "feat(ios): FilePreviewScreen — full-screen viewer with action bar"
```

---

### Task 21: ChatView — redesigned to match `.pen`

**Files:**
- Modify: `ios/Boop/Views/ChatView.swift`

- [ ] **Step 1: Rewrite ChatView to compose the redesigned pieces**

Replace the entire contents of `ios/Boop/Views/ChatView.swift`:

```swift
import SwiftUI

struct ChatView: View {
    @Binding var showMenu: Bool
    @Environment(ChatStore.self) private var chat
    @Environment(ThreadsStore.self) private var threads
    @State private var draft: String = ""
    @FocusState private var composerFocused: Bool

    var body: some View {
        ZStack(alignment: .bottom) {
            BoopColor.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                if let err = chat.sendError { BannerView(text: err) }
                messageList
            }
            Dock(draft: $draft, onSend: { text in
                Task { await chat.send(text) }
            })
        }
    }

    private var header: some View {
        HStack {
            Text("Boop")
                .font(BoopFont.semibold(17))
                .foregroundStyle(BoopColor.textPrimary)
                .accessibilityAddTraits(.isHeader)
            Spacer()
            Button(action: { showMenu = true }) {
                DotGrid().foregroundStyle(BoopColor.textPrimary).frame(width: 32, height: 32)
            }
            .accessibilityLabel("Menu")
        }
        .padding(.horizontal, BoopSpacing.edge)
        .padding(.top, 14).padding(.bottom, 10)
        .overlay(Rectangle().fill(BoopColor.border).frame(height: 1).padding(.horizontal, 0), alignment: .bottom)
    }

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: BoopSpacing.m) {
                    ForEach(chat.messages) { msg in
                        MessageBubble(message: msg).id(msg.id)
                    }
                    if chat.isAwaitingReply {
                        TypingBubble().id("typing")
                    }
                    Color.clear.frame(height: 1).id("bottom")
                }
                .padding(.horizontal, 14).padding(.top, 12)
                .padding(.bottom, 150)   // room for the dock + safe area
                .animation(.easeInOut(duration: 0.18), value: chat.isAwaitingReply)
            }
            .onChange(of: chat.messages.count) { withAnimation { proxy.scrollTo("bottom", anchor: .bottom) } }
            .onChange(of: chat.messages.last?.content) { proxy.scrollTo("bottom", anchor: .bottom) }
            .onChange(of: chat.isAwaitingReply) { _, awaiting in
                if awaiting { withAnimation { proxy.scrollTo("bottom", anchor: .bottom) } }
            }
            .onAppear { proxy.scrollTo("bottom", anchor: .bottom) }
        }
    }
}

private struct DotGrid: View {
    var body: some View {
        Grid(horizontalSpacing: 4, verticalSpacing: 4) {
            GridRow {
                Circle().frame(width: 6, height: 6)
                Circle().frame(width: 6, height: 6)
            }
            GridRow {
                Circle().frame(width: 6, height: 6)
                Circle().frame(width: 6, height: 6)
            }
        }
    }
}

private struct BannerView: View {
    let text: String
    var body: some View {
        Text(text)
            .font(BoopFont.meta)
            .foregroundStyle(BoopColor.error)
            .padding(.horizontal, BoopSpacing.edge).padding(.vertical, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(BoopColor.error.opacity(0.10))
    }
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd ios && xcrun --sdk iphonesimulator swiftc -target arm64-apple-ios17.0-simulator -typecheck \
  Boop/Views/ChatView.swift Boop/Views/Components/*.swift Boop/DesignSystem/*.swift \
  Boop/Models/*.swift Boop/State/*.swift Boop/Storage/*.swift Boop/Networking/*.swift && cd -
git add ios/Boop/Views/ChatView.swift
git commit -m "feat(ios): ChatView redesign — new header, dock, markdown bubbles"
```

---

### Task 22: RootView + PairingView + SettingsView restyle

**Files:**
- Modify: `ios/Boop/Views/RootView.swift`
- Modify: `ios/Boop/Views/PairingView.swift`
- Modify: `ios/Boop/Views/SettingsView.swift`

- [ ] **Step 1: Update `RootView.swift` to thread ThreadsStore through and present MenuSheet**

```swift
import SwiftUI

struct RootView: View {
    @Environment(AppSettings.self) private var settings
    @State private var pairing: PairingStore?
    @State private var chat: ChatStore?
    @State private var threadsStore: ThreadsStore?
    @State private var showMenu = false
    @State private var showSettings = false

    var body: some View {
        Group {
            if let pairing, let chat, let threadsStore {
                switch pairing.phase {
                case .paired(let bearer):
                    ChatView(showMenu: $showMenu)
                        .task(id: bearer) {
                            threadsStore.bind(bearer: bearer)
                            chat.bind(bearer: bearer)
                            await threadsStore.loadThreads()
                            if let id = threadsStore.activeThreadId {
                                await chat.switchTo(threadId: id)
                            }
                        }
                        .onChange(of: pairing.phase) { _, new in
                            if case .paired = new { return }
                            chat.unbind(); threadsStore.unbind()
                        }
                        .onChange(of: threadsStore.activeThreadId) { _, newId in
                            guard let newId else { return }
                            Task { await chat.switchTo(threadId: newId) }
                        }
                        .environment(chat).environment(threadsStore)
                default:
                    PairingView(showMenu: $showMenu)
                        .environment(pairing)
                }
            } else { ProgressView().tint(BoopColor.textSecondary) }
        }
        .task {
            if pairing == nil { pairing = PairingStore(settings: settings) }
            if chat == nil    { chat    = ChatStore(settings: settings) }
            if threadsStore == nil { threadsStore = ThreadsStore(settings: settings) }
        }
        .sheet(isPresented: $showMenu) {
            MenuSheet(
                onFiles:      { /* Plan B */ },
                onLiveAgents: { /* Plan B */ },
                onArchived:   { /* Plan B */ },
                onSettings:   { showSettings = true },
            )
        }
        .sheet(isPresented: $showSettings) {
            SettingsView(onUnpair: { pairing?.reset() }).environment(settings)
        }
    }
}
```

- [ ] **Step 2: Update `PairingView.swift` header to match new design**

Just swap the existing settings-gear button for the dot-grid menu trigger and use BoopColor / BoopFont throughout. Find the current header and replace:

```swift
// at top of PairingView
@Binding var showMenu: Bool

// in the view body, replace any old header with:
HStack {
    Text("Boop").font(BoopFont.semibold(17)).foregroundStyle(BoopColor.textPrimary)
    Spacer()
    Button(action: { showMenu = true }) {
        DotGridLocal().foregroundStyle(BoopColor.textPrimary).frame(width: 32, height: 32)
    }
}
.padding(.horizontal, BoopSpacing.edge).padding(.top, 14)
```

Add a private `DotGridLocal` view inside `PairingView.swift` matching the one in ChatView. Then update every color/font reference in the file to BoopColor / BoopFont.

- [ ] **Step 3: Update `SettingsView.swift`**

Mostly a color / font swap. Anywhere `.foregroundStyle` was a system color, replace with `BoopColor.*`. Anywhere `.font(.headline)` or similar, replace with the matching `BoopFont` token.

- [ ] **Step 4: Typecheck the full source set + commit**

```bash
cd ios && xcrun --sdk iphonesimulator swiftc -target arm64-apple-ios17.0-simulator -typecheck \
  Boop/*.swift Boop/Models/*.swift Boop/State/*.swift Boop/Storage/*.swift Boop/Networking/*.swift \
  Boop/Views/*.swift Boop/Views/Components/*.swift Boop/DesignSystem/*.swift && cd -
git add ios/Boop/Views/RootView.swift ios/Boop/Views/PairingView.swift ios/Boop/Views/SettingsView.swift
git commit -m "feat(ios): RootView wires ThreadsStore + MenuSheet; restyled Pairing/Settings"
```

---

### Task 23: Build, install, and end-to-end test on the simulator

**Files:** (no code changes)

- [ ] **Step 1: Generate xcodeproj and build**

```bash
cd ios && xcodegen generate && cd -
xcodebuild -project ios/Boop.xcodeproj -target Boop -sdk iphonesimulator -configuration Debug build CODE_SIGNING_ALLOWED=NO 2>&1 | grep -E "error:|BUILD SUCCEEDED|BUILD FAILED" | tail -5
```

Expected: BUILD SUCCEEDED.

- [ ] **Step 2: Install + launch in iPhone 17 simulator**

```bash
xcrun simctl boot "iPhone 17" 2>/dev/null
open -a Simulator
xcrun simctl terminate booted dev.boop.Boop 2>/dev/null
xcrun simctl install booted /Users/lakunle/project/boop-agent/ios/build/Debug-iphonesimulator/Boop.app
xcrun simctl launch booted dev.boop.Boop
sleep 3
xcrun simctl io booted screenshot /tmp/plan-a-fresh.png
```

Expected: pairing screen visible matching the new design (Boop wordmark, dot-grid menu, primary action button).

- [ ] **Step 3: Pair a device and create a thread**

Start the dev server and pair:

```bash
npm run dev:server &
sleep 12
# Have a human tap Start pairing in the simulator. Auto-consume:
CODE=$(xcrun simctl io booted screenshot /tmp/code.png && \
       python3 scripts/read-code-from-screenshot.py /tmp/code.png)  # — if a helper exists
# (alternative: ask the operator to read the 6-digit code from the screen and consume manually)
curl -s -X POST http://localhost:3456/channels/ios/pair/consume \
  -H 'Content-Type: application/json' \
  -d "{\"code\":\"$CODE\",\"label\":\"PlanATest\"}"
sleep 3
xcrun simctl io booted screenshot /tmp/plan-a-chat.png
```

Expected: the screenshot shows the chat with the dock, an active thread tab with a fallback icon, and a "+" new-thread button.

- [ ] **Step 4: Send a message and verify the markdown reply renders**

Type a prompt that forces a markdown-rich reply (e.g. "give me a quick markdown recap of what you can do"). Verify:
- Reply renders with headers, bullets, bold
- Active thread's icon changes from fallback to a topic-appropriate Lucide icon (the agent calls `set_thread_icon`)
- No duplicate bubble

- [ ] **Step 5: Tap "+" to make a second thread, send another message**

Verify:
- New tab appears in dock with `sparkles` (fallback) icon until first reply
- Switching to the previous thread reloads its history
- Tints differ between the two threads
- Unread dot appears on inactive thread when it gets an SSE message

- [ ] **Step 6: Open the menu**

Tap the dot-grid → MenuSheet appears as a bottom sheet with 4 cards in 2×2. Tap Settings → restyled settings opens.

- [ ] **Step 7: Commit any incidental fixes**

If anything broke during verification, fix and commit per the usual TDD flow.

```bash
git add -A && git commit -m "fix(ios): smoke-test fixes from Plan A verification" || echo "nothing to fix"
```

---

### Task 24: Document + push

**Files:**
- Create: `docs/CHANGELOG-plan-a.md`

- [ ] **Step 1: Write a short release note**

```markdown
# Plan A complete

iOS app fully redesigned to match `ios_app_design.pen`. Multi-thread support
shipping: up to 4 concurrent threads, each with an agent-picked Lucide icon
and a deterministic per-thread color tint. Markdown rendering live in chat
bubbles. Bottom-sheet menu with 2×2 cards (Files / Live agents / Archived /
Settings — Files + Live agents land in Plan B).

Server side: new `threads` Convex table, thread-aware `/channels/ios/*`
endpoints, `set_thread_icon` self-tool, dispatcher prompt addendum.

Verified end-to-end on the iPhone 17 simulator: pair → multi-thread chat →
thread-icon assignment → cross-thread switching → markdown rendering.
```

- [ ] **Step 2: Append to CHANGELOG**

In the repo-root `CHANGELOG.md`, add a new Unreleased section above the existing ones:

```markdown
## Unreleased — iOS Plan A redesign

- iOS: full visual redesign matching the approved design (`ios_app_design.pen`)
- iOS: multi-thread chat — up to 4 concurrent threads, agent picks Lucide icon, per-thread color tints
- iOS: Markdown rendering in chat bubbles and `.md` previews
- iOS: bottom-sheet 2×2 menu (Files / Live agents / Archived / Settings)
- Server: `threads` Convex table + endpoints under `/channels/ios/threads/*`
- Server: `set_thread_icon` self-tool
- See `docs/superpowers/plans/2026-05-15-ios-redesign-plan-a-foundation.md`
```

- [ ] **Step 3: Commit + push**

```bash
git add docs/CHANGELOG-plan-a.md CHANGELOG.md
git commit -m "docs: changelog for iOS Plan A redesign"
git push origin feat/ios-channel
```

---

## Self-review

**Spec coverage** (against `docs/superpowers/specs/2026-05-15-ios-redesign-brief.md`):

| Brief section | Plan A task(s) |
| --- | --- |
| §2.1 Multi-thread conversations | 1, 2, 3, 4, 5, 11, 13, 18 |
| §2.4 Rich-text chat formatting | 15 |
| §2.5 In-line attachment preview | 16 (FileCard), 20 (FilePreviewScreen) |
| §3.1 Type stack | 7, 8 |
| §3.2 Color tokens | 8 |
| §3.3 Per-thread tint palette | 9 |
| §3.4 Material — glass | 18 (Dock) |
| §3.5 Motion principles | 14, 17, 21 |
| §4.1 The dock | 18 |
| §4.2 Top header | 21 |
| §4.3 Message bubbles | 16 |
| §4.4 File cards | 16 |
| §4.7 Bottom sheet | 19 |
| §4.8 Top-right menu | superseded by 19 (designer chose bottom sheet) |
| §4.9 Markdown rendering | 15 |
| §5.1 Chat screen | 21 |
| §5.4 File preview | 20 |
| §5.5 Settings | 22 |
| §7 Iconography | 10 |
| §2.2 Files browser | **deferred to Plan B** ✓ |
| §2.3 Sub-agent watcher | **deferred to Plan B** ✓ |
| §6.2 Sub-agent inline pill | 17 (component) — wiring is Plan B |

**Placeholder scan:** all code blocks contain concrete content; no `TODO` or `TBD` in actual implementation steps. Plan-B-deferred items are explicitly labeled.

**Type consistency:**
- `BoopThread.id` is `String` everywhere → ✓
- `LucideName` is the iOS-side type; the server stores raw `String` icon names → ✓
- `ThreadTint` uses `.solid` / `.fill` / `.border` / `.text` consistently → ✓
- `Message.threadId` non-optional in M1; `ServerMessage.threadId` optional for back-compat → ✓
- `BoopClient.sendInbound(text:threadId:)` signature stable across ChatStore and Dock → ✓

**Known omission to fix during Plan B:** unread dots on inactive tabs depend on receiving SSE events from threads other than the active one. Plan A's `ChatStore` only opens an SSE for the active thread. The unread-dot wiring will need a thin "multi-thread fan-out" SSE in Plan B (or per-thread connections capped at 4). Noted in Task 23, Step 5 — the dot will not fire in Plan A; visible only once Plan B lands.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-15-ios-redesign-plan-a-foundation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
