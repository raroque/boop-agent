---
name: upgrade-boop
description: Pull upstream Boop changes into a customized fork. Previews, backs up, merges with conflict-aware resolution, validates, and surfaces breaking changes.
---

# About

Your Boop fork drifts from upstream as you customize it — system prompts tweaked, new automations, tuned memory thresholds, etc. This skill brings upstream changes in without blowing away those edits.

Run `/upgrade-boop` inside the repo (from `claude`, not your normal shell).

## How it works

**Preflight:** refuses to touch anything with a dirty working tree. If the `upstream` remote is missing, adds it (default: `https://github.com/chris/boop-agent.git` — the skill will ask).

**Backup:** creates a timestamped rollback branch + tag before doing anything. Printed at the end so you can `git reset --hard` back.

**Preview:** buckets upstream changes into categories so you know what's about to land:
- **Core** (`server/`) — the dispatcher, executor, memory, automations. High conflict risk if you edited your prompts.
- **Integrations** (`server/composio*`, `server/integrations/`) — Composio wiring.
- **UI** (`debug/`) — debug dashboard.
- **Schema** (`convex/`) — Convex tables + functions. Pushes happen on next `convex dev`.
- **Scripts / config** (`scripts/`, `package.json`, `tsconfig.json`, `.env.example`) — env vars + deps might need attention.
- **Docs** (`README.md`, `ARCHITECTURE.md`, `INTEGRATIONS.md`, `CHANGELOG.md`).

**Choice:** you pick merge (one-pass), cherry-pick (specific commits), rebase (linear history), or abort.

**Conflict preview:** dry-run merge to show which files would conflict before you commit.

**Validation:** `npm install` + `npm run typecheck` after the merge.

**Breaking changes:** parses the CHANGELOG.md diff for `[BREAKING]` entries and surfaces each one. Many breaking changes will reference a migration skill (`/<skill-name>`) — the skill offers to run those for you.

**Summary:** prints rollback tag, new/upstream HEADs, and any env-var additions from `.env.example` you should copy into `.env.local`.

---

# Operating principles

- Never proceed with a dirty working tree.
- Always create a rollback point (backup branch + tag) before touching anything.
- Prefer git-native operations. Do not rewrite files manually except to resolve conflict markers.
- Default to MERGE (one-pass conflict resolution). Offer REBASE only if the user explicitly asks.
- Keep token usage low: use `git status`, `git log`, `git diff`, and only open files that actually have conflicts.

---

# Step 0: Preflight

Run:
- `git status --porcelain`

If output is non-empty:
- Tell the user to commit or stash first. Stop.

Confirm remotes with `git remote -v`. If `upstream` is missing:
- Ask the user for the upstream repo URL (default: `https://github.com/chris/boop-agent.git`).
- `git remote add upstream <url>`
- `git fetch upstream --prune`

Detect the upstream branch:
- `git branch -r | grep upstream/`
- Prefer `upstream/main`. Fall back to `upstream/master`. If neither, ask.
- Store as `UPSTREAM_BRANCH`. All commands below that reference `upstream/main` use `upstream/$UPSTREAM_BRANCH` instead.

Fetch fresh:
- `git fetch upstream --prune`

# Step 1: Safety net

```
HASH=$(git rev-parse --short HEAD)
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
git branch backup/pre-upgrade-$HASH-$TIMESTAMP
git tag pre-upgrade-$HASH-$TIMESTAMP
```

Save the tag name. You'll print it in Step 7 for rollback.

# Step 2: Preview

Compute base:
- `BASE=$(git merge-base HEAD upstream/$UPSTREAM_BRANCH)`

Show what's coming:
- `git log --oneline $BASE..upstream/$UPSTREAM_BRANCH`

Show local drift:
- `git log --oneline $BASE..HEAD`

File-level impact:
- `git diff --name-only $BASE..upstream/$UPSTREAM_BRANCH`

Bucket files into the categories listed in **How it works** (Core, Integrations, UI, Schema, Scripts/config, Docs). Call out high-risk buckets specifically.

**Large-drift check:** if upstream has many commits and the user has heavy local drift, mention that starting fresh and reapplying customizations might be cleaner than merging. Don't push — offer.

Ask the user with `AskUserQuestion`:
- A) **Full update** — merge all upstream changes (default)
- B) **Selective** — cherry-pick specific commits
- C) **Abort** — preview only
- D) **Rebase** — linear history, resolves conflicts per commit

If Abort: print rollback info and stop.

# Step 3: Conflict preview (no commits yet)

If Full update or Rebase, dry-run:
```
git merge --no-commit --no-ff upstream/$UPSTREAM_BRANCH; git diff --name-only --diff-filter=U; git merge --abort
```

Show the conflict list. If empty, say "clean" and proceed. If non-empty, let the user bail.

# Step 4A: Full update (MERGE — default)

- `git merge upstream/$UPSTREAM_BRANCH --no-edit`

If conflicts:
- `git status` → list conflicted files.
- For each file:
  - Open it.
  - Resolve only conflict markers.
  - Preserve intentional local customizations.
  - Incorporate upstream improvements.
  - Do not refactor surrounding code.
  - `git add <file>`
- When done: `git commit --no-edit` (if merge didn't auto-commit).

# Step 4B: Selective (CHERRY-PICK)

- `git log --oneline $BASE..upstream/$UPSTREAM_BRANCH`
- Ask which hashes.
- `git cherry-pick <hash1> <hash2> …`

On conflict:
- Resolve markers, `git add`, `git cherry-pick --continue`.
- `git cherry-pick --abort` to stop.

# Step 4C: Rebase (opt-in)

- `git rebase upstream/$UPSTREAM_BRANCH`

On conflict: resolve, `git add`, `git rebase --continue`. If > 3 rounds of conflicts, `git rebase --abort` and recommend merge.

# Step 5: Validation

Run in order:
- `npm install` — picks up any new deps.
- `npm run typecheck` — this repo's typecheck. If it fails with errors outside the merge delta, flag it but don't block.

**Note:** Convex schema changes (`convex/schema.ts`, `convex/*.ts`) take effect the next time `convex dev` runs. Mention this to the user — they need to restart `npm run dev` for the schema to push.

**Note:** If `.env.example` changed, diff it against `.env.local`:
- `diff <(grep -o '^[A-Z_]*=' .env.example | sort) <(grep -o '^[A-Z_]*=' .env.local | sort)`
- List any new keys the user should add to `.env.local`.

# Step 6: Breaking changes check

Read the CHANGELOG delta:
- `git diff pre-upgrade-$HASH-$TIMESTAMP..HEAD -- CHANGELOG.md`

Parse new lines containing `[BREAKING]`. Format is:
```
[BREAKING] <description>. Run `/<skill-name>` to <action>.
```

If none: proceed silently.

If any:
- Display a warning header: "This update introduces breaking changes that may need action:"
- Show each `[BREAKING]` line in full.
- Collect referenced skills.
- `AskUserQuestion` (multiSelect: true):
  - One option per referenced skill
  - "Skip — I'll handle these manually"
- For each selected skill, invoke via the Skill tool.

# Step 7: Summary + rollback

Print:
- **Rollback tag:** `pre-upgrade-<HASH>-<TIMESTAMP>`
- **New HEAD:** `git rev-parse --short HEAD`
- **Upstream HEAD:** `git rev-parse --short upstream/$UPSTREAM_BRANCH`
- **Conflicts resolved:** list, if any
- **New env vars to add to .env.local:** list from Step 5
- **Breaking changes applied:** list skills run

Tell the user:
- Rollback: `git reset --hard pre-upgrade-<HASH>-<TIMESTAMP>`
- Backup branch also exists: `backup/pre-upgrade-<HASH>-<TIMESTAMP>`
- Restart `npm run dev` to pick up code + Convex schema changes.
