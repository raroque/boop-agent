# Changelog

Notable changes per release. `[BREAKING]` entries require action on your fork — `/upgrade-boop` will surface these and offer to run the relevant migration skill.

Format:
- One section per release.
- Prefix breaking items with `[BREAKING]` and include a migration path (ideally a skill to run).

---

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
