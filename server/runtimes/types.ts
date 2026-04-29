import type { z } from "zod";

export type RuntimeName = "claude" | "codex" | "openai";
export type RuntimeReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";

export interface RuntimeTool {
  namespace: string;
  name: string;
  description: string;
  zodSchema: Record<string, z.ZodTypeAny>;
  jsonSchema: Record<string, unknown>;
  handle: (args: Record<string, unknown>) => Promise<RuntimeToolResult>;
}

export interface RuntimeToolResult {
  text: string;
  success?: boolean;
}

export interface RuntimeRunRequest {
  prompt: string;
  systemPrompt: string;
  model: string;
  reasoningEffort?: RuntimeReasoningEffort;
  tools: RuntimeTool[];
  claudeMcpServers?: Record<string, unknown>;
  allowedTools?: string[];
  disallowedTools?: string[];
  cwd?: string;
  abortController?: AbortController;
  mode: "dispatcher" | "execution";
  onText?: (text: string) => void;
  onToolUse?: (toolName: string, input: unknown) => void | Promise<void>;
  onToolResult?: (toolName: string, text: string) => void | Promise<void>;
  onUsage?: (usage: RuntimeRunResult["usage"]) => void | Promise<void>;
}

export interface RuntimeRunResult {
  text: string;
  usage: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    costUsd: number;
  };
}

export const EMPTY_RUNTIME_USAGE: RuntimeRunResult["usage"] = {
  model: "unknown",
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  costUsd: 0,
};

export function runtimeText(text: string, success = true): RuntimeToolResult {
  return { text, success };
}
