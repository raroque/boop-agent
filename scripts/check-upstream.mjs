#!/usr/bin/env node
// Background check that nudges the user when upstream has new commits.
// Runs in parallel with dev.mjs startup; silent on no-op or failure.
//
// Behavior matrix:
//   - upstream remote + new commits → banner w/ count + /upgrade-boop instruction
//   - upstream remote, up to date   → silent
//   - no upstream + forked origin   → one-line hint on how to add upstream
//   - no upstream + origin IS upstream (raroque/boop-agent) → silent

import { spawn } from "node:child_process";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const CANONICAL_REGEX = /raroque\/boop-agent(\.git)?$/;
const FETCH_TIMEOUT_MS = 5000;

const C = {
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  reset: "\x1b[0m",
};

function tryExec(cmd) {
  try {
    return execSync(cmd, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function isAncestor(ref) {
  try {
    execSync(`git merge-base --is-ancestor ${ref} HEAD`, { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function fetchUpstream() {
  return new Promise((resolveFn) => {
    const child = spawn("git", ["fetch", "upstream", "main", "--quiet"], {
      cwd: root,
      stdio: "ignore",
    });
    const timer = setTimeout(() => {
      child.kill();
      resolveFn(false);
    }, FETCH_TIMEOUT_MS);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolveFn(code === 0);
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolveFn(false);
    });
  });
}

function printBehindBanner(ahead) {
  const pad = (s, n) => s + " ".repeat(Math.max(0, n - stripAnsi(s).length));
  const line = `📦  ${ahead} new commit${ahead === 1 ? "" : "s"} upstream on raroque/boop-agent`;
  const cmd = `${C.bold}/upgrade-boop${C.reset}${C.yellow}`;
  console.log(`
${C.yellow}╭──────────────────────────────────────────────────────────────╮
│ ${pad(line, 60)} │
│                                                              │
│ Open \`claude\` in this repo and run:                          │
│   ${pad(cmd, 58)} │
│                                                              │
│ Previews diffs, tags a rollback, merges, surfaces [BREAKING] │
│ entries in CHANGELOG.                                        │
╰──────────────────────────────────────────────────────────────╯${C.reset}
`);
}

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function printNoUpstreamHint() {
  console.log(
    `${C.dim}  ℹ Tip: set up upstream for new-version checks on \`npm run dev\`:
     ${C.bold}git remote add upstream https://github.com/raroque/boop-agent.git${C.reset}${C.dim}
     Then \`claude\` → \`/upgrade-boop\` whenever upstream has changes.${C.reset}
`,
  );
}

(async () => {
  const upstreamUrl = tryExec("git remote get-url upstream");

  if (!upstreamUrl) {
    const originUrl = tryExec("git remote get-url origin") || "";
    // Canonical clone (rare) or fork-with-no-upstream (common). Only nag the
    // latter — if this user IS the upstream they have nothing to pull.
    if (!CANONICAL_REGEX.test(originUrl)) {
      printNoUpstreamHint();
    }
    return;
  }

  const fetched = await fetchUpstream();
  if (!fetched) return; // offline, perms, network — fail open

  const upstreamHead = tryExec("git rev-parse upstream/main");
  if (!upstreamHead) return;

  if (isAncestor(upstreamHead)) return; // already have it

  const ahead = parseInt(tryExec(`git rev-list --count HEAD..${upstreamHead}`) || "0", 10);
  if (!ahead) return;
  printBehindBanner(ahead);
})().catch(() => {
  /* never block startup on failure */
});
