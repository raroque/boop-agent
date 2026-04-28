# Changelog

Notable changes per release. `[BREAKING]` entries require action on your fork — `/upgrade-boop` will surface these and offer to run the relevant migration skill.

Format:
- One section per release.
- Prefix breaking items with `[BREAKING]` and include a migration path (ideally a skill to run).

---

## Unreleased — Self-inspection & runtime model switching

- Added: `server/self-tools.ts` — interaction-agent MCP server (`boop-self`) exposing `get_config`, `list_integrations`, `search_composio_catalog`, `inspect_toolkit`, and `set_model`. Lets the user ask Boop about its own configuration from iMessage without spawning a sub-agent.
- Added: runtime model override via `convex/settings.ts` + `server/runtime-config.ts`. Both the dispatcher and execution agent now read the model from a Convex-backed setting on each turn (with 30s in-memory cache and `BOOP_MODEL` fallback). User can say "use opus" / "switch to sonnet" / "make it faster (haiku)" from iMessage; takes effect on the next turn. Aliases: `opus`, `sonnet`, `haiku`.
- Added: `agentLogs.accounts` field — each tool_use row now records which Composio account aliases were targeted (e.g. `gmail_charry-fusc`). Surfaced as a small badge in the debug UI's agent timeline. Pulled from `account` / `connectedAccountId` / `tools[].account` in tool input.
- Added: new Convex `settings` table (key/value/updatedAt) and `convex/settings.ts` with `get` / `set` / `clear`.
- Fixed: per-connection identity lookup. `fetchToolkitIdentity` was calling `composio.tools.execute` without a `connectedAccountId`, so multiple Gmail / Slack / etc. connections all got labeled with the user's *default* account email. Now scoped per connection — the Connections panel shows the correct email per row.

## Unreleased — Composio integration layer

- **[BREAKING]** Hand-built integrations (`/integrations/gmail`, `/integrations/google-calendar`, `/integrations/notion`, `/integrations/slack`, `/integrations/_template`) removed. To reconnect equivalents: set `COMPOSIO_API_KEY` in `.env.local`, open the Debug UI's Connections tab, click Connect on the toolkit you want. The dispatcher will see it under the same slug (`gmail`, `slack`, `notion`, `googlecalendar`).
- **[BREAKING]** Convex `connections` table dropped. Composio stores OAuth state on its side. Any existing rows in that table are discarded on the next `convex dev` push.
- **[BREAKING]** `server/oauth.ts` removed. The `/oauth/*` HTTP routes no longer exist. OAuth flows now live at `https://platform.composio.dev`.
- **[BREAKING]** Env vars removed: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_ACCESS_TOKEN`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_BOT_TOKEN`, `SLACK_USER_TOKEN`, `NOTION_TOKEN`. Delete from `.env.local`.
- Added: `server/composio.ts`, `server/composio-routes.ts`, `server/integrations/composio-loader.ts`, `debug/src/components/ComposioSection.tsx`.
- Added: `@composio/core`, `@composio/claude-agent-sdk` npm deps.
- Added: env vars `COMPOSIO_API_KEY`, `COMPOSIO_USER_ID` (optional, defaults to `boop-default`).
- Added: `/upgrade-boop` Claude Code skill for bringing upstream changes into a customized fork.
- Added: `CHANGELOG.md` and `CONTRIBUTING.md`.
- Fixed: Sendblue links updated from `sendblue.co` to `sendblue.com` (the `.co` host 301-redirects; API base aligned with Sendblue's own docs).
