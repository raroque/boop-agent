import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";

const STATUS = v.union(
  v.literal("active"),
  v.literal("parked"),
  v.literal("closed"),
  v.literal("error"),
  v.literal("timed_out"),
);

const PARKED_REASON = v.union(
  v.literal("2fa"),
  v.literal("captcha"),
  v.literal("approval"),
  v.literal("ambiguous"),
  v.literal("other"),
);

export const create = mutation({
  args: {
    sessionId: v.string(),
    conversationId: v.optional(v.string()),
    agentId: v.optional(v.string()),
    provider: v.string(),
    providerSessionId: v.string(),
    goal: v.string(),
    startUrl: v.optional(v.string()),
    liveViewUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("browserSessions", {
      ...args,
      status: "active",
      steps: 0,
      totalCostUsd: 0,
      startedAt: Date.now(),
    });
  },
});

export const incrementStep = mutation({
  args: {
    sessionId: v.string(),
    addCostUsd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("browserSessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!row) return;
    await ctx.db.patch(row._id, {
      steps: row.steps + 1,
      totalCostUsd: row.totalCostUsd + (args.addCostUsd ?? 0),
    });
  },
});

export const finalize = mutation({
  args: {
    sessionId: v.string(),
    status: STATUS,
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("browserSessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!row) return;
    await ctx.db.patch(row._id, {
      status: args.status,
      errorMessage: args.errorMessage,
      endedAt: Date.now(),
    });
  },
});

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("browserSessions").collect();
    return rows
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, args.limit ?? 50);
  },
});

export const get = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("browserSessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
      .first();
  },
});

export const park = mutation({
  args: {
    sessionId: v.string(),
    reason: PARKED_REASON,
    question: v.string(),
    pendingFieldTarget: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("browserSessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!row) throw new Error(`No session ${args.sessionId} to park`);
    if (row.status !== "active") {
      throw new Error(
        `Session ${args.sessionId} is "${row.status}", can only park an active session`,
      );
    }
    await ctx.db.patch(row._id, {
      status: "parked",
      parkedReason: args.reason,
      parkedQuestion: args.question,
      parkedAt: Date.now(),
      pendingFieldTarget: args.pendingFieldTarget,
    });
  },
});

export const markActive = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("browserSessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!row) throw new Error(`No session ${args.sessionId} to resume`);
    await ctx.db.patch(row._id, {
      status: "active",
      parkedReason: undefined,
      parkedQuestion: undefined,
      parkedAt: undefined,
      pendingFieldTarget: undefined,
    });
  },
});

// Returns the most recent parked session for the conversation IF it's still
// within the freshness window. Caller passes maxAgeMs so the freshness
// policy lives in app code, not Convex. Returns null if none / stale.
export const findParked = query({
  args: {
    conversationId: v.string(),
    maxAgeMs: v.number(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("browserSessions")
      .withIndex("by_conversation_status", (q) =>
        q.eq("conversationId", args.conversationId).eq("status", "parked"),
      )
      .collect();
    if (rows.length === 0) return null;
    // Most recent first.
    rows.sort((a, b) => (b.parkedAt ?? 0) - (a.parkedAt ?? 0));
    const newest = rows[0];
    const age = Date.now() - (newest.parkedAt ?? 0);
    if (age > args.maxAgeMs) return null;
    return newest;
  },
});
