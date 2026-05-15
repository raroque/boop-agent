#!/usr/bin/env tsx
// Tiny one-shot to download + warm the local embedding model. Used by
// `npm run setup` and by the user manually if they want to pre-cache.
import { embed } from "../server/embeddings.js";

async function main() {
  console.log("[preload] warming local embedding model…");
  const start = Date.now();
  const vec = await embed("hello world");
  if (!vec) {
    console.error("[preload] embed() returned null — provider unavailable");
    process.exit(1);
  }
  console.log(
    `[preload] ready in ${Date.now() - start}ms (vector dim = ${vec.length})`,
  );
}

main().catch((err) => {
  console.error("[preload] failed:", err);
  process.exit(1);
});
