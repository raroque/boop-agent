import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api.js";
import {
  RuntimeProviderBadge,
  RuntimeProviderLogo,
  type RuntimeProvider,
} from "../lib/branding.js";
import { BrowserSection } from "./BrowserSection.js";

type RuntimeChoice = "claude" | "codex";
type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";

interface Option<T extends string = string> {
  value: T;
  label: string;
}

interface RuntimeConfigSnapshot {
  runtime: RuntimeChoice;
  model: string;
  reasoningEffort?: ReasoningEffort;
  billingMode: "api" | "codex-subscription";
}

interface ToggleSetting {
  kind: "toggle";
  key: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
}

interface TimezoneSetting {
  kind: "timezone";
  key: string;
  label: string;
  description: string;
}

type Setting = ToggleSetting | TimezoneSetting;

const SETTINGS: Setting[] = [
  {
    kind: "toggle",
    key: "proactive_enabled",
    label: "Proactive email surfacing",
    description:
      "Watch new Gmail messages. When something important arrives, you'll get an iMessage. Turn off to silence the watcher entirely without disconnecting Gmail.",
    defaultEnabled: true,
  },
  {
    kind: "timezone",
    key: "user_timezone",
    label: "Your timezone",
    description:
      "Used for deadline checks, 'today', and any time-of-day reasoning. The agent can also update this via iMessage when you tell it your timezone.",
  },
];

const RUNTIME_SETTING_COUNT = SETTINGS.length + 2;

const RUNTIME_OPTIONS: Option<RuntimeChoice>[] = [
  { value: "claude", label: "Claude" },
  { value: "codex", label: "Codex" },
];

const CLAUDE_MODELS: Option[] = [
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { value: "claude-opus-4-7", label: "Opus 4.7" },
  { value: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
];

const CODEX_MODELS: Option[] = [
  { value: "gpt-5.5", label: "GPT-5.5" },
  { value: "gpt-5.4", label: "GPT-5.4" },
  { value: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
  { value: "gpt-5.3-codex", label: "GPT-5.3 Agent" },
  { value: "gpt-5.2", label: "GPT-5.2" },
];

const CODEX_REASONING_EFFORTS: Option<ReasoningEffort>[] = [
  { value: "minimal", label: "Minimal" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "XHigh" },
];

// A short curated list for the dropdown, covering most US users plus a few
// common international zones. The text input next to the dropdown lets the
// user paste any IANA ID for the long tail.
const COMMON_TIMEZONES: Array<{ value: string; label: string }> = [
  { value: "America/New_York", label: "America/New_York (Eastern)" },
  { value: "America/Chicago", label: "America/Chicago (Central)" },
  { value: "America/Denver", label: "America/Denver (Mountain)" },
  { value: "America/Phoenix", label: "America/Phoenix (Arizona)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (Pacific)" },
  { value: "America/Anchorage", label: "America/Anchorage (Alaska)" },
  { value: "Pacific/Honolulu", label: "Pacific/Honolulu (Hawaii)" },
  { value: "Europe/London", label: "Europe/London" },
  { value: "Europe/Paris", label: "Europe/Paris" },
  { value: "Europe/Berlin", label: "Europe/Berlin" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo" },
  { value: "Asia/Kolkata", label: "Asia/Kolkata" },
  { value: "Australia/Sydney", label: "Australia/Sydney" },
  { value: "UTC", label: "UTC" },
];

function optionValue<T extends string>(
  stored: string | null | undefined,
  options: Option<T>[],
  fallback: T,
): T {
  return options.some((o) => o.value === stored) ? (stored as T) : fallback;
}

function settingDebug(key: string, value: string | null | undefined, fallback: string) {
  if (value === undefined) return `settings.${key} = …`;
  if (value === null) return `settings.${key} = (unset, default ${fallback})`;
  return `settings.${key} = "${value}"`;
}

async function updateRuntimeConfig(
  patch: Partial<{
    runtime: RuntimeChoice;
    model: string;
    reasoningEffort: ReasoningEffort;
  }>,
): Promise<RuntimeConfigSnapshot> {
  const res = await fetch("/api/runtime-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Runtime config update failed (${res.status})`);
  }
  return (await res.json()) as RuntimeConfigSnapshot;
}

export function SettingsPanel({ isDark }: { isDark: boolean }) {
  return (
    <div className="mx-auto max-w-[880px] space-y-5 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div
            className={`text-[11px] font-medium uppercase tracking-[0.08em] ${
              isDark ? "text-zinc-500" : "text-zinc-400"
            }`}
          >
            Preferences
          </div>
          <h2
            className={`mt-1 text-[22px] font-semibold tracking-normal ${
              isDark ? "text-zinc-50" : "text-zinc-950"
            }`}
          >
            Settings
          </h2>
          <p className={`mt-1 text-sm ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            Runtime, model, and local agent preferences.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-2xl border px-2.5 py-1 text-xs mono ${
              isDark
                ? "border-white/10 bg-white/5 text-zinc-500"
                : "border-zinc-200 bg-white text-zinc-500"
            }`}
          >
            {RUNTIME_SETTING_COUNT} controls
          </span>
          <SettingsRuntimeBadge isDark={isDark} />
        </div>
      </div>

      <div className="space-y-3">
        <RuntimeRow isDark={isDark} />
        {SETTINGS.map((s) =>
          s.kind === "toggle" ? (
            <ToggleRow key={s.key} setting={s} isDark={isDark} />
          ) : (
            <TimezoneRow key={s.key} setting={s} isDark={isDark} />
          ),
        )}
        <BrowserSection isDark={isDark} />
        <DemoModeRow isDark={isDark} />
      </div>
    </div>
  );
}

function SettingsRuntimeBadge({ isDark }: { isDark: boolean }) {
  const storedRuntime = useQuery(api.settings.get, { key: "runtime" });
  const [serverConfig, setServerConfig] = useState<RuntimeConfigSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/runtime-config")
      .then((res) => {
        if (!res.ok) throw new Error(`Runtime config fetch failed (${res.status})`);
        return res.json() as Promise<RuntimeConfigSnapshot>;
      })
      .then((config) => {
        if (!cancelled) setServerConfig(config);
      })
      .catch(() => {
        if (!cancelled) setServerConfig(null);
      });
    return () => {
      cancelled = true;
    };
  }, [storedRuntime]);

  const runtime: RuntimeProvider =
    storedRuntime === "claude" || storedRuntime === "codex"
      ? storedRuntime
      : serverConfig?.runtime ?? "claude";

  if (storedRuntime === undefined && serverConfig === null) return null;

  return (
    <RuntimeProviderBadge
      runtime={runtime}
      model={serverConfig?.runtime === runtime ? serverConfig.model : undefined}
      isDark={isDark}
      className="shrink-0"
    />
  );
}

function DemoModeRow({ isDark }: { isDark: boolean }) {
  const status = useQuery(api.demo.status);
  const setDemoMode = useMutation(api.demo.setMode);
  const [saving, setSaving] = useState<"toggle" | "reseed" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loading = status === undefined;
  const enabled = status?.enabled ?? false;
  const seeded = status?.seeded ?? false;
  const counts = status?.counts;
  const rowCount = status?.total ?? 0;
  const summary = counts
    ? `${counts.agents} agents / ${counts.agentLogs} logs / ${counts.memories} memories / ${counts.automationRuns} automation runs`
    : "Preparing demo dataset status";
  const debugLine = loading
    ? "settings.debug_demo_mode = ..."
    : `settings.debug_demo_mode = "${enabled ? "true" : "false"}" · ${rowCount} demo rows`;

  async function toggle() {
    if (loading || saving) return;
    setSaving("toggle");
    setError(null);
    try {
      await setDemoMode({ enabled: !enabled });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }

  async function reseed() {
    if (loading || saving) return;
    setSaving("reseed");
    setError(null);
    try {
      await setDemoMode({ enabled: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }

  const btnBg = isDark
    ? "bg-zinc-100 text-zinc-950 hover:bg-white"
    : "bg-zinc-950 text-white hover:bg-zinc-800";
  const secondaryBg = isDark
    ? "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
    : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50";
  const statusTone = enabled
    ? isDark
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
      : "border-emerald-200 bg-emerald-50 text-emerald-700"
    : isDark
      ? "border-white/10 bg-white/5 text-zinc-400"
      : "border-zinc-200 bg-zinc-50 text-zinc-500";

  return (
    <SettingShell
      label="Demo mode"
      description="Seeds realistic namespaced records across agents, tool traces, memories, memory events, automations, conversations, consolidation, and usage so every dashboard screen has data to inspect."
      debugLine={debugLine}
      isDark={isDark}
      control={
        <div className="flex w-full flex-col items-end gap-2 lg:min-w-[390px]">
          <div className="flex w-full items-center justify-end gap-2">
            <span
              className={`min-w-0 flex-1 rounded-2xl border px-3 py-2 text-[11px] leading-relaxed ${statusTone}`}
            >
              <span className="font-medium">
                {enabled ? "Demo data enabled" : seeded ? "Demo data staged" : "Real data only"}
              </span>
              <span className="block truncate mono opacity-80">{summary}</span>
            </span>
            <button
              onClick={toggle}
              disabled={loading || saving !== null}
              role="switch"
              aria-checked={enabled}
              aria-label="Toggle demo mode"
              className={`toggle-switch relative inline-flex h-6 w-11 shrink-0 items-center rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                loading || saving !== null ? "cursor-not-allowed opacity-50" : "cursor-pointer"
              } ${
                enabled
                  ? isDark
                    ? "bg-emerald-500 focus:ring-emerald-500/50 focus:ring-offset-[#202024]"
                    : "bg-emerald-500 focus:ring-emerald-500/50 focus:ring-offset-white"
                  : isDark
                    ? "bg-zinc-700 focus:ring-zinc-500/50 focus:ring-offset-[#202024]"
                    : "bg-zinc-300 focus:ring-zinc-400/50 focus:ring-offset-white"
              }`}
            >
              <span
                className={`toggle-thumb inline-block h-5 w-5 transform rounded-full bg-white shadow ${
                  enabled ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {enabled && (
              <button
                onClick={reseed}
                disabled={loading || saving !== null}
                className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${secondaryBg}`}
              >
                {saving === "reseed" ? "Reseeding..." : "Reseed"}
              </button>
            )}
            <button
              onClick={toggle}
              disabled={loading || saving !== null}
              className={`rounded-xl px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${btnBg}`}
            >
              {saving === "toggle"
                ? enabled
                  ? "Clearing..."
                  : "Seeding..."
                : enabled
                  ? "Turn off"
                  : "Seed demo data"}
            </button>
          </div>
          {error && <div className="text-[11px] text-rose-400">{error}</div>}
        </div>
      }
    />
  );
}

function SettingShell({
  label,
  description,
  debugLine,
  control,
  isDark,
}: {
  label: string;
  description: string;
  debugLine: string;
  control: ReactNode;
  isDark: boolean;
}) {
  const cardBg = isDark
    ? "bg-[#202024] border-white/10 shadow-black/20"
    : "bg-white border-zinc-200 shadow-zinc-200/50";
  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm fade-in ${cardBg}`}
      title={debugLine}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <div className="min-w-0 flex-1">
          <div
            className={`text-sm font-semibold ${
              isDark ? "text-zinc-100" : "text-zinc-900"
            }`}
          >
            {label}
          </div>
          <div
            className={`mt-1 max-w-[34rem] text-xs leading-relaxed ${
              isDark ? "text-zinc-400" : "text-zinc-500"
            }`}
          >
            {description}
          </div>
        </div>
        <div className="w-full lg:w-auto lg:shrink-0">{control}</div>
      </div>
    </div>
  );
}

function RuntimeRow({ isDark }: { isDark: boolean }) {
  const storedRuntime = useQuery(api.settings.get, { key: "runtime" });
  const storedClaudeModel = useQuery(api.settings.get, { key: "model" });
  const storedHostedModel = useQuery(api.settings.get, { key: "codex_model" });
  const storedHostedEffort = useQuery(api.settings.get, {
    key: "codex_reasoning_effort",
  });

  const [serverConfig, setServerConfig] = useState<RuntimeConfigSnapshot | null>(
    null,
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshServerConfig = useCallback(async () => {
    const res = await fetch("/api/runtime-config");
    if (!res.ok) throw new Error(`Runtime config fetch failed (${res.status})`);
    setServerConfig((await res.json()) as RuntimeConfigSnapshot);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/runtime-config")
      .then((res) => {
        if (!res.ok) throw new Error(`Runtime config fetch failed (${res.status})`);
        return res.json() as Promise<RuntimeConfigSnapshot>;
      })
      .then((config) => {
        if (!cancelled) {
          setServerConfig(config);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [refreshServerConfig, storedRuntime, storedClaudeModel, storedHostedModel, storedHostedEffort]);

  const runtime: RuntimeChoice =
    storedRuntime === "claude" || storedRuntime === "codex"
      ? storedRuntime
      : serverConfig?.runtime ?? "claude";

  const activeModelOptions = runtime === "codex" ? CODEX_MODELS : CLAUDE_MODELS;
  const modelKey = runtime === "codex" ? "codex_model" : "model";
  const storedModel = runtime === "codex" ? storedHostedModel : storedClaudeModel;
  const firstModelValue = activeModelOptions[0]?.value ?? "";
  const serverModelFallback =
    serverConfig?.runtime === runtime ? serverConfig.model : firstModelValue;
  const modelFallback =
    serverConfig?.runtime === runtime
      ? optionValue(serverConfig.model, activeModelOptions, firstModelValue)
      : firstModelValue;
  const activeModel = optionValue(storedModel, activeModelOptions, modelFallback);
  const reasoningEffort = optionValue(
    storedHostedEffort,
    CODEX_REASONING_EFFORTS,
    serverConfig?.reasoningEffort ?? "medium",
  );

  async function savePatch(
    key: string,
    patch: Partial<{
      runtime: RuntimeChoice;
      model: string;
      reasoningEffort: ReasoningEffort;
    }>,
  ) {
    setSaving(key);
    setError(null);
    try {
      const next = await updateRuntimeConfig(patch);
      setServerConfig(next);
      await refreshServerConfig().catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }

  const runtimeLoading = storedRuntime === undefined && serverConfig === null;
  const debugParts = [
    settingDebug("runtime", storedRuntime, serverConfig?.runtime ?? "claude"),
    settingDebug(modelKey, storedModel, serverModelFallback),
  ];
  if (runtime === "codex") {
    debugParts.push(
      settingDebug(
        "codex_reasoning_effort",
        storedHostedEffort,
        serverConfig?.reasoningEffort ?? "medium",
      ),
    );
  }
  debugParts.push(`billing: ${serverConfig?.billingMode ?? "…"}`);

  const inputBg = isDark
    ? "bg-[#17171a] border-white/10 text-zinc-100"
    : "bg-zinc-50 border-zinc-200 text-zinc-900";
  const segmentBase = isDark
    ? "border-white/10 bg-[#17171a] text-zinc-400"
    : "border-zinc-200 bg-zinc-100 text-zinc-500";
  const segmentActive = isDark
    ? "bg-zinc-100 text-zinc-950 shadow-sm"
    : "bg-white text-zinc-950 shadow-sm";

  return (
    <SettingShell
      label="AI provider"
      description="Choose the provider for new top-level turns. Running agents keep the provider and model they started with."
      debugLine={debugParts.join(" · ")}
      isDark={isDark}
      control={
        <div className="flex w-full min-w-0 flex-col items-end gap-3 lg:min-w-[360px]">
          <div
            className={`segmented-control grid w-full grid-cols-2 rounded-2xl border p-1 ${segmentBase}`}
            role="group"
            aria-label="AI provider"
          >
            {RUNTIME_OPTIONS.map((option) => {
              const active = runtime === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() =>
                    savePatch(`runtime:${option.value}`, { runtime: option.value })
                  }
                  disabled={runtimeLoading || saving !== null || active}
                  className={`segmented-button inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium disabled:opacity-60 ${
                    active ? segmentActive : isDark ? "hover:bg-white/5" : "hover:bg-white/70"
                  }`}
                >
                  <span aria-hidden="true">
                    <RuntimeProviderLogo runtime={option.value} size={14} />
                  </span>
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
            <label className="flex flex-col gap-1">
              <span
                className={`text-[10px] font-medium uppercase tracking-[0.08em] ${
                  isDark ? "text-zinc-500" : "text-zinc-400"
                }`}
              >
                Model
              </span>
              <select
                value={activeModel}
                disabled={saving !== null || storedModel === undefined}
                onChange={(e) =>
                  savePatch(`${modelKey}:${e.target.value}`, {
                    runtime,
                    model: e.target.value,
                  })
                }
                className={`w-full rounded-xl border px-3 py-2 text-xs outline-none transition-colors focus:border-zinc-400 ${inputBg}`}
              >
                {activeModelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span
                className={`text-[10px] font-medium uppercase tracking-[0.08em] ${
                  isDark ? "text-zinc-500" : "text-zinc-400"
                }`}
              >
                Reasoning effort
              </span>
              <select
                value={reasoningEffort}
                disabled={
                  runtime !== "codex" ||
                  saving !== null ||
                  storedHostedEffort === undefined
                }
                onChange={(e) =>
                  savePatch(`codex_reasoning_effort:${e.target.value}`, {
                    runtime: "codex",
                    reasoningEffort: e.target.value as ReasoningEffort,
                  })
                }
                className={`w-full rounded-xl border px-3 py-2 text-xs outline-none transition-colors focus:border-zinc-400 disabled:opacity-50 ${inputBg}`}
              >
                {CODEX_REASONING_EFFORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error && <div className="text-[11px] text-rose-400">{error}</div>}
        </div>
      }
    />
  );
}

function ToggleRow({
  setting,
  isDark,
}: {
  setting: ToggleSetting;
  isDark: boolean;
}) {
  const value = useQuery(api.settings.get, { key: setting.key });
  const setSetting = useMutation(api.settings.set);

  const loading = value === undefined;
  const enabled = loading
    ? setting.defaultEnabled
    : value === null
      ? setting.defaultEnabled
      : value !== "false";

  async function toggle() {
    if (loading) return;
    await setSetting({ key: setting.key, value: enabled ? "false" : "true" });
  }

  const debugLine = `settings.${setting.key} = ${
    loading
      ? "…"
      : value === null
        ? `(unset, default ${setting.defaultEnabled ? "true" : "false"})`
        : `"${value}"`
  }`;

  return (
    <SettingShell
      label={setting.label}
      description={setting.description}
      debugLine={debugLine}
      isDark={isDark}
      control={
        <button
          onClick={toggle}
          disabled={loading}
          role="switch"
          aria-checked={enabled}
          aria-label={`Toggle ${setting.label}`}
          className={`toggle-switch relative inline-flex h-6 w-11 items-center rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
          } ${
            enabled
              ? isDark
                ? "bg-emerald-500 focus:ring-emerald-500/50 focus:ring-offset-[#202024]"
                : "bg-emerald-500 focus:ring-emerald-500/50 focus:ring-offset-white"
              : isDark
                ? "bg-zinc-700 focus:ring-zinc-500/50 focus:ring-offset-[#202024]"
                : "bg-zinc-300 focus:ring-zinc-400/50 focus:ring-offset-white"
          }`}
        >
          <span
            className={`toggle-thumb inline-block h-5 w-5 transform rounded-full bg-white shadow ${
              enabled ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      }
    />
  );
}

function TimezoneRow({
  setting,
  isDark,
}: {
  setting: TimezoneSetting;
  isDark: boolean;
}) {
  const value = useQuery(api.settings.get, { key: setting.key });
  const setSetting = useMutation(api.settings.set);
  const clearSetting = useMutation(api.settings.clear);

  const [draft, setDraft] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState<string>("");

  const loading = value === undefined;
  const stored = !loading && value !== null ? value : null;

  // Keep the input in sync when the stored value changes (e.g. agent updates
  // it from iMessage while the panel is open).
  useEffect(() => {
    if (!loading) setDraft(stored ?? "");
  }, [loading, stored]);

  // Render "now" in the saved zone (or the browser's, as a preview) so the
  // user can confirm they picked the right one.
  useEffect(() => {
    function tick() {
      const tz = stored ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
      try {
        const d = new Date();
        const fmt = new Intl.DateTimeFormat(undefined, {
          timeZone: tz,
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        });
        setNow(fmt.format(d));
      } catch {
        setNow("(invalid timezone)");
      }
    }
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [stored]);

  async function save(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Pick a timezone or clear to reset.");
      return;
    }
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: trimmed });
    } catch {
      setError(`"${trimmed}" isn't a recognized IANA timezone.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await setSetting({ key: setting.key, value: trimmed });
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setSaving(true);
    setError(null);
    try {
      await clearSetting({ key: setting.key });
      setDraft("");
    } finally {
      setSaving(false);
    }
  }

  const debugLine = `settings.${setting.key} = ${
    loading ? "…" : stored === null ? "(unset, falling back to server zone)" : `"${stored}"`
  }${now ? ` · now: ${now}` : ""}`;

  const inputBg = isDark
    ? "bg-[#17171a] border-white/10 text-zinc-100 placeholder:text-zinc-600"
    : "bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400";
  const btnBg = isDark
    ? "bg-zinc-100 text-zinc-950 hover:bg-white"
    : "bg-zinc-950 text-white hover:bg-zinc-800";
  const clearBtnBg = isDark
    ? "text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
    : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800";

  return (
    <SettingShell
      label={setting.label}
      description={setting.description}
      debugLine={debugLine}
      isDark={isDark}
      control={
        <div className="flex w-full flex-col items-end gap-2 lg:min-w-[380px]">
          <div className="flex items-center gap-2 w-full">
            <select
              value={
                COMMON_TIMEZONES.some((t) => t.value === draft) ? draft : ""
              }
              onChange={(e) => setDraft(e.target.value)}
              disabled={saving || loading}
              className={`flex-1 rounded-xl border px-3 py-2 text-xs outline-none transition-colors focus:border-zinc-400 ${inputBg}`}
            >
              <option value="">Pick a common zone</option>
              {COMMON_TIMEZONES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 w-full">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="or paste IANA ID e.g. America/Chicago"
              disabled={saving || loading}
              className={`min-w-0 flex-1 rounded-xl border px-3 py-2 text-xs outline-none transition-colors focus:border-zinc-400 mono ${inputBg}`}
            />
            <button
              onClick={() => save(draft)}
              disabled={saving || loading || draft.trim() === (stored ?? "")}
              className={`rounded-xl px-3 py-2 text-xs font-medium disabled:opacity-50 ${btnBg}`}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
          {stored !== null && (
            <button
              onClick={clear}
              disabled={saving || loading}
              className={`rounded-xl px-2.5 py-1.5 text-[11px] ${clearBtnBg}`}
            >
              Reset to server default
            </button>
          )}
          {error && <div className="text-[11px] text-rose-400">{error}</div>}
        </div>
      }
    />
  );
}
