import type { z } from "zod";
import type { UsageTotals } from "../usage.js";

export type RuntimeName = "claude" | "codex";
export type RuntimeReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";
export type RuntimeMode = "dispatcher" | "execution" | "background";

export interface RuntimeTool {
  namespace: string;
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
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
  mode: RuntimeMode;
  onText?: (text: string) => void | Promise<void>;
  onToolUse?: (toolName: string, input: unknown) => void | Promise<void>;
  onToolResult?: (toolName: string, text: string) => void | Promise<void>;
  onUsage?: (usage: UsageTotals) => void | Promise<void>;
}

export interface RuntimeRunResult {
  text: string;
  usage: UsageTotals;
}

export function runtimeText(text: string, success = true): RuntimeToolResult {
  return { text, success };
}
