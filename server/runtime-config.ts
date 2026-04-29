import { api } from "../convex/_generated/api.js";
import { convex } from "./convex-client.js";

const MODEL_KEY = "model";
const MODEL_TTL_MS = 30 * 1000;
let cached: { at: number; value: string } | null = null;

// User-friendly aliases the agent can pass through from iMessage. Resolved to
// canonical Anthropic model IDs before being handed to the SDK.
export const MODEL_ALIASES: Record<string, string> = {
  opus: "claude-opus-4-7",
  "opus 4.7": "claude-opus-4-7",
  sonnet: "claude-sonnet-4-6",
  "sonnet 4.6": "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
  "haiku 4.5": "claude-haiku-4-5-20251001",
};

export const KNOWN_MODELS = new Set<string>([
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
]);

export function resolveModelInput(input: string): string | null {
  const lower = input.trim().toLowerCase();
  if (KNOWN_MODELS.has(lower)) return lower;
  return MODEL_ALIASES[lower] ?? null;
}

function envFallback(): string {
  return process.env.BOOP_MODEL ?? "claude-sonnet-4-6";
}

export async function getRuntimeModel(): Promise<string> {
  if (cached && Date.now() - cached.at < MODEL_TTL_MS) return cached.value;
  let stored: string | null = null;
  try {
    stored = await convex.query(api.settings.get, { key: MODEL_KEY });
  } catch (err) {
    console.warn("[runtime-config] settings:get failed", err);
  }
  // Re-validate even though set_model writes through resolveModelInput — the
  // settings table is also writable via the Convex dashboard and other
  // mutations, and a bad value here would surface as an opaque SDK 4xx on the
  // next turn instead of falling back gracefully.
  const final = stored && KNOWN_MODELS.has(stored) ? stored : envFallback();
  cached = { at: Date.now(), value: final };
  return final;
}

export async function setRuntimeModel(model: string): Promise<void> {
  await convex.mutation(api.settings.set, { key: MODEL_KEY, value: model });
  cached = { at: Date.now(), value: model };
}

export async function clearRuntimeModel(): Promise<void> {
  await convex.mutation(api.settings.clear, { key: MODEL_KEY });
  cached = null;
}

const BROWSER_HEADED_KEY = "browser_headed";
const BROWSER_HEADED_TTL_MS = 30 * 1000;
let browserHeadedCache: { at: number; value: boolean } | null = null;

// Default headed: real visible Chrome window. Headless gets fingerprinted by
// Cloudflare/Reddit/etc., so headed is the safer default. Override via the
// debug UI toggle (writes to settings.browser_headed) or via the env var
// AGENT_BROWSER_HEADED.
const HEADED_DEFAULT = true;

export async function getBrowserHeaded(): Promise<boolean> {
  if (browserHeadedCache && Date.now() - browserHeadedCache.at < BROWSER_HEADED_TTL_MS) {
    return browserHeadedCache.value;
  }
  let stored: string | null = null;
  try {
    stored = await convex.query(api.settings.get, { key: BROWSER_HEADED_KEY });
  } catch (err) {
    console.warn("[runtime-config] browser_headed:get failed", err);
  }
  let value = HEADED_DEFAULT;
  if (stored === "true") value = true;
  else if (stored === "false") value = false;
  else if (process.env.AGENT_BROWSER_HEADED === "0") value = false;
  else if (process.env.AGENT_BROWSER_HEADED === "1") value = true;
  browserHeadedCache = { at: Date.now(), value };
  return value;
}

export function invalidateBrowserHeadedCache(): void {
  browserHeadedCache = null;
}
