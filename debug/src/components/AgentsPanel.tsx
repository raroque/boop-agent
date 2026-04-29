import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Activity01Icon,
  AiBrain02Icon,
  ArrowLeft01Icon,
  Calendar03Icon,
  Clock01Icon,
  Dollar01Icon,
  MachineRobotIcon,
} from "@hugeicons/core-free-icons";
import { api } from "../../../convex/_generated/api.js";
import { IntegrationLogo, BrailleIndicator, prettyToolName } from "../lib/branding.js";
import { useSocket, type SocketEvent } from "../lib/useSocket.js";
import { MarkdownText } from "./MarkdownText.js";

interface LogEntry {
  _id?: string;
  logType: string;
  toolName?: string;
  accounts?: string[];
  content: string;
  createdAt?: number;
}

interface AgentLike {
  _id?: string;
  agentId: string;
  conversationId?: string;
  name: string;
  task: string;
  status: string;
  result?: string;
  error?: string;
  mcpServers: string[];
  runtime?: string;
  model?: string;
  reasoningEffort?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  costUsd: number;
  startedAt: number;
  completedAt?: number;
}

interface AgentUsageLike {
  model?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  costUsd: number;
}

const STATUS_CONFIG: Record<string, { dot: string; label: string; color: string }> = {
  spawned: { dot: "bg-amber-400", label: "Spawning", color: "text-amber-400" },
  running: { dot: "bg-sky-400", label: "Running", color: "text-sky-400" },
  completed: { dot: "bg-emerald-400", label: "Done", color: "text-emerald-400" },
  failed: { dot: "bg-rose-400", label: "Failed", color: "text-rose-400" },
  cancelled: { dot: "bg-slate-500", label: "Cancelled", color: "text-slate-500" },
};

const FILTERS = ["all", "running", "completed", "failed"] as const;

function groupAgentLogs(logs: LogEntry[]): LogEntry[] {
  const grouped: LogEntry[] = [];
  for (const log of logs) {
    const previous = grouped[grouped.length - 1];
    if (log.logType === "text" && previous?.logType === "text") {
      previous.content += log.content;
      previous.createdAt = log.createdAt ?? previous.createdAt;
      continue;
    }
    grouped.push({ ...log });
  }
  return grouped;
}

function formatDateTime(value?: number): string {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(startedAt: number, completedAt?: number): string {
  const seconds = Math.max(0, ((completedAt ?? Date.now()) - startedAt) / 1000);
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${rest}s`;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${value}`;
}

function compactText(text?: string, fallback = "No output yet"): string {
  const cleaned = (text ?? "").replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}

function logKey(log: LogEntry): string {
  return `${log.logType}:${log.toolName ?? ""}:${log.createdAt ?? ""}:${log.content}`;
}

function mergeLogs(convexLogs?: LogEntry[], liveLogs?: LogEntry[]): LogEntry[] | undefined {
  if (!convexLogs && !liveLogs) return undefined;
  const seen = new Set<string>();
  const merged: LogEntry[] = [];
  for (const log of [...(convexLogs ?? []), ...(liveLogs ?? [])]) {
    const key = logKey(log);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(log);
  }
  return merged.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

interface ToolCallPair {
  call: LogEntry;
  result?: LogEntry;
}

type TimelineEntry =
  | { type: "single"; log: LogEntry }
  | { type: "tool_group"; toolName: string; calls: ToolCallPair[] };

function readToolCall(logs: LogEntry[], index: number): { pair: ToolCallPair; nextIndex: number } {
  const call = logs[index];
  const next = logs[index + 1];
  if (next?.logType === "tool_result") {
    return { pair: { call, result: next }, nextIndex: index + 2 };
  }
  return { pair: { call }, nextIndex: index + 1 };
}

function buildTimelineEntries(logs: LogEntry[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  let index = 0;

  while (index < logs.length) {
    const log = logs[index];
    if (log.logType !== "tool_use") {
      entries.push({ type: "single", log });
      index += 1;
      continue;
    }

    const toolName = log.toolName ?? "";
    const first = readToolCall(logs, index);
    const calls = [first.pair];
    index = first.nextIndex;

    while (logs[index]?.logType === "tool_use" && (logs[index].toolName ?? "") === toolName) {
      const next = readToolCall(logs, index);
      calls.push(next.pair);
      index = next.nextIndex;
    }

    if (calls.length > 1) {
      entries.push({ type: "tool_group", toolName, calls });
    } else {
      entries.push({ type: "single", log: calls[0].call });
      if (calls[0].result) entries.push({ type: "single", log: calls[0].result });
    }
  }

  return entries;
}

function summarizeLogs(logs?: LogEntry[]) {
  const source = logs ?? [];
  const toolUses = source.filter((log) => log.logType === "tool_use");
  const messages = source.filter((log) => log.logType === "text");
  const errors = source.filter((log) => log.logType === "error");
  const uniqueTools = [
    ...new Map(
      toolUses.map((log) => [
        log.toolName ?? "",
        {
          raw: log.toolName,
          label: prettyToolName(log.toolName),
        },
      ]),
    ).values(),
  ].filter((tool) => tool.raw);
  return {
    toolsRan: toolUses.length,
    messages: messages.length,
    errors: errors.length,
    uniqueTools,
  };
}

function finalResponseFor(agent: AgentLike, groupedLogs?: LogEntry[]): string {
  if (agent.error) return agent.error;
  if (agent.status !== "completed") return "";
  const lastMessage = [...(groupedLogs ?? [])]
    .reverse()
    .find((log) => log.logType === "text" && log.content.trim());
  return lastMessage?.content.trim() || agent.result || "";
}

function isAgentActive(agent: AgentLike): boolean {
  return agent.status === "running" || agent.status === "spawned";
}

export function AgentsPanel({
  isDark,
  routeAgentId,
  onRouteAgent,
}: {
  isDark: boolean;
  routeAgentId?: string;
  onRouteAgent?: (agentId: string | null) => void;
}) {
  const agents = useQuery(api.agents.list, { limit: 80 }) as AgentLike[] | undefined;
  const [localAgentId, setLocalAgentId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const selectedAgentId = routeAgentId ?? localAgentId;

  const selectAgent = (agentId: string | null) => {
    setLocalAgentId(agentId);
    onRouteAgent?.(agentId);
  };

  const agentList = agents ?? [];
  const filtered = useMemo(
    () => (statusFilter === "all" ? agentList : agentList.filter((agent) => agent.status === statusFilter)),
    [agentList, statusFilter],
  );
  const activeCount = agentList.filter(isAgentActive).length;

  if (selectedAgentId) {
    return (
      <AgentDetail
        agentId={selectedAgentId}
        isDark={isDark}
        onBack={() => selectAgent(null)}
        onSelectAgent={selectAgent}
      />
    );
  }

  return (
    <div className="flex flex-col h-[calc(100%+2.5rem)] -m-5">
      <AgentsHeader
        isDark={isDark}
        activeCount={activeCount}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
      />

      <div className="flex-1 min-h-0 overflow-y-auto debug-scroll p-5">
        {agents === undefined ? (
          <AgentGridSkeleton isDark={isDark} />
        ) : filtered.length === 0 ? (
          <div
            className={`h-full flex items-center justify-center text-sm ${
              isDark ? "text-slate-600" : "text-slate-400"
            }`}
          >
            {statusFilter !== "all" ? `No ${statusFilter} agents` : "No agents yet"}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((agent) => (
              <AgentListRow
                key={agent._id ?? agent.agentId}
                agent={agent}
                isDark={isDark}
                onOpen={() => selectAgent(agent.agentId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AgentsHeader({
  isDark,
  activeCount,
  statusFilter,
  onStatusFilter,
}: {
  isDark: boolean;
  activeCount: number;
  statusFilter: string;
  onStatusFilter: (status: string) => void;
}) {
  return (
    <div
      className={`shrink-0 border-b px-5 py-3 flex items-center gap-3 ${
        isDark ? "border-slate-800" : "border-slate-200"
      }`}
    >
      <div className="flex items-center gap-2">
        <HugeiconsIcon icon={MachineRobotIcon} size={18} className={isDark ? "text-slate-500" : "text-slate-400"} />
        <h2
          className={`text-xs font-semibold uppercase tracking-wider ${
            isDark ? "text-slate-500" : "text-slate-400"
          }`}
        >
          Agents
        </h2>
      </div>
      {activeCount > 0 && (
        <span className="flex items-center gap-1.5 text-xs text-sky-400 font-medium">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-sky-400 pulse-ring" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-400" />
          </span>
          {activeCount} active
        </span>
      )}
      <div className="ml-auto flex items-center gap-1">
        {FILTERS.map((status) => (
          <button
            key={status}
            onClick={() => onStatusFilter(status)}
            className={`px-2.5 py-1 text-xs rounded-md capitalize transition-colors ${
              statusFilter === status
                ? isDark
                  ? "bg-slate-700 text-white font-medium"
                  : "bg-slate-200 text-slate-800 font-medium"
                : isDark
                  ? "text-slate-500 hover:text-slate-300 hover:bg-slate-800"
                  : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            }`}
          >
            {status}
          </button>
        ))}
      </div>
    </div>
  );
}

function AgentListRow({
  agent,
  isDark,
  onOpen,
}: {
  agent: AgentLike;
  isDark: boolean;
  onOpen: () => void;
}) {
  const cfg = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.running;
  const active = isAgentActive(agent);
  const totalTokens = agent.inputTokens + agent.outputTokens;
  const preview =
    agent.status === "completed"
      ? compactText(agent.result)
      : agent.status === "failed"
        ? compactText(agent.error, "Failed without an error message")
        : compactText(agent.task);

  return (
    <button
      onClick={onOpen}
      className={`group flex min-h-52 w-full rounded-xl border px-4 py-4 text-left transition-all duration-150 ${
        isDark
          ? "bg-slate-900/30 border-slate-800/70 hover:bg-slate-900/70 hover:border-slate-700"
          : "bg-white border-slate-200 hover:bg-slate-50"
      }`}
    >
      <div className="grid min-h-0 flex-1 grid-cols-[14px_minmax(0,1fr)] gap-x-3">
        <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0">
          {active && <span className={`absolute inline-flex h-full w-full rounded-full ${cfg.dot} pulse-ring`} />}
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${cfg.dot}`} />
        </span>
        <div className="min-w-0 flex-1 flex flex-col h-full">
          <div className="flex min-w-0 items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className={`text-sm font-semibold leading-5 line-clamp-2 ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                {agent.name}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className={`text-[11px] font-medium ${cfg.color}`}>{cfg.label}</span>
                {agent.model && (
                  <span className={`text-[11px] mono ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                    {agent.model}
                  </span>
                )}
              </div>
            </div>
            {agent.mcpServers.length > 0 && (
              <div className="flex max-w-[64px] shrink-0 flex-wrap justify-end gap-1">
                {agent.mcpServers.slice(0, 4).map((name) => (
                  <IntegrationLogo key={name} raw={name} size={16} />
                ))}
              </div>
            )}
          </div>
          <p className={`mt-3 text-xs leading-5 line-clamp-4 ${isDark ? "text-slate-500" : "text-slate-500"}`}>
            {preview}
          </p>
          <div className={`mt-auto pt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] mono ${isDark ? "text-slate-600" : "text-slate-400"}`}>
            <span className="whitespace-nowrap">{formatDateTime(agent.startedAt)}</span>
            <span className="whitespace-nowrap">{formatDuration(agent.startedAt, agent.completedAt)}</span>
            {totalTokens > 0 && <span className="whitespace-nowrap">{formatTokens(totalTokens)} tok</span>}
            {agent.costUsd > 0 && <span className="whitespace-nowrap text-emerald-500 font-semibold">${agent.costUsd.toFixed(4)}</span>}
          </div>
        </div>
      </div>
    </button>
  );
}

function SkeletonBlock({
  isDark,
  className,
}: {
  isDark: boolean;
  className: string;
}) {
  return (
    <div
      className={`shimmer rounded-md ${
        isDark ? "bg-slate-800/50" : "bg-slate-200/80"
      } ${className}`}
    />
  );
}

function AgentGridSkeleton({ isDark }: { isDark: boolean }) {
  const cardClass = isDark
    ? "bg-slate-900/30 border-slate-800/70"
    : "bg-white border-slate-200";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {Array.from({ length: 9 }).map((_, index) => (
        <div key={index} className={`min-h-52 rounded-xl border px-4 py-4 ${cardClass}`}>
          <div className="flex items-start gap-3 h-full">
            <SkeletonBlock isDark={isDark} className="mt-1 h-2.5 w-2.5 rounded-full shrink-0" />
            <div className="min-w-0 flex-1 flex flex-col h-full">
              <div className="flex items-center gap-2">
                <SkeletonBlock isDark={isDark} className="h-4 w-36" />
                <SkeletonBlock isDark={isDark} className="h-3 w-12" />
              </div>
              <div className="mt-4 space-y-2">
                <SkeletonBlock isDark={isDark} className="h-3 w-full" />
                <SkeletonBlock isDark={isDark} className="h-3 w-5/6" />
                <SkeletonBlock isDark={isDark} className="h-3 w-2/3" />
              </div>
              <div className="mt-auto pt-3 flex items-center gap-3">
                <SkeletonBlock isDark={isDark} className="h-3 w-16" />
                <SkeletonBlock isDark={isDark} className="h-3 w-12" />
                <SkeletonBlock isDark={isDark} className="h-3 w-14" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function AgentDetailSkeleton({ isDark }: { isDark: boolean }) {
  const border = isDark ? "border-slate-800" : "border-slate-200";
  const panel = isDark ? "bg-slate-900/30 border-slate-800/80" : "bg-white border-slate-200";

  return (
    <div className="flex flex-col h-[calc(100%+2.5rem)] -m-5 fade-in">
      <div className={`shrink-0 border-b px-5 py-3 flex items-center gap-3 ${border}`}>
        <SkeletonBlock isDark={isDark} className="h-7 w-20" />
        <SkeletonBlock isDark={isDark} className="h-4 w-36" />
        <SkeletonBlock isDark={isDark} className="ml-auto h-4 w-28" />
      </div>
      <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-h-0 overflow-hidden p-6">
          <div className="max-w-4xl space-y-5">
            <DetailSectionSkeleton isDark={isDark} panel={panel} lines={3} />
            <div className={`rounded-xl border p-4 ${panel}`}>
              <div className="flex items-center gap-2">
                <SkeletonBlock isDark={isDark} className="h-4 w-24" />
                <SkeletonBlock isDark={isDark} className="h-4 w-20" />
                <SkeletonBlock isDark={isDark} className="ml-auto h-8 w-28 rounded-lg" />
              </div>
              <div className="mt-3 flex gap-1.5">
                {[1, 2, 3, 4].map((i) => (
                  <SkeletonBlock key={i} isDark={isDark} className="h-7 w-24 rounded-md" />
                ))}
              </div>
            </div>
            <DetailSectionSkeleton isDark={isDark} panel={panel} lines={5} />
          </div>
        </div>
        <aside className={`min-h-0 border-l p-5 space-y-7 ${border}`}>
          <SidebarSectionSkeleton isDark={isDark} rows={5} />
          <div className="grid grid-cols-2 gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={`rounded-lg border p-3 ${panel}`}>
                <SkeletonBlock isDark={isDark} className="h-3 w-16" />
                <SkeletonBlock isDark={isDark} className="mt-2 h-5 w-20" />
              </div>
            ))}
          </div>
          <SidebarSectionSkeleton isDark={isDark} rows={4} />
        </aside>
      </div>
    </div>
  );
}

function DetailSectionSkeleton({
  isDark,
  panel,
  lines,
}: {
  isDark: boolean;
  panel: string;
  lines: number;
}) {
  return (
    <section>
      <SkeletonBlock isDark={isDark} className="mb-2 h-3 w-20" />
      <div className={`rounded-xl border p-4 ${panel}`}>
        <div className="space-y-2">
          {Array.from({ length: lines }).map((_, index) => (
            <SkeletonBlock
              key={index}
              isDark={isDark}
              className={`h-3 ${index === lines - 1 ? "w-2/3" : "w-full"}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function ActivitySkeleton({ isDark }: { isDark: boolean }) {
  const panel = isDark ? "bg-slate-900/30 border-slate-800/80" : "bg-white border-slate-200";

  return (
    <div className={`rounded-xl border p-4 ${panel}`}>
      <div className="flex items-center gap-2">
        <SkeletonBlock isDark={isDark} className="h-4 w-24" />
        <SkeletonBlock isDark={isDark} className="h-3 w-20" />
        <SkeletonBlock isDark={isDark} className="ml-auto h-8 w-28 rounded-lg" />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {[1, 2, 3, 4].map((i) => (
          <SkeletonBlock key={i} isDark={isDark} className="h-7 w-24 rounded-md" />
        ))}
      </div>
    </div>
  );
}

function SidebarSectionSkeleton({ isDark, rows }: { isDark: boolean; rows: number }) {
  return (
    <section>
      <SkeletonBlock isDark={isDark} className="mb-4 h-3 w-20" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <SkeletonBlock isDark={isDark} className="h-3 w-20" />
            <SkeletonBlock isDark={isDark} className="h-3 w-28" />
          </div>
        ))}
      </div>
    </section>
  );
}

function AgentDetail({
  agentId,
  onBack,
  onSelectAgent,
  isDark,
}: {
  agentId: string;
  onBack: () => void;
  onSelectAgent: (agentId: string) => void;
  isDark: boolean;
}) {
  const agent = useQuery(api.agents.get, { agentId }) as AgentLike | null | undefined;
  const logs = useQuery(api.agents.getLogs, { agentId, limit: 500 }) as LogEntry[] | undefined;
  const relatedRuns = useQuery(api.agents.relatedRuns, { agentId, limit: 12 }) as AgentLike[] | undefined;
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [liveLogs, setLiveLogs] = useState<LogEntry[]>([]);
  const [liveUsage, setLiveUsage] = useState<AgentUsageLike | null>(null);

  useEffect(() => {
    setLiveLogs([]);
    setLiveUsage(null);
    setTimelineOpen(false);
  }, [agentId]);

  useSocket((event: SocketEvent) => {
    if (event.event === "agent_log") {
      const data = event.data as (LogEntry & { agentId?: string }) | null;
      if (!data || data.agentId !== agentId) return;
      setLiveLogs((current) => [...current, data]);
    }
    if (event.event === "agent_usage") {
      const data = event.data as { agentId?: string; usage?: AgentUsageLike } | null;
      if (!data || data.agentId !== agentId || !data.usage) return;
      setLiveUsage(data.usage);
    }
  });

  if (!agent) {
    return <AgentDetailSkeleton isDark={isDark} />;
  }

  const cfg = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.running;
  const active = isAgentActive(agent);
  const totalTokens = agent.inputTokens + agent.outputTokens;
  const mergedLogs = mergeLogs(logs, liveLogs);
  const groupedLogs = mergedLogs ? groupAgentLogs(mergedLogs) : undefined;
  const summary = summarizeLogs(mergedLogs);
  const finalResponse = finalResponseFor(agent, groupedLogs);

  return (
    <div className="flex flex-col h-[calc(100%+2.5rem)] -m-5 fade-in">
      <div
        className={`shrink-0 border-b px-5 py-3 flex items-center gap-3 ${
          isDark ? "border-slate-800" : "border-slate-200"
        }`}
      >
        <button
          onClick={onBack}
          className={`inline-flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1 transition-colors ${
            isDark
              ? "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
          }`}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={14} />
          Agents
        </button>
        <span className={isDark ? "text-slate-700" : "text-slate-300"}>/</span>
        <span className={`text-sm font-medium truncate ${isDark ? "text-slate-200" : "text-slate-800"}`}>
          {agent.name}
        </span>
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          {active && <span className={`absolute inline-flex h-full w-full rounded-full ${cfg.dot} pulse-ring`} />}
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${cfg.dot}`} />
        </span>
        <span className={`text-xs ${cfg.color}`}>{cfg.label}</span>
        <div className="ml-auto flex items-center gap-3 text-xs mono">
          {agent.model && <span className={isDark ? "text-slate-500" : "text-slate-400"}>{agent.model}</span>}
          {agent.costUsd > 0 && <span className="text-emerald-500 font-semibold">${agent.costUsd.toFixed(4)}</span>}
          {totalTokens > 0 && (
            <span className={isDark ? "text-slate-500" : "text-slate-400"}>{formatTokens(totalTokens)} tok</span>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-h-0 overflow-y-auto debug-scroll p-6">
          <div className="max-w-4xl space-y-5">
            <section>
              <div className={`text-[10px] font-bold mono tracking-wider mb-2 ${isDark ? "text-slate-600" : "text-slate-400"}`}>
                MAIN TASK
              </div>
              <div
                className={`rounded-xl border p-4 ${
                  isDark ? "bg-slate-900/40 border-slate-800/80" : "bg-white border-slate-200"
                }`}
              >
                <p className={`text-sm whitespace-pre-wrap break-words leading-6 ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                  {agent.task}
                </p>
              </div>
            </section>

            <section>
              <div className={`text-[10px] font-bold mono tracking-wider mb-2 ${isDark ? "text-slate-600" : "text-slate-400"}`}>
                ACTIVITY
              </div>
              {logs === undefined ? (
                <ActivitySkeleton isDark={isDark} />
              ) : groupedLogs && groupedLogs.length === 0 ? (
                active ? (
                  <div
                    className={`rounded-xl border p-4 flex items-center gap-3 ${
                      isDark ? "bg-slate-900/30 border-slate-800/80" : "bg-white border-slate-200"
                    }`}
                  >
                    <BrailleIndicator />
                    <span className={`text-xs ${isDark ? "text-slate-500" : "text-slate-500"}`}>Waiting for activity</span>
                  </div>
                ) : (
                  <div
                    className={`rounded-xl border p-4 text-sm ${
                      isDark ? "bg-slate-900/30 border-slate-800/80 text-slate-600" : "bg-white border-slate-200 text-slate-400"
                    }`}
                  >
                    No timeline recorded
                  </div>
                )
              ) : (
                <ActivitySummary
                  summary={summary}
                  logs={groupedLogs}
                  isDark={isDark}
                  timelineOpen={timelineOpen}
                  onToggle={() => setTimelineOpen((open) => !open)}
                />
              )}
            </section>

            {(finalResponse || agent.error) && (
              <section>
                <div
                  className={`text-[10px] font-bold mono tracking-wider mb-2 ${
                    agent.error ? "text-rose-400" : isDark ? "text-emerald-400" : "text-emerald-600"
                  }`}
                >
                  {agent.error ? "ERROR" : "FINAL RESPONSE"}
                </div>
                <div
                  className={`rounded-xl border p-4 ${
                    agent.error
                      ? isDark
                        ? "bg-rose-950/20 border-rose-900/50"
                        : "bg-rose-50 border-rose-200"
                      : isDark
                        ? "bg-emerald-950/10 border-emerald-900/40"
                        : "bg-emerald-50 border-emerald-200"
                  }`}
                >
                  <MarkdownText
                    text={finalResponse}
                    isDark={isDark}
                    className={`text-sm leading-6 ${
                      agent.error ? "text-rose-300" : isDark ? "text-slate-300" : "text-slate-700"
                    }`}
                  />
                </div>
              </section>
            )}

          </div>
        </div>

        <aside className={`min-h-0 border-l overflow-y-auto debug-scroll ${isDark ? "border-slate-800" : "border-slate-200"}`}>
          <AgentRunSidebar
            agent={agent}
            relatedRuns={relatedRuns}
            isDark={isDark}
            liveUsage={liveUsage}
            onSelectAgent={onSelectAgent}
          />
        </aside>
      </div>
    </div>
  );
}

function ActivitySummary({
  summary,
  logs,
  isDark,
  timelineOpen,
  onToggle,
}: {
  summary: ReturnType<typeof summarizeLogs>;
  logs?: LogEntry[];
  isDark: boolean;
  timelineOpen: boolean;
  onToggle: () => void;
}) {
  const visibleTools = summary.uniqueTools.slice(0, 5);
  const hiddenTools = Math.max(0, summary.uniqueTools.length - visibleTools.length);
  const timelineEntries = logs ? buildTimelineEntries(logs) : [];

  return (
    <div
      className={`rounded-xl border p-4 ${
        isDark ? "bg-slate-900/30 border-slate-800/80" : "bg-white border-slate-200"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-sm font-medium ${isDark ? "text-slate-200" : "text-slate-800"}`}>
          Ran {summary.toolsRan} tool{summary.toolsRan === 1 ? "" : "s"}
        </span>
        {summary.messages > 0 && (
          <span className={`text-xs ${isDark ? "text-slate-500" : "text-slate-500"}`}>
            {summary.messages} message{summary.messages === 1 ? "" : "s"}
          </span>
        )}
        {summary.errors > 0 && (
          <span className="rounded-md bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-400">
            {summary.errors} error{summary.errors === 1 ? "" : "s"}
          </span>
        )}
        <button
          type="button"
          onClick={onToggle}
          className={`ml-auto rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
            isDark
              ? "border-slate-700 text-slate-300 hover:bg-slate-800"
              : "border-slate-200 text-slate-700 hover:bg-slate-100"
          }`}
        >
          {timelineOpen ? "Hide full timeline" : "Show full timeline"}
        </button>
      </div>

      {visibleTools.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {visibleTools.map((tool) => (
            <span
              key={tool.raw}
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium ${
                isDark ? "bg-slate-950 text-slate-400" : "bg-slate-100 text-slate-600"
              }`}
            >
              <IntegrationLogo raw={tool.raw} size={14} />
              {tool.label}
            </span>
          ))}
          {hiddenTools > 0 && (
            <span className={`px-2 py-1 text-[11px] ${isDark ? "text-slate-600" : "text-slate-400"}`}>
              +{hiddenTools} more
            </span>
          )}
        </div>
      )}

      {timelineOpen && logs && logs.length > 0 && (
        <div className={`mt-4 border-t pt-4 ${isDark ? "border-slate-800" : "border-slate-200"}`}>
          <div className={`mb-3 text-[10px] font-bold mono tracking-wider ${isDark ? "text-slate-600" : "text-slate-400"}`}>
            FULL TIMELINE
          </div>
          <div className="space-y-0">
            {timelineEntries.map((entry, i) =>
              entry.type === "tool_group" ? (
                <ToolCallGroup
                  key={`${entry.toolName}-${i}`}
                  entry={entry}
                  isLast={i === timelineEntries.length - 1}
                  isDark={isDark}
                />
              ) : (
                <TimelineRow
                  key={entry.log._id ?? `${entry.log.logType}-${i}`}
                  log={entry.log}
                  isLast={i === timelineEntries.length - 1}
                  isDark={isDark}
                />
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ToolCallGroup({
  entry,
  isLast,
  isDark,
}: {
  entry: Extract<TimelineEntry, { type: "tool_group" }>;
  isLast: boolean;
  isDark: boolean;
}) {
  const [open, setOpen] = useState(false);
  const firstCall = entry.calls[0]?.call;

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center shrink-0 w-5">
        <div className="mt-1.5">
          <IntegrationLogo raw={entry.toolName} size={20} />
        </div>
        {!isLast && <div className={`flex-1 w-px mt-1 ${isDark ? "bg-slate-800" : "bg-slate-200"}`} />}
      </div>
      <div className="flex-1 min-w-0 pb-5">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
            isDark
              ? "border-slate-800 bg-slate-950/50 hover:bg-slate-950"
              : "border-slate-200 bg-slate-50 hover:bg-slate-100"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold mono tracking-wider text-sky-400">
              TOOL GROUP
            </span>
            <span className={`text-xs font-medium ${isDark ? "text-sky-300" : "text-sky-600"}`}>
              {prettyToolName(entry.toolName)}
            </span>
            <span className={`text-[10px] mono ${isDark ? "text-slate-600" : "text-slate-400"}`}>
              {entry.calls.length} calls
            </span>
            {firstCall?.createdAt && (
              <span className={`text-[10px] mono ${isDark ? "text-slate-700" : "text-slate-400"}`}>
                {formatDateTime(firstCall.createdAt)}
              </span>
            )}
            <span className={`ml-auto text-xs ${isDark ? "text-slate-500" : "text-slate-500"}`}>
              {open ? "Collapse" : "Expand"}
            </span>
          </div>
        </button>

        {open && (
          <div className={`mt-3 rounded-lg border p-3 ${isDark ? "border-slate-800 bg-slate-950/30" : "border-slate-200 bg-white"}`}>
            {entry.calls.flatMap((item, index) => {
              const rows = item.result ? [item.call, item.result] : [item.call];
              return rows.map((log, rowIndex) => (
                <TimelineRow
                  key={`${log.logType}-${index}-${rowIndex}-${log.createdAt ?? ""}`}
                  log={log}
                  isLast={index === entry.calls.length - 1 && rowIndex === rows.length - 1}
                  isDark={isDark}
                />
              ));
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function AgentRunSidebar({
  agent,
  relatedRuns,
  isDark,
  liveUsage,
  onSelectAgent,
}: {
  agent: AgentLike;
  relatedRuns?: AgentLike[];
  isDark: boolean;
  liveUsage?: AgentUsageLike | null;
  onSelectAgent: (agentId: string) => void;
}) {
  const [now, setNow] = useState(Date.now());
  const cfg = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.running;
  const active = isAgentActive(agent);
  const displayUsage = liveUsage ?? agent;
  const cacheTokens = (displayUsage.cacheReadTokens ?? 0) + (displayUsage.cacheCreationTokens ?? 0);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  const sectionClass = `border-b pb-6 last:border-b-0 last:pb-0 ${
    isDark ? "border-slate-800/80" : "border-slate-200"
  }`;

  return (
    <div className="p-5 space-y-6">
      <section className={sectionClass}>
        <div className={`text-[10px] font-bold mono tracking-wider mb-3 ${isDark ? "text-slate-600" : "text-slate-400"}`}>
          AGENT
        </div>
        <div className="space-y-3">
          <DetailRow label="Name" value={agent.name} isDark={isDark} />
          <DetailRow label="Status" value={cfg.label} valueClass={cfg.color} isDark={isDark} />
          <DetailRow label="Runtime" value={agent.runtime ?? "Not recorded"} isDark={isDark} />
          <DetailRow label="Model" value={liveUsage?.model ?? agent.model ?? "Not recorded"} isDark={isDark} />
          <DetailRow label="Reasoning" value={agent.reasoningEffort ?? "Not recorded"} isDark={isDark} />
          <DetailRow label="Agent ID" value={agent.agentId} mono isDark={isDark} />
        </div>
      </section>

      <section className={sectionClass}>
        <div className={`text-[10px] font-bold mono tracking-wider mb-3 ${isDark ? "text-slate-600" : "text-slate-400"}`}>
          INTERACTIONS
        </div>
        <div className="grid grid-cols-2 gap-2">
          <MetricBox icon={Clock01Icon} label="Duration" value={formatDuration(agent.startedAt, agent.completedAt ?? (active ? now : undefined))} isDark={isDark} live={active} />
          <MetricBox icon={Dollar01Icon} label="Cost" value={displayUsage.costUsd > 0 ? `$${displayUsage.costUsd.toFixed(4)}` : "$0.0000"} isDark={isDark} live={active && Boolean(liveUsage)} />
          <MetricBox icon={Activity01Icon} label="Input" value={formatTokens(displayUsage.inputTokens)} isDark={isDark} live={active && Boolean(liveUsage)} />
          <MetricBox icon={AiBrain02Icon} label="Output" value={formatTokens(displayUsage.outputTokens)} isDark={isDark} live={active && Boolean(liveUsage)} />
        </div>
        {cacheTokens > 0 && (
          <div className={`mt-2 text-[11px] mono ${isDark ? "text-slate-600" : "text-slate-400"}`}>
            Cache {formatTokens(cacheTokens)} tokens
          </div>
        )}
      </section>

      <section className={sectionClass}>
        <div className={`text-[10px] font-bold mono tracking-wider mb-3 ${isDark ? "text-slate-600" : "text-slate-400"}`}>
          DETAILS
        </div>
        <div className="space-y-3">
          <DetailRow label="Started" value={formatDateTime(agent.startedAt)} isDark={isDark} />
          <DetailRow label="Completed" value={formatDateTime(agent.completedAt)} isDark={isDark} />
          <div>
            <div className={`text-xs mb-2 ${isDark ? "text-slate-500" : "text-slate-500"}`}>Integrations</div>
            {agent.mcpServers.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {agent.mcpServers.map((name) => (
                  <span
                    key={name}
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium ${
                      isDark ? "bg-slate-900 text-slate-300" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    <IntegrationLogo raw={name} size={14} />
                    {name}
                  </span>
                ))}
              </div>
            ) : (
              <span className={`text-xs ${isDark ? "text-slate-600" : "text-slate-400"}`}>None</span>
            )}
          </div>
        </div>
      </section>

      <section className={sectionClass}>
        <div className={`text-[10px] font-bold mono tracking-wider mb-3 ${isDark ? "text-slate-600" : "text-slate-400"}`}>
          PREVIOUS RUNS
        </div>
        {relatedRuns === undefined ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={`rounded-lg px-2.5 py-2 ${isDark ? "bg-slate-900/40" : "bg-slate-50"}`}
              >
                <div className="flex items-center gap-3">
                  <SkeletonBlock isDark={isDark} className="h-2 w-2 rounded-full shrink-0" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <SkeletonBlock isDark={isDark} className="h-3 w-28" />
                    <SkeletonBlock isDark={isDark} className="h-2.5 w-40" />
                  </div>
                  <SkeletonBlock isDark={isDark} className="h-3 w-12" />
                </div>
              </div>
            ))}
          </div>
        ) : relatedRuns.length === 0 ? (
          <p className={`text-xs ${isDark ? "text-slate-600" : "text-slate-400"}`}>
            No matching prior runs for this exact task.
          </p>
        ) : (
          <div className="space-y-1">
            {relatedRuns.map((run) => (
              <PreviousRunButton
                key={run.agentId}
                run={run}
                isDark={isDark}
                onClick={() => onSelectAgent(run.agentId)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DetailRow({
  label,
  value,
  isDark,
  mono,
  valueClass,
}: {
  label: string;
  value: string;
  isDark: boolean;
  mono?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex items-start gap-4 justify-between">
      <span className={`text-xs shrink-0 ${isDark ? "text-slate-500" : "text-slate-500"}`}>{label}</span>
      <span
        className={`text-xs text-right break-words min-w-0 ${
          valueClass ?? (isDark ? "text-slate-300" : "text-slate-700")
        } ${mono ? "mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function MetricBox({
  icon,
  label,
  value,
  isDark,
  live = false,
}: {
  icon: any;
  label: string;
  value: string;
  isDark: boolean;
  live?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-3 ${isDark ? "border-slate-800 bg-slate-900/30" : "border-slate-200 bg-slate-50"}`}>
      <div className="flex items-center gap-1.5">
        <HugeiconsIcon icon={icon} size={13} className={isDark ? "text-slate-600" : "text-slate-400"} />
        <span className={`text-[10px] ${isDark ? "text-slate-500" : "text-slate-500"}`}>{label}</span>
        {live && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400 live-dot" />}
      </div>
      <div className={`mt-1 text-sm mono font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>{value}</div>
    </div>
  );
}

function PreviousRunButton({
  run,
  isDark,
  onClick,
}: {
  run: AgentLike;
  isDark: boolean;
  onClick: () => void;
}) {
  const cfg = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.running;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${
        isDark ? "hover:bg-slate-900/70" : "hover:bg-slate-100"
      }`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
      <div className="min-w-0 flex-1">
        <div className={`text-xs truncate ${isDark ? "text-slate-300" : "text-slate-700"}`}>{formatDateTime(run.startedAt)}</div>
        <div className={`text-[10px] mono truncate ${isDark ? "text-slate-600" : "text-slate-400"}`}>
          {run.model ?? "unknown model"} · {formatDuration(run.startedAt, run.completedAt)}
        </div>
      </div>
      {run.costUsd > 0 && <span className="text-[10px] mono text-emerald-500">${run.costUsd.toFixed(4)}</span>}
    </button>
  );
}

function TimelineRow({
  log,
  isLast,
  isDark,
}: {
  log: LogEntry;
  isLast: boolean;
  isDark: boolean;
}) {
  const isToolUse = log.logType === "tool_use";
  const isToolResult = log.logType === "tool_result";
  const isError = log.logType === "error";
  const isThinking = log.logType === "thinking";

  const dotColor = isToolUse
    ? "bg-sky-400"
    : isError
      ? "bg-rose-400"
      : isThinking
        ? "bg-amber-400"
        : isDark
          ? "bg-slate-700"
          : "bg-slate-300";

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center shrink-0 w-5">
        <div className="mt-1.5">
          {isToolUse ? (
            <IntegrationLogo raw={log.toolName} size={20} />
          ) : (
            <span className={`block w-2.5 h-2.5 rounded-full ${dotColor}`} style={{ marginLeft: "3.75px" }} />
          )}
        </div>
        {!isLast && <div className={`flex-1 w-px mt-1 ${isDark ? "bg-slate-800" : "bg-slate-200"}`} />}
      </div>
      <div className="flex-1 min-w-0 pb-5">
        <div className="flex items-center gap-2 mb-1">
          <span
            className={`text-[10px] font-bold mono tracking-wider ${
              isToolUse
                ? "text-sky-400"
                : isError
                  ? "text-rose-400"
                  : isThinking
                    ? "text-amber-400"
                    : isToolResult
                      ? isDark
                        ? "text-slate-500"
                        : "text-slate-400"
                      : isDark
                        ? "text-slate-600"
                        : "text-slate-400"
            }`}
          >
            {isToolUse ? "TOOL" : isError ? "ERROR" : isThinking ? "THINKING" : isToolResult ? "RESPONSE" : "MESSAGE"}
          </span>
          {isToolUse && log.toolName && (
            <span className={`text-xs font-medium ${isDark ? "text-sky-300" : "text-sky-600"}`}>
              {prettyToolName(log.toolName)}
            </span>
          )}
          {log.createdAt && <span className={`text-[10px] mono ${isDark ? "text-slate-700" : "text-slate-400"}`}>{formatDateTime(log.createdAt)}</span>}
          {isToolUse && log.accounts && log.accounts.length > 0 && (
            <span
              className={`text-[10px] mono px-1.5 py-px rounded ${
                isDark
                  ? "bg-sky-500/10 text-sky-300/80 border border-sky-500/20"
                  : "bg-sky-50 text-sky-700 border border-sky-200"
              }`}
              title="Composio account targeted by this call"
            >
              {log.accounts.join(", ")}
            </span>
          )}
        </div>
        <div
          className={`text-xs leading-5 ${
            isError
              ? "text-rose-400"
              : isToolUse
                ? isDark
                  ? "text-sky-400/60"
                  : "text-sky-600/60"
                : isDark
                  ? "text-slate-400"
                  : "text-slate-600"
          }`}
        >
          {isToolUse ? (
            <pre className="whitespace-pre-wrap break-words">{log.content.slice(0, 1000)}</pre>
          ) : (
            <MarkdownText text={log.content.slice(0, 1000)} isDark={isDark} compact />
          )}
        </div>
      </div>
    </div>
  );
}
