# Deploying Boop

Boop runs as a single Fly.io machine with Convex as the backend. This doc walks through the one-shot deploy flow.

## Prerequisites

- Local dev set up — run `npm run setup` first if you haven't.
- A [Fly.io](https://fly.io) account and `fly` CLI installed (`curl -L https://fly.io/install.sh | sh`).
- Either:
  - **A Claude subscription** (Pro/Max/Team/Enterprise) — generate a 1-year token via `claude setup-token` locally. Recommended.
  - **An Anthropic API key** if you'd rather pay per token.
- Your Sendblue dashboard's **webhook signing secret** (Webhook Settings → Signing Secret).
- (Optional but recommended) `gh` CLI for auto-pushing GitHub Actions secrets.

## One command

```bash
npm run deploy
```

The interactive script walks you through:

1. Verifying your local setup (Convex deployment, Sendblue keys).
2. Creating a Fly app and printing your stable public URL (`https://<your-app>.fly.dev`).
3. Picking your LLM auth method (subscription token or API key) and a webhook signing secret.
4. Generating a strong dashboard password and storing it as both a Fly secret and a Convex env var.
5. Pushing all secrets to Fly.
6. Reminding you to set the Sendblue inbound webhook to `https://<your-app>.fly.dev/sendblue/webhook`.
7. Setting GitHub Actions secrets (`FLY_API_TOKEN`, `FLY_APP_NAME`, `CONVEX_DEPLOY_KEY`) so future pushes to `main` auto-deploy.
8. Running the first deploy.

After it finishes:

- Visit `https://<your-app>.fly.dev/` and log in with the dashboard password.
- Send yourself an iMessage. Watch the Events panel light up.
- Future deploys: `git push origin main` triggers GitHub Actions.

## Operational tasks

### Annual: rotate the Claude OAuth token

The `CLAUDE_CODE_OAUTH_TOKEN` expires after 1 year. When it does, the agent will start replying "Sorry — I hit an error" to your messages. To rotate:

```bash
claude setup-token   # local — prints a new token
fly secrets set CLAUDE_CODE_OAUTH_TOKEN=<new-token> --app <your-app>
```

Fly restarts the machine automatically.

### Rotate the dashboard password

```bash
fly secrets set BOOP_ADMIN_PASSWORD=<new-value> --app <your-app>
npx convex env set BOOP_ADMIN_PASSWORD=<same-new-value>
npx convex run users:setPassword
```

### Background loop constraint (single-replica)

Boop's four background loops (cleanup, automation, heartbeat, consolidation) run in-process. The `fly.toml` sets `min_machines_running = 1` and `auto_stop_machines = false` so exactly one machine runs continuously. **Do not scale horizontally** — duplicate automations and consolidation runs would cost real money.

### WebSocket token in logs

The dashboard's live WebSocket connection authenticates via a `?token=<jwt>` query parameter (browsers can't set custom headers on the WS handshake). That token will appear in Fly access logs and in any reverse proxy you put in front of Fly. If your logs ever leak, rotate the dashboard password to invalidate any captured token. Single-user severity is low, but worth knowing.

## Alternative platforms

The Dockerfile is platform-neutral. To deploy elsewhere:

- **Coolify on Hetzner / your own VPS** — point Coolify at the repo, replace `fly.toml` with a Coolify service config.
- **PikaPods** — single Docker container, identical environment variable set. Drop `fly.toml`, configure the same secrets in the PikaPods dashboard.
- **Render / Railway / Fly Machines via API** — same shape.

The thing you need to provide on any platform: a stable HTTPS URL with port 3456 reachable, all environment variables from `.env.example` set, and a single replica with persistent process.

## Layering an SSO edge (optional)

If you want SSO on top of the password gate (e.g., for a small team), put **Cloudflare Access** in front of the Fly app. Cloudflare Access enforces SSO at the edge before traffic reaches Fly; the password gate then becomes redundant but harmless.
