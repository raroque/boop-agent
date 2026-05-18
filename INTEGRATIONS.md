# Integrations

Boop's integrations are provided by [Composio](https://composio.dev/?utm_source=chris&utm_medium=youtube&utm_campaign=collab), a tool-aggregator that exposes 1000+ third-party services (Gmail, GitHub, Slack, Notion, Linear, Google Drive, HubSpot, Salesforce, …) behind one API.

There is one built-in non-Composio integration: **Local browser use**. It registers as `browser` only when enabled in the debug dashboard and gives spawned agents a local Patchright Chrome profile for login-required services, visual workflows, JS-heavy pages, or sites that may detect ordinary automation.

You don't write integration code. You:

1. Put `COMPOSIO_API_KEY` in `.env.local`.
2. Open the debug dashboard → **Connections** tab.
3. Click **Connect** on a toolkit.
4. Authenticate on Composio's hosted page. Composio stores the tokens and keeps them fresh.
5. The toolkit becomes available to `spawn_agent(integrations: [...])` by its slug.

That's it.

---

## How it hooks into Boop

Each connected Composio toolkit is registered in Boop's integration registry (`server/integrations/registry.ts`) keyed by its slug. When the dispatcher calls:

```ts
spawn_agent({ task: "…", integrations: ["gmail"] })
```

`buildMcpServersForIntegrations(["gmail"])` looks up the registered `gmail` module, opens a Composio session **scoped to only the Gmail toolkit**:

```ts
const session = await composio.create(boopUserId(), {
  toolkits: ["gmail"],
  manageConnections: false,
});
const tools = await session.tools();
```

and wraps those tools as an MCP server for the sub-agent. The sub-agent sees only Gmail's tools (`mcp__gmail__GMAIL_SEND_EMAIL`, etc.) — no Slack, no GitHub, no 1000-tool context bloat.

Every tool call is logged to Convex as usual, so the Agents tab in the debug dashboard shows them with the right toolkit logo and a humanized name.

---

## Local browser use

Local browser use is registered by `server/integrations/browser-loader.ts`, not by Composio. Its enabled state comes from `browser_enabled` in the Convex `settings` table, with `BOOP_BROWSER_ENABLED=false` as the default fallback.

When disabled:
- `browser` is not included in `listEnabledIntegrations()`.
- The dispatcher tells users to enable **Settings → Local browser use** if they explicitly request a local browser.
- Execution agents cannot call browser tools.

When enabled:
- The dispatcher can spawn `integrations: ["browser"]`.
- Claude receives an MCP server named `browser`.
- Codex receives dynamic tools under the internal `local_browser` namespace to avoid Codex's reserved browser namespace.
- Patchright launches a persistent Chrome profile from `BOOP_BROWSER_PROFILE_DIR` or the saved `browser_profile_dir` setting.

Settings live under **Settings → Local browser use**:
- **Local browser use** — master enable switch.
- **Show browser UI** — headed Chrome window on the user's machine when on; hidden/headless when off.
- **Spawn login instance** — allows `browser_request_login` to open a visible handoff window and return: "I need you to log in first. I’ve spawned an instance on your machine."
- **Advanced settings** — launch URL, profile directory, channel, executable path, extra Chrome flags, and Patchright Chrome install.

Boop does not store third-party passwords or OAuth tokens for this feature. Login state lives in the selected local Chrome profile.

Browser control HTTP routes are local-only and reject public tunnel requests before launching, closing, installing, or inspecting Chrome. The `browser_fill` tool also redacts typed values before tool-use arguments are persisted to Convex logs.

---

## Curated toolkit list

The Connections tab shows a hand-picked set in `server/composio.ts:CURATED_TOOLKITS`. Edit that array to add or remove cards — the slugs must match Composio's toolkit slugs (see `docs.composio.dev/toolkits` for the full catalog).

Current defaults: Gmail, Google Calendar, Google Drive, Google Sheets, Google Docs, Slack, GitHub, Linear, Notion, HubSpot, Salesforce, Discord, Twitter, LinkedIn, Instagram, YouTube, Trello, Asana, Jira, Airtable, Figma, Dropbox.

---

## Disconnecting

Click **Disconnect** on a connected card. That revokes the Composio connection and re-loads the integration registry — the toolkit drops out of `availableIntegrations()` immediately. Next time the dispatcher tries to spawn with that slug, it'll log `[integrations] unknown integration: …`.

---

## Toolkits that need a one-time auth config

Composio hosts managed OAuth apps for most popular toolkits (Gmail, Slack, GitHub, Linear, Notion, Google Calendar/Drive/Sheets/Docs, etc.) — click Connect and it just works. A handful of toolkits don't have a managed app on Composio's side (Twitter/X is the common one; Salesforce sometimes) because their developer policies make hosting a shared OAuth app impractical.

When you click Connect on one of those, Boop surfaces an amber banner explaining that you need to:

1. Create an OAuth app on the toolkit's developer portal (e.g., `developer.twitter.com` for Twitter).
2. Open [platform.composio.dev/auth-configs](https://platform.composio.dev/auth-configs), pick the toolkit, and register your app's client ID + secret.
3. Come back to the Connections tab and click Connect again.

This is a one-time setup per toolkit (not per user) — all users of your Boop instance reuse the same auth config after that.

## Notes

- **Single-tenant by default.** All connections are keyed under `COMPOSIO_USER_ID` (defaults to `boop-default`). Override if you manage Composio sessions elsewhere and want Boop to share that user.
- **External actions still use the draft flow.** Execution agents are prompted to call `save_draft` first for anything that writes to the outside world. The dispatcher's `send_draft` is the only path that actually commits.
- **No tokens live in Boop.** Composio stores OAuth credentials on their side. Boop never sees them.
- **Tool names are Composio's canonical slugs** (e.g., `GMAIL_LIST_MESSAGES`). The debug dashboard humanizes them for display.
