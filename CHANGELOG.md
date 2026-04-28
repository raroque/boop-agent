# Changelog

Notable changes per release. `[BREAKING]` entries require action on your fork — `/upgrade-boop` will surface these and offer to run the relevant migration skill.

Format:
- One section per release.
- Prefix breaking items with `[BREAKING]` and include a migration path (ideally a skill to run).

---

## Unreleased

### Auto-deploy + single-user auth

- **[BREAKING]** Express admin endpoints (`/chat`, `/consolidate`, `/agents/:id/cancel`, `/agents/:id/retry`, `/composio/*`) now require a valid Convex Auth JWT (`Authorization: Bearer <jwt>`). The dashboard handles this automatically via the new login form. Direct API callers must obtain a JWT first. Run `/setup-deploy-auth` to configure the new auth flow.
- **[BREAKING]** Convex public `query`/`mutation` functions now call `await requireUser(ctx)` and throw "unauthenticated" if no user identity is present. Server-side code uses `internal.X.YInternal` twins that skip the check (deploy-key path). External callers using the Convex deployment URL directly will get "unauthenticated" until they set up auth.
- **[BREAKING]** Sendblue webhook now verifies HMAC signatures via `SENDBLUE_SIGNING_SECRET` (when set) and rejects requests where `from_number !== SENDBLUE_FROM_NUMBER`. Set the signing secret from your Sendblue dashboard → Webhook Settings.
- **[BREAKING]** WebSocket `/ws` upgrade now requires an `?token=<jwt>` query parameter. The dashboard sets this automatically; direct WS clients need updating.
- **[BREAKING]** Convex schema spreads `authTables` from `@convex-dev/auth/server` (adds `users`, `authAccounts`, `authSessions`, etc.). Pushed automatically on next `npx convex dev`.
- **[BREAKING]** New env vars: `BOOP_ADMIN_PASSWORD` (single dashboard password — must be set in Convex env, not just `.env.local`), `SENDBLUE_SIGNING_SECRET` (Sendblue dashboard → Webhook Settings), `CLAUDE_CODE_OAUTH_TOKEN` (optional, for deployed forks using Claude subscription auth).
- Added: `npm run deploy` — interactive script that creates a Fly app, generates secrets, configures Convex/Sendblue/GitHub Actions, and ships the first deploy. See `docs/deploying.md`.
- Added: `Dockerfile` (multi-stage `node:22-slim`, runs server with `tsx`), `fly.toml` (single machine, always-on), `.github/workflows/deploy.yml` (test → `convex deploy` → bootstrap → `fly deploy` → smoke).
- Added: `convex/auth.ts`, `convex/auth.config.ts`, `convex/users.ts` (with `bootstrap` and `setPassword` admin actions), `server/auth.ts` (`verifyHmac`, `requireAdmin`).
- Added: `debug/src/auth.tsx` (login form), `debug/src/api-client.ts` (authed `fetch` wrapper). Existing `fetch` call sites in `ConsolidationPanel` + `ComposioSection` migrated.
- Added: 15 unit tests (5 `verifyHmac`, 6 `requireAdmin`, 4 Sendblue webhook auth) using Node's built-in `node:test` runner. Run with `npm test`.
- Added: `scripts/create-test-stubs.mjs` (pretest hook) so `npm test` works without a Convex deployment configured.
- Added: `docs/deploying.md`, `.claude/skills/setup-deploy-auth/SKILL.md`.
- Added npm deps: `jose` (JWT verification), `@convex-dev/auth`, `@auth/core`. `tsx` promoted from `devDependencies` to `dependencies` so the production Docker image can run it.

### Composio integration layer

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
