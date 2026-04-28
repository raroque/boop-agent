import { internalAction, internalQuery, internalMutation } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import { createAccount } from "@convex-dev/auth/server";

const ADMIN_EMAIL = "admin@boop.local";

export const countUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").take(2);
    return users.length;
  },
});

export const deleteAllUsersAndAccounts = internalMutation({
  args: {},
  handler: async (ctx) => {
    for await (const user of ctx.db.query("users")) {
      await ctx.db.delete(user._id);
    }
    for await (const acc of ctx.db.query("authAccounts")) {
      await ctx.db.delete(acc._id);
    }
    for await (const sess of ctx.db.query("authSessions")) {
      await ctx.db.delete(sess._id);
    }
  },
});

// Idempotent: safe to run on every deploy.
export const bootstrap = internalAction({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.runQuery(internal.users.countUsers, {});
    if (existing > 0) return { created: false, reason: "user already exists" };

    const password = process.env.BOOP_ADMIN_PASSWORD;
    if (!password) {
      throw new Error(
        "BOOP_ADMIN_PASSWORD is not set in Convex env — cannot bootstrap admin user.",
      );
    }

    await createAccount(ctx, {
      provider: "password",
      account: { id: ADMIN_EMAIL, secret: password },
      profile: { email: ADMIN_EMAIL },
    });

    return { created: true };
  },
});

// Rotation: wipe and recreate from the current BOOP_ADMIN_PASSWORD env var.
// Old sessions invalidate naturally on next token expiry.
export const setPassword = internalAction({
  args: {},
  handler: async (ctx) => {
    await ctx.runMutation(internal.users.deleteAllUsersAndAccounts, {});
    const password = process.env.BOOP_ADMIN_PASSWORD;
    if (!password) {
      throw new Error("BOOP_ADMIN_PASSWORD is not set");
    }
    await createAccount(ctx, {
      provider: "password",
      account: { id: ADMIN_EMAIL, secret: password },
      profile: { email: ADMIN_EMAIL },
    });
    return { rotated: true };
  },
});
