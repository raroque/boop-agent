import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const statusV = v.union(
  v.literal("spawned"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("cancelled"),
  v.literal("paused"),
);

export const create = mutation({
  args: {
    agentId: v.string(),
    conversationId: v.optional(v.string()),
    name: v.string(),
    task: v.string(),
    mcpServers: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("executionAgents", {
      ...args,
      status: "spawned",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      startedAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    agentId: v.string(),
    status: v.optional(statusV),
    result: v.optional(v.string()),
    error: v.optional(v.string()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    cacheReadTokens: v.optional(v.number()),
    cacheCreationTokens: v.optional(v.number()),
    costUsd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { agentId, ...patch } = args;
    const agent = await ctx.db
      .query("executionAgents")
      .withIndex("by_agent_id", (q) => q.eq("agentId", agentId))
      .unique();
    if (!agent) return null;
    const completed = patch.status && ["completed", "failed", "cancelled", "paused"].includes(patch.status);
    await ctx.db.patch(agent._id, { ...patch, ...(completed ? { completedAt: Date.now() } : {}) });
    return agent._id;
  },
});

export const addLog = mutation({
  args: {
    agentId: v.string(),
    logType: v.union(
      v.literal("thinking"),
      v.literal("tool_use"),
      v.literal("tool_result"),
      v.literal("text"),
      v.literal("error"),
    ),
    toolName: v.optional(v.string()),
    accounts: v.optional(v.array(v.string())),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentLogs", { ...args, createdAt: Date.now() });
  },
});

export const list = query({
  args: { status: v.optional(statusV), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    if (args.status) {
      return await ctx.db
        .query("executionAgents")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(limit);
    }
    return await ctx.db.query("executionAgents").order("desc").take(limit);
  },
});

export const get = query({
  args: { agentId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("executionAgents")
      .withIndex("by_agent_id", (q) => q.eq("agentId", args.agentId))
      .unique();
  },
});

export const getLogs = query({
  args: { agentId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentLogs")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .order("asc")
      .take(args.limit ?? 500);
  },
});
