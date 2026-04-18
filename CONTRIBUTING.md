# Contributing

Boop is a small template, not a generic framework. The codebase stays tight because most extensions happen on your fork, not in the base.

## Philosophy

The base should do one thing well: text an agent, spawn sub-agents, remember, run automations, connect integrations via Composio. Everything else is opt-in per fork.

**Source code changes that are accepted:**
- Bug fixes.
- Security fixes.
- Simplifications (less code doing the same thing).
- Clear improvements to core behaviour (memory decay tuning, consolidation robustness, dispatcher policy refinements).

**Not accepted as source code:**
- New features.
- New integrations (those live in Composio's catalog — no code change needed).
- Optional capabilities (alternative models, specialized UIs, extra channels).

Those go in as **skills** instead.

## Skills, not features

Feature additions ship as Claude Code skills in `.claude/skills/<name>/`. A user opts in with `/<name>` inside `claude`, and the skill transforms their fork. This keeps the base minimal and lets each user end up with exactly the code they want.

Two skill shapes are common:

### Branch-based feature skill

The skill's `SKILL.md` tells Claude to fetch + merge a `skill/<name>` branch that carries the actual code.

- `.claude/skills/<name>/SKILL.md` — instructions, merge + setup steps.
- `skill/<name>` branch (managed by maintainers after your PR is merged to `main`) — the code.

Good for: new channels, alternative runtimes, optional UI panels.

### Instruction-only skill

Pure `SKILL.md` with no branch — Claude reads it and executes the described edits directly.

Good for: small customizations, tuning knobs, migration helpers.

See `.claude/skills/upgrade-boop/SKILL.md` for a canonical example.

## Writing a skill

1. Fork, branch from `main`.
2. Create `.claude/skills/<name>/SKILL.md` with frontmatter:
   ```yaml
   ---
   name: <name>
   description: <one-sentence trigger description — what this skill does>
   ---
   ```
3. Body: operating principles, step-by-step instructions for Claude Code.
4. If code changes are needed: put them on a `skill/<name>` branch and reference it in the SKILL.md's merge step.
5. If the skill migrates existing state: parse `CHANGELOG.md` for the `[BREAKING]` entry that triggered it, so it's idempotent.
6. Open a PR with `SKILL.md` (+ the code branch if applicable).

## Bug-fix PRs

- Keep the diff tight — one fix per PR.
- Update `CHANGELOG.md` under **Unreleased** with a one-liner.
- If the fix changes external behaviour (env vars, schema, routes), mark the CHANGELOG entry `[BREAKING]` and name the migration skill users should run.

## CHANGELOG conventions

- Entries live under **Unreleased** until a release cut.
- Prefix actionable changes with `[BREAKING]` and include `` `/skill-name` `` to reference the migration.
- Format: `[BREAKING] <description>. Run \`/<skill-name>\` to <action>.`

`/upgrade-boop` parses this format to surface breaking changes and offer to run the referenced skills.

## What doesn't go in the base

Skip proposing these — they belong in skills or forks:

- New Composio toolkits in `CURATED_TOOLKITS` (keep the list intentionally short; users can paste arbitrary slugs anyway in future work).
- Alternative message channels (SMS provider A, iMessage alternative B, Telegram, etc).
- Specialized dashboards or visualizations beyond the current panels.
- Hosted / multi-tenant functionality.

Hosted/multi-tenant is an architectural fork, not a feature flag — better as its own project.
