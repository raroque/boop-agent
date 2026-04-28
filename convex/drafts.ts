import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./auth.js";

const statusV = v.union(
  v.literal("pending"),
  v.literal("sent"),
  v.literal("rejected"),
  v.literal("expired"),
);

export const create = internalMutation({
  args: {
    draftId: v.string(),
    conversationId: v.string(),
    kind: v.string(),
    summary: v.string(),
    payload: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("drafts", {
      ...args,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

export const get = query({
  args: { draftId: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("drafts")
      .withIndex("by_draft_id", (q) => q.eq("draftId", args.draftId))
      .unique();
  },
});

export const pendingByConversation = query({
  args: { conversationId: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("drafts")
      .withIndex("by_conversation_status", (q) =>
        q.eq("conversationId", args.conversationId).eq("status", "pending"),
      )
      .order("desc")
      .take(25);
  },
});

export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db.query("drafts").order("desc").take(args.limit ?? 50);
  },
});

export const setStatus = internalMutation({
  args: { draftId: v.string(), status: statusV },
  handler: async (ctx, args) => {
    const draft = await ctx.db
      .query("drafts")
      .withIndex("by_draft_id", (q) => q.eq("draftId", args.draftId))
      .unique();
    if (!draft) return null;
    await ctx.db.patch(draft._id, { status: args.status, decidedAt: Date.now() });
    return draft;
  },
});
