import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { api } from "../convex/_generated/api.js";
import { convex } from "./convex-client.js";
import { createMemoryMcp } from "./memory/tools.js";
import { extractAndStore } from "./memory/extract.js";
import { availableIntegrations, spawnExecutionAgent } from "./execution-agent.js";
import { createAutomationMcp } from "./automation-tools.js";
import { createDraftDecisionMcp } from "./draft-tools.js";
import { createSelfMcp } from "./self-tools.js";
import { getRuntimeModel } from "./runtime-config.js";
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
- get_config / set_model / set_timezone / list_integrations / search_composio_catalog / inspect_toolkit (self-inspection)

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
BEFORE any spawn_agent call(s), you MUST call send_ack first with a short
1-sentence message. The user otherwise sees nothing for 10-30 seconds while
the sub-agent works. Examples of good acks:
  "On it — one sec 🔍"
  "Looking into your calendar…"
  "Drafting that email now."
  "Checking Slack, hold tight."
Order: send_ack → spawn_agent(s) → (wait) → final reply with the result(s).
ONE ack covers multiple parallel spawns — don't ack each one separately.
Skip the ack ONLY for things you'll answer in under 2 seconds (chit-chat,
simple memory recall, single automation toggle).

Parallel spawning:
When the user's request decomposes into independent sub-tasks (e.g. "check
my gmail unreads AND summarize today's calendar", or "draft the email and
also find me 3 restaurants nearby"), emit MULTIPLE spawn_agent tool_use
blocks in the SAME assistant turn. They run concurrently and you'll see
all results before your next turn. This is much faster than chaining
sequential spawns. Rules:
  - Only fan out for genuinely independent tasks. If task B needs task A's
    result, do them sequentially.
  - Send ONE send_ack first, then all the spawns in the same turn.
  - When relaying, combine the results in one reply — don't make the user
    read N separate messages.

Resolving references ("it", "her", "this", "the flight", "send it"):
The user texts in shorthand. Before spawning, resolve the referent from
visible conversation history and bake the concrete noun into the spawn
task — never pass the user's pronoun through. "Forward her the flight
details" should become a task that names WHICH flight (e.g. "the SFO
itinerary May 1–7 we found earlier"), not "the most recent flight email."
"Most recent X" is NOT a safe default for ambiguous references.
- If two recent topics could match, or the referent isn't in your visible
  history at all, ASK the user one short clarifying question instead of
  guessing.
- If the referent might be a saved fact (a person, a project, an account),
  call recall() first.
- Topic hops (the user wandered to YouTube/Twitter/etc.) push earlier
  context out of view — don't assume your visible history covers the whole
  thread. When in doubt, ask.

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

Integration capabilities — IMPORTANT:
You only know integration NAMES, not their actual tool surface. Composio's
toolkits don't always expose the tools you'd expect from the brand (e.g. the
LinkedIn toolkit has no inbox/DM tools). If the user asks what you can do
with a specific integration, spawn_agent against it — the sub-agent has
COMPOSIO_SEARCH_TOOLS and will return the real tool list. Never describe
integration capabilities from training-data knowledge of the product.

Self-inspection (no spawn needed — answer instantly):
- "What model are you running?" → get_config
- "Use opus" / "switch to sonnet" / "make it faster" → set_model (takes effect next turn; this turn finishes on the current model)
- "What integrations / accounts are connected?" / "Which Gmail account?" → list_integrations
- "Is there a tool for X?" / "Can you connect to Y?" → search_composio_catalog
- "Is Slack connected?" / "What tools does Notion expose?" → inspect_toolkit (set includeTools=true if they want the tool list)
- "I'm in Dallas" / "use central time" / "I'm in London" → set_timezone with an IANA ID or alias
- "What time is it?" / "What's my timezone?" → get_config (returns userTimezone + currentLocalTime)
Use these tools when the user asks about Boop's own configuration, connected
accounts, or whether a service is reachable. They're cheap and synchronous —
no ack required.

Time / timezone:
The user has a saved timezone in get_config.userTimezone. Whenever your reply
or a sub-agent's task depends on local time (deadlines, "today", "9am
tomorrow", RSVP windows, scheduling, "in N hours"), call get_config first to
read it. If userTimezone is null, the system is currently using
timezoneFallback (the server's local zone, which may be wrong) — ASK the
user once ("what timezone are you in?") and call set_timezone with their
answer. Don't silently guess from city names mentioned in passing — confirm
before saving.

Choosing integrations for spawn_agent:
- Pick the SPECIFIC native toolkit that matches the task (gmail for email,
  calendar for events, slack for slack, etc.). Don't shotgun all of them.
- The "browser" integration is a FALLBACK for sites/services with no native
  toolkit. NEVER pass "browser" for a task a native toolkit can do — if the
  user asks about Gmail, pass ["gmail"], NOT ["browser"] or ["gmail", "browser"].
  Browser is for tasks like "log into my landlord's tenant portal and grab
  this month's invoice" — sites we don't have a Composio toolkit for. The
  sub-agent already runs in a logged-in Chrome profile via "browser".
- If you're unsure whether a toolkit exists, prefer the toolkit name and let
  the sub-agent fall back if it doesn't have the right tool surface.

Available integrations for spawn_agent: {{INTEGRATIONS}}

Pending continuation for this conversation: {{PENDING_CONTINUATION}}

When pending continuation is non-null, a previous sub-agent paused mid-task
and asked the user to do something by hand (login, OAuth, captcha, file
pick). Decide based on the user's CURRENT message:
- If their reply indicates they completed the action (any signal of
  readiness — "done", "logged in", "ready", "ok", "yes", "now", "go", or
  similar; OR they say nothing about cancelling and just push forward like
  "what's the balance?"): IMMEDIATELY call spawn_agent with the saved
  resume_task, the saved integrations, and a name like "resume". Do NOT
  ask for clarification first — the user is waiting. Send_ack right before
  if it'll take a while.
- If they cancel, change topic, or say it didn't work: tell the user
  briefly ("got it, dropping that"), call clear_pending_continuation, and
  proceed normally with their new request.

Format: Plain iMessage-friendly text. Markdown sparingly. Keep replies under ~400 chars when you can.`;

interface HandleOpts {
  conversationId: string;
  content: string;
  turnTag?: string;
  onThinking?: (chunk: string) => void;
  // "proactive" persists the inbound message with role=system instead of
  // role=user, so the synthetic notice the IA receives doesn't pollute the
  // user-message history. Defaults to "user".
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

  const pendingContinuation = await convex.query(api.pendingContinuations.get, {
    conversationId: opts.conversationId,
  });

  const memoryServer = createMemoryMcp(opts.conversationId);
  const automationServer = createAutomationMcp(opts.conversationId);
  const draftDecisionServer = createDraftDecisionMcp(opts.conversationId);
  const selfServer = createSelfMcp();

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
          // Skip the iMessage send for proactive turns — those go out as a
          // single self-contained notice from dispatchProactiveNotice. If the
          // IA calls send_ack here on a proactive turn, the user would get
          // two iMessages (the ack + the final reply). Still persist + log
          // so the debug UI sees it.
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

  // Set by spawn_agent when a sub-agent paused for user action. The post-loop
  // logic uses this to skip the "(no reply)" fallback so the user doesn't
  // receive a placeholder message after the sub-agent already sent its own.
  let dispatcherSilent = false;

  const spawnServer = createSdkMcpServer({
    name: "boop-spawn",
    version: "0.1.0",
    tools: [
      tool(
        "spawn_agent",
        "Spawn a focused sub-agent to do real work using external tools. Returns the agent's final answer. Use for anything requiring lookups, drafting, or actions in the user's integrations. Multiple independent spawn_agent calls in one turn run in parallel — fan out when the request has independent sub-tasks instead of chaining serially.",
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
          if (res.status === "paused") {
            dispatcherSilent = true;
            return {
              content: [
                {
                  type: "text" as const,
                  text: `[agent ${res.agentId} PAUSED — waiting for user to complete a hand-action]\n\nThe sub-agent already messaged the user with what to do. DO NOT relay anything else for this turn — return an empty assistant message. Boop will re-spawn the agent when the user replies.`,
                },
              ],
            };
          }
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
    limit: 30,
  });
  const historyBlock = history
    .slice(0, -1)
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  const pendingServer = createSdkMcpServer({
    name: "boop-pending",
    version: "0.1.0",
    tools: [
      tool(
        "clear_pending_continuation",
        "Drop any pending continuation set by a paused sub-agent for THIS conversation. Call this when the user changes topic, cancels, or reports the hand-action didn't work — anything that means we shouldn't auto-resume the saved task. No-op when there's nothing pending.",
        {},
        async () => {
          await convex.mutation(api.pendingContinuations.clear, {
            conversationId: opts.conversationId,
          });
          return { content: [{ type: "text" as const, text: "Pending continuation cleared." }] };
        },
      ),
    ],
  });

  const pendingDescription = pendingContinuation
    ? `RESUME_TASK="${pendingContinuation.resumeTask.replace(/"/g, '\\"')}", INTEGRATIONS=[${pendingContinuation.integrations.join(", ")}], asked ${Math.round((Date.now() - pendingContinuation.askedAt) / 1000)}s ago by agent ${pendingContinuation.pausedByAgentId ?? "?"}`
    : "(none)";

  const systemPrompt = INTERACTION_SYSTEM.replace(
    "{{INTEGRATIONS}}",
    integrations.join(", ") || "(no integrations configured yet)",
  ).replace("{{PENDING_CONTINUATION}}", pendingDescription);

  const prompt = historyBlock
    ? `Prior turns:\n${historyBlock}\n\nCurrent message:\n${opts.content}`
    : opts.content;

  const tag = opts.turnTag ?? turnId.slice(-6);
  const log = (msg: string) => console.log(`[turn ${tag}] ${msg}`);

  const turnStart = Date.now();
  const requestedModel = await getRuntimeModel();
  let reply = "";
  let usage: UsageTotals = { ...EMPTY_USAGE };
  try {
    for await (const msg of query({
      prompt,
      options: {
        systemPrompt,
        model: requestedModel,
        mcpServers: {
          "boop-memory": memoryServer,
          "boop-spawn": spawnServer,
          "boop-automations": automationServer,
          "boop-draft-decisions": draftDecisionServer,
          "boop-ack": ackServer,
          "boop-self": selfServer,
          "boop-pending": pendingServer,
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
          "mcp__boop-pending__clear_pending_continuation",
          "mcp__boop-ack__send_ack",
          "mcp__boop-self__get_config",
          "mcp__boop-self__set_model",
          "mcp__boop-self__set_timezone",
          "mcp__boop-self__list_integrations",
          "mcp__boop-self__search_composio_catalog",
          "mcp__boop-self__inspect_toolkit",
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
        // Reset `reply` on each new assistant turn so only the LAST turn's
        // text becomes the user-facing iMessage. Earlier turns are usually
        // pre-tool-call narration ("Got it — saving that now.") that, if
        // concatenated with the post-tool-result final text, sends as one
        // smushed iMessage. Streaming via onThinking still sees everything.
        reply = "";
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
        usage = aggregateUsageFromResult(msg, requestedModel);
      }
    }
  } catch (err) {
    console.error(`[turn ${tag}] query failed`, err);
    reply = "Sorry — I hit an error processing that. Try again in a moment.";
  }

  // When a sub-agent paused for user action it already sent its own message —
  // don't fall back to the "(no reply)" placeholder, since that'd send a
  // useless string to the user. Returning empty here makes the caller skip
  // the iMessage send entirely.
  reply = dispatcherSilent ? reply.trim() : reply.trim() || "(no reply)";

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
  // Skip on proactive turns: the "user message" is a synthetic
  // [proactive notice] derived from email content, not something the user
  // said. Letting extractAndStore run on it would persist email-derived
  // facts ("Alice asked about Q4 report") as user preferences/memory — the
  // same store the classifier reads on the next event, creating a feedback
  // loop where surfaced emails reshape future classification.
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
