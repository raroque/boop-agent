import type { RuntimeRunRequest, RuntimeRunResult } from "./types.js";
import { runClaudeAgent } from "./claude.js";

export async function runAgentRuntime(
  request: RuntimeRunRequest,
): Promise<RuntimeRunResult> {
  return runClaudeAgent(request);
}
