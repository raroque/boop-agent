import { api } from "../convex/_generated/api.js";
import { convex } from "./convex-client.js";
import { broadcast } from "./broadcast.js";
import {
  buildMcpServersForIntegrations,
  buildRuntimeToolsForIntegrations,
  listIntegrations,
} from "./integrations/registry.js";
import { createDraftStagingTools } from "./draft-tools.js";
import { EMPTY_USAGE, type UsageTotals } from "./usage.js";
import { getRuntimeConfig } from "./runtime-config.js";
import { runAgentRuntime } from "./runtimes/index.js";
import { formatError } from "./error-format.js";

const running = new Map<string, AbortController>();

function randomId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function extractAccounts(input: unknown): string[] {
  if (!input || typeof input !== "object") return [];
  const accounts = new Set<string>();
  const collect = (v: unknown) => {
    if (typeof v === "string" && v.trim()) accounts.add(v.trim());
  };
  const obj = input as Record<string, unknown>;
  collect(obj.account);
  collect(obj.connectedAccountId);
  collect(obj.connected_account_id);
  if (Array.isArray(obj.accounts)) obj.accounts.forEach(collect);
  if (Array.isArray(obj.tools)) {
    for (const t of obj.tools) {
      if (t && typeof t === "object") {
        const tt = t as Record<string, unknown>;
        collect(tt.account);
        collect(tt.connectedAccountId);
        collect(tt.connected_account_id);
      }
    }
  }
  return [...accounts];
}

const EXECUTION_SYSTEM = `You are a focused background worker for the user.

Your job:
1. Perform the task you were given, end to end.
2. Use your tools, web/research capability when available, and any integrations loaded for this spawn to investigate and act.
3. Return a concise, well-structured answer - not a data dump.

Research discipline:
- Prefer fresh/factual lookup tools when the task depends on current or external facts.
- Cite real URLs only - NEVER invent sources. If a page failed to load, say so.
- Cross-check when it matters: one search is rarely enough for a claim.

MANDATORY: for any task that used web/research capability, end your response with
a "Sources:" section listing the ACTUAL URLs you fetched or found.

No URLs = no sources section. Never write vague names like "Lonely Planet" or
"official guide" without the specific URL. The interaction agent relays your
output to the user verbatim, so if you don't include URLs, the user won't see
any.

Style:
- Optimize for iMessage delivery: short sentences, bullets over paragraphs, no tables.
- Prefer markdown with **bold** keywords and bullets.
- Under 500 words unless explicitly asked for more.
- If you can't complete something, say why in one sentence.

Safety:
- Anything that sends a message, creates an event, or takes an external action: call save_draft with a JSON payload instead of the real send/create tool.
- Only the interaction agent's send_draft tool commits. You never commit unless the task explicitly says this is an approved draft execution.`;

export interface SpawnOptions {
  task: string;
  integrations: string[];
  conversationId?: string;
  name?: string;
}

export interface SpawnResult {
  agentId: string;
  result: string;
  status: "completed" | "failed" | "cancelled";
}

export async function spawnExecutionAgent(opts: SpawnOptions): Promise<SpawnResult> {
  const agentId = randomId("agent");
  const name = opts.name ?? (opts.integrations.join("+") || "general");
  const abort = new AbortController();
  running.set(agentId, abort);

  const shortId = agentId.slice(-6);
  const logAgent = (msg: string) => console.log(`[agent ${shortId}] ${msg}`);
  const taskPreview = opts.task.length > 120 ? `${opts.task.slice(0, 120)}...` : opts.task;
  logAgent(
    `spawn: ${name} [${opts.integrations.join(", ") || "no integrations"}] - ${JSON.stringify(taskPreview)}`,
  );
  const agentStart = Date.now();
  const requestedRuntime = await getRuntimeConfig();

  await convex.mutation(api.agents.create, {
    agentId,
    conversationId: opts.conversationId,
    name,
    task: opts.task,
    mcpServers: opts.integrations,
    runtime: requestedRuntime.runtime,
    model: requestedRuntime.model,
    reasoningEffort: requestedRuntime.reasoningEffort,
  });
  broadcast("agent_spawned", { agentId, name, task: opts.task });

  await convex.mutation(api.agents.update, {
    agentId,
    status: "running",
    runtime: requestedRuntime.runtime,
    model: requestedRuntime.model,
    reasoningEffort: requestedRuntime.reasoningEffort,
  });
  let buffer = "";
  let usage: UsageTotals = { ...EMPTY_USAGE };
  let status: "completed" | "failed" | "cancelled" = "completed";
  let errorMsg: string | undefined;
  let pendingTextLog = "";
  let lastTextFlush = Date.now();

  const addAgentLog = async (log: {
    logType: "thinking" | "tool_use" | "tool_result" | "text" | "error";
    toolName?: string;
    accounts?: string[];
    content: string;
  }) => {
    const createdAt = Date.now();
    const payload = { agentId, ...log, createdAt };
    broadcast("agent_log", payload);
    await convex.mutation(api.agents.addLog, payload);
  };

  const flushTextLog = async (force = false) => {
    if (!pendingTextLog) return;
    if (!force && pendingTextLog.length < 240 && Date.now() - lastTextFlush < 600) return;
    const content = pendingTextLog;
    pendingTextLog = "";
    lastTextFlush = Date.now();
    await addAgentLog({
      logType: "text",
      content,
    });
  };

  try {
    const integrationServers =
      requestedRuntime.runtime === "claude"
        ? await buildMcpServersForIntegrations(opts.integrations, opts.conversationId)
        : {};
    const runtimeTools = [
      ...(opts.conversationId ? createDraftStagingTools(opts.conversationId) : []),
      ...(requestedRuntime.runtime !== "claude"
        ? await buildRuntimeToolsForIntegrations(opts.integrations, opts.conversationId)
        : []),
    ];
    const allowedTools = [
      "WebSearch",
      "WebFetch",
      "Skill",
      "mcp__boop-drafts__*",
      ...Object.keys(integrationServers).flatMap((n) => [`mcp__${n}__*`]),
    ];

    const result = await runAgentRuntime(requestedRuntime.runtime, {
      prompt: opts.task,
      systemPrompt: EXECUTION_SYSTEM,
      model: requestedRuntime.model,
      reasoningEffort: requestedRuntime.reasoningEffort,
      tools: runtimeTools,
      claudeMcpServers: integrationServers,
      allowedTools,
      mode: "execution",
      abortController: abort,
      onText: async (text) => {
        pendingTextLog += text;
        await flushTextLog();
      },
      onToolUse: async (toolName, input) => {
        await flushTextLog(true);
        const toolShort = toolName.replace(/^mcp__[a-z-]+__/, "");
        const accounts = extractAccounts(input);
        const acctSuffix = accounts.length ? ` [${accounts.join(", ")}]` : "";
        logAgent(`tool: ${toolShort}${acctSuffix}`);
        await addAgentLog({
          logType: "tool_use",
          toolName,
          ...(accounts.length ? { accounts } : {}),
          content: JSON.stringify(input).slice(0, 2000),
        });
        broadcast("agent_tool", { agentId, toolName, accounts });
      },
      onToolResult: async (_toolName, text) => {
        await flushTextLog(true);
        await addAgentLog({
          logType: "tool_result",
          content: text.slice(0, 2000),
        });
      },
      onUsage: async (nextUsage) => {
        usage = nextUsage;
        broadcast("agent_usage", { agentId, usage: nextUsage });
      },
    });
    usage = result.usage;
    buffer = result.text;
    await flushTextLog(true);
  } catch (err) {
    await flushTextLog(true);
    status = abort.signal.aborted ? "cancelled" : "failed";
    errorMsg = formatError(err);
    await addAgentLog({
      logType: "error",
      content: errorMsg,
    });
  } finally {
    running.delete(agentId);
  }

  const elapsed = ((Date.now() - agentStart) / 1000).toFixed(1);
  logAgent(
    `done (${status}, ${elapsed}s, in/out tokens ${usage.inputTokens}/${usage.outputTokens}, cache r/w ${usage.cacheReadTokens}/${usage.cacheCreationTokens}, $${usage.costUsd.toFixed(4)})`,
  );

  await convex.mutation(api.agents.update, {
    agentId,
    status,
    result: buffer,
    error: errorMsg,
    runtime: requestedRuntime.runtime,
    model: usage.model,
    reasoningEffort: requestedRuntime.reasoningEffort,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheCreationTokens: usage.cacheCreationTokens,
    costUsd: usage.costUsd,
  });
  if (usage.costUsd > 0 || usage.inputTokens > 0) {
    await convex.mutation(api.usageRecords.record, {
      source: "execution",
      conversationId: opts.conversationId,
      agentId,
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheCreationTokens: usage.cacheCreationTokens,
      costUsd: usage.costUsd,
      durationMs: Date.now() - agentStart,
    });
  }
  broadcast("agent_done", { agentId, status, result: buffer.slice(0, 200) });

  return { agentId, result: buffer || errorMsg || "(no output)", status };
}

export function cancelAgent(agentId: string): boolean {
  const abort = running.get(agentId);
  if (!abort) return false;
  abort.abort();
  return true;
}

export function runningAgentIds(): string[] {
  return [...running.keys()];
}

export async function retryAgent(agentId: string): Promise<SpawnResult | null> {
  const existing = await convex.query(api.agents.get, { agentId });
  if (!existing) return null;
  return await spawnExecutionAgent({
    task: existing.task,
    integrations: existing.mcpServers,
    conversationId: existing.conversationId,
    name: existing.name,
  });
}

export function availableIntegrations(): string[] {
  return listIntegrations().map((i) => i.name);
}
