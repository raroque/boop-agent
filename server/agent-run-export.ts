export interface AgentRunExportSource {
  agentId: string;
  conversationId?: string;
  name: string;
  task: string;
  runtime?: "claude" | "codex";
  model?: string;
  reasoningEffort?: string;
  billingMode?: "api" | "codex-subscription";
  status: string;
  result?: string;
  error?: string;
  mcpServers: string[];
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  costUsd: number;
  startedAt: number;
  completedAt?: number;
}

export interface AgentLogExportSource {
  logType: string;
  toolName?: string;
  accounts?: string[];
  content: string;
  createdAt?: number;
}

export interface AgentLogPage {
  page: AgentLogExportSource[];
  isDone: boolean;
  continueCursor: string;
}

const SENSITIVE_KEY = /^(?:password|passwd|secret|token|api[_-]?key|client[_-]?secret|private[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|auth[_-]?token|authorization|cookie)$/i;
const REDACTED = "[redacted]";

function sanitizeStructuredValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeStructuredValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      SENSITIVE_KEY.test(key) ? REDACTED : sanitizeStructuredValue(entry),
    ]),
  );
}

export function sanitizeAgentLogContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return content;

  try {
    return JSON.stringify(sanitizeStructuredValue(JSON.parse(content)));
  } catch {
    return content;
  }
}

export async function collectAgentLogs(
  fetchPage: (cursor: string | null) => Promise<AgentLogPage>,
): Promise<AgentLogExportSource[]> {
  const logs: AgentLogExportSource[] = [];
  let cursor: string | null = null;

  while (true) {
    const page = await fetchPage(cursor);
    logs.push(...page.page);
    if (page.isDone) return logs;
    cursor = page.continueCursor;
  }
}

export function buildAgentRunExport(
  agent: AgentRunExportSource,
  logs: AgentLogExportSource[],
  exportedAt = new Date().toISOString(),
) {
  return {
    format: "boop-agent-run",
    version: 1,
    exportedAt,
    run: {
      agentId: agent.agentId,
      conversationId: agent.conversationId,
      name: agent.name,
      task: agent.task,
      runtime: agent.runtime,
      model: agent.model,
      reasoningEffort: agent.reasoningEffort,
      billingMode: agent.billingMode,
      status: agent.status,
      integrations: agent.mcpServers,
      result: agent.result,
      error: agent.error,
      usage: {
        inputTokens: agent.inputTokens,
        outputTokens: agent.outputTokens,
        cacheReadTokens: agent.cacheReadTokens ?? 0,
        cacheCreationTokens: agent.cacheCreationTokens ?? 0,
        costUsd: agent.costUsd,
      },
      timing: {
        startedAt: agent.startedAt,
        completedAt: agent.completedAt,
        durationMs: agent.completedAt ? agent.completedAt - agent.startedAt : undefined,
      },
    },
    logs: logs.map((log) => ({
      type: log.logType,
      toolName: log.toolName,
      accounts: log.accounts,
      content: sanitizeAgentLogContent(log.content),
      createdAt: log.createdAt,
    })),
  };
}
