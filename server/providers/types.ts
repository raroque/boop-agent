/**
 * Unified message type emitted by both Claude and OpenAI providers.
 * Structurally compatible with @anthropic-ai/claude-agent-sdk's SDKMessage
 * for the subset of fields that boop-agent's agent code actually reads.
 */
export type BoopMessage =
  | {
      type: "assistant";
      message: {
        content: Array<
          | { type: "text"; text: string }
          | { type: "tool_use"; id: string; name: string; input: unknown }
        >;
      };
    }
  | {
      type: "user";
      message: {
        content: Array<{ type: "tool_result"; content: unknown }>;
      };
    }
  | {
      type: "result";
      /** Total cost in USD across all turns of the agent loop. */
      total_cost_usd?: number;
      /**
       * Per-model usage, keyed by model name.
       * Shape mirrors claude-agent-sdk's modelUsage so aggregateUsageFromResult works unchanged.
       */
      modelUsage?: Record<
        string,
        {
          inputTokens?: number;
          outputTokens?: number;
          cacheReadInputTokens?: number;
          cacheCreationInputTokens?: number;
        }
      >;
    };
