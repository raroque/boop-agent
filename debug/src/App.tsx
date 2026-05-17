import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  MachineRobotIcon,
  AiBrain02Icon,
  WorkflowCircle03Icon,
  Activity01Icon,
  Link04Icon,
  DashboardSquare01Icon,
  ArrowShrink02Icon,
  Settings01Icon,
  Moon02Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons";
import { api } from "../../convex/_generated/api.js";
import { useSocket } from "./lib/useSocket.js";
import { DashboardPanel } from "./components/DashboardPanel.js";
import { AgentsPanel } from "./components/AgentsPanel.js";
import { AutomationsPanel } from "./components/AutomationsPanel.js";
import { MemoryPanel } from "./components/MemoryPanel.js";
import { EventsPanel } from "./components/EventsPanel.js";
import { ConnectionsPanel } from "./components/ConnectionsPanel.js";
import { ConsolidationPanel } from "./components/ConsolidationPanel.js";
import { SettingsPanel } from "./components/SettingsPanel.js";
import { ChangelogDrawer } from "./components/ChangelogDrawer.js";
import { RuntimeProviderLogo, type RuntimeProvider } from "./lib/branding.js";
import boopGif from "../../assets/boop.gif";

type View =
  | "dashboard"
  | "agents"
  | "automations"
  | "memory"
  | "events"
  | "consolidation"
  | "connections"
  | "settings";

type Theme = "dark" | "light";

interface RuntimeConfigSnapshot {
  runtime: RuntimeProvider;
  model: string;
}

interface MemoryTierCounts {
  short: number;
  long: number;
  permanent: number;
}

interface AgentSummary {
  status: string;
}

const NAV_ICONS: Record<View, any> = {
  dashboard: DashboardSquare01Icon,
  agents: MachineRobotIcon,
  automations: WorkflowCircle03Icon,
  memory: AiBrain02Icon,
  events: Activity01Icon,
  consolidation: ArrowShrink02Icon,
  connections: Link04Icon,
  settings: Settings01Icon,
};

const NAV: { id: View; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "agents", label: "Agents" },
  { id: "automations", label: "Automations" },
  { id: "memory", label: "Memory" },
  { id: "events", label: "Events" },
  { id: "consolidation", label: "Consolidation" },
  { id: "connections", label: "Connections" },
  { id: "settings", label: "Settings" },
];

function getStoredTheme(): Theme {
  try {
    return (localStorage.getItem("boop-debug-theme") as Theme) || "dark";
  } catch {
    return "dark";
  }
}

export function App() {
  const [view, setView] = useState<View>("dashboard");
  const [theme, setTheme] = useState<Theme>(getStoredTheme);
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfigSnapshot | null>(null);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const { connected } = useSocket();

  const counts = useQuery(api.memoryRecords.countsByTier, {}) as
    | MemoryTierCounts
    | undefined;
  const agents = useQuery(api.agents.list, {}) as AgentSummary[] | undefined;
  const storedRuntime = useQuery(api.settings.get, { key: "runtime" }) as
    | string
    | null
    | undefined;
  const storedClaudeModel = useQuery(api.settings.get, { key: "model" }) as
    | string
    | null
    | undefined;
  const storedHostedModel = useQuery(api.settings.get, { key: "codex_model" }) as
    | string
    | null
    | undefined;
  const activeAgentCount = (agents ?? []).filter(
    (a) => a.status === "running" || a.status === "spawned",
  ).length;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
    document.body.style.background = theme === "dark" ? "#101012" : "#f7f7f5";
    document.body.style.color = theme === "dark" ? "#f4f4f5" : "#18181b";
    localStorage.setItem("boop-debug-theme", theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/runtime-config")
      .then((res) => {
        if (!res.ok) throw new Error(`Runtime config fetch failed (${res.status})`);
        return res.json() as Promise<RuntimeConfigSnapshot>;
      })
      .then((config) => {
        if (!cancelled) setRuntimeConfig(config);
      })
      .catch(() => {
        if (!cancelled) setRuntimeConfig(null);
      });
    return () => {
      cancelled = true;
    };
  }, [storedRuntime, storedClaudeModel, storedHostedModel]);

  const isDark = theme === "dark";
  const currentView = NAV.find((item) => item.id === view)?.label ?? "Dashboard";
  const storedProvider: RuntimeProvider | null =
    storedRuntime === "claude" || storedRuntime === "codex" ? storedRuntime : null;
  const activeRuntime = runtimeConfig?.runtime ?? storedProvider ?? "claude";
  const providerLabel = activeRuntime === "codex" ? "Codex" : "Claude";
  const modelLabel =
    runtimeConfig?.model ??
    (activeRuntime === "codex" ? storedHostedModel : storedClaudeModel) ??
    "Model unavailable";

  return (
    <div
      className={`h-full flex ${
        isDark ? "bg-[#101012] text-zinc-100" : "bg-[#f7f7f5] text-zinc-900"
      }`}
    >
      <nav
        className={`w-[244px] shrink-0 p-3 flex flex-col ${
          isDark ? "bg-[#101012]" : "bg-[#f7f7f5]"
        }`}
      >
        <div className="flex items-center gap-3 px-1.5 py-1">
          <img src={boopGif} alt="Boop" className="w-8 h-8 rounded-2xl object-cover" />
          <div className="min-w-0">
            <h1 className={`truncate text-sm font-semibold ${isDark ? "text-zinc-100" : "text-zinc-950"}`}>
              Boop
            </h1>
            <div
              className={`flex items-center gap-1.5 truncate text-xs ${
                connected ? "text-emerald-500" : "text-rose-400"
              }`}
            >
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                {connected && (
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 pulse-ring" />
                )}
                <span
                  className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                    connected ? "bg-emerald-400" : "bg-rose-400"
                  }`}
                />
              </span>
              {connected ? "Connection healthy" : "Disconnected"}
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-0.5">
          {NAV.map((item) => (
            <button
              key={item.id}
              data-active={view === item.id}
              onClick={() => setView(item.id)}
              className={`sidebar-nav-item flex h-8 w-full items-center gap-2 rounded-2xl px-2.5 text-left text-[12px] ${
                view === item.id
                  ? isDark
                    ? "text-zinc-50"
                    : "text-zinc-950"
                  : isDark
                    ? "text-zinc-400 hover:text-zinc-100"
                    : "text-zinc-600 hover:text-zinc-950"
              }`}
            >
              <HugeiconsIcon icon={NAV_ICONS[item.id]} size={16} className="shrink-0" />
              <span className="truncate">{item.label}</span>
              {item.id === "agents" && activeAgentCount > 0 && (
                <span
                  className={`ml-auto flex h-4 min-w-4 items-center justify-center rounded-full px-1.5 text-[10px] font-medium ${
                    isDark ? "bg-zinc-700 text-zinc-100" : "bg-zinc-200 text-zinc-800"
                  }`}
                >
                  {activeAgentCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-auto space-y-3">
          {counts && (
            <div
              className={`rounded-2xl border p-2.5 ${
                isDark ? "border-white/10 bg-black/20" : "border-zinc-200 bg-zinc-50"
              }`}
            >
              <div className={`mb-2 text-xs ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                Memory
              </div>
              <div className="grid grid-cols-3 gap-2">
                <MetricPill label="Short" value={counts.short} isDark={isDark} />
                <MetricPill label="Long" value={counts.long} isDark={isDark} />
                <MetricPill
                  label="Perm"
                  value={counts.permanent}
                  isDark={isDark}
                  color={isDark ? "text-amber-300" : "text-amber-700"}
                />
              </div>
            </div>
          )}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center">
              <button
                onClick={() => setChangelogOpen(true)}
                aria-label="Open changelog"
                className={`rounded-lg px-1.5 py-1 text-[11px] mono transition-colors ${
                  isDark
                    ? "text-zinc-600 hover:bg-white/5 hover:text-zinc-300"
                    : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                }`}
                title="Open changelog"
              >
                v0.2
              </button>
            </div>
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className={`p-1.5 rounded-xl transition-colors ${
                isDark
                  ? "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
                  : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
              }`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              <HugeiconsIcon icon={isDark ? Sun03Icon : Moon02Icon} size={16} />
            </button>
          </div>
        </div>
      </nav>

      <div
        className={`relative flex flex-1 min-w-0 flex-col overflow-hidden rounded-l-[20px] border-y border-l shadow-sm ${
          isDark
            ? "border-white/10 bg-[#18181b] shadow-black/20"
            : "border-zinc-200 bg-[#fbfbfa] shadow-zinc-200/60"
        }`}
      >
        <header
          className={`flex h-14 shrink-0 items-center justify-between border-b px-5 ${
            isDark ? "border-white/10 bg-[#18181b]" : "border-zinc-200 bg-[#fbfbfa]"
          }`}
        >
          <div>
            <div className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
              Boop Debug
            </div>
            <h2 className={`text-sm font-medium ${isDark ? "text-zinc-100" : "text-zinc-950"}`}>
              {currentView}
            </h2>
          </div>
          <div
            className={`hidden min-w-0 items-center gap-2 rounded-2xl border px-2.5 py-1.5 text-xs sm:flex ${
              isDark ? "border-white/10 bg-white/5 text-zinc-400" : "border-zinc-200 bg-white text-zinc-600"
            }`}
            title={`Active model: ${providerLabel} ${modelLabel}`}
          >
            <RuntimeProviderLogo runtime={activeRuntime} size={17} className="shrink-0" />
            <span className={`shrink-0 font-medium ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
              {providerLabel}
            </span>
            <span className={`max-w-[180px] truncate mono font-medium ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
              {modelLabel}
            </span>
          </div>
        </header>

        <main className="flex-1 min-h-0 min-w-0 overflow-hidden">
          <div key={view} className="h-full overflow-auto debug-scroll p-5 view-shell">
            {view === "dashboard" && <DashboardPanel isDark={isDark} />}
            {view === "agents" && <AgentsPanel isDark={isDark} />}
            {view === "automations" && <AutomationsPanel isDark={isDark} />}
            {view === "memory" && <MemoryPanel isDark={isDark} />}
            {view === "events" && <EventsPanel isDark={isDark} />}
            {view === "consolidation" && <ConsolidationPanel isDark={isDark} />}
            {view === "connections" && <ConnectionsPanel isDark={isDark} />}
            {view === "settings" && <SettingsPanel isDark={isDark} />}
          </div>
        </main>
        <ChangelogDrawer
          open={changelogOpen}
          onClose={() => setChangelogOpen(false)}
          isDark={isDark}
        />
      </div>
    </div>
  );
}

function MetricPill({
  label,
  value,
  isDark,
  color,
}: {
  label: string;
  value: number;
  isDark: boolean;
  color?: string;
}) {
  return (
    <div className="min-w-0 text-xs">
      <span className={isDark ? "text-zinc-500" : "text-zinc-400"}>{label}</span>
      <span
        className={`block truncate mono font-semibold ${
          color ?? (isDark ? "text-zinc-300" : "text-zinc-700")
        }`}
      >
        {value}
      </span>
    </div>
  );
}
