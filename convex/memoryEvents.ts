import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./auth.js";

export const emit = internalMutation({
  args: {
    eventType: v.string(),
    conversationId: v.optional(v.string()),
    memoryId: v.optional(v.string()),
    agentId: v.optional(v.string()),
    data: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("memoryEvents", { ...args, createdAt: Date.now() });
  },
});

export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db.query("memoryEvents").order("desc").take(args.limit ?? 100);
  },
});

export const byConversation = query({
  args: { conversationId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("memoryEvents")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});
