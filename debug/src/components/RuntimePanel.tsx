import { useEffect, useMemo, useState } from "react";

type RuntimeName = "claude" | "codex" | "openai";
type RuntimeReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";

interface RuntimePayload {
  runtime: RuntimeName;
  model: string;
  reasoningEffort?: RuntimeReasoningEffort;
  availableRuntimes: RuntimeName[];
  availableModels: Record<RuntimeName, string[]>;
  availableReasoningEfforts: Record<RuntimeName, RuntimeReasoningEffort[]>;
  pricing: {
    current: RuntimePricingStatus;
    byModel: Record<RuntimeName, Record<string, RuntimePricingStatus>>;
  };
  status: {
    claude: { configured: boolean; note: string };
    codex: { configured: boolean; installed: boolean; note: string };
    openai: { configured: boolean; apiKeyPresent: boolean; note: string };
  };
}

interface RuntimePricingStatus {
  mode: "api" | "api-equivalent" | "provider-reported";
  priced: boolean;
  label: string;
  note: string;
  source?: string;
}

const RUNTIME_LABELS: Record<RuntimeName, string> = {
  claude: "Claude",
  codex: "Codex",
  openai: "OpenAI API",
};

const RUNTIME_SUBCOPY: Record<RuntimeName, string> = {
  claude: "Default. Uses Claude Code sign-in or ANTHROPIC_API_KEY.",
  codex: "Uses local codex app-server and your signed-in Codex session.",
  openai: "Uses OPENAI_API_KEY through the OpenAI Responses API.",
};

export function RuntimePanel({ isDark }: { isDark: boolean }) {
  const [data, setData] = useState<RuntimePayload | null>(null);
  const [runtime, setRuntime] = useState<RuntimeName>("claude");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [reasoningEffort, setReasoningEffort] = useState<RuntimeReasoningEffort>("medium");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const colors = isDark
    ? {
        card: "bg-slate-900/60 border-slate-800",
        label: "text-slate-500",
        value: "text-slate-100",
        sub: "text-slate-400",
        control: "bg-slate-950 border-slate-700 text-slate-100",
        muted: "text-slate-500",
        chip: "bg-sky-500/10 text-sky-300 border-sky-500/20",
      }
    : {
        card: "bg-white border-slate-200",
        label: "text-slate-500",
        value: "text-slate-900",
        sub: "text-slate-600",
        control: "bg-white border-slate-200 text-slate-900",
        muted: "text-slate-500",
        chip: "bg-sky-50 text-sky-700 border-sky-200",
      };

  async function refresh() {
    setError(null);
    try {
      const response = await fetch("/api/runtime");
      if (!response.ok) throw new Error(await response.text());
      const payload = (await response.json()) as RuntimePayload;
      setData(payload);
      setRuntime(payload.runtime);
      setModel(payload.model);
      setReasoningEffort(payload.reasoningEffort ?? "medium");
      window.dispatchEvent(new Event("boop-runtime-updated"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const modelOptions = useMemo(() => data?.availableModels[runtime] ?? [], [data, runtime]);
  const effortOptions = useMemo(
    () => data?.availableReasoningEfforts[runtime] ?? [],
    [data, runtime],
  );
  const selectedStatus = data?.status[runtime];
  const hasCurrentModel = modelOptions.includes(model);
  const hasCurrentEffort = effortOptions.includes(reasoningEffort);
  const effectiveModel = hasCurrentModel ? model : modelOptions[0] ?? model;
  const effectiveReasoningEffort = hasCurrentEffort
    ? reasoningEffort
    : effortOptions.includes("medium")
      ? "medium"
      : effortOptions[0] ?? "medium";
  const selectedPricing = data?.pricing?.byModel[runtime]?.[effectiveModel] ?? data?.pricing?.current;
  const hasPendingChanges = Boolean(
    data &&
      (runtime !== data.runtime ||
        effectiveModel !== data.model ||
        (effortOptions.length > 0 && effectiveReasoningEffort !== (data.reasoningEffort ?? "medium"))),
  );

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/runtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runtime,
          model: effectiveModel,
          reasoningEffort: effectiveReasoningEffort,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      const payload = (await response.json()) as RuntimePayload;
      setData(payload);
      setRuntime(payload.runtime);
      setModel(payload.model);
      setReasoningEffort(payload.reasoningEffort ?? "medium");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function onRuntimeChange(next: RuntimeName) {
    setRuntime(next);
    const nextModels = data?.availableModels[next] ?? [];
    if (nextModels.length) setModel(nextModels[0]);
    const nextEfforts = data?.availableReasoningEfforts[next] ?? [];
    setReasoningEffort(nextEfforts.includes("medium") ? "medium" : nextEfforts[0] ?? "medium");
  }

  function modelOptionLabel(name: string): string {
    const pricing = data?.pricing?.byModel[runtime]?.[name];
    if (!pricing || pricing.mode === "provider-reported") return name;
    return `${name} - ${pricing.priced ? pricing.label : "not priced"}`;
  }

  return (
    <div className={`rounded-xl border p-4 ${colors.card}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${colors.label}`}>
            Runtime
          </div>
          <div className={`mt-1 flex flex-wrap items-center gap-2 text-sm ${colors.value}`}>
            <span className="font-semibold">{data ? RUNTIME_LABELS[data.runtime] : "Loading runtime"}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${colors.chip}`}>
              {data?.model ?? "..."}
            </span>
            {data?.reasoningEffort && (
              <span className={`rounded-full border px-2 py-0.5 text-[11px] ${colors.chip}`}>
                effort {data.reasoningEffort}
              </span>
            )}
            {data?.pricing?.current && data.pricing.current.mode !== "provider-reported" && (
              <span className={`rounded-full border px-2 py-0.5 text-[11px] ${colors.chip}`}>
                {data.pricing.current.priced ? "API-priced" : "not priced"}
              </span>
            )}
          </div>
          <p className={`mt-1 max-w-2xl text-xs ${colors.sub}`}>
            {data ? RUNTIME_SUBCOPY[runtime] : "Reading saved provider settings..."} Tools, memory, drafts, and integrations stay shared.
          </p>
        </div>

        {data ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[150px_220px_130px_auto]">
          <select
            value={runtime}
            onChange={(event) => onRuntimeChange(event.target.value as RuntimeName)}
            className={`h-9 rounded-lg border px-2 text-xs outline-none ${colors.control}`}
          >
            {(data?.availableRuntimes ?? (["claude", "codex", "openai"] as RuntimeName[])).map((name) => (
              <option key={name} value={name}>
                {RUNTIME_LABELS[name]}
              </option>
            ))}
          </select>
          <select
            value={effectiveModel}
            onChange={(event) => setModel(event.target.value)}
            className={`h-9 rounded-lg border px-2 text-xs outline-none ${colors.control}`}
            disabled={!modelOptions.length}
          >
            {(modelOptions.length ? modelOptions : [model]).map((name) => (
              <option key={name} value={name}>
                {modelOptionLabel(name)}
              </option>
            ))}
          </select>
          <select
            value={effectiveReasoningEffort}
            onChange={(event) => setReasoningEffort(event.target.value as RuntimeReasoningEffort)}
            className={`h-9 rounded-lg border px-2 text-xs outline-none ${colors.control}`}
            disabled={!effortOptions.length}
          >
            {(effortOptions.length ? effortOptions : ["medium"]).map((name) => (
              <option key={name} value={name}>
                {effortOptions.length ? `effort ${name}` : "default effort"}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={save}
            disabled={saving || !hasPendingChanges}
            className={`h-9 rounded-lg px-3 text-xs font-semibold transition-colors ${
              isDark
                ? "bg-sky-500 text-white hover:bg-sky-400 disabled:bg-slate-800 disabled:text-slate-500"
                : "bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-200 disabled:text-slate-500"
            }`}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
        ) : (
          <div className={`h-9 min-w-72 rounded-lg border px-3 flex items-center text-xs ${colors.control}`}>
            Loading saved runtime...
          </div>
        )}
      </div>

      <div className={`mt-3 flex flex-wrap items-center gap-2 text-[11px] ${colors.muted}`}>
        <span>
          {selectedStatus?.configured ? "Ready" : runtime === "claude" ? "Check local sign-in" : "Needs setup"}
        </span>
        <span>|</span>
        <span>{selectedStatus?.note ?? "Loading runtime status..."}</span>
        {selectedPricing && (
          <>
            <span>|</span>
            <span>{selectedPricing.note}</span>
          </>
        )}
        {error && (
          <>
            <span>|</span>
            <span className={isDark ? "text-rose-300" : "text-rose-600"}>{error}</span>
          </>
        )}
      </div>
    </div>
  );
}
