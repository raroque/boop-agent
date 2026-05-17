import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Activity01Icon,
  AiBrain02Icon,
  ArrowShrink02Icon,
  CheckmarkCircle02Icon,
  DashboardSquare01Icon,
  InformationCircleIcon,
  MachineRobotIcon,
  WorkflowCircle03Icon,
} from "@hugeicons/core-free-icons";
import { api } from "../../../convex/_generated/api.js";

type TimeRange = "all" | "7d" | "30d" | "90d";

type DashboardSurface = {
  page: string;
  panel: string;
  tile: string;
  label: string;
  value: string;
  sub: string;
  heading: string;
  border: string;
  divider: string;
  segment: string;
  segmentActive: string;
  segmentInactive: string;
  iconBox: string;
};

type DailyBucket = {
  day: string;
  agentCost: number;
  inputTokens: number;
  outputTokens: number;
  agentsSpawned: number;
  agentsCompleted: number;
  agentsFailed: number;
  agentsCancelled: number;
  automationRuns: number;
};

type DashboardMetrics = {
  messages: number;
  memories: {
    total: number;
    shortTerm: number;
    longTerm: number;
    permanent: number;
  };
  agents: {
    total: number;
    completed: number;
    failed: number;
    cancelled: number;
    running: number;
  };
  cost: {
    total: number;
  };
  tokens: {
    input: number;
    output: number;
  };
  dailyBuckets: DailyBucket[];
  truncated: boolean;
  scanLimit: number;
};

const RANGES: { id: TimeRange; label: string }[] = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "all", label: "All time" },
];

function cutoffDate(range: TimeRange): string | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function plural(n: number, singular: string, pluralLabel = `${singular}s`) {
  return `${fmt(n)} ${n === 1 ? singular : pluralLabel}`;
}

export function DashboardPanel({ isDark }: { isDark: boolean }) {
  const data = useQuery(api.dashboard.metrics, {}) as DashboardMetrics | undefined;
  const [range, setRange] = useState<TimeRange>("all");

  const filtered = useMemo(() => {
    if (!data) return null;
    const cutoff = cutoffDate(range);
    const days = cutoff
      ? data.dailyBuckets.filter((d) => d.day >= cutoff)
      : data.dailyBuckets;

    let agentCost = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let agentsSpawned = 0;
    let agentsCompleted = 0;
    let agentsFailed = 0;
    let agentsCancelled = 0;
    let automationRuns = 0;

    for (const d of days) {
      agentCost += d.agentCost;
      inputTokens += d.inputTokens;
      outputTokens += d.outputTokens;
      agentsSpawned += d.agentsSpawned;
      agentsCompleted += d.agentsCompleted;
      agentsFailed += d.agentsFailed;
      agentsCancelled += d.agentsCancelled;
      automationRuns += d.automationRuns;
    }

    const totalTokens = inputTokens + outputTokens;
    return {
      days,
      cost: { total: agentCost, agents: agentCost },
      tokens: { input: inputTokens, output: outputTokens, total: totalTokens },
      agents: {
        total: agentsSpawned,
        completed: agentsCompleted,
        failed: agentsFailed,
        cancelled: agentsCancelled,
        failureRate: agentsSpawned > 0 ? agentsFailed / agentsSpawned : 0,
      },
      automationRuns,
    };
  }, [data, range]);

  if (!data || !filtered) {
    return (
      <div
        className={`flex items-center justify-center h-full ${
          isDark ? "text-slate-500" : "text-slate-400"
        }`}
      >
        Loading dashboard...
      </div>
    );
  }

  const c: DashboardSurface = isDark
    ? {
        page: "bg-[#18181b]",
        panel: "bg-[#1d1d20] border-white/10",
        tile: "bg-[#1d1d20] border-white/10",
        label: "text-zinc-500",
        value: "text-zinc-100",
        sub: "text-zinc-400",
        heading: "text-zinc-100",
        border: "border-white/10",
        divider: "divide-white/10",
        segment: "border-white/10 bg-black/30",
        segmentActive: "bg-zinc-100 text-zinc-950",
        segmentInactive: "text-zinc-500 hover:text-zinc-200",
        iconBox: "bg-zinc-800/80 text-zinc-300 border-white/10",
      }
    : {
        page: "bg-[#fbfbfa]",
        panel: "bg-white border-zinc-200",
        tile: "bg-white border-zinc-200",
        label: "text-zinc-500",
        value: "text-zinc-950",
        sub: "text-zinc-600",
        heading: "text-zinc-950",
        border: "border-zinc-200",
        divider: "divide-zinc-200",
        segment: "border-zinc-200 bg-zinc-100",
        segmentActive: "bg-white text-zinc-950 shadow-sm",
        segmentInactive: "text-zinc-500 hover:text-zinc-900",
        iconBox: "bg-zinc-100 text-zinc-700 border-zinc-200",
      };

  const rangeLabel = RANGES.find((r) => r.id === range)?.label ?? "All time";
  const failPctNumber = filtered.agents.failureRate * 100;
  const failPct = failPctNumber.toFixed(1);
  const completionRate =
    filtered.agents.total > 0 ? filtered.agents.completed / filtered.agents.total : 0;
  return (
    <div className={`min-h-full ${c.page}`}>
      <div className="mx-auto max-w-[1440px] space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className={`text-[11px] font-medium uppercase ${c.label}`}>
              Operations
            </div>
            <h2 className={`mt-1 text-[22px] font-semibold ${c.heading}`}>
              Debug dashboard
            </h2>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {data.truncated && (
              <StatusPill
                label={`Latest ${fmt(data.scanLimit)} rows`}
                tone="amber"
                isDark={isDark}
              />
            )}
            <RangePicker value={range} onChange={setRange} c={c} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.85fr)]">
          <section className={`overflow-hidden rounded-2xl border ${c.panel}`}>
            <PanelHeader
              icon={Activity01Icon}
              title="Usage"
              meta={`${rangeLabel} window`}
              c={c}
            />
            <div
              className={`grid divide-y ${c.divider} md:grid-cols-3 md:divide-x md:divide-y-0`}
            >
              <SummaryCell
                label="Estimated cost"
                value={`$${filtered.cost.total.toFixed(2)}`}
                c={c}
              />
              <SummaryCell label="Total tokens" value={fmtTokens(filtered.tokens.total)} c={c} />
              <SummaryCell label="Active days" value={fmt(filtered.days.length)} c={c} />
            </div>
            <div className="p-4">
              {filtered.days.length > 1 ? (
                <StackedAreaChart
                  data={filtered.days}
                  keys={["agentCost"]}
                  colors={isDark ? ["#38bdf8"] : ["#0284c7"]}
                  labels={["LLM usage"]}
                  format={(v) => `$${v.toFixed(2)}`}
                  isDark={isDark}
                />
              ) : (
                <EmptyTrend c={c} label="Cost trend appears after two active days." />
              )}
            </div>
          </section>

          <section className={`overflow-hidden rounded-2xl border ${c.panel}`}>
            <PanelHeader
              icon={MachineRobotIcon}
              title="Agent health"
              meta={`${fmt(data.agents.running)} running`}
              c={c}
            />
            <div className="p-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className={`text-[11px] font-medium uppercase ${c.label}`}>
                    Failure rate
                  </div>
                  <div
                    className={`mt-1 mono text-4xl font-semibold ${
                      failPctNumber > 20
                        ? isDark
                          ? "text-rose-400"
                          : "text-rose-600"
                        : c.value
                    }`}
                  >
                    {failPct}%
                  </div>
                </div>
                <div className={`text-right text-xs ${c.sub}`}>
                  <div>{plural(filtered.agents.total, "agent")} spawned</div>
                  <div>{plural(filtered.automationRuns, "automation run")}</div>
                </div>
              </div>

              <div className={`mt-5 border-t pt-4 ${c.border}`}>
                <div className="space-y-2.5">
                  <BarRow
                    label="completed"
                    value={filtered.agents.completed}
                    total={filtered.agents.total}
                    color={isDark ? "bg-emerald-500" : "bg-emerald-600"}
                    isDark={isDark}
                    format={String}
                  />
                  <BarRow
                    label="failed"
                    value={filtered.agents.failed}
                    total={filtered.agents.total}
                    color={isDark ? "bg-rose-500" : "bg-rose-600"}
                    isDark={isDark}
                    format={String}
                  />
                  <BarRow
                    label="cancelled"
                    value={filtered.agents.cancelled}
                    total={filtered.agents.total}
                    color={isDark ? "bg-slate-500" : "bg-slate-400"}
                    isDark={isDark}
                    format={String}
                  />
                </div>
              </div>

              <div className={`mt-4 border-t pt-4 ${c.border}`}>
                <div className="flex items-center justify-between text-xs">
                  <span className={c.sub}>Completion rate</span>
                  <span className={`mono font-semibold ${c.value}`}>
                    {(completionRate * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            label="Messages"
            value={fmt(data.messages)}
            sub="conversation rows"
            icon={DashboardSquare01Icon}
            c={c}
          />
          <MetricTile
            label="Memories"
            value={fmt(data.memories.total)}
            sub={`${fmt(data.memories.shortTerm)} short / ${fmt(
              data.memories.longTerm,
            )} long / ${fmt(data.memories.permanent)} perm`}
            icon={AiBrain02Icon}
            c={c}
          />
          <MetricTile
            label="Agents"
            value={fmt(filtered.agents.total)}
            sub={`${fmt(data.agents.running)} running now`}
            icon={MachineRobotIcon}
            c={c}
          />
          <MetricTile
            label="Estimated cost"
            value={`$${filtered.cost.total.toFixed(2)}`}
            sub="API-equivalent spend"
            icon={WorkflowCircle03Icon}
            color={isDark ? "text-emerald-400" : "text-emerald-600"}
            c={c}
            isDark={isDark}
            info={{
              title: "Estimated/API-equivalent cost",
              body: (
                <>
                  <p className="mb-1.5">
                    Claude rows use SDK-reported cost when available. Codex rows are
                    estimated from token counts and configured token pricing.
                  </p>
                  <p>
                    Subscription-backed runtimes still bill through the subscription,
                    so treat this as a usage proxy.
                  </p>
                </>
              ),
            }}
          />
          <MetricTile
            label="Tokens"
            value={fmtTokens(filtered.tokens.total)}
            sub={`${fmtTokens(filtered.tokens.input)} in / ${fmtTokens(filtered.tokens.output)} out`}
            icon={ArrowShrink02Icon}
            c={c}
          />
          <MetricTile
            label="Failure rate"
            value={`${failPct}%`}
            sub={`${filtered.agents.failed} of ${filtered.agents.total}`}
            icon={Activity01Icon}
            color={
              failPctNumber > 20
                ? isDark
                  ? "text-rose-400"
                  : "text-rose-600"
                : undefined
            }
            c={c}
          />
          <MetricTile
            label="Automations"
            value={fmt(filtered.automationRuns)}
            sub={`${rangeLabel} runs`}
            icon={WorkflowCircle03Icon}
            c={c}
          />
          <MetricTile
            label="Completion"
            value={`${(completionRate * 100).toFixed(1)}%`}
            sub={`${fmt(filtered.agents.completed)} completed`}
            icon={CheckmarkCircle02Icon}
            c={c}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <section className={`overflow-hidden rounded-2xl border ${c.panel}`}>
            <PanelHeader
              icon={ArrowShrink02Icon}
              title="Token usage"
              meta={`${fmtTokens(filtered.tokens.input)} input / ${fmtTokens(
                filtered.tokens.output,
              )} output`}
              c={c}
            />
            <div className="p-4">
              {filtered.days.length > 1 ? (
                <StackedAreaChart
                  data={filtered.days}
                  keys={["inputTokens", "outputTokens"]}
                  colors={isDark ? ["#38bdf8", "#34d399"] : ["#0284c7", "#059669"]}
                  labels={["Input", "Output"]}
                  format={fmtTokens}
                  isDark={isDark}
                />
              ) : (
                <EmptyTrend c={c} label="Token trend appears after two active days." />
              )}
            </div>
          </section>

          <section className={`overflow-hidden rounded-2xl border ${c.panel}`}>
            <PanelHeader icon={AiBrain02Icon} title="Breakdown" meta="Current range" c={c} />
            <div className="p-4 space-y-4">
              <div className="space-y-2.5">
                <BarRow
                  label="Input"
                  value={filtered.tokens.input}
                  total={filtered.tokens.total}
                  color={isDark ? "bg-sky-500" : "bg-sky-600"}
                  isDark={isDark}
                  format={fmtTokens}
                />
                <BarRow
                  label="Output"
                  value={filtered.tokens.output}
                  total={filtered.tokens.total}
                  color={isDark ? "bg-emerald-500" : "bg-emerald-600"}
                  isDark={isDark}
                  format={fmtTokens}
                />
              </div>

              <div className={`grid grid-cols-2 gap-3 border-t pt-4 ${c.border}`}>
                <MiniFact label="Messages" value={fmt(data.messages)} c={c} />
                <MiniFact label="Memories" value={fmt(data.memories.total)} c={c} />
                <MiniFact label="Automations" value={fmt(filtered.automationRuns)} c={c} />
                <MiniFact label="Completed" value={fmt(filtered.agents.completed)} c={c} />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function RangePicker({
  value,
  onChange,
  c,
}: {
  value: TimeRange;
  onChange: (value: TimeRange) => void;
  c: DashboardSurface;
}) {
  return (
    <div
      className={`segmented-control inline-flex h-9 items-center rounded-2xl border p-0.5 text-xs ${c.segment}`}
    >
      {RANGES.map((r) => (
        <button
          key={r.id}
          onClick={() => onChange(r.id)}
          className={`segmented-button h-7 min-w-[64px] rounded-xl px-2.5 ${
            value === r.id ? c.segmentActive : c.segmentInactive
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

function StatusPill({
  label,
  tone,
  isDark,
}: {
  label: string;
  tone: "emerald" | "amber" | "slate";
  isDark: boolean;
}) {
  const toneClass =
    tone === "emerald"
      ? isDark
        ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
        : "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "amber"
        ? isDark
          ? "border-amber-400/20 bg-amber-400/10 text-amber-300"
          : "border-amber-200 bg-amber-50 text-amber-700"
        : isDark
          ? "border-white/10 bg-white/5 text-slate-400"
          : "border-slate-200 bg-white text-slate-600";

  return (
    <div
      className={`inline-flex h-9 items-center rounded-2xl border px-3 text-xs ${toneClass}`}
    >
      {label}
    </div>
  );
}

function PanelHeader({
  icon,
  title,
  meta,
  c,
}: {
  icon: any;
  title: string;
  meta: string;
  c: DashboardSurface;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 border-b px-4 py-3 ${c.border}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${c.iconBox}`}
        >
          <HugeiconsIcon icon={icon} size={17} />
        </div>
        <div className="min-w-0">
          <h3 className={`truncate text-sm font-semibold ${c.heading}`}>{title}</h3>
          <div className={`truncate text-xs ${c.sub}`}>{meta}</div>
        </div>
      </div>
    </div>
  );
}

function SummaryCell({
  label,
  value,
  c,
}: {
  label: string;
  value: string;
  c: DashboardSurface;
}) {
  return (
    <div className="px-4 py-3">
      <div className={`text-[11px] font-medium uppercase ${c.label}`}>
        {label}
      </div>
      <div className={`mt-1 mono text-2xl font-semibold ${c.value}`}>{value}</div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  sub,
  icon,
  color,
  info,
  c,
  isDark,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: any;
  color?: string;
  info?: { title: string; body: ReactNode };
  c: DashboardSurface;
  isDark?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div className={`relative min-h-[118px] rounded-2xl border p-4 ${c.tile}`}>
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${c.iconBox}`}
        >
          <HugeiconsIcon icon={icon} size={17} />
        </div>
        {info && (
          <div className="relative" ref={popRef}>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={`What does ${label} mean?`}
              aria-expanded={open}
              className={`inline-flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
                isDark
                  ? "border-slate-700 text-slate-500 hover:border-sky-400 hover:text-sky-400"
                  : "border-slate-300 text-slate-500 hover:border-sky-500 hover:text-sky-600"
              }`}
            >
              <HugeiconsIcon icon={InformationCircleIcon} size={13} />
            </button>
            {open && (
              <div
                role="dialog"
                aria-label={info.title}
                className={`pop-in absolute right-0 z-30 mt-1.5 w-64 rounded-2xl border px-3 py-2.5 text-[11px] leading-snug shadow-lg ${
                  isDark
                    ? "border-slate-700 bg-slate-900 text-slate-200"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                <div className={`mb-1 font-semibold ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                  {info.title}
                </div>
                <div className="font-normal">{info.body}</div>
              </div>
            )}
          </div>
        )}
      </div>
      <div className={`mt-4 text-[11px] font-medium uppercase ${c.label}`}>
        {label}
      </div>
      <div className={`mt-1 mono text-2xl font-semibold ${color ?? c.value}`}>{value}</div>
      {sub && <div className={`mt-1 truncate text-xs ${c.sub}`}>{sub}</div>}
    </div>
  );
}

function MiniFact({ label, value, c }: { label: string; value: string; c: DashboardSurface }) {
  return (
    <div>
      <div className={`text-[11px] font-medium uppercase ${c.label}`}>
        {label}
      </div>
      <div className={`mt-1 mono text-lg font-semibold ${c.value}`}>{value}</div>
    </div>
  );
}

function EmptyTrend({ label, c }: { label: string; c: DashboardSurface }) {
  return (
    <div className={`flex h-[220px] items-center justify-center text-xs ${c.sub}`}>
      {label}
    </div>
  );
}

function BarRow({
  label,
  value,
  total,
  color,
  isDark,
  format,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
  isDark: boolean;
  format?: (v: number) => string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  const display = format ? format(value) : `$${value.toFixed(2)}`;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={`w-24 truncate capitalize ${
          isDark ? "text-slate-400" : "text-slate-600"
        }`}
      >
        {label}
      </span>
      <div
        className={`flex-1 h-2 rounded-full overflow-hidden ${
          isDark ? "bg-slate-800" : "bg-slate-100"
        }`}
      >
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: value > 0 ? `${Math.max(pct, 1)}%` : "0%" }}
        />
      </div>
      <span
        className={`w-16 text-right mono font-medium ${
          isDark ? "text-slate-300" : "text-slate-700"
        }`}
      >
        {display}
      </span>
    </div>
  );
}

function StackedAreaChart({
  data,
  keys,
  colors,
  labels,
  format,
  isDark,
}: {
  data: Record<string, any>[];
  keys: string[];
  colors: string[];
  labels: string[];
  format: (v: number) => string;
  isDark: boolean;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  if (data.length < 2) return null;

  const W = 800;
  const H = 180;
  const PL = 55;
  const PR = 16;
  const PT = 8;
  const PB = 28;
  const chartW = W - PL - PR;
  const chartH = H - PT - PB;

  const stacked = data.map((d) => {
    let cum = 0;
    const layers: number[] = [];
    const raw: number[] = [];
    for (const k of keys) {
      const v = d[k] ?? 0;
      raw.push(v);
      cum += v;
      layers.push(cum);
    }
    return { day: d.day as string, layers, raw, total: cum };
  });

  const maxVal = Math.max(...stacked.map((d) => d.total), 0.01);
  const x = (i: number) => PL + (i / (data.length - 1)) * chartW;
  const y = (v: number) => PT + chartH - (v / maxVal) * chartH;
  const yTicks = [0, maxVal * 0.5, maxVal];

  const areaPaths: string[] = [];
  for (let k = keys.length - 1; k >= 0; k--) {
    const topPoints = stacked.map((d, i) => `${x(i)},${y(d.layers[k])}`).join(" L");
    const bottomLayer =
      k > 0
        ? stacked
            .map((d, i) => `${x(i)},${y(d.layers[k - 1])}`)
            .reverse()
            .join(" L")
        : stacked
            .map((_, i) => `${x(i)},${y(0)}`)
            .reverse()
            .join(" L");
    areaPaths.push(`M${topPoints} L${bottomLayer} Z`);
  }

  const step = Math.max(1, Math.floor(data.length / 6));
  const xLabels: { i: number; label: string }[] = [];
  for (let i = 0; i < data.length; i += step)
    xLabels.push({ i, label: (data[i].day as string).slice(5) });
  if (xLabels[xLabels.length - 1]?.i !== data.length - 1) {
    xLabels.push({
      i: data.length - 1,
      label: (data[data.length - 1].day as string).slice(5),
    });
  }

  const gridColor = isDark ? "#1e293b" : "#e2e8f0";
  const textColor = isDark ? "#64748b" : "#94a3b8";
  const crosshair = isDark ? "#475569" : "#cbd5e1";

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * W;
      const chartX = mouseX - PL;
      if (chartX < 0 || chartX > chartW) {
        setHoverIdx(null);
        return;
      }
      const idx = Math.round((chartX / chartW) * (data.length - 1));
      setHoverIdx(Math.max(0, Math.min(data.length - 1, idx)));
    },
    [data.length, chartW],
  );

  const hovered = hoverIdx !== null ? stacked[hoverIdx] : null;
  const tooltipLeft = hoverIdx !== null ? (x(hoverIdx) / W) * 100 : 0;
  const flipTooltip = hoverIdx !== null && tooltipLeft > 65;

  return (
    <div ref={containerRef} className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} stroke={gridColor} strokeWidth={1} />
            <text
              x={PL - 6}
              y={y(v) + 3.5}
              textAnchor="end"
              fill={textColor}
              fontSize={10}
              fontFamily="'Geist Mono', ui-monospace, SFMono-Regular, monospace"
            >
              {format(v)}
            </text>
          </g>
        ))}

        {areaPaths.map((path, i) => (
          <path key={i} d={path} fill={colors[i]} opacity={0.35} />
        ))}

        {keys.map((_, k) => {
          const linePoints = stacked
            .map((d, i) => `${x(i)},${y(d.layers[k])}`)
            .join(" L");
          return (
            <path
              key={k}
              d={`M${linePoints}`}
              fill="none"
              stroke={colors[k]}
              strokeWidth={1.5}
            />
          );
        })}

        {xLabels.map(({ i, label }) => (
          <text
            key={i}
            x={x(i)}
            y={H - 4}
            textAnchor="middle"
            fill={textColor}
            fontSize={10}
            fontFamily="'Geist Mono', ui-monospace, SFMono-Regular, monospace"
          >
            {label}
          </text>
        ))}

        {hoverIdx !== null && hovered && (
          <>
            <line
              x1={x(hoverIdx)}
              x2={x(hoverIdx)}
              y1={PT}
              y2={PT + chartH}
              stroke={crosshair}
              strokeWidth={1}
              strokeDasharray="3,3"
            />
            {keys.map((_, k) => (
              <circle
                key={k}
                cx={x(hoverIdx)}
                cy={y(hovered.layers[k])}
                r={3.5}
                fill={colors[k]}
                stroke={isDark ? "#0f172a" : "#ffffff"}
                strokeWidth={1.5}
              />
            ))}
          </>
        )}
      </svg>

      {hoverIdx !== null && hovered && (
        <div
          className={`absolute pointer-events-none rounded-2xl border px-3 py-2 shadow-lg text-xs z-10 ${
            isDark
              ? "bg-slate-800 border-slate-700 text-slate-200"
              : "bg-white border-slate-200 text-slate-800"
          }`}
          style={{
            top: 4,
            left: flipTooltip ? undefined : `calc(${tooltipLeft}% + 12px)`,
            right: flipTooltip ? `calc(${100 - tooltipLeft}% + 12px)` : undefined,
          }}
        >
          <div
            className={`font-semibold mb-1.5 ${
              isDark ? "text-slate-300" : "text-slate-700"
            }`}
          >
            {hovered.day}
          </div>
          {keys.map((_, k) => (
            <div key={k} className="flex items-center gap-2 py-0.5">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: colors[k] }}
              />
              <span className={isDark ? "text-slate-400" : "text-slate-500"}>
                {labels[k]}
              </span>
              <span className="ml-auto mono font-medium pl-3">
                {format(hovered.raw[k])}
              </span>
            </div>
          ))}
          <div
            className={`border-t mt-1.5 pt-1.5 flex justify-between font-semibold ${
              isDark ? "border-slate-700" : "border-slate-200"
            }`}
          >
            <span>Total</span>
            <span className="mono">{format(hovered.total)}</span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 mt-2 ml-14">
        {labels.map((l, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[11px]">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: colors[i] }}
            />
            <span className={isDark ? "text-slate-400" : "text-slate-600"}>
              {l}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
