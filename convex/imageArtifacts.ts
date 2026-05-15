import { action, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

function randomArtifactId(): string {
  return `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Atomic upload + create. Called by the gemini MCP server. Accepts the
 * generated image as base64 (MCP tool inputs serialize through JSON), stores
 * it, signs a URL, and writes the metadata row in one action so the caller
 * only does one round-trip. Mirrors convex/pdfArtifacts.ts:generate.
 */
export const generate = action({
  args: {
    imageBase64: v.string(),
    mimeType: v.string(),
    conversationId: v.optional(v.string()),
    prompt: v.string(),
    source: v.union(v.literal("generate"), v.literal("edit")),
    model: v.string(),
    agentId: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    artifactId: string;
    storageId: string;
    signedUrl: string;
    fileSizeBytes: number;
  }> => {
    const imageBytes = base64ToUint8Array(args.imageBase64);
    const blob = new Blob([imageBytes.buffer as ArrayBuffer], { type: args.mimeType });

    const storageId = await ctx.storage.store(blob);
    const signedUrl = await ctx.storage.getUrl(storageId);
    if (!signedUrl) {
      throw new Error(
        `imageArtifacts.generate: storage.getUrl returned null after store (storageId=${storageId})`,
      );
    }

    const artifactId: string = await ctx.runMutation(
      internal.imageArtifacts.createInternal,
      {
        artifactId: randomArtifactId(),
        conversationId: args.conversationId,
        prompt: args.prompt,
        source: args.source,
        model: args.model,
        mimeType: args.mimeType,
        storageId,
        fileSizeBytes: imageBytes.byteLength,
        signedUrl,
        agentId: args.agentId,
      },
    );

    return {
      artifactId,
      storageId,
      signedUrl,
      fileSizeBytes: imageBytes.byteLength,
    };
  },
});

export const createInternal = internalMutation({
  args: {
    artifactId: v.string(),
    conversationId: v.optional(v.string()),
    prompt: v.string(),
    source: v.union(v.literal("generate"), v.literal("edit")),
    model: v.string(),
    mimeType: v.string(),
    storageId: v.id("_storage"),
    fileSizeBytes: v.number(),
    signedUrl: v.optional(v.string()),
    agentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("imageArtifacts", {
      ...args,
      createdAt: Date.now(),
    });
    return args.artifactId;
  },
});

export const getUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    return await ctx.storage.getUrl(storageId);
  },
});

/**
 * Used by the channels runTurn post-turn to know whether an image was produced
 * during this turn. `since` is the turn-start timestamp.
 */
export const latestForConversation = query({
  args: { conversationId: v.string(), since: v.number() },
  handler: async (ctx, { conversationId, since }) => {
    const rows = await ctx.db
      .query("imageArtifacts")
      .withIndex("by_conversation_and_createdAt", (q) =>
        q.eq("conversationId", conversationId).gte("createdAt", since),
      )
      .order("desc")
      .take(1);
    return rows[0] ?? null;
  },
});

export const listForConversation = query({
  args: { conversationId: v.string() },
  handler: async (ctx, { conversationId }) => {
    return await ctx.db
      .query("imageArtifacts")
      .withIndex("by_conversation_and_createdAt", (q) =>
        q.eq("conversationId", conversationId),
      )
      .order("desc")
      .take(50);
  },
});

export const listAll = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("imageArtifacts")
      .order("desc")
      .take(args.limit ?? 100);
  },
});
