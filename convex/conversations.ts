import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./auth.js";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.db.query("conversations").order("desc").take(50);
  },
});

export const get = query({
  args: { conversationId: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("conversations")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .unique();
  },
});
