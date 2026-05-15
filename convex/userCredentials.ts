import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";

// All encryption happens server-side (server/browser/credentials.ts).
// These functions store and return the opaque ciphertext only.

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("userCredentials").collect();
    // Never expose ciphertext to the browser. Sort newest-first for the UI.
    return rows
      .map((r) => ({
        _id: r._id,
        label: r.label,
        host: r.host,
        username: r.username,
        hasTotp: r.totpCiphertext !== undefined,
        notes: r.notes,
        createdAt: r.createdAt,
        lastUsedAt: r.lastUsedAt,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const findByLabel = query({
  args: { label: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("userCredentials")
      .withIndex("by_label", (q) => q.eq("label", args.label))
      .first();
    if (!row) return null;
    return {
      _id: row._id,
      label: row.label,
      host: row.host,
      username: row.username,
      hasTotp: row.totpCiphertext !== undefined,
    };
  },
});

// Returns ciphertext blobs. Public because the express server calls it via
// ConvexHttpClient, which can't reach internalQueries. Safe because the
// AES-256-GCM key (BROWSER_CREDENTIAL_KEY) lives only on the server — the
// ciphertext is useless to anyone reaching Convex directly.
export const getSecret = query({
  args: { label: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("userCredentials")
      .withIndex("by_label", (q) => q.eq("label", args.label))
      .first();
    if (!row) return null;
    return {
      _id: row._id,
      label: row.label,
      host: row.host,
      username: row.username,
      ciphertext: row.ciphertext,
      iv: row.iv,
      authTag: row.authTag,
      totpCiphertext: row.totpCiphertext,
      totpIv: row.totpIv,
      totpAuthTag: row.totpAuthTag,
    };
  },
});

export const create = mutation({
  args: {
    label: v.string(),
    host: v.string(),
    username: v.string(),
    ciphertext: v.bytes(),
    iv: v.bytes(),
    authTag: v.bytes(),
    totpCiphertext: v.optional(v.bytes()),
    totpIv: v.optional(v.bytes()),
    totpAuthTag: v.optional(v.bytes()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userCredentials")
      .withIndex("by_label", (q) => q.eq("label", args.label))
      .first();
    if (existing) {
      throw new Error(
        `userCredentials: label "${args.label}" already exists. Delete the old one or pick a different label.`,
      );
    }
    return await ctx.db.insert("userCredentials", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("userCredentials") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const markUsed = mutation({
  args: { id: v.id("userCredentials") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { lastUsedAt: Date.now() });
  },
});
