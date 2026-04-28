import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api.js";
import { IntegrationLogo, BrailleIndicator, prettyToolName } from "../lib/branding.js";

interface LogEntry {
  logType: string;
  toolName?: string;
  accounts?: string[];
  content: string;
}

const STATUS_CONFIG: Record<string, { dot: string; label: string; color: string }> = {
  spawned: { dot: "bg-amber-400", label: "Spawning", color: "text-amber-400" },
  running: { dot: "bg-sky-400", label: "Running", color: "text-sky-400" },
  completed: { dot: "bg-emerald-400", label: "Done", color: "text-emerald-400" },
  failed: { dot: "bg-rose-400", label: "Failed", color: "text-rose-400" },
  cancelled: { dot: "bg-slate-500", label: "Cancelled", color: "text-slate-500" },
};

function formatLogRow(log: LogEntry): string {
  if (log.logType === "tool_use") return prettyToolName(log.toolName);
  if (log.logType === "tool_result" || log.logType === "error") {
    return (log.content ?? "").replace(/<[^>]+>/g, "").trim().slice(0, 80);
  }
  return (log.content ?? "").slice(0, 80);
}

export function AgentsPanel({ isDark }: { isDark: boolean }) {
  const agents = useQuery(api.agents.list, { limit: 60 });
  const [selected, setSelected] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const agentList = agents ?? [];
  const filtered =
    statusFilter === "all" ? agentList : agentList.filter((a) => a.status === statusFilter);
  const activeCount = agentList.filter(
    (a) => a.status === "running" || a.status === "spawned",
  ).length;

  const cardBg = isDark
    ? "bg-slate-900/40 border-slate-800/60"
    : "bg-white border-slate-200";
  const hoverBg = isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50";

  if (selected) {
    return (
      <AgentDetail
        agentId={selected}
        onBack={() => setSelected(null)}
        isDark={isDark}
      />
    );
  }

  return (
    <div className="flex flex-col h-full -m-5">
      {/* Toolbar */}
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
          Agents
        </h2>
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
          {["all", "running", "completed", "failed"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 text-xs rounded-md capitalize transition-colors ${
                statusFilter === s
                  ? isDark
                    ? "bg-slate-700 text-white font-medium"
                    : "bg-slate-200 text-slate-800 font-medium"
                  : isDark
                    ? "text-slate-500 hover:text-slate-300 hover:bg-slate-800"
                    : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto debug-scroll p-4 space-y-3">
        {agents === undefined ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`h-20 rounded-xl border ${cardBg} shimmer`} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p
            className={`text-sm py-8 text-center ${
              isDark ? "text-slate-600" : "text-slate-400"
            }`}
          >
            {statusFilter !== "all" ? `No ${statusFilter} agents` : "No agents yet"}
          </p>
        ) : (
          filtered.map((agent) => {
            const cfg = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.running;
            const isActive = agent.status === "running" || agent.status === "spawned";
            const totalTokens = agent.inputTokens + agent.outputTokens;
            const elapsed = agent.completedAt
              ? (agent.completedAt - agent.startedAt) / 1000
              : (Date.now() - agent.startedAt) / 1000;

            return (
              <div
                key={agent._id}
                onClick={() => setSelected(agent.agentId)}
                className={`border rounded-xl p-4 cursor-pointer transition-all duration-150 fade-in ${cardBg} ${hoverBg}`}
              >
                <div className="flex items-center gap-2.5 mb-1.5">
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    {isActive && (
                      <span
                        className={`absolute inline-flex h-full w-full rounded-full ${cfg.dot} pulse-ring`}
                      />
                    )}
                    <span
                      className={`relative inline-flex rounded-full h-2.5 w-2.5 ${cfg.dot}`}
                    />
                  </span>
                  <span
                    className={`text-sm font-medium truncate ${
                      isDark ? "text-slate-200" : "text-slate-800"
                    }`}
                  >
                    {agent.name}
                  </span>
                  <span
                    className={`flex items-center gap-2 text-xs ml-auto ${cfg.color}`}
                  >
                    {isActive && <BrailleIndicator />}
                    {cfg.label}
                  </span>
                </div>

                <p
                  className={`text-xs truncate mb-2 ${
                    isDark ? "text-slate-500" : "text-slate-500"
                  }`}
                >
                  {agent.status === "completed"
                    ? agent.result?.slice(0, 120)
                    : agent.status === "failed"
                      ? agent.error?.slice(0, 120)
                      : agent.task.slice(0, 120)}
                </p>

                {(agent.costUsd > 0 || totalTokens > 0) && (
                  <div className="flex items-center gap-3 text-[10px] mono mb-2">
                    {agent.costUsd > 0 && (
                      <span className="text-emerald-500 font-semibold">
                        ${agent.costUsd.toFixed(4)}
                      </span>
                    )}
                    {totalTokens > 0 && (
                      <span
                        className={isDark ? "text-slate-600" : "text-slate-400"}
                      >
                        {(totalTokens / 1000).toFixed(1)}k tok
                      </span>
                    )}
                    <span className={isDark ? "text-slate-600" : "text-slate-400"}>
                      {elapsed.toFixed(1)}s
                    </span>
                  </div>
                )}

                {agent.mcpServers.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {agent.mcpServers.map((name) => (
                      <IntegrationLogo key={name} raw={name} size={18} />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Agent Detail ───

function AgentDetail({
  agentId,
  onBack,
  isDark,
}: {
  agentId: string;
  onBack: () => void;
  isDark: boolean;
}) {
  const agent = useQuery(api.agents.get, { agentId });
  const logs = useQuery(api.agents.getLogs, { agentId, limit: 500 });
  const [requestOpen, setRequestOpen] = useState(false);
  const [responseOpen, setResponseOpen] = useState(false);

  if (!agent) {
    return (
      <div className="p-5">
        <div
          className={`h-20 rounded-xl shimmer ${
            isDark ? "bg-slate-900/40" : "bg-slate-100"
          }`}
        />
      </div>
    );
  }

  const cfg = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.running;
  const isActive = agent.status === "running" || agent.status === "spawned";
  const totalTokens = agent.inputTokens + agent.outputTokens;

  return (
    <div className="flex flex-col h-full -m-5 fade-in">
      <div
        className={`shrink-0 border-b px-5 py-3 flex items-center gap-3 ${
          isDark ? "border-slate-800" : "border-slate-200"
        }`}
      >
        <button
          onClick={onBack}
          className={`text-xs rounded-md px-2.5 py-1 transition-colors ${
            isDark
              ? "text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700"
              : "text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200"
          }`}
        >
          ← Back
        </button>
        <span className="relative flex h-2.5 w-2.5">
          {isActive && (
            <span
              className={`absolute inline-flex h-full w-full rounded-full ${cfg.dot} pulse-ring`}
            />
          )}
          <span
            className={`relative inline-flex rounded-full h-2.5 w-2.5 ${cfg.dot}`}
          />
        </span>
        <span
          className={`text-sm font-medium ${
            isDark ? "text-slate-200" : "text-slate-800"
          }`}
        >
          {agent.name}
        </span>
        <span className={`text-xs ${cfg.color}`}>{cfg.label}</span>
        <div className="ml-auto flex items-center gap-3 text-xs mono">
          {agent.costUsd > 0 && (
            <span className="text-emerald-500 font-semibold">
              ${agent.costUsd.toFixed(4)}
            </span>
          )}
          {totalTokens > 0 && (
            <span className={isDark ? "text-slate-500" : "text-slate-400"}>
              {(totalTokens / 1000).toFixed(1)}k tok
            </span>
          )}
        </div>
      </div>

      <div className="shrink-0 p-4 pb-2">
        <div
          className={`rounded-xl border shadow-lg px-4 py-3 ${
            isDark
              ? "bg-slate-900/90 border-sky-800/40"
              : "bg-white border-sky-200"
          }`}
        >
          <button
            onClick={() => setRequestOpen(!requestOpen)}
            className="flex items-center gap-2 w-full min-w-0"
          >
            <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0" />
            <span
              className={`text-[10px] font-bold mono tracking-wider shrink-0 ${
                isDark ? "text-sky-400" : "text-sky-600"
              }`}
            >
              REQUEST
            </span>
            {!requestOpen && (
              <span
                className={`text-xs truncate min-w-0 ${
                  isDark ? "text-slate-500" : "text-slate-400"
                }`}
              >
                {agent.task}
              </span>
            )}
            <span className={`ml-auto shrink-0 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
              {requestOpen ? "▲" : "▼"}
            </span>
          </button>
          {requestOpen && (
            <p
              className={`text-xs whitespace-pre-wrap break-words mt-2 ${
                isDark ? "text-slate-300" : "text-slate-700"
              }`}
            >
              {agent.task}
            </p>
          )}
        </div>
      </div>

      {agent.mcpServers.length > 0 && (
        <div className="shrink-0 px-4 pb-2">
          <div
            className={`rounded-xl border px-4 py-2.5 ${
              isDark
                ? "bg-slate-900/60 border-slate-800/60"
                : "bg-slate-50 border-slate-200"
            }`}
          >
            <span
              className={`text-[10px] font-bold mono tracking-wider ${
                isDark ? "text-slate-500" : "text-slate-400"
              }`}
            >
              INTEGRATIONS
            </span>
            <div className="flex items-center gap-2 flex-wrap mt-1.5">
              {agent.mcpServers.map((name) => (
                <span
                  key={name}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium ${
                    isDark
                      ? "bg-slate-800 text-slate-300"
                      : "bg-white text-slate-600 border border-slate-200"
                  }`}
                >
                  <IntegrationLogo raw={name} size={14} />
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto debug-scroll p-5">
        {logs === undefined ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-8 rounded shimmer ${
                  isDark ? "bg-slate-900/30" : "bg-slate-100"
                }`}
              />
            ))}
          </div>
        ) : logs.length === 0 ? (
          isActive ? (
            <div className="flex items-center gap-3 py-4">
              <BrailleIndicator />
              <span
                className={`text-xs ${
                  isDark ? "text-slate-600" : "text-slate-400"
                }`}
              >
                Waiting for activity…
              </span>
            </div>
          ) : (
            <p
              className={`text-sm ${
                isDark ? "text-slate-600" : "text-slate-400"
              }`}
            >
              No logs recorded
            </p>
          )
        ) : (
          <div className="space-y-0">
            {logs.map((log, i) => (
              <TimelineRow
                key={log._id}
                log={log as any}
                isLast={i === logs.length - 1}
                isDark={isDark}
              />
            ))}
          </div>
        )}
      </div>

      {agent.status === "completed" && agent.result && (
        <div className="sticky bottom-0 p-4 pt-2">
          <div
            className={`rounded-xl border shadow-lg px-4 py-3 ${
              isDark
                ? "bg-slate-900/90 border-emerald-800/40"
                : "bg-white border-emerald-200"
            }`}
          >
            <button
              onClick={() => setResponseOpen(!responseOpen)}
              className="flex items-center gap-2 w-full min-w-0"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <span
                className={`text-[10px] font-bold mono tracking-wider shrink-0 ${
                  isDark ? "text-emerald-400" : "text-emerald-600"
                }`}
              >
                RESPONSE
              </span>
              {!responseOpen && (
                <span
                  className={`text-xs truncate min-w-0 ${
                    isDark ? "text-slate-500" : "text-slate-400"
                  }`}
                >
                  {agent.result.slice(0, 160)}
                </span>
              )}
              <span className={`ml-auto shrink-0 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                {responseOpen ? "▲" : "▼"}
              </span>
            </button>
            {responseOpen && (
              <p
                className={`text-xs whitespace-pre-wrap break-words mt-2 ${
                  isDark ? "text-slate-300" : "text-slate-700"
                }`}
              >
                {agent.result}
              </p>
            )}
          </div>
        </div>
      )}

      {agent.status === "failed" && agent.error && (
        <div className="sticky bottom-0 p-4 pt-2">
          <div
            className={`rounded-xl border shadow-lg px-4 py-3 ${
              isDark
                ? "bg-slate-900/90 border-rose-800/40"
                : "bg-white border-rose-200"
            }`}
          >
            <span className="text-[10px] font-bold mono tracking-wider text-rose-500">
              ERROR
            </span>
            <p
              className={`text-xs whitespace-pre-wrap break-words mt-1 ${
                isDark ? "text-rose-300" : "text-rose-600"
              }`}
            >
              {agent.error}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function TimelineRow({
  log,
  isLast,
  isDark,
}: {
  log: { logType: string; toolName?: string; accounts?: string[]; content: string };
  isLast: boolean;
  isDark: boolean;
}) {
  const isToolUse = log.logType === "tool_use";
  const isToolResult = log.logType === "tool_result";
  const isError = log.logType === "error";

  const dotColor = isToolUse
    ? "bg-sky-400"
    : isError
      ? "bg-rose-400"
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
            <span
              className={`block w-2.5 h-2.5 rounded-full ${dotColor}`}
              style={{ marginLeft: "3.75px" }}
            />
          )}
        </div>
        {!isLast && (
          <div
            className={`flex-1 w-px mt-1 ${
              isDark ? "bg-slate-800" : "bg-slate-200"
            }`}
          />
        )}
      </div>
      <div className="flex-1 min-w-0 pb-4">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className={`text-[10px] font-bold mono tracking-wider ${
              isToolUse
                ? "text-sky-400"
                : isError
                  ? "text-rose-400"
                  : isToolResult
                    ? isDark
                      ? "text-slate-500"
                      : "text-slate-400"
                    : isDark
                      ? "text-slate-600"
                      : "text-slate-400"
            }`}
          >
            {isToolUse ? "TOOL" : isError ? "ERROR" : isToolResult ? "RESPONSE" : "TEXT"}
          </span>
          {isToolUse && log.toolName && (
            <span
              className={`text-xs font-medium ${
                isDark ? "text-sky-300" : "text-sky-600"
              }`}
            >
              {prettyToolName(log.toolName)}
            </span>
          )}
          {isToolUse && log.accounts && log.accounts.length > 0 && (
            <span
              className={`text-[10px] mono px-1.5 py-px rounded ${
                isDark
                  ? "bg-sky-500/10 text-sky-300/80 border border-sky-500/20"
                  : "bg-sky-50 text-sky-700 border border-sky-200"
              }`}
              title="Composio account(s) targeted by this call"
            >
              {log.accounts.join(", ")}
            </span>
          )}
        </div>
        <p
          className={`text-xs whitespace-pre-wrap break-words ${
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
          {log.content.slice(0, 600)}
        </p>
      </div>
    </div>
  );
}
