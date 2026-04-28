import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./auth.js";

const statusV = v.union(
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
);

export const createRun = internalMutation({
  args: { runId: v.string(), trigger: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.insert("consolidationRuns", {
      ...args,
      status: "running",
      proposalsCount: 0,
      mergedCount: 0,
      prunedCount: 0,
      startedAt: Date.now(),
    });
  },
});

export const updateRun = internalMutation({
  args: {
    runId: v.string(),
    status: v.optional(statusV),
    proposalsCount: v.optional(v.number()),
    mergedCount: v.optional(v.number()),
    prunedCount: v.optional(v.number()),
    notes: v.optional(v.string()),
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { runId, ...patch } = args;
    const run = await ctx.db
      .query("consolidationRuns")
      .withIndex("by_run_id", (q) => q.eq("runId", runId))
      .unique();
    if (!run) return null;
    const done = patch.status && patch.status !== "running";
    await ctx.db.patch(run._id, { ...patch, ...(done ? { completedAt: Date.now() } : {}) });
    return run._id;
  },
});

export const listRuns = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db.query("consolidationRuns").order("desc").take(args.limit ?? 25);
  },
});
