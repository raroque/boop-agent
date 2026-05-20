import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/** Maximum number of OPEN threads per device. Older ones must be archived
 *  before a new one can be created. Matches the spec. */
export const MAX_OPEN_THREADS = 4;

export const createThread = mutation({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    // Read at most MAX_OPEN_THREADS + 1 to detect overflow without an
    // unbounded scan inside the mutation. Stays well below Convex's
    // per-transaction read budget regardless of corruption / stale rows.
    const open = await ctx.db
      .query("threads")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId).eq("archived", false))
      .take(MAX_OPEN_THREADS + 1);
    if (open.length >= MAX_OPEN_THREADS) {
      throw new Error(`Cannot create: no more than ${MAX_OPEN_THREADS} open threads allowed`);
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
      .take(MAX_OPEN_THREADS);
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

/** Lists archived threads for a device, newest-archived-first.
 *  The Convex client doesn't expose `_creationTime` ordering on a
 *  filtered query out of the box, but the by_device index orders by
 *  the indexed fields, so we read all rows for this device and
 *  filter+sort in-process. Bounded by MAX_OPEN_THREADS * N reads —
 *  in practice an archived list grows slowly. */
export const listArchived = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const rows = await ctx.db
      .query("threads")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId).eq("archived", true))
      .take(200);
    // Newest-archived-first means most-recent `lastMessageAt` first;
    // archived threads keep the `lastMessageAt` they had at archive time.
    rows.sort((a, b) => (b.lastMessageAt ?? b.createdAt) - (a.lastMessageAt ?? a.createdAt));
    return rows;
  },
});

/** Restores an archived thread. Fails if the device already has
 *  MAX_OPEN_THREADS open — caller must archive one first. */
export const unarchive = mutation({
  args: { threadId: v.id("threads") },
  handler: async (ctx, { threadId }) => {
    const row = await ctx.db.get(threadId);
    if (!row) throw new Error("thread not found");
    if (!row.archived) return; // idempotent

    const openCount = await ctx.db
      .query("threads")
      .withIndex("by_device", (q) => q.eq("deviceId", row.deviceId).eq("archived", false))
      .take(MAX_OPEN_THREADS + 1);
    if (openCount.length >= MAX_OPEN_THREADS) {
      throw new Error(`Cannot unarchive: no more than ${MAX_OPEN_THREADS} open threads allowed`);
    }
    await ctx.db.patch(threadId, { archived: false });
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
  args: { threadId: v.id("threads") },
  handler: async (ctx, { threadId }) => {
    await ctx.db.patch(threadId, { lastMessageAt: Date.now() });
  },
});

/** Permanently deletes a thread and everything tied to it: messages on
 *  this threadId, executionAgents whose conversationId is the iOS
 *  `ios:<deviceId>:<threadId>`, and the per-agent logs for those. The
 *  thread row itself goes last. Reads are capped so a runaway thread
 *  (>1000 messages or >500 agents) can't blow the per-transaction
 *  budget — in practice an iOS thread has a couple dozen of each.
 *  Attachment storage objects (image / PDF / doc) are intentionally
 *  left in `_storage` for now; no other code path purges them either,
 *  so consistency wins.
 *
 *  Throws `forbidden` when `expectedDeviceId` is provided and doesn't
 *  match the thread's owner — defense-in-depth on top of the bearer
 *  check the HTTP layer already does. The route translates that into a
 *  403 response. */
export const remove = mutation({
  args: {
    threadId: v.id("threads"),
    expectedDeviceId: v.optional(v.string()),
  },
  handler: async (ctx, { threadId, expectedDeviceId }) => {
    const thread = await ctx.db.get(threadId);
    if (!thread) return; // idempotent — already gone.
    if (expectedDeviceId && thread.deviceId !== expectedDeviceId) {
      throw new Error("forbidden");
    }

    const conversationId = `ios:${thread.deviceId}:${threadId}`;

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .take(1000);
    for (const m of messages) await ctx.db.delete(m._id);

    const agents = await ctx.db
      .query("executionAgents")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
      .take(500);
    for (const a of agents) {
      const logs = await ctx.db
        .query("agentLogs")
        .withIndex("by_agent", (q) => q.eq("agentId", a.agentId))
        .take(500);
      for (const l of logs) await ctx.db.delete(l._id);
      await ctx.db.delete(a._id);
    }

    await ctx.db.delete(threadId);
  },
});
