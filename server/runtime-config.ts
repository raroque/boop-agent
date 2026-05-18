import { api } from "../convex/_generated/api.js";
import { convex } from "./convex-client.js";
import type { RuntimeName, RuntimeReasoningEffort } from "./runtimes/types.js";
import { homedir } from "node:os";
import { join } from "node:path";

const RUNTIME_KEY = "runtime";
const CLAUDE_MODEL_KEY = "model";
const CODEX_MODEL_KEY = "codex_model";
const CODEX_REASONING_EFFORT_KEY = "codex_reasoning_effort";
const BROWSER_ENABLED_KEY = "browser_enabled";
const BROWSER_PROFILE_DIR_KEY = "browser_profile_dir";
const BROWSER_SHOW_UI_KEY = "browser_show_ui";
const BROWSER_LOGIN_HANDOFF_KEY = "browser_login_handoff";
const BROWSER_START_URL_KEY = "browser_start_url";
const BROWSER_CHANNEL_KEY = "browser_channel";
const BROWSER_EXECUTABLE_PATH_KEY = "browser_executable_path";
const BROWSER_EXTRA_ARGS_KEY = "browser_extra_args";
const CONFIG_TTL_MS = 30 * 1000;
const BROWSER_CONFIG_TTL_MS = 5 * 1000;

export interface RuntimeConfig {
  runtime: RuntimeName;
  model: string;
  reasoningEffort?: RuntimeReasoningEffort;
  billingMode: "api" | "codex-subscription";
}

let cachedConfig: { at: number; value: RuntimeConfig } | null = null;
let cachedBrowserSettings: { at: number; value: BrowserSettings } | null = null;

export interface BrowserSettings {
  enabled: boolean;
  profileDir: string;
  showUi: boolean;
  loginHandoffEnabled: boolean;
  startUrl: string;
  channel: string;
  executablePath: string;
  extraArgs: string[];
}

const DEFAULT_BROWSER_PROFILE_DIR = join(homedir(), ".boop", "browser-profile");
const DEFAULT_BROWSER_CHANNEL = "chrome";
const BLOCKED_BROWSER_EXTRA_ARGS = new Set([
  "--allow-running-insecure-content",
  "--disable-extensions-except",
  "--disable-web-security",
  "--load-extension",
  "--remote-allow-origins",
  "--remote-debugging-address",
  "--remote-debugging-port",
  "--unsafely-treat-insecure-origin-as-secure",
  "--user-data-dir",
]);

export const RUNTIME_ALIASES: Record<string, RuntimeName> = {
  anthropic: "claude",
  claude: "claude",
  "claude agent sdk": "claude",
  codex: "codex",
  chatgpt: "codex",
  "chatgpt codex": "codex",
};

// Backward-compatible names kept for existing imports and prompt text.
export const MODEL_ALIASES: Record<string, string> = {
  opus: "claude-opus-4-7",
  "opus 4.7": "claude-opus-4-7",
  sonnet: "claude-sonnet-4-6",
  "sonnet 4.6": "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
  "haiku 4.5": "claude-haiku-4-5-20251001",
};

export const KNOWN_MODELS = new Set<string>([
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
]);

export const CODEX_MODEL_ALIASES: Record<string, string> = {
  "5.5": "gpt-5.5",
  "gpt 5.5": "gpt-5.5",
  "gpt-5.5": "gpt-5.5",
  "5.4": "gpt-5.4",
  "gpt 5.4": "gpt-5.4",
  "gpt-5.4": "gpt-5.4",
  mini: "gpt-5.4-mini",
  "5.4 mini": "gpt-5.4-mini",
  "gpt-5.4-mini": "gpt-5.4-mini",
  codex: "gpt-5.3-codex",
  "5.3 codex": "gpt-5.3-codex",
  "gpt-5.3-codex": "gpt-5.3-codex",
};

export const KNOWN_CODEX_MODELS = new Set<string>([
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3-codex",
  "gpt-5.2",
]);

const KNOWN_REASONING_EFFORTS = new Set<RuntimeReasoningEffort>([
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);

export function resolveRuntimeInput(input: string): RuntimeName | null {
  return RUNTIME_ALIASES[input.trim().toLowerCase()] ?? null;
}

export function resolveModelInput(
  input: string,
  runtime: RuntimeName = "claude",
): string | null {
  const lower = input.trim().toLowerCase();
  if (runtime === "codex") {
    if (KNOWN_CODEX_MODELS.has(lower)) return lower;
    return CODEX_MODEL_ALIASES[lower] ?? null;
  }
  if (KNOWN_MODELS.has(lower)) return lower;
  return MODEL_ALIASES[lower] ?? null;
}

function resolveRuntimeValue(input: string | null): RuntimeName {
  const envRuntime = resolveRuntimeInput(process.env.BOOP_RUNTIME ?? "") ?? "claude";
  return input ? (resolveRuntimeInput(input) ?? envRuntime) : envRuntime;
}

function claudeEnvFallback(): string {
  return process.env.BOOP_MODEL ?? "claude-sonnet-4-6";
}

function codexEnvFallback(): string {
  return process.env.BOOP_CODEX_MODEL ?? "gpt-5.5";
}

function resolveReasoningEffort(input: string | null): RuntimeReasoningEffort {
  return (
    resolveReasoningEffortInput(
      input ?? process.env.BOOP_CODEX_REASONING_EFFORT ?? "medium",
    ) ?? "medium"
  );
}

export function resolveReasoningEffortInput(
  input: string,
): RuntimeReasoningEffort | null {
  const lower = input.trim().toLowerCase() as RuntimeReasoningEffort;
  return KNOWN_REASONING_EFFORTS.has(lower) ? lower : null;
}

async function getSetting(key: string): Promise<string | null> {
  try {
    return await convex.query(api.settings.get, { key });
  } catch (err) {
    console.warn(`[runtime-config] settings:get ${key} failed`, err);
    return null;
  }
}

function settingBool(
  stored: string | null,
  envValue: string | undefined,
  fallback: boolean,
): boolean {
  if (stored === "true") return true;
  if (stored === "false") return false;
  if (envValue === "1" || envValue === "true") return true;
  if (envValue === "0" || envValue === "false") return false;
  return fallback;
}

export function parseExtraArgs(input: string | null): string[] {
  if (!input) return [];
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      if (!line.startsWith("--")) return false;
      const [flagName] = line.toLowerCase().split(/[=\s]/, 1);
      return !BLOCKED_BROWSER_EXTRA_ARGS.has(flagName);
    });
}

export function parseEnvExtraArgs(input: string | undefined): string[] {
  return parseExtraArgs(input?.replace(/[ \t]+/g, "\n") ?? null);
}

export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  if (cachedConfig && Date.now() - cachedConfig.at < CONFIG_TTL_MS) {
    return cachedConfig.value;
  }

  const runtime = resolveRuntimeValue(await getSetting(RUNTIME_KEY));
  let model: string;
  let reasoningEffort: RuntimeReasoningEffort | undefined;
  let billingMode: RuntimeConfig["billingMode"];

  if (runtime === "codex") {
    const stored = await getSetting(CODEX_MODEL_KEY);
    model = stored && KNOWN_CODEX_MODELS.has(stored) ? stored : codexEnvFallback();
    reasoningEffort = resolveReasoningEffort(await getSetting(CODEX_REASONING_EFFORT_KEY));
    billingMode = "codex-subscription";
  } else {
    const stored = await getSetting(CLAUDE_MODEL_KEY);
    model = stored && KNOWN_MODELS.has(stored) ? stored : claudeEnvFallback();
    billingMode = "api";
  }

  const value = { runtime, model, reasoningEffort, billingMode };
  cachedConfig = { at: Date.now(), value };
  return value;
}

export async function getRuntimeModel(): Promise<string> {
  return (await getRuntimeConfig()).model;
}

export async function setRuntimeProvider(runtime: RuntimeName): Promise<void> {
  await convex.mutation(api.settings.set, { key: RUNTIME_KEY, value: runtime });
  cachedConfig = null;
}

export async function setRuntimeModel(model: string, runtime?: RuntimeName): Promise<void> {
  const targetRuntime = runtime ?? (await getRuntimeConfig()).runtime;
  await convex.mutation(api.settings.set, {
    key: targetRuntime === "codex" ? CODEX_MODEL_KEY : CLAUDE_MODEL_KEY,
    value: model,
  });
  cachedConfig = null;
}

export async function setCodexReasoningEffort(
  effort: RuntimeReasoningEffort,
): Promise<void> {
  await convex.mutation(api.settings.set, {
    key: CODEX_REASONING_EFFORT_KEY,
    value: effort,
  });
  cachedConfig = null;
}

export async function clearRuntimeModel(runtime?: RuntimeName): Promise<void> {
  const targetRuntime = runtime ?? (await getRuntimeConfig()).runtime;
  await convex.mutation(api.settings.clear, {
    key: targetRuntime === "codex" ? CODEX_MODEL_KEY : CLAUDE_MODEL_KEY,
  });
  cachedConfig = null;
}

export async function getBrowserSettings(): Promise<BrowserSettings> {
  if (
    cachedBrowserSettings &&
    Date.now() - cachedBrowserSettings.at < BROWSER_CONFIG_TTL_MS
  ) {
    return cachedBrowserSettings.value;
  }

  const [
    enabled,
    profileDir,
    showUi,
    loginHandoff,
    startUrl,
    channel,
    executablePath,
    extraArgs,
  ] = await Promise.all([
    getSetting(BROWSER_ENABLED_KEY),
    getSetting(BROWSER_PROFILE_DIR_KEY),
    getSetting(BROWSER_SHOW_UI_KEY),
    getSetting(BROWSER_LOGIN_HANDOFF_KEY),
    getSetting(BROWSER_START_URL_KEY),
    getSetting(BROWSER_CHANNEL_KEY),
    getSetting(BROWSER_EXECUTABLE_PATH_KEY),
    getSetting(BROWSER_EXTRA_ARGS_KEY),
  ]);

  const value: BrowserSettings = {
    enabled: settingBool(enabled, process.env.BOOP_BROWSER_ENABLED, false),
    profileDir:
      profileDir?.trim() ||
      process.env.BOOP_BROWSER_PROFILE_DIR?.trim() ||
      DEFAULT_BROWSER_PROFILE_DIR,
    showUi: settingBool(showUi, process.env.BOOP_BROWSER_SHOW_UI, true),
    loginHandoffEnabled: settingBool(loginHandoff, process.env.BOOP_BROWSER_LOGIN_HANDOFF, false),
    startUrl: startUrl?.trim() || process.env.BOOP_BROWSER_START_URL?.trim() || "",
    channel: channel?.trim() || process.env.BOOP_BROWSER_CHANNEL?.trim() || DEFAULT_BROWSER_CHANNEL,
    executablePath:
      executablePath?.trim() || process.env.BOOP_BROWSER_EXECUTABLE_PATH?.trim() || "",
    extraArgs:
      extraArgs !== null
        ? parseExtraArgs(extraArgs)
        : parseEnvExtraArgs(process.env.BOOP_BROWSER_EXTRA_ARGS),
  };

  cachedBrowserSettings = { at: Date.now(), value };
  return value;
}

export function clearBrowserSettingsCache(): void {
  cachedBrowserSettings = null;
}
