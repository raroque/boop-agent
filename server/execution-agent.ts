import { query } from "@anthropic-ai/claude-agent-sdk";
import { api } from "../convex/_generated/api.js";
import { convex } from "./convex-client.js";
import { broadcast } from "./broadcast.js";
import { buildMcpServersForIntegrations, listIntegrations } from "./integrations/registry.js";
import { createDraftStagingMcp } from "./draft-tools.js";
import { aggregateUsageFromResult, EMPTY_USAGE, type UsageTotals } from "./usage.js";

const running = new Map<string, AbortController>();

function randomId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const EXECUTION_SYSTEM = `You are a focused background worker for the user.

Your job:
1. Perform the task you were given, end to end.
2. Use your tools — WebSearch, WebFetch, and any integrations loaded for this spawn — to investigate and act.
3. Return a concise, well-structured answer — not a data dump.

Research discipline:
- Prefer WebSearch for fresh/factual questions. WebFetch when you need the content of a known URL.
- Cite real URLs only — NEVER invent sources. If a page failed to load, say so.
- Cross-check when it matters: one search is rarely enough for a claim.

MANDATORY: for any task that used WebSearch or WebFetch, end your response with
a "Sources:" section listing the ACTUAL URLs you fetched or found. Example:

  Sources:
  - https://www.lonelyplanet.com/japan/tokyo
  - https://www.japan-guide.com/e/e3008.html

No URLs = no sources section. Never write vague names like "Lonely Planet" or
"official guide" without the specific URL. The interaction agent relays your
output to the user verbatim, so if you don't include URLs, the user won't see
any.

Style:
- Optimize for iMessage delivery: short sentences, bullets over paragraphs, no tables.
- Prefer markdown with **bold** keywords and • bullets.
- Under 500 words unless explicitly asked for more.
- If you can't complete something, say why in one sentence.

Safety:
- Anything that sends a message, creates an event, or takes an external action: call save_draft with a JSON payload instead of the real send/create tool. Return the summary so the interaction agent can show it to the user.
- Only the interaction agent's send_draft tool commits. You never commit.`;

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
  const taskPreview =
    opts.task.length > 120 ? opts.task.slice(0, 120) + "…" : opts.task;
  logAgent(
    `spawn: ${name} [${opts.integrations.join(", ") || "no integrations"}] — ${JSON.stringify(taskPreview)}`,
  );
  const agentStart = Date.now();

  await convex.mutation(api.agents.create, {
    agentId,
    conversationId: opts.conversationId,
    name,
    task: opts.task,
    mcpServers: opts.integrations,
  });
  broadcast("agent_spawned", { agentId, name, task: opts.task });

  await convex.mutation(api.agents.update, { agentId, status: "running" });

  const integrationServers = await buildMcpServersForIntegrations(
    opts.integrations,
    opts.conversationId,
  );
  const draftServer = opts.conversationId
    ? createDraftStagingMcp(opts.conversationId)
    : undefined;
  const mcpServers = {
    ...integrationServers,
    ...(draftServer ? { "boop-drafts": draftServer } : {}),
  };
  const allowedTools = [
    "WebSearch",
    "WebFetch",
    "Skill",
    ...Object.keys(mcpServers).flatMap((n) => [`mcp__${n}__*`]),
  ];

  let buffer = "";
  let usage: UsageTotals = { ...EMPTY_USAGE };
  let status: "completed" | "failed" | "cancelled" = "completed";
  let errorMsg: string | undefined;

  try {
    for await (const msg of query({
      prompt: opts.task,
      options: {
        systemPrompt: EXECUTION_SYSTEM,
        model: process.env.BOOP_MODEL ?? "claude-sonnet-4-6",
        mcpServers,
        allowedTools,
        // Load .claude/skills/ so the model can invoke SKILL.md playbooks. Without
        // this the SDK runs in isolation mode and skills are silently ignored.
        settingSources: ["project"],
        permissionMode: "bypassPermissions",
        abortController: abort,
      },
    })) {
      if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "text") {
            buffer += block.text;
            await convex.mutation(api.agents.addLog, {
              agentId,
              logType: "text",
              content: block.text,
            });
          } else if (block.type === "tool_use") {
            const toolShort = block.name.replace(/^mcp__[a-z-]+__/, "");
            logAgent(`tool: ${toolShort}`);
            await convex.mutation(api.agents.addLog, {
              agentId,
              logType: "tool_use",
              toolName: block.name,
              content: JSON.stringify(block.input).slice(0, 2000),
            });
            broadcast("agent_tool", { agentId, toolName: block.name });
          }
        }
      } else if (msg.type === "user") {
        for (const block of msg.message.content) {
          if (block.type === "tool_result") {
            const text = Array.isArray(block.content)
              ? block.content
                  .map((c: { type: string; text?: string }) => (c.type === "text" ? (c.text ?? "") : ""))
                  .join("")
              : String(block.content ?? "");
            await convex.mutation(api.agents.addLog, {
              agentId,
              logType: "tool_result",
              content: text.slice(0, 2000),
            });
          }
        }
      } else if (msg.type === "result") {
        // Always take the aggregate from modelUsage — msg.usage is just the
        // final turn's raw tokens and massively undercounts on tool-heavy runs.
        usage = aggregateUsageFromResult(msg);
      }
    }
  } catch (err) {
    status = abort.signal.aborted ? "cancelled" : "failed";
    errorMsg = String(err);
    await convex.mutation(api.agents.addLog, {
      agentId,
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
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheCreationTokens: usage.cacheCreationTokens,
    costUsd: usage.costUsd,
  });
  // Also append to the usage log so total-cost queries cover every layer.
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
