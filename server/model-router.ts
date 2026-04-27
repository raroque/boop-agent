// Centralized model selection. Every Claude call in boop should resolve its
// model through pickModel() so we can route different workloads to different
// tiers (cheap Haiku for background JSON parsing, Sonnet for user-facing
// reasoning) without scattering env-var reads across the codebase.
//
// Adding a new call site is a one-liner — see registerSite() below.

export type ModelTier = "haiku" | "sonnet" | "opus";

const TIER_DEFAULTS: Record<ModelTier, string> = {
  haiku: "claude-haiku-4-5",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-7",
};

export interface SiteConfig<TInput = unknown> {
  defaultTier: ModelTier;
  // Hard override env var. If set, its value is used verbatim and the
  // classifier is skipped — escape hatch for users who want to pin a model.
  envVar?: string;
  // Consulted before defaultTier when set. Lets sites fall back to the
  // global BOOP_MODEL without making it the first-choice override.
  fallbackEnv?: string;
  // Picks a tier from runtime input (e.g., task complexity). Skipped when
  // envVar is set so the override always wins.
  classifier?: (input: TInput) => ModelTier;
}

const sites = new Map<string, SiteConfig<any>>();

export function registerSite<TInput = unknown>(
  name: string,
  config: SiteConfig<TInput>,
): void {
  sites.set(name, config as SiteConfig<unknown>);
}

export function pickModel<TInput = unknown>(
  name: string,
  input?: TInput,
): string {
  const config = sites.get(name);
  if (!config) {
    throw new Error(`[model-router] unknown site: ${name}`);
  }

  const override = config.envVar ? process.env[config.envVar] : undefined;
  if (override) {
    log(name, override, "env-override");
    return override;
  }

  if (config.classifier && input !== undefined) {
    const tier = config.classifier(input as TInput);
    const model = TIER_DEFAULTS[tier];
    log(name, model, `classifier:${tier}`);
    return model;
  }

  const fallback = config.fallbackEnv ? process.env[config.fallbackEnv] : undefined;
  if (fallback) {
    log(name, fallback, `fallback:${config.fallbackEnv}`);
    return fallback;
  }

  const model = TIER_DEFAULTS[config.defaultTier];
  log(name, model, `default:${config.defaultTier}`);
  return model;
}

function log(site: string, model: string, reason: string): void {
  console.log(`[router] ${site} → ${model} (${reason})`);
}

// Heuristic for the execution agent. Static regex/keywords — no extra LLM
// call, since a "tiny classifier call" would itself burn the rate-limit
// budget we're trying to protect.
//
// "simple" = short, lookup-style, no action verbs. Bias is toward "complex"
// (Sonnet) on ambiguity — a wrong cheap call on a real task is worse than
// a Sonnet call we could've saved.
const LOOKUP_VERBS = /^\s*(what|who|when|where|why|how|find|look ?up|check|list|show|get|tell)\b/i;
const ACTION_VERBS = /\b(draft|compose|write|reply|respond|compare|analy[sz]e|recommend|decide|plan|book|schedule|send|email|message|create|update|delete|cancel|negotiate)\b/i;

export function isSimpleTask(task: string): boolean {
  if (!task) return false;
  const trimmed = task.trim();
  if (trimmed.length > 200) return false;
  if (!LOOKUP_VERBS.test(trimmed)) return false;
  if (ACTION_VERBS.test(trimmed)) return false;
  return true;
}

// ---- Site registry ---------------------------------------------------------
// Seed the registry with boop's call sites. Adding a new site (e.g., a future
// "analysis" feature) is just another registerSite() call — at the call site
// itself, not here, if you want it co-located with the feature.

registerSite("dispatcher", {
  defaultTier: "sonnet",
  envVar: "BOOP_DISPATCHER_MODEL",
  fallbackEnv: "BOOP_MODEL",
});

registerSite<{ task: string }>("execution", {
  defaultTier: "sonnet",
  envVar: "BOOP_EXECUTION_MODEL",
  fallbackEnv: "BOOP_MODEL",
  classifier: ({ task }) => (isSimpleTask(task) ? "haiku" : "sonnet"),
});

registerSite("extract", {
  defaultTier: "haiku",
  envVar: "BOOP_EXTRACT_MODEL",
});

registerSite("proposer", {
  defaultTier: "sonnet",
  envVar: "BOOP_PROPOSER_MODEL",
  fallbackEnv: "BOOP_MODEL",
});

registerSite("adversary", {
  defaultTier: "haiku",
  envVar: "BOOP_ADVERSARY_MODEL",
});

registerSite("judge", {
  defaultTier: "haiku",
  envVar: "BOOP_JUDGE_MODEL",
});
