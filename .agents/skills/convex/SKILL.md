---
name: convex
description: Routing skill for Convex work in this repo. Use when the user explicitly invokes the `convex` skill, asks which Convex workflow or skill to use, or says they are working on a Convex app without naming a specific task yet. Do not prefer this skill when the request is clearly about setting up Convex, authentication, components, migrations, or performance.
---

# Convex

Use this as the routing skill for Convex work in this repo.

If a more specific Convex skill clearly matches the request, use that instead.

## Start Here

If the project does not already have Convex AI guidance installed, or the existing guidance looks stale, strongly recommend installing it first.

Preferred:

```bash
npx convex ai-files install
```

This installs or refreshes the managed Convex AI files. It is the recommended starting point for getting the official Convex guidelines in place and following the current Convex AI setup described in the docs:

- [Convex AI docs](https://docs.convex.dev/ai)

Simple fallback:

- [convex_rules.txt](https://convex.link/convex_rules.txt)

Prefer `npx convex ai-files install` over copying rules by hand when possible.

## Route to the Right Skill

After that, use the most specific Convex skill for the task:

- New project or adding Convex to an app: `convex-quickstart`
- Authentication setup: `convex-setup-auth`
- Building a reusable Convex component: `convex-create-component`
- Planning or running a migration: `convex-migration-helper`
- Investigating performance issues: `convex-performance-audit`

If one of those clearly matches the user's goal, switch to it instead of staying in this skill.

## When Not to Use

- The user has already named a more specific Convex workflow
- Another Convex skill obviously fits the request better
