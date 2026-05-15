import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const send = mutation({
  args: {
    conversationId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.string(),
    agentId: v.optional(v.string()),
    turnId: v.optional(v.string()),
    imageStorageIds: v.optional(v.array(v.id("_storage"))),
    mediaError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert("messages", { ...args, createdAt: now });

    const conv = await ctx.db
      .query("conversations")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .unique();
    if (conv) {
      await ctx.db.patch(conv._id, {
        messageCount: conv.messageCount + 1,
        lastActivityAt: now,
      });
    } else {
      await ctx.db.insert("conversations", {
        conversationId: args.conversationId,
        messageCount: 1,
        lastActivityAt: now,
      });
    }
    return id;
  },
});

export const list = query({
  args: { conversationId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const recent = query({
  args: { conversationId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const msgs = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .take(args.limit ?? 20);
    return msgs.reverse();
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const getStorageUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

export const expiredWithImages = query({
  args: {
    olderThanMs: v.number(),
    afterMs: v.optional(v.number()),
    scanLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Cursor-based pagination over the by_createdAt index. The caller scans
    // pages until either no more expired rows exist or it has enough image
    // rows. Filtering after take is unavoidable (Convex can't index on an
    // array's emptiness), but pagination via the index makes that filter a
    // bounded-cost step instead of a silent dropout.
    const scanLimit = args.scanLimit ?? 200;
    const after = args.afterMs ?? 0;
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_createdAt", (q) =>
        q.gt("createdAt", after).lt("createdAt", args.olderThanMs),
      )
      .order("asc")
      .take(scanLimit);
    const imageRows = rows.filter(
      (r) => Array.isArray(r.imageStorageIds) && r.imageStorageIds.length > 0,
    );
    // hasMore = the scan filled its budget; the caller may need another page.
    return {
      rows: imageRows,
      hasMore: rows.length === scanLimit,
      nextAfterMs: rows.length > 0 ? rows[rows.length - 1].createdAt : after,
    };
  },
});

export const clearMessageImage = mutation({
  args: { messageId: v.id("messages"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.messageId);
    if (!row || !row.imageStorageIds) return;
    const remaining = row.imageStorageIds.filter((id) => id !== args.storageId);
    if (remaining.length === 0) {
      await ctx.db.patch(args.messageId, { imageStorageIds: undefined });
    } else {
      await ctx.db.patch(args.messageId, { imageStorageIds: remaining });
    }
  },
});

export const deleteImageBytes = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    await ctx.storage.delete(args.storageId);
  },
});
