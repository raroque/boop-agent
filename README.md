<p align="center">
  <img src="assets/boop.png" alt="Boop" width="220" />
</p>

# Boop

An iMessage-based personal agent built on top of the [Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk/overview).

📺 **Watch the walkthrough:** [YouTube — How I built Boop](https://www.youtube.com/watch?v=3Rc4MlMJMNU)

> **This is a starting point, not a finished product.**
> It's the architecture I built for my own personal agent, opened up as a template so you can take it, text-enable your own Claude, and extend it however you want. Integrations are plugged in via [Composio](https://composio.dev) — drop in an API key and connect Gmail, Slack, GitHub, Linear, Notion, and ~1000 others straight from the debug dashboard.

```
 iMessage  →  Sendblue webhook  →  Interaction agent  →  Sub-agents (per task)
                                          │                    │
                                          ▼                    ▼
                                    Memory store  ←──  Integrations (your MCP tools)
```

Built on:
- [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript) — the loop, tool use, sub-agents, MCP
- [Composio](https://composio.dev) — integrations layer. One API key = Gmail, Slack, GitHub, Linear, Notion, Stripe, Supabase, + ~1000 more with hosted OAuth
- [Sendblue](https://sendblue.co) — iMessage in/out (free on their agent plan)
- [Convex](https://convex.dev) — real-time database for memory, agents, drafts
- Your [Claude Code](https://claude.com/code) subscription — no separate Anthropic API key required

---

## Heads up before you use this

- **This was never meant to be open-sourced.** I built it for personal use and decided to share the architecture after enough people asked. It's not a product.
- **Not optimized for cost or security.** Use at your own risk. Review the code, set your own budgets, and don't trust it with anything you wouldn't trust yourself with.
- **I'm open to PRs for optimizations** — performance, bug fixes, DX improvements, new example integrations, better docs.
- **Claude Agent SDK is load-bearing.** I won't merge PRs that swap it out or add workarounds to run non-Anthropic models. This template exists specifically to show what you can build on top of the SDK. If you want to run this against a different model or provider, please fork — I'll happily link to good forks from here.

---

## What you get

- **iMessage in / iMessage out** via Sendblue (with typing indicators and webhook dedup).
- **Sendblue CLI integration** — `npm run dev` auto-registers the inbound webhook for you every restart (no re-pasting into the dashboard when free ngrok rotates your URL).
- **Dispatcher + workers** pattern: a lean interaction agent decides what to do, spawns focused sub-agents that actually do the work.
- **Pure dispatcher** — the interaction agent has only memory + spawn + automation + draft tools. Web access, files, and integrations are explicitly denied to it; sub-agents get `WebSearch` / `WebFetch` / the integrations.
- **Tiered memory** (short / long / permanent) with post-turn extraction, decay, and cleaning.
- **Vector search** for recall when you add an embeddings key (Voyage or OpenAI) — falls back to substring.
- **Memory consolidation** — a nightly proposer + judge pass that merges duplicates and resolves contradictions.
- **Automations** — the agent can schedule recurring work from a text ("every morning at 8 summarize my calendar") and push results back to iMessage.
- **Draft-and-send** — any external action stages a draft first; the agent only commits when the user confirms.
- **Heartbeat + retry** — stuck agents auto-fail, debug dashboard can retry.
- **Composio-powered integrations** — one API key unlocks 1000+ toolkits. Connect Gmail, Slack, GitHub, Linear, Notion, Drive, HubSpot, etc. with a click from the debug dashboard. Composio handles OAuth + token refresh.
- **Debug dashboard** (React + Vite) with a Boop mascot — Dashboard (spend + tokens + agent status), Agents (timeline + integration logos), Automations, Memory (table + force-directed graph), Events, Connections.
- **Convex** for persistence — real-time, typed, free tier.
- **Uses your Claude Code subscription** — no separate Anthropic API key required.

---

## Prerequisites

You need accounts for these. Keep the tabs open — setup will ask for credentials from each.

| Service | Why | Free? |
|---|---|---|
| [Claude Code](https://claude.com/code) | Powers the agent. Install it, sign in once, the SDK uses your session. | Subscription required |
| [Sendblue](https://sendblue.co) | iMessage bridge. Get a number, grab API keys. | Free on their agent plan |
| [Convex](https://convex.dev) | Database + realtime. | Free tier is plenty |
| [Composio](https://composio.dev) | Integrations — one API key unlocks ~1000 toolkits. Optional if you just want chat + memory + automations without third-party access. | Free tier covers personal use |
| [ngrok](https://ngrok.com) or similar | Expose your local port so Sendblue can reach it. | Free tier works |

Integrations are **opt-in**. First-run without a Composio key gives you a plain chat agent with memory + automations. Drop in `COMPOSIO_API_KEY` and connect toolkits from the Debug UI whenever you want more.

**Custom integrations welcome.** Composio covers the common catalog, but you're free to add your own MCP servers under `server/integrations/` and register them in `server/integrations/registry.ts` — the dispatcher treats them the same as Composio-backed ones (just named toolkits the execution agent can spawn against). Useful for in-house APIs, local tools, or anything Composio doesn't ship.

---

## Quickstart

```bash
# 1. Clone + install
git clone <your-fork-url> boop-agent
cd boop-agent
npm install

# 2. Install Claude Code (one-time, global) and sign in
npm install -g @anthropic-ai/claude-code
claude  # sign in, then Ctrl-C to exit

# 3. Interactive setup — writes .env.local, creates Convex deployment
npm run setup

# 4. Install ngrok (one-time) and authorize it
brew install ngrok
# or grab from https://ngrok.com/download
ngrok config add-authtoken <your-token>   # free at https://dashboard.ngrok.com

# 5. Start everything with one command — server, Convex, debug UI, and ngrok
npm run dev
```

`npm run dev` prints color-prefixed output from all four processes and shows a banner with your ngrok webhook URL once the tunnel is live.

```
Public URL:        https://<abc123>.ngrok.app
Sendblue webhook:  https://<abc123>.ngrok.app/sendblue/webhook
```

On free ngrok, **the webhook auto-registers with Sendblue every boot** — no manual paste needed. For stable URLs (ngrok reserved or Cloudflare Tunnel), set the webhook once in the dashboard.

Text your Sendblue-provisioned number from a **different** phone. The agent replies.

> **⚠ ngrok free plan gives you a new URL every time.** That means every time you restart `npm run dev`, your Sendblue webhook URL is dead until you paste the new one in.
>
> If you're going to run this for more than a quick demo, **strongly recommend one of:**
> - **ngrok paid plan** — gives you a reserved domain that stays the same forever
> - **[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)** — free, stable subdomain, a bit more setup
> - Any other tunnel with a static URL (Tailscale Funnel, localtunnel reserved, etc.)
>
> If you use a non-ngrok tunnel, point it at `localhost:3456` yourself — `npm run dev` will still run the rest, just ignore its ngrok output and use your tunnel's URL.

> **Gotcha:** `SENDBLUE_FROM_NUMBER` must be your Sendblue-provisioned number (the one people text TO), not your personal cell. Sendblue's API requires it, and misconfiguring it returns either "missing required parameter: from_number" or "Cannot send messages to self".
>
> **Fix in one command:** `npm run sendblue:sync` pulls the right number from the Sendblue CLI and writes it to `.env.local`.

---

## How the Sendblue integration works

Boop uses the [Sendblue CLI](https://github.com/sendblue-api/sendblue-cli) (`@sendblue/cli`) to eliminate almost all manual dashboard work. Three NPM scripts wrap it:

| Command | What it does |
|---|---|
| `npm run setup` | Interactive. Offers to run `sendblue login` / `sendblue setup` and pulls `api_key_id` + `api_secret_key` from `sendblue show-keys` into `.env.local`. |
| `npm run sendblue:sync` | Runs `sendblue lines`, parses your provisioned phone number, and writes `SENDBLUE_FROM_NUMBER` to `.env.local` in E.164 format. Run this anytime your number changes or got set wrong. |
| `npm run sendblue:webhook -- <url>` | Runs `sendblue webhooks list`, removes stale ngrok/tunnel hooks, and adds `<url>` as a `type=receive` inbound webhook. Called automatically by `npm run dev`. |

### The `npm run dev` lifecycle

```
 1. Preflight: confirm convex/_generated/ exists (else prompt to run setup).
 2. Spawn four children in parallel, each with a prefixed log stream:
       server │   (tsx watch server/index.ts)
       convex │   (npx convex dev — pushes schema + functions)
       debug  │   (vite dev server on :5173)
       ngrok  │   (if installed AND no static URL) exposes :PORT
 3. Wait for all four readiness signals:
       server → "listening on :PORT"
       convex → "Convex functions ready"
       debug  → "Local:  http://localhost:5173/"
       ngrok  → tunnel URL visible at http://127.0.0.1:4040
 4. Auto-register the webhook (FREE ngrok only, not reserved domains):
       webhook │ [webhook] removed stale https://old.ngrok-free.app/sendblue/webhook
       webhook │ [webhook] registered https://new.ngrok-free.app/sendblue/webhook (type=receive)
 5. Show the banner with dashboard + public URL + your Sendblue number.
```

The banner will look like:

```
════════════════════════════════════════════════════════════════════
  Boop is ready — ngrok tunnel is live  (webhook auto-registered).

  🐶 Debug dashboard (click me):   http://localhost:5173
  🌐 Public URL:                   https://abc123.ngrok-free.app
  📮 Sendblue webhook (inbound):   https://abc123.ngrok-free.app/sendblue/webhook
  📱 Text this Sendblue number:    +13053369541  (from a DIFFERENT phone)
════════════════════════════════════════════════════════════════════
```

### When auto-register fires vs when it doesn't

| Setup | Auto-register fires? | Why |
|---|---|---|
| Free ngrok (default) | **Yes**, every boot | URL rotates; dashboard would be stale otherwise |
| Reserved `NGROK_DOMAIN` | No | URL is stable; configure once in Sendblue dashboard |
| Static `PUBLIC_URL` (Cloudflare Tunnel etc.) | No | Same reason |
| `SENDBLUE_AUTO_WEBHOOK=false` | No | Manual opt-out |

### What you'll see in the server logs during a conversation

When someone texts your Sendblue number, expect this sequence in your terminal:

```
server │ [turn a3f21d] ← +14155551234: "what's on my calendar today?"
server │ [turn a3f21d] tool: recall({"query":"calendar today"})
server │ [turn a3f21d] tool: spawn_agent({"integrations":["google-calendar"],"task":"Pull today's events"})
server │ [agent 9e82c1] spawn: google-calendar [google-calendar] — "Pull today's events"
server │ [agent 9e82c1] tool: list_events
server │ [agent 9e82c1] done (completed, 2.1s, in/out tokens 1234/567)
server │ [turn a3f21d] → reply (3.4s, 140 chars): "Light day — just your 2pm with Sarah..."
server │ [sendblue] → sent 140 chars to +14155551234
```

Per-line anatomy:

- **`[turn xxxxxx]`** — one iMessage round trip. Same id across `←` (incoming) → tool calls → `→ reply` → `[sendblue] sent`.
- **`[agent xxxxxx]`** — a spawned execution agent. Shows `spawn`, each `tool:` it invokes, and `done` with timing + token counts.
- **`[sendblue]`** — outbound send results. If Sendblue rejects, the error body is logged with a hint about the likely cause (from_number mismatch, self-send, etc.).

The same events are written to Convex (`messages`, `executionAgents`, `agentLogs`, `memoryEvents` tables) and streamed to the debug dashboard in real time.

### When to re-run each Sendblue script

- **First time / after losing `.env.local`** → `npm run setup` (walks through Sendblue + Convex together)
- **Phone number looks wrong in the banner** → `npm run sendblue:sync`
- **Webhook went stale in the dashboard and auto-register is off** → `npm run sendblue:webhook -- https://your-url.example.com/sendblue/webhook`

### Disabling auto-register

Add to `.env.local`:

```
SENDBLUE_AUTO_WEBHOOK=false
```

`npm run dev` will still show you the webhook URL in the banner so you can paste it yourself.

Visit `http://localhost:5173` for the debug dashboard (chat, agents, memory, events). You can also chat from the dashboard's Chat tab without Sendblue.

**This is the full first-run.** You now have a working agent that chats, remembers, and schedules reminders. Enable integrations (Gmail, Calendar, Notion, Slack) when you want more — see the next section.

---

## Architecture in 30 seconds

```
┌─────────────┐    webhook     ┌─────────────────────┐
│   iMessage  │ ─────────────► │ Sendblue → /webhook │
└─────────────┘                └──────────┬──────────┘
                                          │
                                          ▼
                          ┌────────────────────────────┐
                          │    Interaction agent       │
                          │    (dispatcher only)       │
                          │  • recall / write_memory   │
                          │  • spawn_agent(...)        │
                          └────────┬────────┬──────────┘
                                   │        │
                   ┌───────────────┘        └──────────────┐
                   ▼                                       ▼
           ┌───────────────┐                      ┌──────────────┐
           │   Memory      │                      │  Execution   │
           │ (Convex)      │                      │  agent(s)    │
           │ + cleaning    │                      │  + integrations│
           └───────────────┘                      └──────────────┘
```

- **Interaction agent** (`server/interaction-agent.ts`) is the front door. It reads the user's message + recent history, optionally calls `recall`, writes memories, creates automations, and decides whether to answer directly or spawn a sub-agent.
- **Execution agent** (`server/execution-agent.ts`) is spawned per task. It loads only the integrations named in the spawn call and returns a tight answer.
- **Memory** (`server/memory/`) handles writes, recall, post-turn extraction, and daily cleaning. Stored in Convex.
- **Automations** (`server/automations.ts`) poll every 30s for due jobs, spawn an execution agent to run them, and push results back to the user.
- **Integrations** are provided by [Composio](https://composio.dev). The dispatcher names toolkits by slug (`spawn_agent(integrations: ["gmail"])`); `server/composio.ts` opens a toolkit-scoped Composio session per spawn and wraps its tools as an MCP server. No per-integration code to write.

Deep dive: [ARCHITECTURE.md](./ARCHITECTURE.md). Adding your own tools: [INTEGRATIONS.md](./INTEGRATIONS.md).

---

## Skills

Skills are reusable playbooks — `SKILL.md` files under `.claude/skills/` that teach the execution agent how to do a specific kind of task (write a YouTube script, draft a cold email, plan a trip, etc.).

**How the Agent SDK handles them:** every `.claude/skills/*/SKILL.md` is loaded when the execution agent boots, and each skill's `description` gets injected into the agent's system prompt along with an instruction to pick the relevant one for the current task. You do **not** select skills per spawn — the agent picks based on which description matches. Only descriptions load upfront; the full SKILL.md body is pulled into context only when the agent actually invokes the skill, so adding more skills is cheap.

The SDK is pretty smart about picking the right skill as long as your `description` is specific and front-loads the trigger phrases ("Use when the user asks to write a video script, turn research into a YouTube video…"). Vague descriptions = missed invocations.

Wiring (in `server/execution-agent.ts`):
- `settingSources: ["project"]` — tells the SDK to load `.claude/skills/`
- `"Skill"` in `allowedTools` — enables the Skill tool

Only the **execution agent** loads skills. The dispatcher (interaction-agent) stays in SDK isolation mode, so it never sees them — which is correct, because the dispatcher should never do work, only route.

**To add a skill:** create `.claude/skills/<kebab-name>/SKILL.md`:

```yaml
---
name: youtube-script-writer
description: Write a tight, retention-focused YouTube script from a topic or outline. Use when the user asks for a video script, wants to turn research into a video, or needs a hook rewritten.
---

<instructions the agent follows when this skill is invoked>
```

There's a soft budget (~15k chars by default, via `SLASH_COMMAND_TOOL_CHAR_BUDGET`) for the combined skill-description block in context — if you end up with many skills, keep descriptions sharp so none get truncated.

Example included: `.claude/skills/youtube-script-writer/`.

---

## Using your Claude Code subscription

The Claude Agent SDK reuses the credentials Claude Code writes to your machine when you sign in. You do not need an `ANTHROPIC_API_KEY`.

- Install once: `npm install -g @anthropic-ai/claude-code`
- Run `claude` in a terminal, sign in.
- That's it — the SDK finds the session automatically.

If you'd prefer an API key (e.g. for a deployed server), set `ANTHROPIC_API_KEY` in `.env.local` and the SDK will use it instead.

---

## Environment variables

Everything lives in `.env.local` (auto-created by `npm run setup`). See `.env.example` for the full list.

| Var | Required | Notes |
|---|---|---|
| `CONVEX_URL` / `VITE_CONVEX_URL` | yes | Convex deployment URL. Written by `npx convex dev`. |
| `SENDBLUE_API_KEY` / `SENDBLUE_API_SECRET` | yes | From your Sendblue dashboard. |
| `SENDBLUE_FROM_NUMBER` | yes | Your Sendblue-provisioned number. |
| `BOOP_MODEL` | no | Default `claude-sonnet-4-6`. |
| `PORT` | no | Default `3456`. |
| `PUBLIC_URL` | no | Base URL used in the Sendblue webhook. Composio handles its own OAuth callbacks on `platform.composio.dev`, so this is just for inbound iMessage. |
| `VOYAGE_API_KEY` **or** `OPENAI_API_KEY` | optional | Unlocks vector recall. Falls back to substring. |
| `COMPOSIO_API_KEY` | optional | Enables integrations. Without it, plain chat + memory + automations still work. Get one at [app.composio.dev/developers](https://app.composio.dev/developers). |
| `COMPOSIO_USER_ID` | optional | Stable user id Composio keys connections under. Defaults to `boop-default`. |
| `ANTHROPIC_API_KEY` | optional | Bypass the Claude Code subscription. |

---

## Integrations, via Composio

Boop outsources 3rd-party service integrations to [Composio](https://composio.dev). One API key unlocks ~1000 toolkits (Gmail, Slack, GitHub, Linear, Notion, Drive, Stripe, Supabase, HubSpot, Salesforce, Granola, and so on). Composio hosts the OAuth apps, manages token refresh, and exposes every toolkit as a set of Claude-ready tools. Boop never sees an access token.

### Quickstart

1. Grab an API key at [app.composio.dev/developers](https://app.composio.dev/developers).
2. Add it to `.env.local`:
   ```
   COMPOSIO_API_KEY=sk-comp-...
   ```
3. `npm run dev`.
4. Open the debug dashboard → **Connections** tab. You'll see a curated list of ~20 cards split into:
   - **Ready to connect** — Composio manages the OAuth app. Click **Connect**, authenticate on Composio's hosted page, done.
   - **Needs one-time auth config** — a few toolkits (Twitter/X, LinkedIn, Salesforce) require you to register your own OAuth app on their dev portal and paste the client ID/secret into `platform.composio.dev/auth-configs`. The card's **Set up →** link takes you straight there. Once registered, the card flips to Ready.

After a successful connect, the agent can use that toolkit immediately — no restart.

### How it wires in

Boop keeps the dispatcher / executor split intact. Composio sits under the executor:

```
interaction-agent:  spawn_agent(task, integrations: ["gmail", "slack"])
                              │
                              ▼
execution-agent:    for each slug, open a Composio session scoped to that toolkit:
                      composio.create(BOOP_USER, { toolkits: ["gmail"] })
                      session.tools()          ← returns only Gmail tools
                              │
                              ▼
                    createSdkMcpServer({ name: "gmail", tools })
                              │
                              ▼
                    Sub-agent sees mcp__gmail__GMAIL_*  — nothing else.
```

Key properties:

- **Per-spawn tool scope.** The dispatcher picks which toolkits the sub-agent sees. Tens of tools per spawn, not thousands, so context stays tight and the agent stays fast.
- **Toolkit slug = integration name.** `spawn_agent(integrations: ["linear"])` works for any toolkit you've connected. Unknown slugs just log a warning and are skipped.
- **No tokens on our side.** Every tool call runs through Composio's proxy. If Composio goes down, integrations go down — but your server never holds user OAuth tokens.
- **Multi-account per toolkit.** Connect a second Gmail (work + personal) — each gets its own connection row you can alias. The dispatcher picks up all active connections for the slug.
- **Identity resolution.** Connection cards show the real account email (e.g. `chris@aloa.co`) resolved by calling the toolkit's own "who am I" tool through Composio (`GMAIL_GET_PROFILE`, etc.). Alias per connection if you want a friendlier label.

### Adding toolkits beyond the curated list

The ~20 toolkit catalog is hand-picked in `server/composio.ts:CURATED_TOOLKITS`. To surface another:

```ts
// server/composio.ts
export const CURATED_TOOLKITS: CuratedToolkit[] = [
  // …existing entries…
  { slug: "airtable", displayName: "Airtable", authMode: "managed" },
];
```

`authMode: "managed"` is correct for most toolkits. Use `"byo"` only if you know Composio requires a custom OAuth app (Twitter/LinkedIn/Salesforce-style). If you guess wrong, the UI's auth-config fallback banner catches it and points you at the right dashboard page.

### Cost tracking

Every execution agent's `total_cost_usd` comes straight from the Claude Agent SDK's `result` message (authoritative, matches Anthropic's billing). You'll see real dollar amounts in the Dashboard tab's Cost tile and per-agent cards.

### Keeping it in sync

Deeper dive — auth modes, toolkit scoping internals, multi-account flow, per-connection identity: [INTEGRATIONS.md](./INTEGRATIONS.md).

Upgrade path when upstream ships changes: run `/upgrade-boop` inside `claude` (the skill under `.claude/skills/upgrade-boop/`) — previews diffs, backs up, merges, surfaces `[BREAKING]` CHANGELOG entries. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the "skills, not features" model.

---

## Project layout

```
boop-agent/
├── server/
│   ├── index.ts                   # Express + WS + HTTP routes
│   ├── sendblue.ts                # iMessage webhook, reply, typing indicator
│   ├── interaction-agent.ts       # Dispatcher
│   ├── execution-agent.ts         # Sub-agent runner
│   ├── automations.ts             # Cron loop
│   ├── automation-tools.ts        # create/list/toggle/delete MCP
│   ├── draft-tools.ts             # save_draft / send_draft / reject_draft MCP
│   ├── heartbeat.ts               # Stale-agent sweep
│   ├── consolidation.ts           # Proposer + judge pipeline
│   ├── embeddings.ts              # Voyage / OpenAI wrapper
│   ├── composio.ts                # Composio SDK wrapper (session + toolkit scoping)
│   ├── composio-routes.ts         # /composio/* HTTP routes for the Debug UI
│   ├── broadcast.ts               # WS fanout
│   ├── convex-client.ts           # Convex HTTP client
│   ├── memory/
│   │   ├── types.ts
│   │   ├── tools.ts               # write_memory / recall (vector + substring)
│   │   ├── extract.ts             # Post-turn extraction
│   │   └── clean.ts               # Decay + archive + prune
│   └── integrations/
│       ├── registry.ts            # Integration loader
│       └── composio-loader.ts     # Registers each connected Composio toolkit
├── convex/
│   ├── schema.ts
│   ├── messages.ts
│   ├── memoryRecords.ts
│   ├── agents.ts
│   ├── automations.ts
│   ├── consolidation.ts
│   ├── conversations.ts
│   ├── drafts.ts
│   ├── memoryEvents.ts
│   └── sendblueDedup.ts
├── debug/                         # Dashboard: Dashboard / Agents / Automations / Memory / Events / Connections
├── scripts/
│   ├── setup.ts                   # Interactive setup CLI
│   ├── dev.mjs                    # One-command orchestrator (server + convex + vite + ngrok)
│   ├── preflight.mjs              # Checks convex/_generated exists before booting
│   ├── sendblue-sync.mjs          # Pulls phone number from `sendblue lines`
│   └── sendblue-webhook.mjs       # Registers inbound webhook via Sendblue CLI
├── README.md           ← you are here
├── ARCHITECTURE.md
└── INTEGRATIONS.md
```

---

## Upgrading

Boop is a fork-and-own template. You customize your copy freely — system prompts, memory thresholds, extra tools — and pull upstream fixes in on your own schedule.

The intended path is **Claude Code-driven**, modeled on NanoClaw:

```bash
claude                 # inside your repo
/upgrade-boop
```

`/upgrade-boop` is a skill in `.claude/skills/upgrade-boop/SKILL.md`. It:

1. Refuses to run with a dirty working tree.
2. Creates a timestamped rollback tag.
3. Previews upstream changes bucketed by area (core / integrations / UI / schema / scripts / docs).
4. Merges (or cherry-picks, or rebases — your choice).
5. Runs `npm install` + `npm run typecheck`.
6. Parses `CHANGELOG.md` for `[BREAKING]` entries and offers to run the referenced migration skills.
7. Prints a rollback hash + any env-var additions you should copy into `.env.local`.

Plain git works too, if you'd rather:

```bash
git remote add upstream https://github.com/chris/boop-agent.git    # one-time
git fetch upstream
git merge upstream/main      # or: git rebase upstream/main
```

### How features are added

Features don't land in the base. They ship as **Claude Code skills** that transform your fork on demand:

```
/add-<feature>     # opts your fork into a feature
/customize         # small tuning changes
/debug             # diagnose issues in your installed copy
```

Skill list grows as contributors add them. Base stays small. See `CONTRIBUTING.md` for the "skills, not features" policy.

### CHANGELOG

Every release lists additions under [CHANGELOG.md](./CHANGELOG.md), with `[BREAKING]` prefixes for anything that requires action. `/upgrade-boop` parses that format automatically.

---

## Troubleshooting

**Agent doesn't reply.**
- Check the server is running: `curl http://localhost:3456/health`
- Check the Sendblue webhook is pointed at `<public-url>/sendblue/webhook`
- Watch server logs. Look for `[sendblue]` and `[interaction]` messages.

**Convex errors / `VITE_CONVEX_URL is not set`.**
- Run `npx convex dev` manually. Ensure `.env.local` has both `CONVEX_URL` and `VITE_CONVEX_URL`.

**"Could not find public function for X:Y".**
- `CONVEX_DEPLOYMENT` and `CONVEX_URL` in `.env.local` are pointing at different projects. `convex dev` pushes functions to `CONVEX_DEPLOYMENT` but the client reads from `CONVEX_URL`. Fix: make sure the URL has the same name as the deployment — `CONVEX_DEPLOYMENT=dev:foo-bar-123` → `CONVEX_URL=https://foo-bar-123.convex.cloud`. Re-running `npm run setup` now auto-syncs these.

**Agent replies but can't use my integration.**
- Check `COMPOSIO_API_KEY` is set in `.env.local`.
- Check the toolkit shows as **Connected** in the Connections tab.
- Watch server logs for `[composio] registered …` at boot and `[integrations] unknown integration: …` on spawn attempts.

**I want to skip Sendblue for now.**
- The server exposes `POST /chat` with `{ conversationId, content }` — curl or a tiny client can drive the agent directly, no iMessage required.

**Claude SDK says no credentials.**
- Run `claude` once and sign in, or set `ANTHROPIC_API_KEY` in `.env.local`.

**"Cannot send messages to self" / "missing required parameter: from_number".**
- `SENDBLUE_FROM_NUMBER` is set to your personal cell instead of your Sendblue-provisioned number. Run `npm run sendblue:sync` to pull the correct number from `sendblue lines` and write it to `.env.local`.

**"Dashboard crashed" in the debug UI.**
- The ErrorBoundary caught something. Check the server logs (`server │` stream) and the browser console — both will have the real error. Most common cause: a new Convex function hasn't been deployed yet. Restart `npm run dev` so `convex dev` re-pushes.

---

## License

MIT. Build whatever you want on top of this.
