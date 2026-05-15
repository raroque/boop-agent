/**
 * Thin embeddings wrapper. Tries Voyage → OpenAI → local Transformers.js
 * (Xenova/bge-large-en-v1.5). All three produce 1024-dim vectors so the
 * Convex vector index stays compatible regardless of which provider runs.
 *
 * Local fallback ensures `recall()` always works — no API key required.
 * First local call downloads ~440MB and caches in ~/.cache/huggingface.
 */

import type { FeatureExtractionPipeline } from "@huggingface/transformers";

const VOYAGE_MODEL = "voyage-3";
const OPENAI_MODEL = "text-embedding-3-large";
const LOCAL_MODEL = "Xenova/bge-large-en-v1.5";
const DIMENSIONS = 1024;

// Local pipeline is loaded lazily (model download is ~440MB) and cached
// in-process. `loading` dedupes parallel callers during the first load.
let extractor: FeatureExtractionPipeline | null = null;
let loading: Promise<FeatureExtractionPipeline> | null = null;

export type EmbeddingProvider = "voyage" | "openai" | "local";

export function activeProvider(): EmbeddingProvider {
  if (process.env.VOYAGE_API_KEY) return "voyage";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "local";
}

// Always true now — local is always available. Kept for back-compat with
// callsites that still gate on it.
export function embeddingsAvailable(): boolean {
  return true;
}

async function embedVoyage(text: string): Promise<number[]> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: [text],
      output_dimension: DIMENSIONS,
    }),
  });
  if (!res.ok) throw new Error(`voyage ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data[0].embedding;
}

async function embedOpenAI(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: text,
      dimensions: DIMENSIONS,
    }),
  });
  if (!res.ok) throw new Error(`openai embeddings ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data[0].embedding;
}

async function getLocalExtractor(): Promise<FeatureExtractionPipeline> {
  if (extractor) return extractor;
  if (loading) return loading;
  const attempt = (async () => {
    const { pipeline } = await import("@huggingface/transformers");
    console.log(`[embeddings] loading local model ${LOCAL_MODEL} (~440MB on first run)…`);
    const start = Date.now();
    const ext = await pipeline("feature-extraction", LOCAL_MODEL, {
      dtype: "fp32",
    });
    console.log(`[embeddings] local model ready in ${Date.now() - start}ms`);
    extractor = ext;
    return ext;
  })();
  loading = attempt;
  // If the load rejects (transient network failure during the 440MB
  // download, etc.) we MUST clear `loading` so the next call re-attempts
  // instead of replaying the cached rejection forever. Detach the cleanup
  // from the returned promise via .catch(() => {}) so callers see the
  // original rejection while the slot still resets.
  attempt.catch(() => {
    if (loading === attempt) loading = null;
  });
  return loading;
}

async function embedLocal(text: string): Promise<number[]> {
  const ext = await getLocalExtractor();
  const out = await ext(text, { pooling: "mean", normalize: true });
  // Tensor → number[]. BGE-large outputs 1024 floats; verify shape so a
  // future model swap doesn't silently produce mis-sized vectors that the
  // Convex vector index would reject.
  const arr = Array.from(out.data as ArrayLike<number>);
  if (arr.length !== DIMENSIONS) {
    throw new Error(
      `local embedding returned ${arr.length} dims, expected ${DIMENSIONS}`,
    );
  }
  return arr;
}

// Preload the local model in the background so the first user-facing
// recall() doesn't pay the ~5–15s model load. Safe to call at server
// startup — failures are logged, not thrown.
export function preloadLocalModel(): void {
  if (process.env.VOYAGE_API_KEY || process.env.OPENAI_API_KEY) return;
  getLocalExtractor().catch((err) => {
    console.warn("[embeddings] local model preload failed:", err);
  });
}

export async function embed(text: string): Promise<number[] | null> {
  try {
    if (process.env.VOYAGE_API_KEY) return await embedVoyage(text);
    if (process.env.OPENAI_API_KEY) return await embedOpenAI(text);
    return await embedLocal(text);
  } catch (err) {
    console.warn("[embeddings] failed:", err);
    return null;
  }
}
