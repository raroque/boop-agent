import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

export interface UsageTotals {
  /** Name of the model that consumed the most tokens. */
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
}

export const EMPTY_USAGE: UsageTotals = {
  model: "unknown",
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  costUsd: 0,
};

/**
 * The SDK's result message has two cost-y fields:
 *   - msg.usage      → raw Anthropic usage for the FINAL turn only (snake_case)
 *   - msg.modelUsage → aggregate per-model across the whole query (camelCase)
 *
 * Always prefer modelUsage — msg.usage massively undercounts on tool-heavy runs.
 *
 * Note on the `model` field returned: msg.modelUsage can contain MULTIPLE models
 * per query because Claude Code CLI uses different models for different internal
 * sub-tasks within a single query() call (e.g. haiku for cheap routing + sonnet
 * for the main response). If you pass `requestedModel`, it's used as the reported
 * primary so the cost row reflects what the caller actually asked for. Otherwise
 * we fall back to whichever model consumed the most tokens — accurate by volume
 * but often misleading.
 */
export function aggregateUsageFromResult(
  msg: Extract<SDKMessage, { type: "result" }>,
  requestedModel?: string,
): UsageTotals {
  const modelUsage = (msg as { modelUsage?: Record<string, {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
  }> }).modelUsage ?? {};

  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  let fallbackModel = "";
  let fallbackTotal = 0;

  for (const [model, u] of Object.entries(modelUsage)) {
    const inT = u.inputTokens ?? 0;
    const outT = u.outputTokens ?? 0;
    inputTokens += inT;
    outputTokens += outT;
    cacheReadTokens += u.cacheReadInputTokens ?? 0;
    cacheCreationTokens += u.cacheCreationInputTokens ?? 0;
    const total = inT + outT;
    if (total > fallbackTotal) {
      fallbackTotal = total;
      fallbackModel = model;
    }
  }

  // Prefer the requested model if the SDK confirmed usage for it; fall back to
  // the heaviest-usage model only if the caller didn't pass one or the SDK
  // routed entirely around it (rare).
  let reportedModel: string;
  if (requestedModel && matchesAnyKey(requestedModel, Object.keys(modelUsage))) {
    reportedModel = requestedModel;
  } else {
    reportedModel = fallbackModel || requestedModel || "unknown";
  }

  return {
    model: reportedModel,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    costUsd: msg.total_cost_usd ?? 0,
  };
}

function matchesAnyKey(requested: string, keys: string[]): boolean {
  if (keys.includes(requested)) return true;
  // SDK may expand a short alias like "claude-sonnet-4-6" to a date-stamped
  // full id like "claude-sonnet-4-6-20251101" in modelUsage keys. Prefix match
  // covers both directions.
  return keys.some(
    (k) => k === requested || k.startsWith(requested) || requested.startsWith(k),
  );
}
