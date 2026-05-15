import { useCallback, useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api.js";
import {
  RuntimeProviderBadge,
  RuntimeProviderLogo,
  type RuntimeProvider,
} from "../lib/branding.js";

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

const RUNTIME_SETTING_COUNT = SETTINGS.length + 1;

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
  { value: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
  { value: "gpt-5.2", label: "GPT-5.2" },
];

const CODEX_REASONING_EFFORTS: Option<ReasoningEffort>[] = [
  { value: "minimal", label: "Minimal" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "XHigh" },
];

// A short curated list for the dropdown — covers most US users plus a few
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
  const muted = isDark ? "text-slate-500" : "text-slate-400";

  return (
    <div className="flex flex-col h-full -m-5">
      <div
        className={`shrink-0 border-b px-5 py-3 flex items-center gap-3 ${
          isDark ? "border-slate-800" : "border-slate-200"
        }`}
      >
        <h2
          className={`text-xs font-semibold uppercase tracking-wider ${
            isDark ? "text-slate-500" : "text-slate-400"
          }`}
        >
          Agent Settings
        </h2>
        <span className={`text-xs mono ${muted}`}>
          {RUNTIME_SETTING_COUNT} setting(s)
        </span>
        <SettingsRuntimeBadge isDark={isDark} />
      </div>

      <div className="flex-1 overflow-y-auto debug-scroll p-5 space-y-3">
        <RuntimeRow isDark={isDark} />
        {SETTINGS.map((s) =>
          s.kind === "toggle" ? (
            <ToggleRow key={s.key} setting={s} isDark={isDark} />
          ) : (
            <TimezoneRow key={s.key} setting={s} isDark={isDark} />
          ),
        )}
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
      className="ml-auto"
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
  control: React.ReactNode;
  isDark: boolean;
}) {
  const cardBg = isDark
    ? "bg-slate-900/40 border-slate-800/60"
    : "bg-white border-slate-200";
  return (
    <div
      className={`border rounded-xl p-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:gap-6 fade-in ${cardBg}`}
    >
      <div className="min-w-0 flex-1">
        <div
          className={`text-sm font-medium ${
            isDark ? "text-slate-200" : "text-slate-800"
          }`}
        >
          {label}
        </div>
        <div
          className={`text-xs mt-1 leading-relaxed ${
            isDark ? "text-slate-400" : "text-slate-600"
          }`}
        >
          {description}
        </div>
        <div
          className={`text-[10px] mono mt-2 ${
            isDark ? "text-slate-600" : "text-slate-400"
          }`}
        >
          {debugLine}
        </div>
      </div>
      <div className="w-full sm:w-auto sm:shrink-0 flex justify-end">{control}</div>
    </div>
  );
}

function RuntimeRow({ isDark }: { isDark: boolean }) {
  const storedRuntime = useQuery(api.settings.get, { key: "runtime" });
  const storedClaudeModel = useQuery(api.settings.get, { key: "model" });
  const storedCodexModel = useQuery(api.settings.get, { key: "codex_model" });
  const storedCodexEffort = useQuery(api.settings.get, {
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
  }, [refreshServerConfig, storedRuntime, storedClaudeModel, storedCodexModel, storedCodexEffort]);

  const runtime: RuntimeChoice =
    storedRuntime === "claude" || storedRuntime === "codex"
      ? storedRuntime
      : serverConfig?.runtime ?? "claude";

  const activeModelOptions = runtime === "codex" ? CODEX_MODELS : CLAUDE_MODELS;
  const modelKey = runtime === "codex" ? "codex_model" : "model";
  const storedModel = runtime === "codex" ? storedCodexModel : storedClaudeModel;
  const firstModelValue = activeModelOptions[0]?.value ?? "";
  const serverModelFallback =
    serverConfig?.runtime === runtime ? serverConfig.model : firstModelValue;
  const modelFallback =
    serverConfig?.runtime === runtime
      ? optionValue(serverConfig.model, activeModelOptions, firstModelValue)
      : firstModelValue;
  const activeModel = optionValue(storedModel, activeModelOptions, modelFallback);
  const reasoningEffort = optionValue(
    storedCodexEffort,
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
        storedCodexEffort,
        serverConfig?.reasoningEffort ?? "medium",
      ),
    );
  }
  debugParts.push(`billing: ${serverConfig?.billingMode ?? "…"}`);

  const inputBg = isDark
    ? "bg-slate-900 border-slate-700 text-slate-200"
    : "bg-white border-slate-300 text-slate-800";
  const segmentBase = isDark
    ? "border-slate-700 bg-slate-900 text-slate-400"
    : "border-slate-300 bg-white text-slate-500";
  const segmentActive = isDark
    ? "bg-sky-500 text-white border-sky-500"
    : "bg-sky-600 text-white border-sky-600";

  return (
    <SettingShell
      label="AI provider"
      description="Choose the provider for new top-level turns. Running agents keep the provider and model they started with."
      debugLine={debugParts.join(" · ")}
      isDark={isDark}
      control={
        <div className="flex flex-col items-end gap-2 w-full min-w-0 sm:min-w-[340px]">
          <div
            className={`grid grid-cols-2 w-full rounded-md border p-0.5 ${segmentBase}`}
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
                  className={`inline-flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-[5px] transition-colors disabled:opacity-60 ${
                    active ? segmentActive : "hover:bg-slate-500/10"
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
                className={`text-[10px] uppercase tracking-wider ${
                  isDark ? "text-slate-500" : "text-slate-400"
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
                className={`text-xs px-2 py-1.5 border rounded-md w-full ${inputBg}`}
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
                className={`text-[10px] uppercase tracking-wider ${
                  isDark ? "text-slate-500" : "text-slate-400"
                }`}
              >
                Codex effort
              </span>
              <select
                value={reasoningEffort}
                disabled={
                  runtime !== "codex" ||
                  saving !== null ||
                  storedCodexEffort === undefined
                }
                onChange={(e) =>
                  savePatch(`codex_reasoning_effort:${e.target.value}`, {
                    runtime: "codex",
                    reasoningEffort: e.target.value as ReasoningEffort,
                  })
                }
                className={`text-xs px-2 py-1.5 border rounded-md w-full disabled:opacity-50 ${inputBg}`}
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
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
          } ${
            enabled
              ? isDark
                ? "bg-emerald-500 focus:ring-emerald-500/50 focus:ring-offset-slate-950"
                : "bg-emerald-500 focus:ring-emerald-500/50 focus:ring-offset-white"
              : isDark
                ? "bg-slate-700 focus:ring-slate-500/50 focus:ring-offset-slate-950"
                : "bg-slate-300 focus:ring-slate-400/50 focus:ring-offset-white"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
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
    ? "bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-600"
    : "bg-white border-slate-300 text-slate-800 placeholder:text-slate-400";
  const btnBg = isDark
    ? "bg-sky-600 hover:bg-sky-500 text-white"
    : "bg-sky-600 hover:bg-sky-500 text-white";
  const clearBtnBg = isDark
    ? "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
    : "text-slate-500 hover:text-slate-700 hover:bg-slate-100";

  return (
    <SettingShell
      label={setting.label}
      description={setting.description}
      debugLine={debugLine}
      isDark={isDark}
      control={
        <div className="flex flex-col items-end gap-2 min-w-[260px]">
          <div className="flex items-center gap-2 w-full">
            <select
              value={
                COMMON_TIMEZONES.some((t) => t.value === draft) ? draft : ""
              }
              onChange={(e) => setDraft(e.target.value)}
              disabled={saving || loading}
              className={`text-xs px-2 py-1.5 border rounded-md flex-1 ${inputBg}`}
            >
              <option value="">— pick a common zone —</option>
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
              className={`text-xs px-2 py-1.5 border rounded-md flex-1 mono ${inputBg}`}
            />
            <button
              onClick={() => save(draft)}
              disabled={saving || loading || draft.trim() === (stored ?? "")}
              className={`text-xs px-3 py-1.5 rounded-md disabled:opacity-50 ${btnBg}`}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
          {stored !== null && (
            <button
              onClick={clear}
              disabled={saving || loading}
              className={`text-[11px] px-2 py-1 rounded-md ${clearBtnBg}`}
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
