---
name: setup-deploy-auth
description: One-time migration to enable single-user auth + Fly deploy. Installs new deps, pushes auth tables to Convex, generates the admin password, bootstraps the admin user, and prints next steps. Run after pulling the auto-deploy + auth upgrade.
---

# Set up deploy + auth

Migration triggered when pulling in the auto-deploy + auth changes. Installs deps, pushes the schema additions, generates and stores the admin password, bootstraps the admin user, and reconciles `.env.local` against `.env.example`. Idempotent — safe to re-run.

# Operating principles

- Never proceed with a dirty working tree. Refuse and ask the user to commit or stash.
- Lean on `npm`, `npx convex`, `git`. Don't hand-edit generated files.
- Idempotent: each step is safe to re-run. The user might Ctrl-C halfway and resume.
- Surface errors clearly. If a step fails, stop and report — don't silently continue.

# Step 0: Preflight

Run:
- `git status --porcelain`

If output is non-empty, tell the user to commit or stash and stop.

Verify the new files exist (these came in with the upgrade):
- `convex/auth.ts`
- `convex/auth.config.ts`
- `convex/users.ts`
- `server/auth.ts`

If any are missing the merge didn't bring them in — stop and tell the user.

# Step 1: Install new deps

Run:
- `npm install`

Picks up `jose`, `@convex-dev/auth`, `@auth/core`, and any other dep moves from the new `package.json`.

# Step 2: Push schema additions to Convex

The upgrade adds `authTables` from `@convex-dev/auth/server` to the schema (`users`, `authAccounts`, `authSessions`, etc.). Push them:

- `npx convex dev --once`

Output should end with "Convex functions ready". If the user is offline or doesn't want to push right now, they can skip — but Step 4 (bootstrap) will fail until the schema is pushed.

# Step 3: Generate the admin password

Check if `BOOP_ADMIN_PASSWORD` is already set in `.env.local`:
- `grep -E '^BOOP_ADMIN_PASSWORD=.+' .env.local`

If a non-empty value exists, ask whether to keep it or generate a new one.

To generate a strong password:
- `openssl rand -base64 24`

Store the chosen value as `$BOOP_PASSWORD` for the remaining steps. Print it once for the user to record (they'll need it to log into the dashboard).

# Step 4: Set the password in Convex env

Run:
- `npx convex env set BOOP_ADMIN_PASSWORD <value>`

The `bootstrap` action reads this from `process.env` inside Convex.

# Step 5: Bootstrap the admin user

Run:
- `npx convex run users:bootstrap`

Expected output:
- First run: `{ created: true }`
- Re-run: `{ created: false, reason: "user already exists" }`

If the action throws "BOOP_ADMIN_PASSWORD is not set", Step 4 didn't take effect — re-run it and try again.

# Step 6: Reconcile `.env.local` against `.env.example`

The upgrade added new keys to `.env.example`. Find ones missing from `.env.local`:

```
comm -23 \
  <(grep -oE '^[A-Z_][A-Z0-9_]*=' .env.example | sort -u) \
  <(grep -oE '^[A-Z_][A-Z0-9_]*=' .env.local 2>/dev/null | sort -u)
```

For each missing key, append a blank line to `.env.local` and tell the user what they need to set:

| Key | When to set | Where to get |
|---|---|---|
| `SENDBLUE_SIGNING_SECRET` | Required for any non-localhost deploy. Without it, the webhook accepts unsigned requests in local dev only. | Sendblue dashboard → Webhook Settings → Signing Secret |
| `BOOP_ADMIN_PASSWORD` | Set to the value from Step 3. (For local dev, the dashboard reads this from Convex env, not `.env.local` — but storing it locally helps you remember.) | Step 3 of this skill |
| `CLAUDE_CODE_OAUTH_TOKEN` | Optional. Use this on deployed forks if you'd rather use your Claude subscription than `ANTHROPIC_API_KEY`. | Run `claude setup-token` locally |

Don't fill values automatically. The user needs to choose what's relevant for their setup.

# Step 7: Print next steps

If the user is running boop locally (not deployed):
- "Run `npm run dev`. Visit `http://localhost:5173`. Log in with the password from Step 3."
- "iMessage flow keeps working — `/sendblue/webhook` is allowlisted."

If the user is deploying (or planning to):
- "Run `npm run deploy` — interactive script that creates a Fly app, generates secrets, configures Convex/Sendblue/GitHub Actions, and ships the first deploy."
- "Read `docs/deploying.md` for the full walkthrough and operational notes (annual `CLAUDE_CODE_OAUTH_TOKEN` rotation, password rotation, single-replica constraint)."

Print rollback info: "If something broke, the `/upgrade-boop` rollback tag (printed at upgrade end) reverses everything in this skill plus the upgrade itself."

# Idempotency notes

- `npm install` — idempotent.
- `convex dev --once` — pushes schema; idempotent if schema unchanged.
- `convex env set` — overwrites existing value (intentional — Step 3 may have generated a new password).
- `users:bootstrap` — returns "user already exists" if already bootstrapped (the action's first check).
- `.env.local` reconciliation — only appends missing keys; never overwrites values.

A user running this skill twice in a row gets:
- Step 1: no change
- Step 2: no schema diff to push
- Step 3: prompted to keep existing or regenerate
- Step 4: env value possibly updated
- Step 5: "user already exists" (or recreated if Step 3 regenerated and Step 4 stored new)
- Step 6: no missing keys to append
- Step 7: prints again
