import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const tierV = v.union(v.literal("short"), v.literal("long"), v.literal("permanent"));
const segmentV = v.union(
  v.literal("identity"),
  v.literal("preference"),
  v.literal("correction"),
  v.literal("relationship"),
  v.literal("project"),
  v.literal("knowledge"),
  v.literal("context"),
);
const lifecycleV = v.union(v.literal("active"), v.literal("archived"), v.literal("pruned"));

export const upsert = mutation({
  args: {
    memoryId: v.string(),
    content: v.string(),
    tier: tierV,
    segment: segmentV,
    importance: v.number(),
    decayRate: v.number(),
    sourceTurn: v.optional(v.string()),
    supersedes: v.optional(v.array(v.string())),
    embedding: v.optional(v.array(v.float64())),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Archive any memories this one supersedes. Must run on BOTH the insert
    // and update paths — consolidation merges typically update an existing
    // "keep" memory while archiving the ones it absorbed.
    if (args.supersedes?.length) {
      for (const sid of args.supersedes) {
        if (sid === args.memoryId) continue; // never archive self
        const target = await ctx.db
          .query("memoryRecords")
          .withIndex("by_memory_id", (q) => q.eq("memoryId", sid))
          .unique();
        if (target && target.lifecycle === "active") {
          await ctx.db.patch(target._id, { lifecycle: "archived" });
        }
      }
    }

    const existing = await ctx.db
      .query("memoryRecords")
      .withIndex("by_memory_id", (q) => q.eq("memoryId", args.memoryId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        content: args.content,
        tier: args.tier,
        segment: args.segment,
        importance: args.importance,
        decayRate: args.decayRate,
        supersedes: args.supersedes,
        embedding: args.embedding ?? existing.embedding,
        metadata: args.metadata ?? existing.metadata,
        lastAccessedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("memoryRecords", {
      ...args,
      accessCount: 0,
      lastAccessedAt: now,
      lifecycle: "active",
      createdAt: now,
    });
  },
});

export const getByIds = query({
  args: { ids: v.array(v.id("memoryRecords")) },
  handler: async (ctx, args) => {
    const out = [];
    for (const id of args.ids) {
      const r = await ctx.db.get(id);
      if (r) out.push(r);
    }
    return out;
  },
});

export const vectorSearch = action({
  args: { embedding: v.array(v.float64()), limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<Array<{ _id: Id<"memoryRecords">; score: number; record: any }>> => {
    const results = await ctx.vectorSearch("memoryRecords", "by_embedding", {
      vector: args.embedding,
      limit: args.limit ?? 20,
      filter: (q) => q.eq("lifecycle", "active"),
    });
    const records = await ctx.runQuery(api.memoryRecords.getByIds, {
      ids: results.map((r) => r._id),
    });
    const byId = new Map(records.map((r: any) => [r._id, r]));
    return results
      .map((r) => ({ _id: r._id, score: r._score, record: byId.get(r._id) }))
      .filter((r) => r.record);
  },
});

export const list = query({
  args: {
    tier: v.optional(tierV),
    segment: v.optional(segmentV),
    lifecycle: v.optional(lifecycleV),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    let results;
    if (args.tier) {
      results = await ctx.db.query("memoryRecords").withIndex("by_tier", (q) => q.eq("tier", args.tier!)).order("desc").take(limit * 2);
    } else if (args.segment) {
      results = await ctx.db.query("memoryRecords").withIndex("by_segment", (q) => q.eq("segment", args.segment!)).order("desc").take(limit * 2);
    } else {
      results = await ctx.db.query("memoryRecords").order("desc").take(limit * 2);
    }
    const lifecycle = args.lifecycle ?? "active";
    return results.filter((r) => r.lifecycle === lifecycle).slice(0, limit);
  },
});

export const search = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const q = args.query.toLowerCase();
    // Filter on the index BEFORE the 500 cap — otherwise archived/pruned
    // records eat the budget and silently truncate the active set.
    // order("desc") so the 500-cap favors recent records. Without it the
    // index iterates oldest-first and a brand-new high-importance record
    // past position 500 would never be seen.
    const active = await ctx.db
      .query("memoryRecords")
      .withIndex("by_lifecycle", (idx) => idx.eq("lifecycle", "active"))
      .order("desc")
      .take(500);
    return active
      .filter((m) => m.content.toLowerCase().includes(q))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit);
  },
});

export const markAccessed = mutation({
  args: { memoryId: v.string() },
  handler: async (ctx, args) => {
    const mem = await ctx.db
      .query("memoryRecords")
      .withIndex("by_memory_id", (q) => q.eq("memoryId", args.memoryId))
      .unique();
    if (!mem) return null;
    await ctx.db.patch(mem._id, {
      accessCount: mem.accessCount + 1,
      lastAccessedAt: Date.now(),
    });
    return mem._id;
  },
});

export const setLifecycle = mutation({
  args: { memoryId: v.string(), lifecycle: lifecycleV },
  handler: async (ctx, args) => {
    const mem = await ctx.db
      .query("memoryRecords")
      .withIndex("by_memory_id", (q) => q.eq("memoryId", args.memoryId))
      .unique();
    if (!mem) return null;
    await ctx.db.patch(mem._id, { lifecycle: args.lifecycle });
    return mem._id;
  },
});

const COUNTS_SCAN_LIMIT = 5000;

export const embeddingStats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db
      .query("memoryRecords")
      .withIndex("by_lifecycle", (q) => q.eq("lifecycle", "active"))
      .order("desc")
      .take(COUNTS_SCAN_LIMIT);
    let withEmbedding = 0;
    let withoutEmbedding = 0;
    for (const m of all) {
      if (m.embedding && m.embedding.length > 0) withEmbedding++;
      else withoutEmbedding++;
    }
    return {
      total: all.length,
      withEmbedding,
      withoutEmbedding,
      truncated: all.length === COUNTS_SCAN_LIMIT,
    };
  },
});

// Cursor-based scan over active memories that yields the unembedded ones.
// Returns at most `pageSize` rows from the underlying index, and the caller
// is expected to walk pages via `continueCursor` until `isDone`. A given
// page may contain fewer unembedded rows than were scanned (the rest had
// embeddings and were filtered out).
//
// Why a cursor rather than a top-N sort by importance: the previous
// implementation took 5,000 rows per call and filtered in-process, so each
// pagination step was O(total memories). With the cursor each step is
// O(pageSize). Re-embed throughput is unchanged (we still process every
// unembedded row exactly once) but Convex query cost stays bounded as the
// memory corpus grows.
export const listUnembeddedPage = query({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("memoryRecords")
      .withIndex("by_lifecycle", (q) => q.eq("lifecycle", "active"))
      .order("desc")
      .paginate({
        cursor: args.cursor ?? null,
        numItems: args.pageSize ?? 50,
      });
    return {
      page: result.page
        .filter((m) => !m.embedding || m.embedding.length === 0)
        .map((m) => ({ memoryId: m.memoryId, content: m.content })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

// Patch just the embedding on an existing memory. Avoids re-running upsert
// (which would touch lastAccessedAt + run supersedes processing) just to
// back-fill a vector.
export const setEmbedding = mutation({
  args: {
    memoryId: v.string(),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    const mem = await ctx.db
      .query("memoryRecords")
      .withIndex("by_memory_id", (q) => q.eq("memoryId", args.memoryId))
      .unique();
    if (!mem) return null;
    await ctx.db.patch(mem._id, { embedding: args.embedding });
    return mem._id;
  },
});

export const countsByTier = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("memoryRecords").order("desc").take(COUNTS_SCAN_LIMIT);
    const active = all.filter((m) => m.lifecycle === "active");
    return {
      short: active.filter((m) => m.tier === "short").length,
      long: active.filter((m) => m.tier === "long").length,
      permanent: active.filter((m) => m.tier === "permanent").length,
      archived: all.filter((m) => m.lifecycle === "archived").length,
      pruned: all.filter((m) => m.lifecycle === "pruned").length,
      truncated: all.length === COUNTS_SCAN_LIMIT,
      scanLimit: COUNTS_SCAN_LIMIT,
    };
  },
});
