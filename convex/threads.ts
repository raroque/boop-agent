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
