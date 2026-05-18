import type { RuntimeConfig } from "../runtime-config.js";
import type { RuntimeRunRequest, RuntimeRunResult } from "./types.js";
import { runClaudeAgent } from "./claude.js";
import { runCodexAppServerAgent } from "./codex-app-server.js";

export async function runAgentRuntime(
  config: RuntimeConfig,
  request: Omit<RuntimeRunRequest, "model" | "reasoningEffort">,
): Promise<RuntimeRunResult> {
  const fullRequest = {
    ...request,
    model: config.model,
    reasoningEffort: config.reasoningEffort,
  };
  switch (config.runtime) {
    case "claude":
      return runClaudeAgent(fullRequest);
    case "codex":
      return runCodexAppServerAgent(fullRequest);
  }
}
