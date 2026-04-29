import { z } from "zod";
import { api } from "../convex/_generated/api.js";
import { convex } from "./convex-client.js";
import { createMemoryTools } from "./memory/tools.js";
import { extractAndStore } from "./memory/extract.js";
import { availableIntegrations, spawnExecutionAgent } from "./execution-agent.js";
import { createAutomationTools } from "./automation-tools.js";
import { createDraftDecisionTools } from "./draft-tools.js";
import { createSelfTools } from "./self-tools.js";
import { getRuntimeConfig } from "./runtime-config.js";
import { broadcast } from "./broadcast.js";
import { sendImessage } from "./sendblue.js";
import { EMPTY_USAGE, type UsageTotals } from "./usage.js";
import { runAgentRuntime } from "./runtimes/index.js";
import { objectSchema, stringArraySchema, stringSchema } from "./runtimes/json-schema.js";
import type { RuntimeTool } from "./runtimes/types.js";
import { runtimeText } from "./runtimes/types.js";

const INTERACTION_SYSTEM = `You are Boop, a personal agent the user texts from iMessage.

Identity:
- You are Boop. Never present yourself as Codex, Claude, OpenAI, Anthropic, or any underlying provider.
- The runtime/model/provider is private plumbing unless the user explicitly asks about configuration.
- If asked who/what you are, answer as Boop. If asked what runtime/model is configured, use get_config and explain it as Boop's backend setting.

You are a DISPATCHER, not a doer. Your job:
1. Understand what the user wants.
2. Decide: answer directly (quick facts, chit-chat, anything you already know) OR spawn_agent (real work that needs tools like email, calendar, web, etc.).
3. When you spawn, give the agent a crisp, specific task - not the raw user message.
4. When the agent returns, relay the result in YOUR voice, tightened for iMessage.

Tone: Warm, witty, concise. Write like you're texting a friend. No corporate voice. No bullet dumps unless the user asked for a list.

Your only tools:
- recall / write_memory (durable memory for this user)
- spawn_agent (dispatches a sub-agent that CAN touch the world)
- create_automation / list_automations / toggle_automation / delete_automation
- list_drafts / send_draft / reject_draft
- get_config / set_runtime / set_model / set_reasoning_effort / set_timezone / list_integrations / search_composio_catalog / inspect_toolkit (self-inspection)

You cannot answer factual questions from your own knowledge. Not allowed.
You have NO browser, NO WebSearch, NO WebFetch, NO file access, NO APIs.
You are not allowed to recite facts about places, events, people, prices,
news, URLs, statistics, or anything "in the world." Your training data does
not count as a source.

Hard rule: if the user asks for information, research, a lookup, a
recommendation that requires real-world data, a current event, a comparison,
a tutorial, a how-to, any URL, or anything you'd be tempted to "just know" -
spawn_agent. No exceptions. Even if you're 99% sure. The sub-agent has the
runtime's external-work capabilities and will return real citations when it
researches; you don't and won't.

Acknowledgment rule (iMessage UX):
BEFORE every spawn_agent call, you MUST call send_ack first with a short
1-sentence message. The user otherwise sees nothing for 10-30 seconds while
the sub-agent works. Examples of good acks:
  "On it - one sec"
  "Looking into your calendar..."
  "Drafting that email now."
  "Checking Slack, hold tight."
Order: send_ack -> spawn_agent -> final reply with the result.
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

Everything else - SPAWN.

Never fabricate URLs, site names, "sources", statistics, news, quotes, prices,
dates, or any external fact. "Sources: [vague site names]" is fabrication.

When relaying a sub-agent's answer:
- Pass through the Sources section the sub-agent included, VERBATIM. Don't
  add, remove, paraphrase, or summarize URLs.
- If the sub-agent did NOT include a Sources section, YOU DO NOT ADD ONE.
  Do not write "Sources: Lonely Planet, etc." No exceptions.
- You may tighten the body for iMessage (shorter bullets, fewer emojis),
  but the URLs are ground truth - don't touch them.

Automations:
- When the user asks for anything recurring ("every morning", "each week", "remind me", "check X daily"), use create_automation - don't just promise to do it later.
- Pick a cron expression (5 fields) and a specific task for the sub-agent.
- If they ask "what have I set up" or want to change/cancel something, use list_automations / toggle_automation / delete_automation.

Drafts:
- Any external action (email, calendar event, Slack message) goes through the draft flow. Execution agents SAVE drafts rather than sending directly.
- When the user confirms ("send it", "yes", "go ahead"), call list_drafts then send_draft with the matching integrations.
- When the user cancels or revises, call reject_draft.
- Never claim something was sent unless send_draft returned success.

Integration capabilities - IMPORTANT:
You only know integration NAMES, not their actual tool surface. Composio's
toolkits don't always expose the tools you'd expect from the brand. If the
user asks what you can do with a specific integration, spawn_agent against it.
Never describe integration capabilities from training-data knowledge of the product.

Self-inspection (no spawn needed - answer instantly):
- "What model are you running?" -> get_config
- "Use codex" / "use OpenAI API" / "switch back to claude" -> set_runtime
- "Use opus" / "switch to sonnet" / "use gpt-5.5" -> set_model
- "Think harder" / "use low effort" / "make it faster" -> set_reasoning_effort
- "What integrations / accounts are connected?" / "Which Gmail account?" -> list_integrations
- "Is there a tool for X?" / "Can you connect to Y?" -> search_composio_catalog
- "Is Slack connected?" / "What tools does Notion expose?" -> inspect_toolkit (set includeTools=true if they want the tool list)
- "I'm in Dallas" / "use central time" / "I'm in London" -> set_timezone with an IANA ID or alias
- "What time is it?" / "What's my timezone?" -> get_config (returns userTimezone + currentLocalTime)
Use these tools when the user asks about Boop's own configuration, connected
accounts, or whether a service is reachable. They're cheap and synchronous,
no ack required.

Time / timezone:
The user has a saved timezone in get_config.userTimezone. Whenever your reply
or a sub-agent's task depends on local time (deadlines, "today", "9am
tomorrow", RSVP windows, scheduling, "in N hours"), call get_config first to
read it. If userTimezone is null, the system is currently using
timezoneFallback (the server's local zone, which may be wrong). Ask the
user once ("what timezone are you in?") and call set_timezone with their
answer. Don't silently guess from city names mentioned in passing. Confirm
before saving.

Available integrations for spawn_agent: {{INTEGRATIONS}}

Format: Plain iMessage-friendly text. Markdown sparingly. Keep replies under ~400 chars when you can.`;

interface HandleOpts {
  conversationId: string;
  content: string;
  turnTag?: string;
  onThinking?: (chunk: string) => void;
  kind?: "user" | "proactive";
}

function randomId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function handleUserMessage(opts: HandleOpts): Promise<string> {
  const turnId = randomId("turn");
  const integrations = availableIntegrations();

  const inboundRole = opts.kind === "proactive" ? "system" : "user";
  await convex.mutation(api.messages.send, {
    conversationId: opts.conversationId,
    role: inboundRole,
    content: opts.content,
    turnId,
  });
  broadcast(opts.kind === "proactive" ? "proactive_notice" : "user_message", {
    conversationId: opts.conversationId,
    content: opts.content,
  });

  const history = await convex.query(api.messages.recent, {
    conversationId: opts.conversationId,
    limit: 10,
  });
  const historyBlock = history
    .slice(0, -1)
    .map((m: any) => `${m.role.toUpperCase()}: ${m.content}`)
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

  const ackSchema = {
    message: z.string().describe("1 short sentence ack. No markdown. Emojis OK."),
  };
  const spawnSchema = {
    task: z.string().describe("Crisp task description - what to find/draft/do, not the raw user message."),
    integrations: z
      .array(z.string())
      .describe(`Which integrations to give the agent. Available: ${integrations.join(", ") || "(none)"}`),
    name: z.string().optional().describe("Short label for the agent."),
  };

  const turnTools: RuntimeTool[] = [
    ...createMemoryTools(opts.conversationId),
    ...createAutomationTools(opts.conversationId),
    ...createDraftDecisionTools(opts.conversationId),
    ...createSelfTools(),
    {
      namespace: "boop-ack",
      name: "send_ack",
      description:
        'Send a short acknowledgment message to the user IMMEDIATELY, before a slow operation. Use this BEFORE spawn_agent so the user knows you heard them and are working on it. Keep it to ONE short sentence. Examples: "On it - one sec", "Looking into it...", "Drafting now, hold tight."',
      zodSchema: ackSchema,
      jsonSchema: objectSchema({
        message: stringSchema("1 short sentence ack. No markdown. Emojis OK."),
      }),
      handle: async (rawArgs) => {
        const args = z.object(ackSchema).parse(rawArgs);
        const text = args.message.trim();
        if (!text) return runtimeText("Empty ack skipped.");
        if (opts.conversationId.startsWith("sms:") && opts.kind !== "proactive") {
          const number = opts.conversationId.slice(4);
          await sendImessage(number, text);
        }
        await convex.mutation(api.messages.send, {
          conversationId: opts.conversationId,
          role: "assistant",
          content: text,
          turnId,
        });
        broadcast("assistant_ack", { conversationId: opts.conversationId, content: text });
        log(`ack: ${text}`);
        return runtimeText("Ack sent to user.");
      },
    },
    {
      namespace: "boop-spawn",
      name: "spawn_agent",
      description:
        "Spawn a focused sub-agent to do real work using external tools. Returns the agent's final answer. Use for anything requiring lookups, drafting, or actions in the user's integrations. If it fails, do not blindly retry the same task; explain the failure or retry once with a meaningfully narrower task.",
      zodSchema: spawnSchema,
      jsonSchema: objectSchema(
        {
          task: stringSchema("Crisp task description - what to find/draft/do, not the raw user message."),
          integrations: stringArraySchema(
            `Which integrations to give the agent. Available: ${integrations.join(", ") || "(none)"}`,
          ),
          name: stringSchema("Short label for the agent."),
        },
        ["task", "integrations"],
      ),
      handle: async (rawArgs) => {
        const args = z.object(spawnSchema).parse(rawArgs);
        const res = await spawnExecutionAgent({
          task: args.task,
          integrations: args.integrations,
          conversationId: opts.conversationId,
          name: args.name,
        });
        const text =
          res.status === "completed"
            ? `[agent ${res.agentId} completed]\n\n${res.result}`
            : `[agent ${res.agentId} ${res.status}]\n\nSub-agent failed before completing the task:\n${res.result}`;
        return runtimeText(text, res.status === "completed");
      },
    },
  ];

  const turnStart = Date.now();
  const requestedRuntime = await getRuntimeConfig();
  let reply = "";
  let usage: UsageTotals = { ...EMPTY_USAGE };
  let streamStarted = false;
  let streamedChars = 0;
  let nextStreamLogAt = 400;
  const onText = (chunk: string) => {
    if (!chunk) return;
    streamedChars += chunk.length;
    opts.onThinking?.(chunk);
    if (!streamStarted && chunk.trim()) {
      streamStarted = true;
      log("stream started");
    }
    if (streamedChars >= nextStreamLogAt) {
      log(`streaming ${streamedChars} chars...`);
      nextStreamLogAt += 400;
    }
  };

  try {
    const result = await runAgentRuntime(requestedRuntime.runtime, {
      prompt,
      systemPrompt,
      model: requestedRuntime.model,
      reasoningEffort: requestedRuntime.reasoningEffort,
      tools: turnTools,
      mode: "dispatcher",
      onText,
      onToolUse: (toolName, input) => {
        const name = toolName.replace(/^mcp__boop-[a-z-]+__/, "");
        const inputPreview = JSON.stringify(input);
        log(`tool: ${name}(${inputPreview.length > 90 ? inputPreview.slice(0, 90) + "..." : inputPreview})`);
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
        "mcp__boop-self__get_config",
        "mcp__boop-self__set_runtime",
        "mcp__boop-self__set_model",
        "mcp__boop-self__set_reasoning_effort",
        "mcp__boop-self__set_timezone",
        "mcp__boop-self__list_integrations",
        "mcp__boop-self__search_composio_catalog",
        "mcp__boop-self__inspect_toolkit",
      ],
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
    });
    reply = result.text;
    usage = result.usage;
  } catch (err) {
    console.error(`[turn ${tag}] query failed`, err);
    reply = "Sorry - I hit an error processing that. Try again in a moment.";
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
  await convex.mutation(api.messages.send, {
    conversationId: opts.conversationId,
    role: "assistant",
    content: reply,
    turnId,
  });

  if (opts.kind !== "proactive") {
    extractAndStore({
      conversationId: opts.conversationId,
      userMessage: opts.content,
      assistantReply: reply,
      turnId,
    }).catch((err) => console.error("[interaction] extraction error", err));
  }

  return reply;
}
