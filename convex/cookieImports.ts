import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("cookieImports").collect();
    return rows.map((r) => ({
      service: r.service,
      sourceProfile: r.sourceProfile,
      identity: r.identity,
      cookieCount: r.cookieCount,
      lastImportedAt: r.lastImportedAt,
      lastVerifiedAt: r.lastVerifiedAt,
      verifiedOk: r.verifiedOk,
    }));
  },
});

export const record = mutation({
  args: {
    service: v.string(),
    sourceProfile: v.string(),
    identity: v.optional(v.string()),
    cookieCount: v.number(),
    verifiedOk: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("cookieImports")
      .withIndex("by_service", (q) => q.eq("service", args.service))
      .unique();
    const payload = {
      service: args.service,
      sourceProfile: args.sourceProfile,
      identity: args.identity,
      cookieCount: args.cookieCount,
      lastImportedAt: now,
      lastVerifiedAt: args.verifiedOk !== undefined ? now : undefined,
      verifiedOk: args.verifiedOk,
    };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
    } else {
      await ctx.db.insert("cookieImports", payload);
    }
  },
});
