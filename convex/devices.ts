import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * iOS device authorization roster. See schema.ts for the threat-model
 * notes. Bearer token PLAINTEXT never touches Convex: the Express
 * router hashes incoming tokens before calling verifyBearer, and the
 * cleartext bearer issued at consume time lives only in the router's
 * in-memory delivery map until the phone polls for it.
 */

/**
 * Phone-initiated. Creates a pairing row if one doesn't already exist
 * for this deviceId, or rotates the code on the existing row. Codes
 * are hashed before storage; the cleartext is only ever in the HTTP
 * response.
 */
export const createPairing = mutation({
  args: {
    deviceId: v.string(),
    pairingCodeHash: v.string(),
    pairingExpiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("devices")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId))
      .unique();
    const now = Date.now();
    if (existing) {
      // Rotating the code on an unpaired device is fine. Re-pairing an
      // already-paired device requires explicit revoke first; we refuse
      // to overwrite a live bearer with a pairing flow.
      if (existing.paired) {
        throw new Error("device already paired; revoke first");
      }
      await ctx.db.patch(existing._id, {
        pairingCodeHash: args.pairingCodeHash,
        pairingExpiresAt: args.pairingExpiresAt,
        lastSeenAt: now,
      });
      return { deviceId: args.deviceId };
    }
    await ctx.db.insert("devices", {
      deviceId: args.deviceId,
      pairingCodeHash: args.pairingCodeHash,
      pairingExpiresAt: args.pairingExpiresAt,
      paired: false,
      lastSeenAt: now,
      createdAt: now,
    });
    return { deviceId: args.deviceId };
  },
});

/**
 * Dashboard-initiated. Looks up the device by its (hashed) pairing
 * code, validates it hasn't expired, marks paired, and writes the
 * bearer-token hash. Returns the deviceId so the router can stash
 * cleartext bearer for phone pickup.
 */
export const consumePairing = mutation({
  args: {
    pairingCodeHash: v.string(),
    bearerTokenHash: v.string(),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const device = await ctx.db
      .query("devices")
      .withIndex("by_pairing", (q) => q.eq("pairingCodeHash", args.pairingCodeHash))
      .unique();
    if (!device) throw new Error("invalid code");
    if (device.paired) throw new Error("already paired");
    if (!device.pairingExpiresAt || device.pairingExpiresAt < Date.now()) {
      throw new Error("code expired");
    }
    const now = Date.now();
    await ctx.db.patch(device._id, {
      paired: true,
      pairedAt: now,
      lastSeenAt: now,
      pairingCodeHash: undefined,
      pairingExpiresAt: undefined,
      bearerTokenHash: args.bearerTokenHash,
      label: args.label ?? device.label,
    });
    return { deviceId: device.deviceId, label: args.label ?? device.label };
  },
});

/**
 * Auth check for inbound HTTP and SSE. Router hashes the incoming
 * bearer and calls this; we update lastSeenAt as a side effect so
 * the dashboard can show device liveness.
 */
export const verifyBearer = mutation({
  args: { bearerTokenHash: v.string() },
  handler: async (ctx, args) => {
    const device = await ctx.db
      .query("devices")
      .withIndex("by_bearer", (q) => q.eq("bearerTokenHash", args.bearerTokenHash))
      .unique();
    if (!device || !device.paired) return null;
    await ctx.db.patch(device._id, { lastSeenAt: Date.now() });
    return { deviceId: device.deviceId, label: device.label };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("devices").collect();
    // Don't leak hashes to the dashboard — they're auth material.
    return rows
      .filter((d) => d.paired)
      .map((d) => ({
        _id: d._id,
        deviceId: d.deviceId,
        label: d.label,
        pairedAt: d.pairedAt,
        lastSeenAt: d.lastSeenAt,
      }));
  },
});

export const revoke = mutation({
  args: { deviceId: v.string() },
  handler: async (ctx, args) => {
    const device = await ctx.db
      .query("devices")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId))
      .unique();
    if (!device) return { revoked: false };
    await ctx.db.delete(device._id);
    return { revoked: true };
  },
});

export const setLabel = mutation({
  args: { deviceId: v.string(), label: v.string() },
  handler: async (ctx, args) => {
    const device = await ctx.db
      .query("devices")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId))
      .unique();
    if (!device) throw new Error("device not found");
    await ctx.db.patch(device._id, { label: args.label });
    return { ok: true };
  },
});
