import type { RuntimeName } from "./runtimes/types.js";

export type RuntimePricingMode = "api" | "api-equivalent" | "provider-reported";

export interface OpenAITextModelPrice {
  inputPerMillion: number;
  cachedInputPerMillion?: number;
  outputPerMillion: number;
}

export interface RuntimePricingStatus {
  mode: RuntimePricingMode;
  priced: boolean;
  label: string;
  note: string;
  source?: string;
  inputPerMillion?: number;
  cachedInputPerMillion?: number;
  outputPerMillion?: number;
}

export interface TextUsageForPricing {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
}

export const OPENAI_PRICING_SOURCE = "https://platform.openai.com/docs/pricing";

export const OPENAI_TEXT_MODEL_PRICES_USD_PER_MILLION: Record<string, OpenAITextModelPrice> = {
  "gpt-5.5": { inputPerMillion: 5, cachedInputPerMillion: 0.5, outputPerMillion: 30 },
  "gpt-5.5-pro": { inputPerMillion: 30, outputPerMillion: 180 },
  "gpt-5.4": { inputPerMillion: 2.5, cachedInputPerMillion: 0.25, outputPerMillion: 15 },
  "gpt-5.4-mini": { inputPerMillion: 0.75, cachedInputPerMillion: 0.075, outputPerMillion: 4.5 },
  "gpt-5.4-nano": { inputPerMillion: 0.2, cachedInputPerMillion: 0.02, outputPerMillion: 1.25 },
  "gpt-5.4-pro": { inputPerMillion: 30, outputPerMillion: 180 },
  "gpt-5.3-chat-latest": { inputPerMillion: 1.75, cachedInputPerMillion: 0.175, outputPerMillion: 14 },
  "gpt-5.3-codex": { inputPerMillion: 1.75, cachedInputPerMillion: 0.175, outputPerMillion: 14 },
  "gpt-5.2": { inputPerMillion: 1.75, cachedInputPerMillion: 0.175, outputPerMillion: 14 },
  "gpt-5.2-chat-latest": { inputPerMillion: 1.75, cachedInputPerMillion: 0.175, outputPerMillion: 14 },
  "gpt-5.2-codex": { inputPerMillion: 1.75, cachedInputPerMillion: 0.175, outputPerMillion: 14 },
  "gpt-5.2-pro": { inputPerMillion: 21, outputPerMillion: 168 },
  "gpt-5.1": { inputPerMillion: 1.25, cachedInputPerMillion: 0.125, outputPerMillion: 10 },
  "gpt-5.1-chat-latest": { inputPerMillion: 1.25, cachedInputPerMillion: 0.125, outputPerMillion: 10 },
  "gpt-5.1-codex-max": { inputPerMillion: 1.25, cachedInputPerMillion: 0.125, outputPerMillion: 10 },
  "gpt-5.1-codex": { inputPerMillion: 1.25, cachedInputPerMillion: 0.125, outputPerMillion: 10 },
  "gpt-5.1-codex-mini": { inputPerMillion: 0.25, cachedInputPerMillion: 0.025, outputPerMillion: 2 },
  "gpt-5": { inputPerMillion: 1.25, cachedInputPerMillion: 0.125, outputPerMillion: 10 },
  "gpt-5-mini": { inputPerMillion: 0.25, cachedInputPerMillion: 0.025, outputPerMillion: 2 },
  "gpt-5-nano": { inputPerMillion: 0.05, cachedInputPerMillion: 0.005, outputPerMillion: 0.4 },
  "gpt-5-chat-latest": { inputPerMillion: 1.25, cachedInputPerMillion: 0.125, outputPerMillion: 10 },
  "gpt-5-codex": { inputPerMillion: 1.25, cachedInputPerMillion: 0.125, outputPerMillion: 10 },
  "gpt-5-pro": { inputPerMillion: 15, outputPerMillion: 120 },
  "gpt-4.1": { inputPerMillion: 2, cachedInputPerMillion: 0.5, outputPerMillion: 8 },
  "gpt-4.1-mini": { inputPerMillion: 0.4, cachedInputPerMillion: 0.1, outputPerMillion: 1.6 },
  "gpt-4.1-nano": { inputPerMillion: 0.1, cachedInputPerMillion: 0.025, outputPerMillion: 0.4 },
  "gpt-4o": { inputPerMillion: 2.5, cachedInputPerMillion: 1.25, outputPerMillion: 10 },
  "gpt-4o-2024-05-13": { inputPerMillion: 5, outputPerMillion: 15 },
  "gpt-4o-mini": { inputPerMillion: 0.15, cachedInputPerMillion: 0.075, outputPerMillion: 0.6 },
  "gpt-realtime": { inputPerMillion: 4, cachedInputPerMillion: 0.4, outputPerMillion: 16 },
  "gpt-realtime-mini": { inputPerMillion: 0.6, cachedInputPerMillion: 0.06, outputPerMillion: 2.4 },
  "gpt-4o-realtime-preview": { inputPerMillion: 5, cachedInputPerMillion: 2.5, outputPerMillion: 20 },
  "gpt-4o-mini-realtime-preview": { inputPerMillion: 0.6, cachedInputPerMillion: 0.3, outputPerMillion: 2.4 },
  "gpt-audio": { inputPerMillion: 2.5, outputPerMillion: 10 },
  "gpt-audio-mini": { inputPerMillion: 0.6, outputPerMillion: 2.4 },
  "gpt-4o-audio-preview": { inputPerMillion: 2.5, outputPerMillion: 10 },
  "gpt-4o-mini-audio-preview": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  o1: { inputPerMillion: 15, cachedInputPerMillion: 7.5, outputPerMillion: 60 },
  "o1-pro": { inputPerMillion: 150, outputPerMillion: 600 },
  "o3-pro": { inputPerMillion: 20, outputPerMillion: 80 },
  o3: { inputPerMillion: 2, cachedInputPerMillion: 0.5, outputPerMillion: 8 },
  "o3-deep-research": { inputPerMillion: 10, cachedInputPerMillion: 2.5, outputPerMillion: 40 },
  "o4-mini": { inputPerMillion: 1.1, cachedInputPerMillion: 0.275, outputPerMillion: 4.4 },
  "o4-mini-deep-research": { inputPerMillion: 2, cachedInputPerMillion: 0.5, outputPerMillion: 8 },
  "o3-mini": { inputPerMillion: 1.1, cachedInputPerMillion: 0.55, outputPerMillion: 4.4 },
  "o1-mini": { inputPerMillion: 1.1, cachedInputPerMillion: 0.55, outputPerMillion: 4.4 },
  "codex-mini-latest": { inputPerMillion: 1.5, cachedInputPerMillion: 0.375, outputPerMillion: 6 },
  "gpt-5-search-api": { inputPerMillion: 1.25, cachedInputPerMillion: 0.125, outputPerMillion: 10 },
  "gpt-4o-mini-search-preview": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "gpt-4o-search-preview": { inputPerMillion: 2.5, outputPerMillion: 10 },
  "computer-use-preview": { inputPerMillion: 3, outputPerMillion: 12 },
};

export const OPENAI_PRICED_TEXT_MODELS = Object.freeze(
  Object.keys(OPENAI_TEXT_MODEL_PRICES_USD_PER_MILLION),
);

export function getOpenAITextModelPrice(model: string): OpenAITextModelPrice | null {
  return OPENAI_TEXT_MODEL_PRICES_USD_PER_MILLION[model.toLowerCase()] ?? null;
}

export function estimateOpenAITextCostUsd(usage: TextUsageForPricing): number | null {
  const price = getOpenAITextModelPrice(usage.model);
  if (!price) return null;
  const cachedInputTokens = Math.max(0, Number(usage.cacheReadTokens ?? 0));
  const uncachedInputTokens = Math.max(0, Number(usage.inputTokens ?? 0) - cachedInputTokens);
  const outputTokens = Math.max(0, Number(usage.outputTokens ?? 0));
  const cachedInputPrice = price.cachedInputPerMillion ?? price.inputPerMillion;
  return (
    (uncachedInputTokens * price.inputPerMillion +
      cachedInputTokens * cachedInputPrice +
      outputTokens * price.outputPerMillion) /
    1_000_000
  );
}

export function describeRuntimePricing(
  runtime: RuntimeName,
  model: string,
): RuntimePricingStatus {
  if (runtime === "claude") {
    return {
      mode: "provider-reported",
      priced: true,
      label: "Provider reported",
      note: "Claude cost is reported by the Claude SDK when available.",
    };
  }

  const price = getOpenAITextModelPrice(model);
  const mode: RuntimePricingMode = runtime === "openai" ? "api" : "api-equivalent";
  if (!price) {
    return {
      mode,
      priced: false,
      label: "Selected model not priced",
      note: `${model} is not in Boop's OpenAI pricing table yet; usage records tokens without estimated dollars.`,
      source: OPENAI_PRICING_SOURCE,
    };
  }

  const cached = price.cachedInputPerMillion ?? price.inputPerMillion;
  return {
    mode,
    priced: true,
    label: `$${price.inputPerMillion}/$${cached}/$${price.outputPerMillion} per 1M`,
    note:
      runtime === "codex"
        ? "Codex subscription usage is shown as a standard OpenAI API-equivalent estimate."
        : "OpenAI API usage is estimated from standard input, cached input, and output token prices.",
    source: OPENAI_PRICING_SOURCE,
    inputPerMillion: price.inputPerMillion,
    cachedInputPerMillion: price.cachedInputPerMillion,
    outputPerMillion: price.outputPerMillion,
  };
}
