import { tool, createSdkMcpServer, type McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { registerIntegration, type IntegrationModule } from "./registry.js";

const BASE_URL = "https://api.apify.com/v2";

// Hard ceilings — protect against runaway compute spend. Each can be raised
// per-run (still subject to the cap), but never above. Set via env at boot.
const RUN_TIMEOUT_CAP_S = Number(process.env.APIFY_RUN_TIMEOUT_CAP_SECONDS ?? 300);
const RUN_MEMORY_CAP_MB = Number(process.env.APIFY_RUN_MEMORY_CAP_MB ?? 4096);
const RUN_MAX_ITEMS_CAP = Number(process.env.APIFY_RUN_MAX_ITEMS_CAP ?? 200);
const RUN_BUDGET_CAP_USD = Number(process.env.APIFY_RUN_BUDGET_CAP_USD ?? 1.0);

// Per-call defaults (used when the model doesn't specify).
const RUN_TIMEOUT_DEFAULT_S = Math.min(180, RUN_TIMEOUT_CAP_S);
const RUN_MEMORY_DEFAULT_MB = Math.min(1024, RUN_MEMORY_CAP_MB);
const RUN_MAX_ITEMS_DEFAULT = Math.min(50, RUN_MAX_ITEMS_CAP);

// Truncate large blobs so a single tool call can't blow the agent's context.
const RESULT_CHAR_BUDGET = 30_000;

interface ApifyStoreItem {
  id: string;
  name: string;
  username: string;
  title?: string;
  description?: string;
  stats?: { totalRuns?: number; totalUsers?: number };
  currentPricingInfo?: {
    pricingModel?: string;
    pricePerUnitUsd?: number;
    trialMinutes?: number;
  };
}

interface ApifyStoreResponse {
  data: { total?: number; count?: number; items: ApifyStoreItem[] };
}

interface ApifyActor {
  id: string;
  name: string;
  username?: string;
  title?: string;
  description?: string;
  defaultRunOptions?: { build?: string; timeoutSecs?: number; memoryMbytes?: number };
  exampleRunInput?: { body?: string; contentType?: string };
  currentPricingInfo?: ApifyStoreItem["currentPricingInfo"];
  taggedBuilds?: Record<string, { buildId?: string; buildNumber?: string }>;
}

interface ApifyActorResponse {
  data: ApifyActor;
}

interface ApifyBuild {
  data: {
    inputSchema?: string;
    readme?: string;
  };
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, Accept: "application/json" };
}

function actorPathId(input: string): string {
  // Apify paths use `username~name`; accept either form from the agent.
  return input.includes("/") ? input.replace("/", "~") : input;
}

function actorDisplayId(a: { username?: string; name: string }): string {
  return a.username ? `${a.username}/${a.name}` : a.name;
}

async function apifyFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { ...authHeaders(token), ...(init?.headers ?? {}) },
  });
  if (res.status === 401) throw new Error("Apify rejected the token (401). Check APIFY_API_TOKEN.");
  if (res.status === 404) throw new Error(`Apify 404: ${path}`);
  if (res.status === 429) throw new Error("Apify rate limit hit (429). Try again in a few seconds.");
  if (!res.ok) throw new Error(`Apify API ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  return (await res.json()) as T;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n\n…(truncated, ${s.length - max} more chars)`;
}

function formatPricing(p?: ApifyStoreItem["currentPricingInfo"]): string {
  if (!p?.pricingModel) return "Pricing: unknown";
  if (p.pricingModel === "FREE") return "Pricing: FREE";
  if (p.pricingModel === "PRICE_PER_DATASET_ITEM" && p.pricePerUnitUsd != null) {
    return `Pricing: $${p.pricePerUnitUsd}/item`;
  }
  if (p.pricingModel === "FLAT_PRICE_PER_MONTH" && p.pricePerUnitUsd != null) {
    return `Pricing: $${p.pricePerUnitUsd}/month flat`;
  }
  if (p.pricingModel === "PAY_PER_EVENT") return "Pricing: pay-per-event (see actor docs)";
  return `Pricing: ${p.pricingModel}`;
}

function estimateCostUsd(p: ApifyStoreItem["currentPricingInfo"] | undefined, maxItems: number): number | null {
  if (!p) return null;
  if (p.pricingModel === "FREE") return 0;
  if (p.pricingModel === "PRICE_PER_DATASET_ITEM" && p.pricePerUnitUsd != null) {
    return p.pricePerUnitUsd * maxItems;
  }
  return null; // unknown / compute-based — rely on timeout cap instead
}

function buildApifyServer(token: string): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: "apify",
    version: "0.1.0",
    tools: [
      tool(
        "search_actors",
        `Search the Apify Store for public actors (web scrapers + automation tools) matching a query.
Use this to discover the right actor for a platform — e.g. "airbnb listings", "booking.com hotels",
"linkedin profiles", "zillow", "amazon products". Returns actor IDs you can pass to get_actor or run_actor.`,
        {
          query: z.string().describe('Search query, e.g. "airbnb" or "flight prices".'),
          limit: z.number().int().min(1).max(20).optional().describe("Max results (1–20). Default 8."),
        },
        async (args) => {
          const params = new URLSearchParams({ search: args.query, limit: String(args.limit ?? 8) });
          const data = await apifyFetch<ApifyStoreResponse>(`/store?${params}`, token);
          if (!data.data.items.length) {
            return { content: [{ type: "text" as const, text: `No actors found for "${args.query}".` }] };
          }
          const lines = data.data.items.map((a) => {
            const id = actorDisplayId(a);
            const runs = a.stats?.totalRuns ?? 0;
            const desc = (a.description ?? "").replace(/\s+/g, " ").trim();
            return [
              `• ${id} — ${a.title ?? a.name}`,
              `  ${truncate(desc, 240)}`,
              `  ${runs.toLocaleString()} total runs · ${formatPricing(a.currentPricingInfo)}`,
            ].join("\n");
          });
          return { content: [{ type: "text" as const, text: lines.join("\n\n") }] };
        },
      ),
      tool(
        "get_actor",
        `Fetch full details for an Apify actor: title, description, pricing, default run options,
and input schema. Call this before run_actor to learn what input fields the actor expects.`,
        {
          actor_id: z.string().describe('Actor id, e.g. "apify/instagram-scraper" or just the numeric id.'),
        },
        async (args) => {
          const id = actorPathId(args.actor_id);
          const actor = (await apifyFetch<ApifyActorResponse>(`/acts/${id}`, token)).data;

          let inputSchema: string | undefined;
          let readme: string | undefined;
          const defaultBuildId = actor.taggedBuilds?.latest?.buildId;
          if (defaultBuildId) {
            try {
              const build = await apifyFetch<ApifyBuild>(`/acts/${id}/builds/${defaultBuildId}`, token);
              inputSchema = build.data.inputSchema;
              readme = build.data.readme;
            } catch {
              // build fetch is best-effort; carry on without schema
            }
          }

          const parts: string[] = [];
          parts.push(`# ${actor.title ?? actor.name}`);
          parts.push(`ID: ${actorDisplayId({ username: actor.username, name: actor.name })}`);
          parts.push(formatPricing(actor.currentPricingInfo));
          if (actor.description) {
            parts.push("");
            parts.push(`Description: ${truncate(actor.description, 800)}`);
          }
          if (actor.defaultRunOptions) {
            parts.push("");
            parts.push(
              `Default run options: timeout=${actor.defaultRunOptions.timeoutSecs ?? "?"}s, ` +
                `memory=${actor.defaultRunOptions.memoryMbytes ?? "?"}MB, build=${actor.defaultRunOptions.build ?? "default"}`,
            );
          }
          if (inputSchema) {
            parts.push("");
            parts.push("## Input schema");
            parts.push("```json");
            parts.push(truncate(inputSchema, 6000));
            parts.push("```");
          }
          if (actor.exampleRunInput?.body) {
            parts.push("");
            parts.push("## Example input");
            parts.push("```json");
            parts.push(truncate(actor.exampleRunInput.body, 2000));
            parts.push("```");
          }
          if (readme) {
            parts.push("");
            parts.push("## README excerpt");
            parts.push(truncate(readme, 4000));
          }
          return { content: [{ type: "text" as const, text: parts.join("\n") }] };
        },
      ),
      tool(
        "run_actor",
        `Run an Apify actor synchronously and return its dataset items. The run is hard-capped by
timeout, memory, and max_items to bound compute spend. Prefer get_actor first to learn the input
shape — passing wrong fields wastes a run. Returns the dataset items (truncated if large).

Cost note: actors with PRICE_PER_DATASET_ITEM pricing are gated by APIFY_RUN_BUDGET_CAP_USD;
compute-based actors are gated by timeout. If a run is rejected, lower max_items or pick a cheaper actor.`,
        {
          actor_id: z.string().describe('Actor id, e.g. "apify/instagram-scraper".'),
          input: z
            .record(z.unknown())
            .describe("Actor input object — the JSON the actor expects. Get the shape from get_actor."),
          max_items: z
            .number()
            .int()
            .min(1)
            .optional()
            .describe(`Cap on dataset items. Default ${RUN_MAX_ITEMS_DEFAULT}, capped at ${RUN_MAX_ITEMS_CAP}.`),
          timeout_seconds: z
            .number()
            .int()
            .min(10)
            .optional()
            .describe(`Run timeout. Default ${RUN_TIMEOUT_DEFAULT_S}s, capped at ${RUN_TIMEOUT_CAP_S}s.`),
          memory_mb: z
            .number()
            .int()
            .min(128)
            .optional()
            .describe(`Run memory. Default ${RUN_MEMORY_DEFAULT_MB}MB, capped at ${RUN_MEMORY_CAP_MB}MB.`),
        },
        async (args) => {
          const maxItems = Math.min(args.max_items ?? RUN_MAX_ITEMS_DEFAULT, RUN_MAX_ITEMS_CAP);
          const timeout = Math.min(args.timeout_seconds ?? RUN_TIMEOUT_DEFAULT_S, RUN_TIMEOUT_CAP_S);
          const memory = Math.min(args.memory_mb ?? RUN_MEMORY_DEFAULT_MB, RUN_MEMORY_CAP_MB);
          const id = actorPathId(args.actor_id);

          // Pre-flight cost check for per-item pricing.
          const actor = (await apifyFetch<ApifyActorResponse>(`/acts/${id}`, token)).data;
          const estCost = estimateCostUsd(actor.currentPricingInfo, maxItems);
          if (estCost != null && estCost > RUN_BUDGET_CAP_USD) {
            return {
              content: [
                {
                  type: "text" as const,
                  text:
                    `Run rejected: estimated cost $${estCost.toFixed(2)} exceeds budget cap ` +
                    `$${RUN_BUDGET_CAP_USD.toFixed(2)} (${formatPricing(actor.currentPricingInfo)}). ` +
                    `Lower max_items or pick a cheaper actor.`,
                },
              ],
            };
          }

          // Inject common max-items keys; harmless if the actor ignores them.
          const enrichedInput = {
            maxItems,
            maxResults: maxItems,
            ...args.input,
          };

          const params = new URLSearchParams({
            timeout: String(timeout),
            memory: String(memory),
            format: "json",
          });
          const res = await fetch(`${BASE_URL}/acts/${id}/run-sync-get-dataset-items?${params}`, {
            method: "POST",
            headers: { ...authHeaders(token), "Content-Type": "application/json" },
            body: JSON.stringify(enrichedInput),
          });
          if (res.status === 401) throw new Error("Apify rejected the token (401).");
          if (res.status === 408) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Run timed out after ${timeout}s before producing results. Increase timeout_seconds (cap ${RUN_TIMEOUT_CAP_S}) or simplify input.`,
                },
              ],
            };
          }
          if (!res.ok) {
            const body = await res.text().catch(() => res.statusText);
            throw new Error(`Apify run failed (${res.status}): ${body}`);
          }
          const items = (await res.json()) as unknown[];
          if (!Array.isArray(items) || items.length === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Run completed but produced no dataset items. Check the input fields against get_actor's schema.",
                },
              ],
            };
          }
          const trimmed = items.slice(0, maxItems);
          const json = JSON.stringify(trimmed, null, 2);
          const header =
            `Returned ${trimmed.length} item(s)` +
            (items.length > trimmed.length ? ` (of ${items.length}; capped at max_items=${maxItems})` : "") +
            (estCost != null ? ` · est. cost $${estCost.toFixed(4)}` : "") +
            ".";
          return {
            content: [{ type: "text" as const, text: `${header}\n\n\`\`\`json\n${truncate(json, RESULT_CHAR_BUDGET)}\n\`\`\`` }],
          };
        },
      ),
    ],
  });
}

const apifyModule: IntegrationModule = {
  name: "apify",
  description: "Apify Store — search and run web-scraping actors (Airbnb, Booking, Zillow, LinkedIn, …)",
  requiredEnv: ["APIFY_API_TOKEN"],
  createServer: async () => {
    const token = process.env.APIFY_API_TOKEN;
    if (!token) throw new Error("[apify] APIFY_API_TOKEN not set");
    return buildApifyServer(token);
  },
};

export function registerApifyIntegration(): void {
  if (!process.env.APIFY_API_TOKEN) {
    console.log("[apify] disabled — APIFY_API_TOKEN not set");
    return;
  }
  registerIntegration(apifyModule);
  console.log("[apify] registered");
}
