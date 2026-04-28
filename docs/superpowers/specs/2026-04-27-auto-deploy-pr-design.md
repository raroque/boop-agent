# Auto-Deploy + Auth PR — Design

**Date:** 2026-04-27
**Target repo:** `boop-agent` (upstream: `raroque/boop-agent`)
**PR shape:** Single coupled PR — deploy infrastructure + authentication layer
**Estimated size:** ~860 lines, ~14 new files, ~24 modified files

## Summary

Make boop-agent safely deployable to a stable public URL on Fly.io, with single-user authentication on every endpoint exposed to the public internet. The deploy and the auth ship together in one PR because they are inseparable: the deploy is the *reason* the auth has to exist, and the auth is the *prerequisite* for the deploy not being dangerous.

The core change is three coupled pieces:

1. **Deploy infrastructure** — Dockerfile, fly.toml, a GitHub Actions workflow, and `scripts/deploy.ts` (interactive setup mirroring `scripts/setup.ts`'s patterns).
2. **Authentication layer** — Convex Auth (single-user password provider) covering both browser dashboard access and the Express admin endpoints with one JWT.
3. **Webhook hardening** — Sendblue HMAC signature validation and phone-number whitelist on `/sendblue/webhook`.

The deploy target is Fly.io as the documented turnkey path. The Dockerfile is platform-neutral; forks can swap to Coolify/Hetzner/PikaPods/Render by replacing `fly.toml` and the deploy step in the workflow.

## Background

In the open-sourcing video, Chris explicitly invited a server-deploy PR:

> "If you do know what you're doing, make those modifications. Run it on a server. It gets so much more powerful when it works with your laptop closed... feel free to open a PR. That is a PR that I would probably merge in if you do it correctly. I want to take a moment to thank you guys..."

He also stated why he didn't ship deploy himself:

> "I purposely did not add this to the repo because I needed a little bit more time if I wanted to do that right... I don't know if I'm doing it in the most secure way, which is why it is not in the repo right now."

This PR addresses both concerns: it ships deploy, and it makes the deploy safe.

### Problem: the security gap when boop goes public

The current security model is "URL is the password" at every layer:

- **Sendblue webhook**: `POST /sendblue/webhook` accepts any body with `from_number` and `content`. No HMAC verification, no source check.
- **Express admin endpoints**: `/chat`, `/consolidate`, `/agents/:id/cancel`, `/agents/:id/retry`, `/composio/*` all accept unauthenticated POSTs.
- **Convex layer**: Every Convex function is exported as `mutation`/`query`/`action` (none use `internalMutation`/`internalQuery`). Zero `ctx.auth.getUserIdentity()` checks. Anyone with the Convex deployment URL can call any function, including reading the entire memory store and conversation history.
- **WebSocket `/ws`**: Open subscription, broadcasts memory events and agent state to anyone who connects.

This is fine for boop's current model (single user, laptop, ngrok tunnel that rotates URLs). It collapses the moment the app is on a stable public URL.

### Why the upstream owner accepted this gap

Chris built boop as a personal tool, never intended for public deployment. The unauthenticated layers are *the same* as a Flask app behind `localhost:5000` — fine when no one else can reach it. The architectural debt only manifests at deploy time.

This PR is the deploy time.

## Goals

In scope:

- Deploy boop to Fly.io with a reproducible, repeatable workflow
- Add a single-user authentication layer covering both browser access and Express admin endpoints
- Verify Sendblue webhook signatures (HMAC + phone whitelist)
- Convert all Convex functions to either `internalQuery`/`internalMutation` (server-only) or `query`/`mutation` with explicit `ctx.auth.getUserIdentity()` checks (browser-callable but authenticated)
- Provide a `scripts/deploy.ts` interactive deploy setup matching the patterns in `scripts/setup.ts`
- Document the deploy in `docs/deploying.md`
- Unit tests for new authentication code

Success criteria:

- Code reviewable by an experienced TypeScript developer
- Type system clean (`tsc --noEmit` passes)
- Unit tests pass (`npm test`)
- Docker image builds (`docker build .`)
- A maintainer with the necessary accounts can complete the runtime smoke test in under 30 minutes
- After deploy, boop is reachable at `https://<app>.fly.dev`, the dashboard at `/debug` requires login, and the iMessage flow works end-to-end without a laptop tether

## Non-Goals

Explicitly out of scope:

- **Multi-user support.** Single user, single row in the `users` table. Multi-tenant is a separate project.
- **Convex Auth provider beyond password.** No magic link, no OAuth/SSO. Forks can swap the provider in `convex/auth.config.ts` if desired.
- **General security hardening.** Body size limits, rate limiting, input validation on memory content, bounded execution-agent buffers — all real issues, all separate PRs.
- **Background loop sharding.** The four in-process loops (cleanup, automation, heartbeat, consolidation) still require single-replica deployment. Documented as a constraint, not fixed.
- **Convex Auth on Express → Convex calls.** Express continues to call Convex with the deploy key. The auth perimeter is at Express's edge, not on every internal Convex call.
- **Composio webhook signature validation.** Existing behavior preserved.
- **Auto-rotation of `CLAUDE_CODE_OAUTH_TOKEN`.** Documented as a yearly manual task.
- **Production debug UI features beyond what exists in dev.** Same UI, just login-gated.
- **Changes to `scripts/setup.ts` or `npm run dev`.** Local dev behavior is identical to today.
- **CI infrastructure beyond a single test step.** No test workflow, no matrix, no coverage tooling.
- **Documentation overhaul.** Adds `docs/deploying.md` and a README link; everything else untouched.

## Architecture

### Two auth perimeters

There are two completely separate auth perimeters by necessity. They share zero credentials because they protect different things.

#### Perimeter A: iMessage path

```
iMessage → Sendblue → Express webhook → Convex (internal)
```

Three checks, in order, on `POST /sendblue/webhook`:

1. **HMAC signature** — Compute `HMAC-SHA256(body, SENDBLUE_SIGNING_SECRET)`, compare to `X-Sendblue-Signature` header using `crypto.timingSafeEqual`. Reject mismatch with 401.
2. **Phone whitelist** — After parsing, `from_number` must equal `SENDBLUE_FROM_NUMBER`. Reject mismatch with 403.
3. **Process** — Hand off to existing dispatcher logic.

iMessage cannot carry JWTs. The "credential" is the cryptographic Sendblue signature plus the operator's own phone number. After these checks, Express writes to Convex via internal mutations using the deploy key (server-side service call, no JWT).

#### Perimeter B: Human path

```
                    ┌─ Convex Auth (issues JWTs) ─┐
                    │  single password user        │
                    └──────────────────────────────┘
                            ▲
                            │ same JWT verifies in both consumers
              ┌─────────────┼─────────────────┐
              ▼             ▼                 ▼
       Browser /debug → Express admin   Browser → Convex
                                        (live subscriptions)
```

Single Convex Auth password login. One row in a `users` table, one password, one identity. The browser logs in once, gets a JWT, and uses the same JWT to call Express (which verifies via Convex's JWKS endpoint) and Convex directly (which verifies natively). One login, one token, two consumers.

#### Route allowlist (Express)

```
PUBLIC                          (no JWT)
├── GET  /health
└── POST /sendblue/webhook      (HMAC + phone whitelist instead)

REQUIRE JWT                     (Authorization: Bearer <Convex JWT>)
├── POST /chat
├── POST /consolidate
├── POST /agents/:id/cancel
├── POST /agents/:id/retry
├── *    /composio/*
├── WS   /ws
└── *    /debug/*                (the dashboard SPA itself)
```

Implemented as deny-by-default middleware with an explicit allowlist for the two public routes. Future endpoints are admin-by-default.

### Single-user model

One `users` table row, one password. Convex Auth's password provider stores the credential as a hashed entry in its `authAccounts` table.

#### Bootstrap

The chicken-and-egg problem (the dashboard requires login but no user exists yet) is solved by a one-shot Convex action triggered by CI:

```
convex/users.ts (new file)

  internalAction bootstrap:
    if any user already exists in `users` table → return early (no-op)
    read BOOP_ADMIN_PASSWORD from Convex env
    if not set → throw "BOOP_ADMIN_PASSWORD not configured"
    create one user via Convex Auth's password provider
    return { created: true }
```

The action is idempotent — running it twice is a no-op because of the "user already exists" guard. The CI workflow runs `npx convex run users:bootstrap` after every `npx convex deploy`. First deploy creates the user; subsequent deploys are no-ops.

#### Password rotation

```
1. fly secrets set BOOP_ADMIN_PASSWORD=<new value>
2. npx convex env set BOOP_ADMIN_PASSWORD=<same new value>
3. npx convex run users:setPassword         (new internalAction)
   — looks up the single user, updates the password hash via Convex Auth
4. Old sessions invalidate naturally on next token expiry.
```

#### Why not other patterns

- **First-visit registration**: wide-open window during deploy. Anyone scanning fly.dev during the bootstrap window could claim the account. Rejected.
- **Manual SSH-and-run**: brittle, more steps, harder to document, fragile across deploys. Rejected.

### LLM authentication

Recommended default: `CLAUDE_CODE_OAUTH_TOKEN` (subscription path), matching Chris's framing in the video.

| | Detail |
|---|---|
| Generation | `claude setup-token` locally → outputs token to stdout. Operator copies it manually. |
| Server use | Set `CLAUDE_CODE_OAUTH_TOKEN=<token>` as a Fly secret. Agent SDK auto-detects. |
| Lifespan | 1 year, then expires |
| Refresh | None. Manual rotation via re-running `claude setup-token` and updating the Fly secret. |
| Failure mode | HTTP 401 from Anthropic. **Boop's existing error swallowing currently presents this to users as "Sorry — I hit an error."** Documented as a known operational note. |
| Plan requirement | Pro / Max / Team / Enterprise |
| Anthropic support | First-class — explicitly intended for "CI pipelines, scripts, or other environments where interactive browser login isn't available" |

Alternative: `ANTHROPIC_API_KEY`. Use this if predictable per-token billing is preferred over the 1-year rotation cost. The PR supports both; the deploy script asks which.

### Convex function classification

Every existing Convex function is classified as one of:

- **Internal** (`internalQuery` / `internalMutation` / `internalAction`) — called only by Express server-side. Not callable from browsers. The Express server uses these via the deploy key.
- **Public + auth-checked** (`query` / `mutation`) — called by the browser dashboard for live subscriptions and reads. Each function starts with `await ctx.auth.getUserIdentity()` and throws if null.

Estimated split (pending file-by-file walkthrough during implementation): ~60% become internal, ~40% remain public with auth checks.

After this split, **the Convex deployment URL alone is no longer a master credential.** Even if the URL leaks, an attacker cannot call any function without either the user password or the deploy key.

### Deployment shape

Single Fly app, single machine, always on:

```toml
app = "boop-agent-<your-handle>"
primary_region = "iad"

[build]
  # uses Dockerfile

[http_service]
  internal_port = 3456
  force_https = true
  auto_stop_machines = false      # Sendblue webhook needs always-on
  auto_start_machines = false
  min_machines_running = 1        # exactly one (in-process loop constraint)
  processes = ["app"]

[[http_service.checks]]
  grace_period = "10s"
  interval = "30s"
  method = "GET"
  path = "/health"
  timeout = "5s"

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
```

The `min_machines_running = 1` + `auto_stop_machines = false` combination is the explicit "exactly one replica, always running" config required by boop's in-process background loops. Documented inline.

## Code Changes by Layer

### Express server (`server/`)

| File | Change | ~Lines |
|---|---|---|
| `server/auth.ts` | **NEW.** JWT verification using `jose` against Convex's JWKS endpoint. Exports `requireAdmin` (deny-by-default middleware with public allowlist), `verifyHmac` for Sendblue. | ~80 |
| `server/index.ts` | Register `requireAdmin` middleware globally. Add WebSocket upgrade auth check. Serve built debug UI as static assets from `debug/dist`. | ~25 modified |
| `server/sendblue.ts` | Wire HMAC verification at the top of the webhook handler. Phone whitelist check after parsing. | ~25 modified |
| `server/composio-routes.ts` | No change — protected by global `requireAdmin`. | 0 |
| `package.json` | Add `jose` dependency (~3KB lightweight JWT library). | ~3 modified |

**Subtotal: ~135 lines, 1 new file, 3 modified files.**

### Convex layer (`convex/`)

| File | Change | ~Lines |
|---|---|---|
| `convex/auth.config.ts` | **NEW.** Convex Auth provider configuration (password provider). | ~10 |
| `convex/auth.ts` | **NEW.** Re-exports from `@convex-dev/auth/server`, custom helpers. | ~20 |
| `convex/users.ts` | **NEW.** `users` table validator, `bootstrap` internalAction (create-if-missing-with-password from env), `setPassword` internalAction (rotation). | ~50 |
| `convex/schema.ts` | Add `users` table reference. | ~5 modified |
| All 12 existing function files | Classify each function: keep public + add `await ctx.auth.getUserIdentity()` guard, OR convert to `internalQuery`/`internalMutation`. ~3 lines per function. | ~80 modified |

**Subtotal: ~165 lines, 3 new files, 13 modified files.**

The function classification is the largest mechanical chunk. It is not bloat — it is what fixing the data layer requires.

### Debug UI (`debug/`)

| File | Change | ~Lines |
|---|---|---|
| `debug/src/main.tsx` | Wrap `<App />` in `<ConvexAuthProvider>` from `@convex-dev/auth/react`. | ~8 modified |
| `debug/src/auth.tsx` | **NEW.** Login form (single password field) using `useAuthActions().signIn("password", ...)`. Renders before `<App />` if not authenticated. | ~50 |
| `debug/src/api-client.ts` | **NEW.** Wrapper around `fetch` that pulls the Convex JWT and sets `Authorization: Bearer ...`. Used by all existing fetch calls to Express. | ~30 |
| Existing fetch call sites | Migrate ~5–8 `fetch(...)` calls to use `api-client.ts`. | ~20 modified |
| `debug/package.json` | Add `@convex-dev/auth` dependency. | ~2 |

**Subtotal: ~110 lines, 2 new files, ~6 modified files.**

## Deploy Infrastructure

### `Dockerfile` (root)

Multi-stage build using `node:22-slim` (Debian Bookworm slim) — chosen over Alpine because operators may `fly ssh console` in to debug, and Debian's familiar toolset (bash, apt-get, standard `ps`/`top`/`curl`) is friendlier than Alpine's busybox/musl environment.

```dockerfile
# ---- Stage 1: deps ----
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Stage 2: build server + debug UI ----
FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build              # compile TS server
RUN npm run build:debug        # build Vite debug UI to debug/dist

# ---- Stage 3: runtime ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/debug/dist ./debug/dist
COPY --from=build /app/convex/_generated ./convex/_generated
COPY package.json ./
EXPOSE 3456
USER node
CMD ["node", "dist/server/index.js"]
```

~25 lines.

### `.dockerignore` (root)

Standard list excluding `node_modules`, `.env*`, `.git`, `dist`, `debug/dist`, `convex/_generated`, `.claude`, `scripts`, `docs`, `tests`. ~15 lines.

### `fly.toml` (root)

Configuration shown in the Architecture section. ~30 lines.

### `.github/workflows/deploy.yml`

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    concurrency:
      group: deploy-${{ github.ref }}
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci

      - name: Run unit tests
        run: npm test

      - name: Push Convex backend
        run: npx convex deploy --yes
        env:
          CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_DEPLOY_KEY }}

      - name: Bootstrap admin user (idempotent)
        run: npx convex run users:bootstrap
        env:
          CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_DEPLOY_KEY }}

      - uses: superfly/flyctl-actions/setup-flyctl@master
      - name: Deploy to Fly
        run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

      - name: Smoke test
        run: |
          for i in {1..30}; do
            if curl -fsS https://${{ secrets.FLY_APP_NAME }}.fly.dev/health; then
              exit 0
            fi
            sleep 5
          done
          echo "health check failed after 150s"
          exit 1
```

Sequencing: tests → Convex push → bootstrap (no-op after first run) → Fly deploy → smoke test. Required GitHub Actions secrets: `CONVEX_DEPLOY_KEY`, `FLY_API_TOKEN`, `FLY_APP_NAME`. All other secrets live in `fly secrets`, not GitHub Actions. ~50 lines.

### `scripts/deploy.ts`

Interactive deploy setup script mirroring `scripts/setup.ts`'s patterns: same `prompts` library, same `banner()` helper, same `hasBinary()`/`openInBrowser()`/`runInherit()`/`runCapture()` utilities, same defensive parsing of CLI tool output, same section-by-section interactive flow. **Standalone** — does not import from or modify `setup.ts`.

Behavior:

1. **Verify dev setup is done.** Read `.env.local`. If missing or `CONVEX_DEPLOYMENT` not set, offer to spawn `npm run setup` inline. Re-read env after.
2. **Fly account + app.** Check `fly` binary, check auth status. Prompt for app name (suggested: `boop-<handle>`). Run `fly apps create <name>` if not exists. Compute `PUBLIC_URL = https://<name>.fly.dev`.
3. **Generate the new secrets.** Prompt to run `claude setup-token` interactively (or fall back to `ANTHROPIC_API_KEY`). Prompt for `SENDBLUE_SIGNING_SECRET` (manual paste from Sendblue dashboard). Prompt for `BOOP_ADMIN_PASSWORD` (auto-generate 32-char random by default).
4. **Push secrets to Fly.** Single `fly secrets set ...` batch with all values from `.env.local` plus the new ones plus `PUBLIC_URL`.
5. **Push Convex env.** Prompt for Convex deploy key (open browser to dashboard URL). `npx convex env set BOOP_ADMIN_PASSWORD=...`.
6. **Configure Sendblue webhook URL.** Print clear instructions: "Open Sendblue dashboard, set INBOUND webhook to `https://<name>.fly.dev/sendblue/webhook`." Prompt to confirm done.
7. **Set GitHub repo secrets.** If `gh` CLI installed, offer to run `gh secret set` for `FLY_API_TOKEN`, `FLY_APP_NAME`, `CONVEX_DEPLOY_KEY` automatically. Otherwise print exact UI steps.
8. **Optional first deploy.** Prompt to run `fly deploy --remote-only` now or wait for next push to main.
9. **Print "you're deployed" footer.** Test instructions, operational notes (annual OAuth rotation), future-deploy command (`git push origin main`).

~280 lines following Chris's exact patterns. Most of the helper code is copy-pastable from `setup.ts`.

### `.env.example` additions

Three new sections following Chris's existing comment style (~15 lines added):

```bash
# ---- Sendblue webhook signing ----
# Get this from your Sendblue dashboard under Webhook Settings → Signing Secret.
# Required when running on a public URL — the webhook handler verifies every
# incoming request's HMAC-SHA256 signature against this secret.
SENDBLUE_SIGNING_SECRET=

# ---- Boop dashboard / admin auth ----
# The single password for the dashboard and admin endpoints when deployed.
# Pick a long random string and set it as a Fly secret AND a Convex env var.
BOOP_ADMIN_PASSWORD=

# ---- Claude (server deploy) ----
# Run `claude setup-token` locally and paste the output here. The token lasts
# 1 year, then you regenerate. ANTHROPIC_API_KEY is the alternative.
# CLAUDE_CODE_OAUTH_TOKEN=
```

### `docs/deploying.md`

Operator-facing deploy documentation, ~50 lines. Most of the heavy lifting is in `scripts/deploy.ts`, so the doc is mostly orientation:

- Prerequisite (`npm run setup` first, or let `npm run deploy` offer to run it)
- Walkthrough of `npm run deploy`'s interactive flow
- After deployment: visit `<app>.fly.dev/debug`, log in, verify dashboard
- Operational tasks: annual `CLAUDE_CODE_OAUTH_TOKEN` rotation, password rotation procedure
- Optional: layering Cloudflare Access in front of Fly for SSO at the edge (one-line note)
- Alternative platforms (informational): Coolify on Hetzner, PikaPods, Render, Railway — same Dockerfile, replace `fly.toml` and the deploy step

### `README.md`

A single new line linking to `docs/deploying.md` from the existing structure.

### Subtotal for deploy infrastructure

| | Count | Lines |
|---|---|---|
| New files | 5 (Dockerfile, .dockerignore, fly.toml, deploy workflow, scripts/deploy.ts) | ~400 |
| New docs | 1 (docs/deploying.md) | ~50 |
| Modified | 3 (.env.example, package.json, README.md) | ~25 |
| **Subtotal** | | **~475 lines** |

## Testing & Verification

### What is tested

Only the new logic. Pure functions and middleware introduced in this PR.

| Test file | Tests | ~Lines |
|---|---|---|
| `server/auth.test.ts` | `verifyHmac()` — valid sig, invalid sig, missing header, timing-safe behavior. `requireAdmin()` — public path passes, admin path with valid JWT passes, admin path without auth → 401, admin path with malformed JWT → 401, expired JWT → 401. | ~60 |
| `server/sendblue.test.ts` (new) | Perimeter checks: HMAC mismatch → 401, phone whitelist mismatch → 403, both pass → handler runs. | ~30 |
| `convex/users.test.ts` | `bootstrap` action: no users → creates one; user exists → no-op. `setPassword` action: updates the single user's hash. | ~30 |

**Test code subtotal: ~120 lines, 3 new files.**

### Test runner: `node:test`

Chris has zero existing test infrastructure. Adding vitest/jest is unnecessary new tooling. Node 22's built-in test runner needs no config and no dependency.

```bash
npx tsx --test 'server/**/*.test.ts' 'convex/**/*.test.ts'
```

Added as `npm test` in `package.json`. Zero new dependencies — `tsx` is already in the repo.

### CI integration

One step in the GitHub workflow before deploy:

```yaml
- name: Run unit tests
  run: npm test
```

Test failure halts deploy.

### What is NOT tested

Stated explicitly so the PR description can be honest:

- **No `convex-test` integration tests.** Would require pulling in the `convex-test` package, wiring up a simulator harness. Skipped to keep tooling minimal.
- **No tests for existing untouched code** (interaction-agent, execution-agent, memory system, consolidation, automations). Out of scope.
- **No E2E tests, no smoke tests in CI** beyond the post-deploy curl. Those need accounts.
- **No type-checking-as-test.** `tsc --noEmit` already enforces this through the existing TypeScript build step.

### Author's testing posture (PR description)

The contributor opening this PR will not have all five external accounts (Convex, Sendblue, Composio, Anthropic, Fly). Verification depth at the contributor's end:

- ✅ TypeScript compiles
- ✅ Unit tests pass (no external services needed)
- ✅ Docker image builds (`docker build .`)
- ✅ Auth middleware verified manually with curl + synthetic HMAC payloads
- ⚠️ Not tested: full E2E iMessage flow (no Sendblue account)
- ⚠️ Not tested: actual Fly deploy (no Fly account)
- 🙏 Asks the maintainer or another contributor with full setup to run the runtime smoke test

This is an explicit, honest test-status banner in the PR description. The maintainer (Chris) does the last-mile verification with his existing accounts.

## Operational Notes

Documented in `docs/deploying.md`:

- **Annual `CLAUDE_CODE_OAUTH_TOKEN` rotation.** The token expires after 1 year. Regenerate via `claude setup-token`, update the Fly secret. Currently presents to users as "Sorry — I hit an error" replies until rotated; surfacing this failure mode to the dashboard is a separate PR.
- **Password rotation.** Three-step process documented in the Architecture section.
- **Single-replica constraint.** Boop's in-process background loops mean `min_machines_running = 1` is mandatory. Scaling beyond one replica without a Convex-level coordination lock causes automation double-fire and consolidation duplicate-cost. Documented as a hard constraint.
- **Convex URL is still a top-tier secret.** Even after this PR, the Convex deployment URL plus the deploy key gives full data-layer access. Treat both as secrets. Future hardening: add Convex Auth checks on the deploy-key code path too (separate PR).

## Contribution Flow

To minimize wasted work and account-creation pain for the contributor, the recommended sequence:

1. **Open a GitHub issue** on the boop repo proposing this design (or pasting a link to this spec). Five-minute conversation that surfaces any constraints Chris has in mind before code is written.
2. **Open a draft PR** with code, unit tests passing, Docker image building locally. Test status banner clearly states what was and wasn't verified by the author.
3. **Maintainer or another contributor** runs the runtime smoke test using their accounts.
4. **Iterate** based on review feedback; switch from draft to ready-for-review when everything passes.
5. **Merge.**

This frames the contribution as a respectful, well-formed proposal rather than a fait accompli.

## Out of Scope

Repeated here as the bullet list for clarity:

- Multi-user support
- Convex Auth provider beyond password (no magic link, no OAuth/SSO)
- General security hardening (body limits, rate limits, input validation, buffer bounds)
- Background loop sharding
- Convex Auth on Express → Convex calls (deploy key remains the trust)
- Composio webhook signature validation
- Auto-rotation of OAuth token
- Production-only debug UI features
- Changes to `scripts/setup.ts` or `npm run dev`
- Changes to `/chat` semantics
- CI infrastructure beyond a single test step
- Documentation overhaul beyond the new deploy doc

## Total Scope

| Layer | New files | Modified files | Lines added/changed |
|---|---|---|---|
| Express | 1 | 3 | ~135 |
| Convex | 3 | 13 | ~165 |
| Debug UI | 2 | ~6 | ~110 |
| Deploy infrastructure | 5 | 3 | ~475 |
| Tests | 3 | — | ~120 |
| **Total** | **~14 new** | **~24 modified** | **~860 lines** |

## Why this is one PR, not two

Splitting into a "deploy only" PR followed by an "auth only" PR was considered and rejected:

- A deploy-only PR ships a knowingly-vulnerable public URL. Chris's stated reason for not shipping deploy himself is security; he would not merge a deploy that ignores the auth gap.
- An auth-only PR has no consumer until deploy ships. The auth changes need a real deploy story to justify their existence.

The two halves are coupled by the same problem ("make this safe to host on a public URL"). Together they answer it. Apart, neither does. The size cost is real but justified.
