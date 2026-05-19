import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { attachmentsFieldValidator } from "./validators";

export const send = mutation({
  args: {
    conversationId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.string(),
    agentId: v.optional(v.string()),
    turnId: v.optional(v.string()),
    threadId: v.optional(v.id("threads")),
    attachments: attachmentsFieldValidator,
  },
  handler: async (ctx, args) => {
    // NOTE: args must mirror the messages schema shape (minus createdAt).
    // The shared `attachmentsFieldValidator` (convex/validators.ts) keeps
    // schema and args in lockstep — extend it there to add fields.
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

    if (args.threadId) {
      await ctx.db.patch(args.threadId, { lastMessageAt: now });
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

export const recentAcrossChannels = query({
  args: {
    conversationIds: v.array(v.string()),
    limit: v.number(),
  },
  handler: async (ctx, { conversationIds, limit }) => {
    if (conversationIds.length === 0) return [];
    const perConvo = await Promise.all(
      conversationIds.map((cid) =>
        ctx.db
          .query("messages")
          .withIndex("by_conversation", (q) => q.eq("conversationId", cid))
          .order("desc")
          .take(limit),
      ),
    );
    const merged = perConvo.flat();
    merged.sort((a, b) => a._creationTime - b._creationTime);
    return merged.slice(-limit);
  },
});

export const listForThread = query({
  args: { threadId: v.id("threads"), limit: v.optional(v.number()) },
  handler: async (ctx, { threadId, limit }) => {
    const cap = Math.min(limit ?? 50, 200);
    return await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .order("desc")
      .take(cap);
  },
});

/**
 * Powers the iOS Files screen. Returns every message-attachment pair for a
 * device across all its threads (open + archived), flattened and sorted
 * newest-first. Each row carries the thread's icon so the UI can render the
 * tint chip without a second lookup.
 */
export const listFilesForDevice = query({
  args: { deviceId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { deviceId, limit }) => {
    const cap = Math.min(limit ?? 100, 500);
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .collect();
    const iconByThread = new Map<string, string | undefined>();
    for (const t of threads) iconByThread.set(t._id, t.icon);

    const flat: Array<{
      messageId: string;
      threadId: string;
      threadIcon: string | undefined;
      role: "user" | "assistant" | "system";
      createdAt: number;
      attachment: {
        kind: "image" | "pdf" | "doc";
        mimeType: string;
        sizeBytes: number;
        storageId: string;
        signedUrl?: string;
        description?: string;
        filename?: string;
      };
    }> = [];

    for (const t of threads) {
      const msgs = await ctx.db
        .query("messages")
        .withIndex("by_thread", (q) => q.eq("threadId", t._id))
        .order("desc")
        .take(cap);
      for (const m of msgs) {
        for (const a of m.attachments ?? []) {
          flat.push({
            messageId: m._id,
            threadId: t._id,
            threadIcon: iconByThread.get(t._id),
            role: m.role,
            createdAt: m.createdAt,
            attachment: a,
          });
        }
      }
    }
    flat.sort((a, b) => b.createdAt - a.createdAt);
    return flat.slice(0, cap);
  },
});
