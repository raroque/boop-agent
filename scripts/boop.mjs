#!/usr/bin/env node
import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import prompts from "prompts";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const DEFAULT_UPSTREAM = "https://github.com/raroque/boop-agent.git";
const CANONICAL_REGEX = /raroque\/boop-agent(\.git)?$/;

const C = {
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  reset: "\x1b[0m",
};

function usage() {
  console.log(`Boop CLI

Usage:
  boop update [--check] [--merge]
  boop help

Commands:
  update   Preview upstream Boop changes and optionally apply a clean merge.

Options:
  --check  Preview only. Never prompts and never merges.
  --merge  Apply the merge if the dry-run conflict preview is clean.

For conflict-heavy upgrades, run the agent skill after preview:
  codex   then /upgrade-boop
  claude  then /upgrade-boop
`);
}

function git(args, opts = {}) {
  return spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: opts.stdio ?? ["ignore", "pipe", "pipe"],
  });
}

function tryGit(args) {
  const result = git(args);
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function mustGit(args, label) {
  const result = git(args);
  if (result.status === 0) return result.stdout.trim();
  const detail = (result.stderr || result.stdout || "").trim();
  throw new Error(`${label} failed${detail ? `: ${detail}` : ""}`);
}

function runInherit(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
  });
  return result.status ?? 1;
}

function isTty() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function currentBranch() {
  return tryGit(["branch", "--show-current"]) || "(detached HEAD)";
}

function isDirty() {
  return Boolean(tryGit(["status", "--porcelain"]));
}

function remoteUrl(remote) {
  return tryGit(["remote", "get-url", remote]);
}

async function chooseRemote(checkOnly) {
  const upstreamUrl = remoteUrl("upstream");
  if (upstreamUrl) return "upstream";

  const originUrl = remoteUrl("origin") || "";
  if (CANONICAL_REGEX.test(originUrl)) {
    return "origin";
  }

  if (checkOnly || !isTty()) {
    throw new Error(
      `No upstream remote is configured. Run:\n  git remote add upstream ${DEFAULT_UPSTREAM}`,
    );
  }

  const answer = await prompts({
    type: "confirm",
    name: "add",
    initial: true,
    message: `No upstream remote found. Add ${DEFAULT_UPSTREAM}?`,
  });
  if (!answer.add) {
    throw new Error(
      `Cannot update without an upstream remote. Run:\n  git remote add upstream ${DEFAULT_UPSTREAM}`,
    );
  }
  const result = git(["remote", "add", "upstream", DEFAULT_UPSTREAM]);
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "git remote add failed").trim());
  }
  return "upstream";
}

function remoteBranch(remote) {
  for (const branch of ["main", "master"]) {
    if (tryGit(["show-ref", "--verify", `refs/remotes/${remote}/${branch}`])) {
      return `${remote}/${branch}`;
    }
  }
  return null;
}

function bucketFile(file) {
  if (file.startsWith("server/composio") || file.startsWith("server/integrations/")) {
    return "Integrations";
  }
  if (file.startsWith("server/")) return "Core";
  if (file.startsWith("debug/")) return "UI";
  if (file.startsWith("convex/")) return "Schema";
  if (
    file.startsWith("scripts/") ||
    file === "package.json" ||
    file === "package-lock.json" ||
    file === "tsconfig.json" ||
    file === ".env.example"
  ) {
    return "Scripts/config";
  }
  if (
    file === "README.md" ||
    file === "ARCHITECTURE.md" ||
    file === "INTEGRATIONS.md" ||
    file === "CONTRIBUTING.md" ||
    file === "CHANGELOG.md"
  ) {
    return "Docs";
  }
  if (file.startsWith(".claude/skills/") || file.startsWith(".agents/skills/")) {
    return "Skills";
  }
  return "Other";
}

function printList(title, text, limit = 20) {
  const lines = text.split("\n").filter(Boolean);
  console.log(`\n${C.bold}${title}${C.reset}`);
  if (lines.length === 0) {
    console.log("  (none)");
    return;
  }
  for (const line of lines.slice(0, limit)) console.log(`  ${line}`);
  if (lines.length > limit) console.log(`  ... ${lines.length - limit} more`);
}

function printBuckets(files) {
  const buckets = new Map();
  for (const file of files) {
    const bucket = bucketFile(file);
    const list = buckets.get(bucket) ?? [];
    list.push(file);
    buckets.set(bucket, list);
  }
  console.log(`\n${C.bold}File impact${C.reset}`);
  for (const bucket of [
    "Core",
    "Integrations",
    "UI",
    "Schema",
    "Scripts/config",
    "Skills",
    "Docs",
    "Other",
  ]) {
    const list = buckets.get(bucket);
    if (!list?.length) continue;
    const risk = bucket === "Core" || bucket === "Schema" ? " high-risk" : "";
    console.log(`  ${bucket}${risk}: ${list.length}`);
    for (const file of list.slice(0, 8)) console.log(`    - ${file}`);
    if (list.length > 8) console.log(`    - ... ${list.length - 8} more`);
  }
}

function dryRunMerge(ref) {
  const merge = git(["merge", "--no-commit", "--no-ff", ref]);
  const conflicted = (tryGit(["diff", "--name-only", "--diff-filter=U"]) || "")
    .split("\n")
    .filter(Boolean);
  git(["merge", "--abort"]);
  return {
    clean: merge.status === 0 && conflicted.length === 0,
    conflicted,
    output: (merge.stderr || merge.stdout || "").trim(),
  };
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    "-",
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds()),
  ].join("");
}

function createRollbackPoint() {
  const hash = mustGit(["rev-parse", "--short", "HEAD"], "Read HEAD");
  const name = `pre-update-${hash}-${timestamp()}`;
  const branch = `backup/${name}`;
  mustGit(["branch", branch], "Create backup branch");
  mustGit(["tag", name], "Create rollback tag");
  return { tag: name, branch };
}

function envKeysFromFile(path) {
  if (!existsSync(path)) return new Set();
  const keys = new Set();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (match) keys.add(match[1]);
  }
  return keys;
}

function showEnvDelta(tag) {
  const envExample = resolve(root, ".env.example");
  const current = envKeysFromFile(envExample);
  let previous = new Set();
  try {
    const raw = execSync(`git show ${tag}:.env.example`, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    for (const line of raw.split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=/);
      if (match) previous.add(match[1]);
    }
  } catch {
    return;
  }
  const added = [...current].filter((key) => !previous.has(key)).sort();
  if (added.length) {
    console.log(`\n${C.bold}New .env.example keys${C.reset}`);
    for (const key of added) console.log(`  - ${key}`);
    console.log("Add any that apply to .env.local.");
  }
}

function printAgentInstructions() {
  console.log(`\n${C.bold}Agent-assisted update${C.reset}
Run one of these in this repo:

  codex
  /upgrade-boop

or:

  claude
  /upgrade-boop

The mirrored skills live at:
  .agents/skills/upgrade-boop/SKILL.md
  .claude/skills/upgrade-boop/SKILL.md
`);
}

async function update() {
  const args = new Set(process.argv.slice(3));
  const checkOnly = args.has("--check");
  const forceMerge = args.has("--merge");

  console.log(`${C.bold}Boop update preview${C.reset}`);
  console.log(`Repo: ${root}`);
  console.log(`Branch: ${currentBranch()}`);

  if (isDirty()) {
    throw new Error("Working tree has uncommitted changes. Commit or stash before updating.");
  }

  const remote = await chooseRemote(checkOnly);
  console.log(`Remote: ${remote}`);
  const fetchStatus = runInherit("git", ["fetch", remote, "--prune"]);
  if (fetchStatus !== 0) throw new Error(`git fetch ${remote} failed`);

  const ref = remoteBranch(remote);
  if (!ref) throw new Error(`Could not find ${remote}/main or ${remote}/master after fetch.`);

  const base = mustGit(["merge-base", "HEAD", ref], "Find merge base");
  const incoming = mustGit(["log", "--oneline", `${base}..${ref}`], "Read incoming commits");
  const local = mustGit(["log", "--oneline", `${base}..HEAD`], "Read local commits");
  const files = mustGit(["diff", "--name-only", `${base}..${ref}`], "Read changed files")
    .split("\n")
    .filter(Boolean);

  if (!incoming.trim()) {
    console.log(`${C.green}Already up to date with ${ref}.${C.reset}`);
    return;
  }

  printList(`Incoming commits from ${ref}`, incoming);
  printList("Local-only commits", local);
  printBuckets(files);

  const preview = dryRunMerge(ref);
  console.log(`\n${C.bold}Conflict preview${C.reset}`);
  if (preview.conflicted.length) {
    console.log(`${C.yellow}Conflicts expected:${C.reset}`);
    for (const file of preview.conflicted) console.log(`  - ${file}`);
  } else if (preview.clean) {
    console.log(`${C.green}Clean merge preview.${C.reset}`);
  } else {
    console.log(`${C.yellow}Merge preview did not complete cleanly:${C.reset}`);
    if (preview.output) console.log(preview.output);
  }

  if (checkOnly) {
    printAgentInstructions();
    return;
  }

  if (forceMerge) {
    if (!preview.clean) {
      throw new Error("Refusing --merge because the dry-run merge was not clean.");
    }
    return applyMerge(ref);
  }

  if (!isTty()) {
    printAgentInstructions();
    return;
  }

  const choices = [
    {
      title: "Use /upgrade-boop in Codex or Claude",
      description: "Best for customized forks and conflict resolution.",
      value: "agent",
    },
  ];
  if (preview.clean) {
    choices.push({
      title: "Apply clean git merge now",
      description: "Creates rollback tag, merges, installs deps, and typechecks.",
      value: "merge",
    });
  }
  choices.push({ title: "Abort", value: "abort" });

  const answer = await prompts({
    type: "select",
    name: "action",
    message: "Next step?",
    choices,
    initial: 0,
  });

  if (answer.action === "merge") return applyMerge(ref);
  if (answer.action === "agent") {
    printAgentInstructions();
    return;
  }
  console.log("Aborted.");
}

function applyMerge(ref) {
  const rollback = createRollbackPoint();
  console.log(`\nRollback tag: ${rollback.tag}`);
  console.log(`Backup branch: ${rollback.branch}`);

  const mergeStatus = runInherit("git", ["merge", ref, "--no-edit"]);
  if (mergeStatus !== 0) {
    console.error(
      `\n${C.red}Merge stopped with conflicts.${C.reset}\nResolve them, or run: git merge --abort\nRollback tag: ${rollback.tag}`,
    );
    process.exit(mergeStatus);
  }

  const installStatus = runInherit("npm", ["install"]);
  if (installStatus !== 0) process.exit(installStatus);

  const typecheckStatus = runInherit("npm", ["run", "typecheck"]);
  if (typecheckStatus !== 0) process.exit(typecheckStatus);

  showEnvDelta(rollback.tag);
  const newHead = mustGit(["rev-parse", "--short", "HEAD"], "Read new HEAD");
  const upstreamHead = mustGit(["rev-parse", "--short", ref], "Read upstream HEAD");
  console.log(`\n${C.green}Update complete.${C.reset}`);
  console.log(`New HEAD: ${newHead}`);
  console.log(`Upstream HEAD: ${upstreamHead}`);
  console.log(`Rollback: git reset --hard ${rollback.tag}`);
  console.log("Restart npm run dev so server code and Convex functions reload.");
}

async function main() {
  const command = process.argv[2] ?? "help";
  if (command === "help" || command === "--help" || command === "-h") {
    usage();
    return;
  }
  if (command === "update") {
    await update();
    return;
  }
  usage();
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(`${C.red}boop:${C.reset} ${err.message}`);
  process.exit(1);
});
