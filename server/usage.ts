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
 */
export function aggregateUsageFromResult(
  msg: Extract<SDKMessage, { type: "result" }>,
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
  let primaryModel = "";
  let primaryTotal = 0;

  for (const [model, u] of Object.entries(modelUsage)) {
    const inT = u.inputTokens ?? 0;
    const outT = u.outputTokens ?? 0;
    inputTokens += inT;
    outputTokens += outT;
    cacheReadTokens += u.cacheReadInputTokens ?? 0;
    cacheCreationTokens += u.cacheCreationInputTokens ?? 0;
    const total = inT + outT;
    if (total > primaryTotal) {
      primaryTotal = total;
      primaryModel = model;
    }
  }

  return {
    model: primaryModel || "unknown",
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    costUsd: msg.total_cost_usd ?? 0,
  };
}
