<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->

## Pre-commit checks (this is a public repo)

Before staging or committing **any** file, scan it for personal or sensitive data. Once it lands in git history it's effectively permanent — even after rewriting history, GitHub keeps orphaned commit SHAs reachable for weeks.

What counts as PII / sensitive in this repo:
- Personal email addresses (the maintainer's or anyone else's), phone numbers, postal addresses, full names of non-public individuals.
- Live API keys, tokens, secrets, or anything from `.env.local`.
- Composio connection IDs (`ca_*`), connected-account aliases, OAuth state, refresh tokens.
- Personal search queries / financial details / message content from real conversations (e.g. "rent", landlord names, contacts' names).
- Production URLs, internal hostnames, or anything that maps a public identifier to a private account.

Where this most often slips in:
- One-off debug scripts under `scripts/` and `debug/` written during a real session.
- Test fixtures hand-copied from real responses.
- Comments or commit messages quoting real data.
- README/docs examples that use real values instead of placeholders.

Process:
1. Before `git add`, read each new or modified file end-to-end and substitute any real values with environment variables, CLI args, or generic placeholders (`user@example.com`, `ca_REDACTED`).
2. Prefer not committing ad-hoc debug scripts at all — keep them in your shell history or a gitignored scratch dir.
3. If you realize PII slipped in **before pushing**, amend or reset and re-commit cleanly.
4. If it already pushed, see the recovery steps in [GitHub's sensitive data docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) and rotate any exposed credentials.
