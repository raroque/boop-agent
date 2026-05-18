import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Phase 0: empty-but-valid schema so `convex dev` codegens cleanly.
// Phase 1 onward fills in messages/conversations/drafts/automations/etc.
export default defineSchema({
  telegramDedup: defineTable({
    updateId: v.string(),
    claimedAt: v.number(),
  }).index("by_update_id", ["updateId"]),
});
