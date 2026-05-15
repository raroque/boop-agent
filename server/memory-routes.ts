import express from "express";
import { convex } from "./convex-client.js";
import { api } from "../convex/_generated/api.js";
import { embed, activeProvider } from "./embeddings.js";
import { broadcast } from "./broadcast.js";

// One in-flight re-embed at a time. Re-embedding twice in parallel just
// double-bills the embedding API and writes the same rows twice.
let runningReembed: Promise<{ embedded: number; failed: number }> | null = null;

async function runReembed(): Promise<{ embedded: number; failed: number }> {
  let embedded = 0;
  let failed = 0;
  // Track every memoryId we've attempted in this run, so a row that fails
  // to embed (e.g., transient null from the provider) doesn't keep
  // reappearing at the top of subsequent page queries and burn through API
  // quota. We only reach a row at most once per /memory/reembed POST.
  const attempted = new Set<string>();
  let cursor: string | null = null;
  let isDone = false;
  while (!isDone) {
    const result: {
      page: Array<{ memoryId: string; content: string }>;
      isDone: boolean;
      continueCursor: string;
    } = await convex.query(api.memoryRecords.listUnembeddedPage, {
      cursor,
      pageSize: 50,
    });
    cursor = result.continueCursor;
    isDone = result.isDone;
    for (const row of result.page) {
      if (attempted.has(row.memoryId)) continue;
      attempted.add(row.memoryId);
      try {
        const vec = await embed(row.content);
        if (!vec) {
          failed++;
          broadcast("memory.reembed.progress", {
            embedded,
            failed,
            memoryId: row.memoryId,
          });
          continue;
        }
        await convex.mutation(api.memoryRecords.setEmbedding, {
          memoryId: row.memoryId,
          embedding: vec,
        });
        embedded++;
        broadcast("memory.reembed.progress", {
          embedded,
          failed,
          memoryId: row.memoryId,
        });
      } catch (err) {
        failed++;
        console.warn("[reembed] failed for", row.memoryId, err);
        broadcast("memory.reembed.progress", {
          embedded,
          failed,
          memoryId: row.memoryId,
        });
      }
    }
  }
  broadcast("memory.reembed.done", { embedded, failed });
  return { embedded, failed };
}

export function createMemoryRouter(): express.Router {
  const router = express.Router();

  router.get("/embedding-status", async (_req, res) => {
    try {
      const stats = await convex.query(api.memoryRecords.embeddingStats, {});
      res.json({
        provider: activeProvider(),
        running: Boolean(runningReembed),
        ...stats,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  router.post("/reembed", async (_req, res) => {
    if (runningReembed) {
      res.status(409).json({ error: "re-embed already in progress" });
      return;
    }
    runningReembed = runReembed().finally(() => {
      runningReembed = null;
    });
    // Fire-and-forget: respond immediately and let the WS broadcast carry
    // progress. The HTTP response only confirms the job started.
    runningReembed.catch((err) => console.error("[reembed]", err));
    res.json({ ok: true, started: true, provider: activeProvider() });
  });

  return router;
}
