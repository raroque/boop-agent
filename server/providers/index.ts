/**
 * Provider factory for boop-agent.
 *
 * Select the active AI provider by setting BOOP_PROVIDER in your .env.local:
 *   BOOP_PROVIDER=claude   (default) — uses @anthropic-ai/claude-agent-sdk via Claude Code subscription
 *   BOOP_PROVIDER=openai   — uses the OpenAI Responses API (requires OPENAI_API_KEY)
 *
 * Both providers expose the same query() interface. The tool() and
 * createSdkMcpServer() utilities always come from @anthropic-ai/claude-agent-sdk
 * because that is how all in-process MCP servers are constructed in this codebase;
 * the OpenAI provider bridges those McpServer instances via InMemoryTransport.
 */
export { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
export type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { query as claudeQuery } from "./claude.js";
import { query as openaiQuery } from "./openai.js";

type QueryParams = Parameters<typeof claudeQuery>[0];

/** Returns the configured provider name ("claude" or "openai"). */
export function getActiveProvider(): "claude" | "openai" {
  const raw = (process.env.BOOP_PROVIDER ?? "claude").toLowerCase();
  return raw === "openai" ? "openai" : "claude";
}

/**
 * Unified query() that delegates to the active provider.
 *
 * Drop-in replacement for the `query` export from @anthropic-ai/claude-agent-sdk.
 * The emitted SDKMessage objects are structurally compatible for all fields
 * that boop-agent's agent code reads (type, message.content, total_cost_usd,
 * modelUsage).
 */
export async function* query(opts: QueryParams): AsyncGenerator<SDKMessage> {
  if (getActiveProvider() === "openai") {
    // The OpenAI provider emits BoopMessage which is structurally compatible
    // with SDKMessage for the fields we use.
    yield* openaiQuery(opts as unknown as Parameters<typeof openaiQuery>[0]) as unknown as AsyncGenerator<SDKMessage>;
  } else {
    yield* claudeQuery(opts);
  }
}
