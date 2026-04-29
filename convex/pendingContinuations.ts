import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";

export const get = query({
  args: { conversationId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("pendingContinuations")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .unique();
    return row
      ? {
          resumeTask: row.resumeTask,
          integrations: row.integrations,
          pausedByAgentId: row.pausedByAgentId,
          askedAt: row.askedAt,
        }
      : null;
  },
});

export const set = mutation({
  args: {
    conversationId: v.string(),
    resumeTask: v.string(),
    integrations: v.array(v.string()),
    pausedByAgentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pendingContinuations")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .unique();
    const payload = {
      conversationId: args.conversationId,
      resumeTask: args.resumeTask,
      integrations: args.integrations,
      pausedByAgentId: args.pausedByAgentId,
      askedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
    } else {
      await ctx.db.insert("pendingContinuations", payload);
    }
  },
});

export const clear = mutation({
  args: { conversationId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pendingContinuations")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});
