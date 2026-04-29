import { api } from "../convex/_generated/api.js";
import { convex } from "./convex-client.js";
import type { RuntimeName, RuntimeReasoningEffort } from "./runtimes/types.js";

const RUNTIME_KEY = "runtime";
const MODEL_KEY = "model";
const CLAUDE_MODEL_KEY = "claude_model";
const CODEX_MODEL_KEY = "codex_model";
const OPENAI_MODEL_KEY = "openai_model";
const CODEX_REASONING_EFFORT_KEY = "codex_reasoning_effort";
const OPENAI_REASONING_EFFORT_KEY = "openai_reasoning_effort";
const MODEL_TTL_MS = 30 * 1000;

let cachedRuntime: { at: number; value: RuntimeName } | null = null;
let cachedModel: { at: number; runtime: RuntimeName; value: string } | null = null;
let cachedReasoningEffort: {
  at: number;
  runtime: RuntimeName;
  value: RuntimeReasoningEffort | undefined;
} | null = null;

export const CLAUDE_MODEL_ALIASES: Record<string, string> = {
  opus: "claude-opus-4-7",
  "opus 4.7": "claude-opus-4-7",
  sonnet: "claude-sonnet-4-6",
  "sonnet 4.6": "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
  "haiku 4.5": "claude-haiku-4-5-20251001",
};

export const CODEX_MODEL_ALIASES: Record<string, string> = {
  codex: "gpt-5.5",
  default: "gpt-5.5",
  "gpt 5.5": "gpt-5.5",
  "gpt-5.5": "gpt-5.5",
  "gpt 5.4": "gpt-5.4",
  "gpt-5.4": "gpt-5.4",
  mini: "gpt-5.4-mini",
  "gpt-5.4-mini": "gpt-5.4-mini",
  "5.3 codex": "gpt-5.3-codex",
  "gpt-5.3-codex": "gpt-5.3-codex",
};

export const OPENAI_MODEL_ALIASES: Record<string, string> = {
  openai: "gpt-5.5",
  api: "gpt-5.5",
  default: "gpt-5.5",
  "gpt 5.5": "gpt-5.5",
  "gpt-5.5": "gpt-5.5",
  "gpt 5.4": "gpt-5.4",
  "gpt-5.4": "gpt-5.4",
  "gpt-5.4-mini": "gpt-5.4-mini",
  "gpt 5.2": "gpt-5.2",
  "gpt-5.2": "gpt-5.2",
  "gpt 5.1": "gpt-5.1",
  "gpt-5.1": "gpt-5.1",
  mini: "gpt-5.4-mini",
};

export const MODEL_ALIASES = CLAUDE_MODEL_ALIASES;

export const CLAUDE_KNOWN_MODELS = new Set<string>([
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
]);

export const CODEX_KNOWN_MODELS = new Set<string>([
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3-codex",
  "gpt-5.3-codex-spark",
  "gpt-5.2",
]);

export const OPENAI_KNOWN_MODELS = new Set<string>([
  "gpt-5.5",
  "gpt-5.5-pro",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "gpt-5.4-pro",
  "gpt-5.3-chat-latest",
  "gpt-5.3-codex",
  "gpt-5.2",
  "gpt-5.2-chat-latest",
  "gpt-5.2-codex",
  "gpt-5.2-pro",
  "gpt-5.1",
  "gpt-5.1-chat-latest",
  "gpt-5",
  "gpt-5-chat-latest",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-5.1-codex",
  "gpt-5.1-codex-mini",
  "gpt-5.1-codex-max",
  "gpt-5-codex",
  "gpt-5-pro",
  "codex-mini-latest",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-4o",
  "gpt-4o-mini",
  "o3",
  "o3-pro",
  "o4-mini",
  "o3-mini",
  "o1",
  "o1-pro",
  "o1-mini",
]);

export const KNOWN_MODELS = CLAUDE_KNOWN_MODELS;

export const REASONING_EFFORTS = new Set<RuntimeReasoningEffort>([
  "medium",
  "low",
  "high",
  "xhigh",
  "minimal",
]);

export function resolveRuntimeInput(input: string): RuntimeName | null {
  const lower = input.trim().toLowerCase();
  if (lower === "claude" || lower === "anthropic") return "claude";
  if (lower === "codex" || lower === "codex-subscription" || lower === "chatgpt") return "codex";
  if (lower === "openai" || lower === "openai-api" || lower === "oai" || lower === "api") return "openai";
  return null;
}

export function resolveModelInput(input: string, runtime: RuntimeName = "claude"): string | null {
  const lower = input.trim().toLowerCase();
  const known =
    runtime === "openai"
      ? OPENAI_KNOWN_MODELS
      : runtime === "codex"
        ? CODEX_KNOWN_MODELS
        : CLAUDE_KNOWN_MODELS;
  const aliases =
    runtime === "openai"
      ? OPENAI_MODEL_ALIASES
      : runtime === "codex"
        ? CODEX_MODEL_ALIASES
        : CLAUDE_MODEL_ALIASES;
  if (known.has(lower)) return lower;
  return aliases[lower] ?? null;
}

export function resolveReasoningEffortInput(input: string): RuntimeReasoningEffort | null {
  const lower = input.trim().toLowerCase();
  if (REASONING_EFFORTS.has(lower as RuntimeReasoningEffort)) {
    return lower as RuntimeReasoningEffort;
  }
  return null;
}

function envRuntimeFallback(): RuntimeName {
  return resolveRuntimeInput(process.env.BOOP_RUNTIME ?? "") ?? "claude";
}

function envModelFallback(runtime: RuntimeName): string {
  if (runtime === "codex") return process.env.BOOP_CODEX_MODEL ?? "gpt-5.5";
  if (runtime === "openai") return process.env.BOOP_OPENAI_MODEL ?? "gpt-5.5";
  return process.env.BOOP_MODEL ?? "claude-sonnet-4-6";
}

function envReasoningEffortFallback(runtime: RuntimeName): RuntimeReasoningEffort | undefined {
  const value =
    runtime === "codex"
      ? process.env.BOOP_CODEX_REASONING_EFFORT
      : runtime === "openai"
        ? process.env.BOOP_OPENAI_REASONING_EFFORT
        : undefined;
  return value ? (resolveReasoningEffortInput(value) ?? "medium") : runtime === "claude" ? undefined : "medium";
}

function modelKeyFor(runtime: RuntimeName): string {
  if (runtime === "codex") return CODEX_MODEL_KEY;
  if (runtime === "openai") return OPENAI_MODEL_KEY;
  return CLAUDE_MODEL_KEY;
}

function reasoningEffortKeyFor(runtime: RuntimeName): string | null {
  if (runtime === "codex") return CODEX_REASONING_EFFORT_KEY;
  if (runtime === "openai") return OPENAI_REASONING_EFFORT_KEY;
  return null;
}

export async function getRuntimeName(): Promise<RuntimeName> {
  if (cachedRuntime && Date.now() - cachedRuntime.at < MODEL_TTL_MS) {
    return cachedRuntime.value;
  }
  let stored: string | null = null;
  try {
    stored = await convex.query(api.settings.get, { key: RUNTIME_KEY });
  } catch (err) {
    console.warn("[runtime-config] settings:get runtime failed", err);
  }
  const runtime = (stored ? resolveRuntimeInput(stored) : null) ?? envRuntimeFallback();
  cachedRuntime = { at: Date.now(), value: runtime };
  return runtime;
}

export async function getRuntimeModel(runtime?: RuntimeName): Promise<string> {
  const selectedRuntime = runtime ?? (await getRuntimeName());
  if (
    cachedModel &&
    cachedModel.runtime === selectedRuntime &&
    Date.now() - cachedModel.at < MODEL_TTL_MS
  ) {
    return cachedModel.value;
  }
  let stored: string | null = null;
  try {
    stored = await convex.query(api.settings.get, {
      key: modelKeyFor(selectedRuntime),
    });
    if (!stored && selectedRuntime === "claude") {
      stored = await convex.query(api.settings.get, { key: MODEL_KEY });
    }
  } catch (err) {
    console.warn("[runtime-config] settings:get model failed", err);
  }
  const known =
    selectedRuntime === "openai"
      ? OPENAI_KNOWN_MODELS
      : selectedRuntime === "codex"
        ? CODEX_KNOWN_MODELS
        : CLAUDE_KNOWN_MODELS;
  const final = stored && known.has(stored) ? stored : envModelFallback(selectedRuntime);
  cachedModel = { at: Date.now(), runtime: selectedRuntime, value: final };
  return final;
}

export async function getRuntimeReasoningEffort(
  runtime?: RuntimeName,
): Promise<RuntimeReasoningEffort | undefined> {
  const selectedRuntime = runtime ?? (await getRuntimeName());
  if (selectedRuntime === "claude") return undefined;
  if (
    cachedReasoningEffort &&
    cachedReasoningEffort.runtime === selectedRuntime &&
    Date.now() - cachedReasoningEffort.at < MODEL_TTL_MS
  ) {
    return cachedReasoningEffort.value;
  }
  let stored: string | null = null;
  const key = reasoningEffortKeyFor(selectedRuntime);
  try {
    if (key) stored = await convex.query(api.settings.get, { key });
  } catch (err) {
    console.warn("[runtime-config] settings:get reasoning effort failed", err);
  }
  const final = stored
    ? (resolveReasoningEffortInput(stored) ?? envReasoningEffortFallback(selectedRuntime))
    : envReasoningEffortFallback(selectedRuntime);
  cachedReasoningEffort = { at: Date.now(), runtime: selectedRuntime, value: final };
  return final;
}

export async function getRuntimeConfig(): Promise<{
  runtime: RuntimeName;
  model: string;
  reasoningEffort?: RuntimeReasoningEffort;
}> {
  const runtime = await getRuntimeName();
  return {
    runtime,
    model: await getRuntimeModel(runtime),
    reasoningEffort: await getRuntimeReasoningEffort(runtime),
  };
}

export async function setRuntimeName(runtime: RuntimeName): Promise<void> {
  await convex.mutation(api.settings.set, { key: RUNTIME_KEY, value: runtime });
  cachedRuntime = { at: Date.now(), value: runtime };
  cachedModel = null;
  cachedReasoningEffort = null;
}

export async function setRuntimeModel(
  model: string,
  runtime?: RuntimeName,
): Promise<void> {
  const selectedRuntime = runtime ?? (await getRuntimeName());
  await convex.mutation(api.settings.set, {
    key: modelKeyFor(selectedRuntime),
    value: model,
  });
  if (selectedRuntime === "claude") {
    await convex.mutation(api.settings.set, { key: MODEL_KEY, value: model });
  }
  cachedModel = { at: Date.now(), runtime: selectedRuntime, value: model };
}

export async function setRuntimeReasoningEffort(
  effort: RuntimeReasoningEffort,
  runtime?: RuntimeName,
): Promise<void> {
  const selectedRuntime = runtime ?? (await getRuntimeName());
  const key = reasoningEffortKeyFor(selectedRuntime);
  if (!key) return;
  await convex.mutation(api.settings.set, { key, value: effort });
  cachedReasoningEffort = { at: Date.now(), runtime: selectedRuntime, value: effort };
}

export async function clearRuntimeModel(): Promise<void> {
  const runtime = await getRuntimeName();
  await convex.mutation(api.settings.clear, {
    key: modelKeyFor(runtime),
  });
  if (runtime === "claude") {
    await convex.mutation(api.settings.clear, { key: MODEL_KEY });
  }
  cachedModel = null;
}
