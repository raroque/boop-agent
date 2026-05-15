import { useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api.js";
import { IntegrationLogo, BrailleIndicator, prettyToolName } from "../lib/branding.js";

interface LogEntry {
  _id?: string;
  logType: string;
  toolName?: string;
  accounts?: string[];
  content: string;
}

type TextTimelineItem = {
  kind: "text";
  id: string;
  content: string;
  logType: "text" | "thinking";
};

type TimelineItem =
  | TextTimelineItem
  | {
      kind: "log";
      id: string;
      log: LogEntry;
    };

type SourceLink = {
  url: string;
  title: string;
  displayUrl: string;
};

const STATUS_CONFIG: Record<string, { dot: string; label: string; color: string }> = {
  spawned: { dot: "bg-amber-400", label: "Spawning", color: "text-amber-400" },
  running: { dot: "bg-sky-400", label: "Running", color: "text-sky-400" },
  completed: { dot: "bg-emerald-400", label: "Done", color: "text-emerald-400" },
  failed: { dot: "bg-rose-400", label: "Failed", color: "text-rose-400" },
  cancelled: { dot: "bg-slate-500", label: "Cancelled", color: "text-slate-500" },
};

function plainPreview(value?: string | null, length = 160): string {
  return normalizeDisplayText(value ?? "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, length);
}

function isEstimatedCost(agent: { runtime?: string; billingMode?: string }): boolean {
  return agent.runtime === "codex" || agent.billingMode === "codex-subscription";
}

function formatCostUsd(costUsd: number, estimated: boolean): string {
  return `${estimated ? "~" : ""}$${costUsd.toFixed(4)}`;
}

function buildTimeline(logs: LogEntry[]): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const log of logs) {
    const logId = log._id ?? `${log.logType}-${items.length}`;
    if (log.logType === "text" || log.logType === "thinking") {
      const previous = items[items.length - 1];
      if (previous?.kind === "text" && previous.logType === log.logType) {
        previous.content += log.content ?? "";
      } else {
        items.push({
          kind: "text",
          id: logId,
          content: log.content ?? "",
          logType: log.logType,
        });
      }
      continue;
    }

    items.push({ kind: "log", id: logId, log });
  }

  return items;
}

function normalizeDisplayText(value: string): string {
  const headings = [
    "At a glance",
    "When to use",
    "Key concepts",
    "Main APIs",
    "Main APIs/workflow",
    "Setup requirements",
    "Notable differences",
    "Notable differences or tradeoffs",
    "Tradeoffs",
    "Bottom line",
    "Sources",
  ];
  let text = value
    .replace(/\r\n?/g, "\n")
    .replace(/([a-z0-9])\.([A-Z])/g, "$1. $2")
    .replace(/\s+•\s+/g, "\n- ");
  for (const heading of headings) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(
      new RegExp(`\\s*\\*\\*${escaped}\\*\\*:?(?=\\s|$)`, "gi"),
      `\n\n**${heading}**`,
    );
  }
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

function cleanUrl(raw: string): string {
  return raw.replace(/[),.;:]+$/g, "");
}

function displayUrl(url: string): { host: string; displayUrl: string } {
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}`.replace(/\/$/, "");
    return {
      host: parsed.hostname.replace(/^www\./, ""),
      displayUrl: `${parsed.hostname.replace(/^www\./, "")}${path}`.slice(0, 88),
    };
  } catch {
    return { host: url, displayUrl: url.slice(0, 88) };
  }
}

function extractSourceLinks(text: string): SourceLink[] {
  const links = new Map<string, SourceLink>();
  const add = (rawUrl: string, rawTitle?: string) => {
    const url = cleanUrl(rawUrl);
    if (!url || links.has(url)) return;
    const display = displayUrl(url);
    const title = (rawTitle ?? display.displayUrl)
      .replace(/\*\*/g, "")
      .replace(/^[-*\s]+/, "")
      .trim();
    links.set(url, {
      url,
      title: title || display.displayUrl,
      displayUrl: display.displayUrl,
    });
  };

  for (const match of text.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)) {
    add(match[2], match[1]);
  }
  for (const match of text.matchAll(/https?:\/\/[^\s)\]>]+/g)) {
    add(match[0]);
  }

  return Array.from(links.values());
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[1] && match[2]) {
      const url = cleanUrl(match[2]);
      nodes.push(
        <a
          key={`${url}-${match.index}`}
          href={url}
          target="_blank"
          rel="noreferrer"
          className="font-medium underline decoration-current/30 underline-offset-2 hover:decoration-current"
        >
          {match[1]}
        </a>,
      );
    } else if (match[3]) {
      nodes.push(
        <code key={`code-${match.index}`} className="rounded bg-slate-500/10 px-1 py-0.5 mono">
          {match[3]}
        </code>,
      );
    } else if (match[4]) {
      nodes.push(<strong key={`strong-${match.index}`}>{match[4]}</strong>);
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function RichTextBlock({
  text,
  isDark,
  compact = false,
}: {
  text: string;
  isDark: boolean;
  compact?: boolean;
}) {
  const normalized = normalizeDisplayText(text);
  const sourceLinks = extractSourceLinks(normalized);
  const blocks = normalized.split(/\n{2,}/).filter(Boolean);

  return (
    <div
      className={`space-y-2 break-words ${compact ? "text-xs" : "text-sm"} ${
        isDark ? "text-slate-300" : "text-slate-700"
      }`}
    >
      {blocks.map((block, blockIndex) => {
        const lines = block.split("\n").filter(Boolean);
        const isList = lines.length > 0 && lines.every((line) => /^[-*]\s+/.test(line));

        if (isList) {
          return (
            <ul key={blockIndex} className="space-y-1 pl-4 list-disc">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{renderInline(line.replace(/^[-*]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={blockIndex} className="whitespace-pre-wrap leading-relaxed">
            {lines.map((line, lineIndex) => (
              <span key={lineIndex}>
                {renderInline(line)}
                {lineIndex < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        );
      })}
      <SourceCards links={sourceLinks} isDark={isDark} />
    </div>
  );
}

function SourceCards({
  links,
  isDark,
}: {
  links: SourceLink[];
  isDark: boolean;
}) {
  if (links.length === 0) return null;
  return (
    <div className="pt-2 space-y-2">
      <div
        className={`text-[10px] font-bold mono tracking-wider ${
          isDark ? "text-slate-500" : "text-slate-400"
        }`}
      >
        SOURCES
      </div>
      <div className="space-y-1.5">
        {links.map((link) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className={`block rounded-lg border px-3 py-2 transition-colors ${
              isDark
                ? "border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-900"
                : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"
            }`}
          >
            <div
              className={`text-xs font-medium truncate ${
                isDark ? "text-sky-300" : "text-sky-700"
              }`}
            >
              {link.title}
            </div>
            <div
              className={`text-[11px] truncate ${
                isDark ? "text-slate-500" : "text-slate-500"
              }`}
            >
              {link.displayUrl}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function summarizeToolPayload(content: string): string {
  try {
    const value = JSON.parse(content) as Record<string, unknown>;
    if (Array.isArray(value.tools)) {
      return value.tools
        .slice(0, 4)
        .map((tool) => {
          if (!tool || typeof tool !== "object") return String(tool);
          const record = tool as Record<string, unknown>;
          const args = record.arguments as Record<string, unknown> | undefined;
          const query = typeof args?.query === "string" ? `: ${args.query}` : "";
          return `${String(record.tool_slug ?? "tool")}${query}`;
        })
        .join(" · ");
    }
    if (Array.isArray(value.queries)) {
      return value.queries
        .slice(0, 4)
        .map((query) => {
          if (!query || typeof query !== "object") return String(query);
          const record = query as Record<string, unknown>;
          return String(record.use_case ?? record.query ?? "query");
        })
        .join(" · ");
    }
    if (typeof value.thought === "string" && value.thought.trim()) {
      return value.thought.trim();
    }
    const preferred = ["query", "q", "url", "path", "message", "prompt", "task", "name"];
    for (const key of preferred) {
      const entry = value[key];
      if (typeof entry === "string" && entry.trim()) return `${key}: ${entry.trim()}`;
    }
    const entries = Object.entries(value)
      .filter(([, entry]) => entry !== undefined && entry !== null)
      .slice(0, 4)
      .map(([key, entry]) => {
        const rendered =
          typeof entry === "string" ? entry : Array.isArray(entry) ? entry.join(", ") : JSON.stringify(entry);
        return `${key}: ${rendered}`;
      });
    if (entries.length > 0) return entries.join(" · ");
  } catch {
    // Fall through to the raw preview.
  }
  return content;
}

function summarizeToolResult(content: string): string {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return content;

  try {
    const value = JSON.parse(content) as Record<string, unknown>;
    if (value.error) return `Error: ${String(value.error)}`;

    const data = value.data as Record<string, unknown> | undefined;
    if (data) {
      if (typeof data.stdout === "string" && data.stdout.trim()) {
        return data.stdout.trim();
      }
      if (typeof data.results === "string" && data.results.trim()) {
        return data.results.trim();
      }
      if (Array.isArray(data.results)) {
        return data.results.slice(0, 4).map(summarizeResultItem).join("\n");
      }
    }

    if (Array.isArray(value.results)) {
      return value.results.slice(0, 4).map(summarizeResultItem).join("\n");
    }
  } catch {
    return summarizeJsonPreview(content);
  }

  return summarizeJsonPreview(content);
}

function summarizeJsonPreview(content: string): string {
  const stdout = content.match(/"stdout":"((?:\\.|[^"])*)"/);
  if (stdout) return decodeJsonString(stdout[1]).trim();

  const useCases = Array.from(content.matchAll(/"use_case":"((?:\\.|[^"])*)"/g))
    .slice(0, 4)
    .map((match) => decodeJsonString(match[1]));
  if (useCases.length > 0) {
    return useCases.map((useCase) => `${useCase}: result guidance`).join("\n");
  }

  const toolSlugs = Array.from(content.matchAll(/"tool_slug":"((?:\\.|[^"])*)"/g))
    .slice(0, 4)
    .map((match) => decodeJsonString(match[1]));
  if (toolSlugs.length > 0) {
    const queries = Array.from(content.matchAll(/"query":"((?:\\.|[^"])*)"/g))
      .slice(0, toolSlugs.length)
      .map((match) => decodeJsonString(match[1]));
    return toolSlugs
      .map((slug, index) => {
        const query = queries[index] ? `: ${queries[index]}` : "";
        return `${slug}${query}: result returned`;
      })
      .join("\n");
  }

  return "JSON result returned. Expand payload for details.";
}

function decodeJsonString(value: string): string {
  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`);
  } catch {
    return value.replace(/\\"/g, '"').replace(/\\n/g, "\n");
  }
}

function summarizeResultItem(item: unknown): string {
  if (!item || typeof item !== "object") return String(item);
  const record = item as Record<string, unknown>;

  if (typeof record.use_case === "string") {
    const count = Array.isArray(record.primary_tool_slugs)
      ? `${record.primary_tool_slugs.length} primary tools`
      : "tool guidance";
    return `${record.use_case}: ${count}`;
  }

  const toolSlug = typeof record.tool_slug === "string" ? record.tool_slug : "tool";
  const response = record.response as Record<string, unknown> | undefined;
  const data = response?.data as Record<string, unknown> | undefined;
  const preview = response?.data_preview as Record<string, unknown> | undefined;
  const source = data ?? preview;
  const query = typeof source?.query === "string" ? `: ${source.query}` : "";

  const messages = source?.messages as Record<string, unknown> | undefined;
  if (messages && typeof messages.total === "number") {
    return `${toolSlug}${query}: ${messages.total} messages`;
  }

  const channels = source?.channels;
  if (Array.isArray(channels)) {
    return `${toolSlug}: ${channels.length} conversations returned`;
  }

  if (typeof response?.successful === "boolean") {
    return `${toolSlug}: ${response.successful ? "successful" : "failed"}`;
  }

  return `${toolSlug}: result returned`;
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
            const estimatedCost = isEstimatedCost(agent);
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
                    ? plainPreview(agent.result, 120)
                    : agent.status === "failed"
                      ? plainPreview(agent.error, 120)
                      : plainPreview(agent.task, 120)}
                </p>

                {(agent.costUsd > 0 || totalTokens > 0) && (
                  <div className="flex items-center gap-3 text-[10px] mono mb-2">
                    {agent.costUsd > 0 && (
                      <span
                        className="text-emerald-500 font-semibold"
                        title={estimatedCost ? "API-equivalent estimate from Codex tokens" : undefined}
                      >
                        {formatCostUsd(agent.costUsd, estimatedCost)}
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
  const estimatedCost = isEstimatedCost(agent);
  const timeline = logs ? buildTimeline(logs as LogEntry[]) : [];

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
            <span
              className="text-emerald-500 font-semibold"
              title={estimatedCost ? "API-equivalent estimate from Codex tokens" : undefined}
            >
              {formatCostUsd(agent.costUsd, estimatedCost)}
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
                {plainPreview(agent.task)}
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
            {timeline.map((item, i) => (
              <TimelineRow
                key={item.id}
                item={item}
                isLast={i === timeline.length - 1}
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
                  {plainPreview(agent.result, 160)}
                </span>
              )}
              <span className={`ml-auto shrink-0 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                {responseOpen ? "▲" : "▼"}
              </span>
            </button>
            {responseOpen && (
              <div className="mt-3">
                <RichTextBlock text={agent.result} isDark={isDark} compact />
              </div>
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
  item,
  isLast,
  isDark,
}: {
  item: TimelineItem;
  isLast: boolean;
  isDark: boolean;
}) {
  const log = item.kind === "log" ? item.log : null;
  const logType = item.kind === "text" ? item.logType : (log?.logType ?? "text");
  const isToolUse = item.kind === "log" && logType === "tool_use";
  const isToolResult = item.kind === "log" && logType === "tool_result";
  const isError = item.kind === "log" && logType === "error";
  const isThinking = logType === "thinking";

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
            <IntegrationLogo raw={log?.toolName} size={20} />
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
            {isToolUse
              ? "TOOL"
              : isError
                ? "ERROR"
                : isToolResult
                  ? "RESULT"
                  : isThinking
                    ? "THINKING"
                    : "TEXT"}
          </span>
          {isToolUse && log?.toolName && (
            <span
              className={`text-xs font-medium ${
                isDark ? "text-sky-300" : "text-sky-600"
              }`}
            >
              {prettyToolName(log.toolName)}
            </span>
          )}
          {isToolUse && log?.accounts && log.accounts.length > 0 && (
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
        {item.kind === "text" ? (
          <RichTextBlock text={item.content} isDark={isDark} compact />
        ) : isToolUse && log ? (
          <ToolPayload content={log.content} isDark={isDark} />
        ) : isToolResult && log ? (
          <ToolResultPayload content={log.content} isDark={isDark} />
        ) : log ? (
          <p
            className={`text-xs whitespace-pre-wrap break-words ${
              isError
                ? "text-rose-400"
                : isDark
                  ? "text-slate-400"
                  : "text-slate-600"
            }`}
          >
            {log.content.slice(0, 2000)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ToolResultPayload({ content, isDark }: { content: string; isDark: boolean }) {
  const isJsonPayload = /^[\[{]/.test(content.trim());
  if (!isJsonPayload) {
    return <RichTextBlock text={content.slice(0, 2000)} isDark={isDark} compact />;
  }

  const summary = summarizeToolResult(content).slice(0, 1000);
  const hasRawPayload = summary !== content && content.trim().length > 0;

  return (
    <div className="space-y-1.5">
      <p
        className={`text-xs whitespace-pre-wrap break-words ${
          isDark ? "text-slate-400" : "text-slate-600"
        }`}
      >
        {summary}
      </p>
      {hasRawPayload && (
        <details className={isDark ? "text-slate-500" : "text-slate-500"}>
          <summary className="cursor-pointer select-none text-[10px] mono uppercase tracking-wider">
            Payload
          </summary>
          <pre
            className={`mt-1 max-h-44 overflow-auto rounded-lg p-2 text-[11px] whitespace-pre-wrap debug-scroll ${
              isDark ? "bg-slate-950/60 text-slate-400" : "bg-slate-50 text-slate-600"
            }`}
          >
            {content.slice(0, 2000)}
          </pre>
        </details>
      )}
    </div>
  );
}

function ToolPayload({ content, isDark }: { content: string; isDark: boolean }) {
  const summary = summarizeToolPayload(content).slice(0, 600);
  const hasRawPayload = summary !== content && content.trim().length > 0;

  return (
    <div className="space-y-1.5">
      <p
        className={`text-xs whitespace-pre-wrap break-words ${
          isDark ? "text-sky-300/75" : "text-sky-700/75"
        }`}
      >
        {summary}
      </p>
      {hasRawPayload && (
        <details className={isDark ? "text-slate-500" : "text-slate-500"}>
          <summary className="cursor-pointer select-none text-[10px] mono uppercase tracking-wider">
            Payload
          </summary>
          <pre
            className={`mt-1 max-h-44 overflow-auto rounded-lg p-2 text-[11px] whitespace-pre-wrap debug-scroll ${
              isDark ? "bg-slate-950/60 text-slate-400" : "bg-slate-50 text-slate-600"
            }`}
          >
            {content.slice(0, 2000)}
          </pre>
        </details>
      )}
    </div>
  );
}
