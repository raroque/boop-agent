import { runClaudeAgent } from "./claude.js";
import { runCodexAppServerAgent } from "./codex-app-server.js";
import { runOpenAIResponsesAgent } from "./openai-responses.js";
import type { RuntimeName, RuntimeRunRequest, RuntimeRunResult } from "./types.js";

export async function runAgentRuntime(
  runtime: RuntimeName,
  request: RuntimeRunRequest,
): Promise<RuntimeRunResult> {
  if (runtime === "openai") return runOpenAIResponsesAgent(request);
  if (runtime === "codex") return runCodexAppServerAgent(request);
  return runClaudeAgent(request);
}
