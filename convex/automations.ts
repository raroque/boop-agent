import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./auth.js";

export const create = internalMutation({
  args: {
    automationId: v.string(),
    name: v.string(),
    task: v.string(),
    integrations: v.array(v.string()),
    schedule: v.string(),
    conversationId: v.optional(v.string()),
    notifyConversationId: v.optional(v.string()),
    nextRunAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("automations")
      .withIndex("by_automation_id", (q) => q.eq("automationId", args.automationId))
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("automations", {
      ...args,
      enabled: true,
      createdAt: Date.now(),
    });
  },
});

export const list = query({
  args: { enabledOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    let results;
    if (args.enabledOnly) {
      results = await ctx.db
        .query("automations")
        .withIndex("by_enabled", (q) => q.eq("enabled", true))
        .collect();
    } else {
      results = await ctx.db.query("automations").order("desc").collect();
    }
    return results;
  },
});

export const get = query({
  args: { automationId: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("automations")
      .withIndex("by_automation_id", (q) => q.eq("automationId", args.automationId))
      .unique();
  },
});

export const setEnabled = mutation({
  args: { automationId: v.string(), enabled: v.boolean() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const auto = await ctx.db
      .query("automations")
      .withIndex("by_automation_id", (q) => q.eq("automationId", args.automationId))
      .unique();
    if (!auto) return null;
    await ctx.db.patch(auto._id, { enabled: args.enabled });
    return auto._id;
  },
});

export const remove = mutation({
  args: { automationId: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const auto = await ctx.db
      .query("automations")
      .withIndex("by_automation_id", (q) => q.eq("automationId", args.automationId))
      .unique();
    if (!auto) return null;
    await ctx.db.delete(auto._id);
    return auto._id;
  },
});

export const listInternal = internalQuery({
  args: { enabledOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    if (args.enabledOnly) {
      return await ctx.db
        .query("automations")
        .withIndex("by_enabled", (q) => q.eq("enabled", true))
        .collect();
    }
    return await ctx.db.query("automations").order("desc").collect();
  },
});

export const setEnabledInternal = internalMutation({
  args: { automationId: v.string(), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const auto = await ctx.db
      .query("automations")
      .withIndex("by_automation_id", (q) => q.eq("automationId", args.automationId))
      .unique();
    if (!auto) return null;
    await ctx.db.patch(auto._id, { enabled: args.enabled });
    return auto._id;
  },
});

export const removeInternal = internalMutation({
  args: { automationId: v.string() },
  handler: async (ctx, args) => {
    const auto = await ctx.db
      .query("automations")
      .withIndex("by_automation_id", (q) => q.eq("automationId", args.automationId))
      .unique();
    if (!auto) return null;
    await ctx.db.delete(auto._id);
    return auto._id;
  },
});

export const markRan = internalMutation({
  args: {
    automationId: v.string(),
    lastRunAt: v.number(),
    nextRunAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const auto = await ctx.db
      .query("automations")
      .withIndex("by_automation_id", (q) => q.eq("automationId", args.automationId))
      .unique();
    if (!auto) return null;
    await ctx.db.patch(auto._id, {
      lastRunAt: args.lastRunAt,
      nextRunAt: args.nextRunAt,
    });
    return auto._id;
  },
});

export const createRun = internalMutation({
  args: {
    runId: v.string(),
    automationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("automationRuns", {
      ...args,
      status: "running",
      startedAt: Date.now(),
    });
  },
});

export const updateRun = internalMutation({
  args: {
    runId: v.string(),
    status: v.union(v.literal("running"), v.literal("completed"), v.literal("failed")),
    result: v.optional(v.string()),
    error: v.optional(v.string()),
    agentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("automationRuns")
      .withIndex("by_run_id", (q) => q.eq("runId", args.runId))
      .unique();
    if (!run) return null;
    const completed = args.status !== "running";
    const { runId: _runId, ...patch } = args;
    await ctx.db.patch(run._id, {
      ...patch,
      ...(completed ? { completedAt: Date.now() } : {}),
    });
    return run._id;
  },
});

export const recentRuns = query({
  args: { automationId: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const limit = args.limit ?? 50;
    if (args.automationId) {
      return await ctx.db
        .query("automationRuns")
        .withIndex("by_automation", (q) => q.eq("automationId", args.automationId!))
        .order("desc")
        .take(limit);
    }
    return await ctx.db.query("automationRuns").order("desc").take(limit);
  },
});
