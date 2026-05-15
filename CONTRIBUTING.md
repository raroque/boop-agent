# Contributing

Boop is a small personal-agent template. The codebase stays tight because that's the whole point — it should be small enough to read cover-to-cover in an afternoon and fork without fear.

## What lands in source

- Bug fixes
- Security fixes
- Simplifications (less code doing the same thing)
- Clear improvements to core behavior — memory decay tuning, consolidation robustness, dispatcher policy, cost tracking, etc.
- New channels, integrations, or runtime skills if they fit the template spirit (small, opinionated, well-scoped)

Keep the diff focused — one concern per PR. A feature PR and a refactor PR should be two PRs.

## Bug-fix PRs

- One fix per PR.
- Update `CHANGELOG.md` under **Unreleased** with a one-line entry.
- If the fix changes external behavior (env vars, Convex schema, HTTP routes, webhook shapes), mark the CHANGELOG entry `[BREAKING]` — see conventions below.

## CHANGELOG conventions

- Entries live under **Unreleased** until a release cut.
- Prefix user-actionable changes with `[BREAKING]`.
- If a breaking change needs a migration (backfill, env var rename, schema transform), ship a **migration skill** in both runtime skill trees so Claude and Codex users get the same upgrade path:

  - `.claude/skills/<name>/SKILL.md`
  - `.agents/skills/<name>/SKILL.md`

  Reference it in the CHANGELOG:

  ```
  [BREAKING] <description>. Run `/<skill-name>` to <action>.
  ```

  `/upgrade-boop` parses this format and offers to run the referenced skill during agent-assisted upgrades. The format is the only coupling — without a migration, just write `[BREAKING] <description>.` without the skill reference.

## Skills

Two kinds of skills live in the project skill trees:

**Migration skills** — instruction-only `SKILL.md` files triggered by `[BREAKING]` CHANGELOG entries during `/upgrade-boop`. Pure markdown, no branch, no supporting code. Mirror them in `.claude/skills/` and `.agents/skills/` unless the migration is explicitly provider-specific. Example: `/upgrade-boop` itself is this shape.

**Runtime skills** — `SKILL.md` loaded into the execution agent at spawn time. Claude loads `.claude/skills/` via the Claude Agent SDK's `settingSources`; Codex uses `.agents/skills/` for the same project-facing playbooks. The model autonomously invokes a skill when a task matches the skill's `description`. Example: `.claude/skills/youtube-script-writer/` plus `.agents/skills/youtube-script-writer/`. See the **Skills** section in the README for wiring details.

Both are just Markdown under `.claude/skills/<name>/SKILL.md` and/or `.agents/skills/<name>/SKILL.md` with YAML frontmatter. No branching model, no maintainer-owned sibling branches — features land directly on `main` like any normal project.

## Writing a migration skill

1. Fork, branch from `main`.
2. Create mirrored skill files:
   - `.claude/skills/<name>/SKILL.md`
   - `.agents/skills/<name>/SKILL.md`

   Each file uses the same frontmatter:
   ```yaml
   ---
   name: <name>
   description: One-line trigger description — when /upgrade-boop should offer this.
   ---
   ```
3. Body: numbered operating steps the agent should execute. Lean on `git`, `npm`, file edits. Make the skill idempotent — a user running it twice should be safe.
4. Add the matching `[BREAKING]` line to `CHANGELOG.md` under **Unreleased**.
5. Open a PR with the code change + both `SKILL.md` files + the CHANGELOG entry in one commit.

## Writing a runtime skill

1. Create `.claude/skills/<name>/SKILL.md` and `.agents/skills/<name>/SKILL.md` with a specific, trigger-rich `description` so both runtimes route to it reliably.
2. Body: the playbook the execution agent should follow when it invokes this skill.
3. That's it — no server code changes needed unless the behavior requires real tools or prompt/runtime changes.
