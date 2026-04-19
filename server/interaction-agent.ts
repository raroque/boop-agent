import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { api } from "../convex/_generated/api.js";
import { convex } from "./convex-client.js";
import { createMemoryMcp } from "./memory/tools.js";
import { extractAndStore } from "./memory/extract.js";
import { availableIntegrations, spawnExecutionAgent } from "./execution-agent.js";
import { createAutomationMcp } from "./automation-tools.js";
import { createDraftDecisionMcp } from "./draft-tools.js";
import { broadcast } from "./broadcast.js";
import { sendImessage } from "./sendblue.js";
import { aggregateUsageFromResult, EMPTY_USAGE, type UsageTotals } from "./usage.js";

const INTERACTION_SYSTEM = `You are Boop, a personal agent the user texts from iMessage.

You are a DISPATCHER, not a doer. Your job:
1. Understand what the user wants.
2. Decide: answer directly (quick facts, chit-chat, anything you already know) OR spawn_agent (real work that needs tools like email, calendar, web, etc.).
3. When you spawn, give the agent a crisp, specific task — not the raw user message.
4. When the agent returns, relay the result in YOUR voice, tightened for iMessage.

Tone: Warm, witty, concise. Write like you're texting a friend. No corporate voice. No bullet dumps unless the user asked for a list.

Your only tools:
- recall / write_memory (durable memory for this user)
- spawn_agent (dispatches a sub-agent that CAN touch the world)
- create_automation / list_automations / toggle_automation / delete_automation
- list_drafts / send_draft / reject_draft

You cannot answer factual questions from your own knowledge. Not allowed.
You have NO browser, NO WebSearch, NO WebFetch, NO file access, NO APIs.
You are not allowed to recite facts about places, events, people, prices,
news, URLs, statistics, or anything "in the world." Your training data does
not count as a source.

Hard rule: if the user asks for information, research, a lookup, a
recommendation that requires real-world data, a current event, a comparison,
a tutorial, a how-to, any URL, or anything you'd be tempted to "just know" —
spawn_agent. No exceptions. Even if you're 99% sure. The sub-agent has
WebSearch/WebFetch and will return real citations; you don't and won't.

Acknowledgment rule (iMessage UX):
BEFORE every spawn_agent call, you MUST call send_ack first with a short
1-sentence message. The user otherwise sees nothing for 10-30 seconds while
the sub-agent works. Examples of good acks:
  "On it — one sec 🔍"
  "Looking into your calendar…"
  "Drafting that email now."
  "Checking Slack, hold tight."
Order: send_ack → spawn_agent → (wait) → final reply with the result.
Skip the ack ONLY for things you'll answer in under 2 seconds (chit-chat,
simple memory recall, single automation toggle).

Memory:
- Call recall() early for anything that might touch the user's preferences, projects, or history.
- Call write_memory() aggressively for durable facts. Err on the side of saving.

Safe to answer directly (no spawn needed):
- Greetings, acknowledgments, short conversational turns ("thanks", "lol", "ok got it").
- Explaining what you just did, confirming a draft, relaying a sub-agent's result.
- Clarifying your own abilities ("yes I can do that", "I'll need your X to proceed").
- Anything that's purely about the user (using recall).

Everything else — SPAWN.

Never fabricate URLs, site names, "sources", statistics, news, quotes, prices,
dates, or any external fact. "Sources: [vague site names]" is fabrication.

When relaying a sub-agent's answer:
- Pass through the Sources section the sub-agent included, VERBATIM. Don't
  add, remove, paraphrase, or summarize URLs.
- If the sub-agent did NOT include a Sources section, YOU DO NOT ADD ONE.
  Do not write "Sources: Lonely Planet, etc." No exceptions.
- You may tighten the body for iMessage (shorter bullets, fewer emojis),
  but the URLs are ground truth — don't touch them.

Automations:
- When the user asks for anything recurring ("every morning", "each week", "remind me", "check X daily"), use create_automation — don't just promise to do it later.
- Pick a cron expression (5 fields) and a specific task for the sub-agent.
- If they ask "what have I set up" or want to change/cancel something, use list_automations / toggle_automation / delete_automation.

Drafts:
- Any external action (email, calendar event, Slack message) goes through the draft flow. Execution agents SAVE drafts rather than sending directly.
- When the user confirms ("send it", "yes", "go ahead"), call list_drafts then send_draft with the matching integrations.
- When the user cancels or revises, call reject_draft.
- Never claim something was sent unless send_draft returned success.

Available integrations for spawn_agent: {{INTEGRATIONS}}

Format: Plain iMessage-friendly text. Markdown sparingly. Keep replies under ~400 chars when you can.`;

interface HandleOpts {
  conversationId: string;
  content: string;
  turnTag?: string;
  onThinking?: (chunk: string) => void;
}

function randomId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function handleUserMessage(opts: HandleOpts): Promise<string> {
  const turnId = randomId("turn");
  const integrations = availableIntegrations();

  await convex.mutation(api.messages.send, {
    conversationId: opts.conversationId,
    role: "user",
    content: opts.content,
    turnId,
  });
  broadcast("user_message", { conversationId: opts.conversationId, content: opts.content });

  const memoryServer = createMemoryMcp(opts.conversationId);
  const automationServer = createAutomationMcp(opts.conversationId);
  const draftDecisionServer = createDraftDecisionMcp(opts.conversationId);

  const ackServer = createSdkMcpServer({
    name: "boop-ack",
    version: "0.1.0",
    tools: [
      tool(
        "send_ack",
        `Send a short acknowledgment message to the user IMMEDIATELY, before a slow operation. Use this BEFORE spawn_agent so the user knows you heard them and are working on it. Keep it to ONE short sentence (ideally under 60 chars) with tone that matches the task. Examples: "On it — one sec 🔍", "Looking into it…", "Drafting now, hold tight.", "Let me check your calendar."`,
        {
          message: z.string().describe("1 short sentence ack. No markdown. Emojis OK."),
        },
        async (args) => {
          const text = args.message.trim();
          if (!text) {
            return {
              content: [{ type: "text" as const, text: "Empty ack skipped." }],
            };
          }
          if (opts.conversationId.startsWith("sms:")) {
            const number = opts.conversationId.slice(4);
            await sendImessage(number, text);
          }
          await convex.mutation(api.messages.send, {
            conversationId: opts.conversationId,
            role: "assistant",
            content: text,
            turnId,
          });
          broadcast("assistant_ack", {
            conversationId: opts.conversationId,
            content: text,
          });
          log(`→ ack: ${text}`);
          return {
            content: [{ type: "text" as const, text: "Ack sent to user." }],
          };
        },
      ),
    ],
  });

  const spawnServer = createSdkMcpServer({
    name: "boop-spawn",
    version: "0.1.0",
    tools: [
      tool(
        "spawn_agent",
        "Spawn a focused sub-agent to do real work using external tools. Returns the agent's final answer. Use for anything requiring lookups, drafting, or actions in the user's integrations.",
        {
          task: z
            .string()
            .describe("Crisp task description — what to find/draft/do, not the raw user message."),
          integrations: z
            .array(z.string())
            .describe(`Which integrations to give the agent. Available: ${integrations.join(", ") || "(none)"}`),
          name: z.string().optional().describe("Short label for the agent."),
        },
        async (args) => {
          const res = await spawnExecutionAgent({
            task: args.task,
            integrations: args.integrations,
            conversationId: opts.conversationId,
            name: args.name,
          });
          return {
            content: [
              {
                type: "text" as const,
                text: `[agent ${res.agentId} ${res.status}]\n\n${res.result}`,
              },
            ],
          };
        },
      ),
    ],
  });

  const history = await convex.query(api.messages.recent, {
    conversationId: opts.conversationId,
    limit: 10,
  });
  const historyBlock = history
    .slice(0, -1)
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  const systemPrompt = INTERACTION_SYSTEM.replace(
    "{{INTEGRATIONS}}",
    integrations.join(", ") || "(no integrations configured yet)",
  );

  const prompt = historyBlock
    ? `Prior turns:\n${historyBlock}\n\nCurrent message:\n${opts.content}`
    : opts.content;

  const tag = opts.turnTag ?? turnId.slice(-6);
  const log = (msg: string) => console.log(`[turn ${tag}] ${msg}`);

  const turnStart = Date.now();
  let reply = "";
  let usage: UsageTotals = { ...EMPTY_USAGE };
  try {
    for await (const msg of query({
      prompt,
      options: {
        systemPrompt,
        model: process.env.BOOP_MODEL ?? "claude-sonnet-4-6",
        mcpServers: {
          "boop-memory": memoryServer,
          "boop-spawn": spawnServer,
          "boop-automations": automationServer,
          "boop-draft-decisions": draftDecisionServer,
          "boop-ack": ackServer,
        },
        allowedTools: [
          "mcp__boop-memory__write_memory",
          "mcp__boop-memory__recall",
          "mcp__boop-spawn__spawn_agent",
          "mcp__boop-automations__create_automation",
          "mcp__boop-automations__list_automations",
          "mcp__boop-automations__toggle_automation",
          "mcp__boop-automations__delete_automation",
          "mcp__boop-draft-decisions__list_drafts",
          "mcp__boop-draft-decisions__send_draft",
          "mcp__boop-draft-decisions__reject_draft",
          "mcp__boop-ack__send_ack",
        ],
        // Belt-and-suspenders: even with bypassPermissions the SDK can leak
        // its built-ins if we only whitelist. Explicitly block them on the
        // dispatcher so it MUST spawn a sub-agent for external work.
        disallowedTools: [
          "WebSearch",
          "WebFetch",
          "Bash",
          "Read",
          "Write",
          "Edit",
          "Glob",
          "Grep",
          "Agent",
          "Skill",
        ],
        permissionMode: "bypassPermissions",
      },
    })) {
      if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "text") {
            reply += block.text;
            opts.onThinking?.(block.text);
          } else if (block.type === "tool_use") {
            const name = block.name.replace(/^mcp__boop-[a-z-]+__/, "");
            const inputPreview = JSON.stringify(block.input);
            log(
              `tool: ${name}(${inputPreview.length > 90 ? inputPreview.slice(0, 90) + "…" : inputPreview})`,
            );
          }
        }
      } else if (msg.type === "result") {
        usage = aggregateUsageFromResult(msg);
      }
    }
  } catch (err) {
    console.error(`[turn ${tag}] query failed`, err);
    reply = "Sorry — I hit an error processing that. Try again in a moment.";
  }

  reply = reply.trim() || "(no reply)";

  if (usage.costUsd > 0 || usage.inputTokens > 0) {
    log(
      `cost: in/out ${usage.inputTokens}/${usage.outputTokens}, cache r/w ${usage.cacheReadTokens}/${usage.cacheCreationTokens}, $${usage.costUsd.toFixed(4)}`,
    );
    await convex.mutation(api.usageRecords.record, {
      source: "dispatcher",
      conversationId: opts.conversationId,
      turnId,
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheCreationTokens: usage.cacheCreationTokens,
      costUsd: usage.costUsd,
      durationMs: Date.now() - turnStart,
    });
  }

  broadcast("assistant_message", { conversationId: opts.conversationId, content: reply });

  // Background extraction — fire-and-forget; don't block the reply.
  extractAndStore({
    conversationId: opts.conversationId,
    userMessage: opts.content,
    assistantReply: reply,
    turnId,
  }).catch((err) => console.error("[interaction] extraction error", err));

  return reply;
}
