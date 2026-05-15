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
import { RuntimeProviderBadge, type RuntimeProvider } from "./lib/branding.js";

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
  const { connected } = useSocket();

  const counts = useQuery(api.memoryRecords.countsByTier, {});
  const agents = useQuery(api.agents.list, {});
  const storedRuntime = useQuery(api.settings.get, { key: "runtime" });
  const activeAgentCount = (agents ?? []).filter(
    (a) => a.status === "running" || a.status === "spawned",
  ).length;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
    document.body.style.background = theme === "dark" ? "#020617" : "#f8fafc";
    document.body.style.color = theme === "dark" ? "#e2e8f0" : "#1e293b";
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
  }, [storedRuntime]);

  const isDark = theme === "dark";
  const activeRuntime: RuntimeProvider =
    storedRuntime === "claude" || storedRuntime === "codex"
      ? storedRuntime
      : runtimeConfig?.runtime ?? "claude";
  const runtimeKnown = storedRuntime !== undefined || runtimeConfig !== null;

  return (
    <div
      className={`h-full flex flex-col ${isDark ? "bg-slate-950 text-slate-200" : "bg-slate-50 text-slate-800"}`}
    >
      {/* Top bar */}
      <header
        className={`flex items-center justify-between px-5 py-2.5 border-b shrink-0 ${
          isDark ? "border-slate-800 bg-slate-950/80" : "border-slate-200 bg-white/80"
        } backdrop-blur-sm`}
      >
        <div className="flex items-center gap-3">
          <img src="/lunagotchi.png" alt="Boop" className="w-7 h-7 rounded-lg" />
          <h1
            className={`text-sm font-bold tracking-wide uppercase ${
              isDark ? "text-slate-400" : "text-slate-500"
            }`}
          >
            Boop Debug
          </h1>
          <div
            className={`flex items-center gap-1.5 text-xs ${
              connected ? "text-emerald-500" : "text-rose-400"
            }`}
          >
            <span className="relative flex h-2 w-2">
              {connected && (
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 pulse-ring" />
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  connected ? "bg-emerald-400" : "bg-rose-400"
                }`}
              />
            </span>
            {connected ? "Live" : "Disconnected"}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {runtimeKnown && (
            <RuntimeProviderBadge
              runtime={activeRuntime}
              model={runtimeConfig?.runtime === activeRuntime ? runtimeConfig.model : undefined}
              isDark={isDark}
            />
          )}
          {counts && (
            <div className="flex items-center gap-4">
              <MetricPill label="Short" value={counts.short} isDark={isDark} />
              <MetricPill label="Long" value={counts.long} isDark={isDark} />
              <MetricPill
                label="Perm"
                value={counts.permanent}
                isDark={isDark}
                color={isDark ? "text-amber-400" : "text-amber-600"}
              />
            </div>
          )}
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className={`p-1.5 rounded-lg transition-colors ${
              isDark
                ? "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-200"
            }`}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {isDark ? (
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            ) : (
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                />
              </svg>
            )}
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <nav
          className={`w-[168px] shrink-0 border-r flex flex-col py-1.5 ${
            isDark ? "border-slate-800 bg-slate-950/50" : "border-slate-200 bg-white/50"
          }`}
        >
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`flex items-center gap-3 px-4 py-2.5 text-left text-[13px] transition-all duration-150 ${
                view === item.id
                  ? isDark
                    ? "bg-slate-800/70 text-white font-medium"
                    : "bg-slate-100 text-slate-900 font-medium"
                  : isDark
                    ? "text-slate-500 hover:text-slate-300 hover:bg-slate-800/30"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-100/60"
              }`}
            >
              <HugeiconsIcon icon={NAV_ICONS[item.id]} size={18} className="shrink-0" />
              {item.label}
              {item.id === "agents" && activeAgentCount > 0 && (
                <span className="ml-auto flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-sky-500 text-white">
                  {activeAgentCount}
                </span>
              )}
            </button>
          ))}

          <div className="mt-auto px-4 py-3 flex items-center gap-2">
            <img src="/appicon.png" alt="" className="w-5 h-5 rounded" />
            <span
              className={`text-[10px] ${isDark ? "text-slate-600" : "text-slate-400"} mono`}
            >
              v0.2
            </span>
          </div>
        </nav>

        {/* Main */}
        <main className="flex-1 min-w-0 overflow-hidden debug-scroll">
          <div className="h-full overflow-auto debug-scroll p-5 fade-in">
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
    <div className="flex items-center gap-1.5 text-xs">
      <span className={isDark ? "text-slate-500" : "text-slate-400"}>{label}</span>
      <span
        className={`mono font-semibold ${
          color ?? (isDark ? "text-slate-300" : "text-slate-700")
        }`}
      >
        {value}
      </span>
    </div>
  );
}
