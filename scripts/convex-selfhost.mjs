#!/usr/bin/env node
/**
 * Self-hosted Convex helper.
 *
 * Subcommands:
 *   up                Start the local backend + dashboard (docker compose up -d)
 *   down              Stop the stack (data volume preserved)
 *   logs [service]    Tail backend (default) or dashboard logs
 *   status            Show container + health status
 *   key               Generate an admin key and print export lines
 *   url               Print the URLs (backend / site / dashboard)
 *   dev               Run `npx convex dev` against the self-hosted backend
 *   deploy            Run `npx convex deploy` against the self-hosted backend
 *   export <dir>      Export all tables to <dir> (snapshot)
 *   import <path>     Import a snapshot zip into the self-hosted backend
 *   nuke              Stop and DELETE the data volume (destructive, prompts)
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), "..");
const COMPOSE_DIR = resolve(ROOT, "self-hosted");
const COMPOSE_FILE = resolve(COMPOSE_DIR, "docker-compose.yml");

function compose(args, opts = {}) {
  return spawnSync("docker", ["compose", "-f", COMPOSE_FILE, ...args], {
    stdio: opts.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    cwd: COMPOSE_DIR,
    encoding: "utf8",
  });
}

function readEnvLocal() {
  const envPath = resolve(ROOT, ".env.local");
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

function selfHostEnv() {
  const env = readEnvLocal();
  const url = env.CONVEX_SELF_HOSTED_URL || "http://127.0.0.1:3210";
  const key = env.CONVEX_SELF_HOSTED_ADMIN_KEY;
  if (!key) {
    console.error(
      "CONVEX_SELF_HOSTED_ADMIN_KEY missing from .env.local — run `npm run convex:selfhost key` first.",
    );
    process.exit(1);
  }
  return {
    ...process.env,
    CONVEX_SELF_HOSTED_URL: url,
    CONVEX_SELF_HOSTED_ADMIN_KEY: key,
  };
}

function runConvex(cmd, env) {
  return spawn("npx", ["convex", ...cmd], {
    stdio: "inherit",
    cwd: ROOT,
    env,
  });
}

async function confirm(question) {
  const rl = createInterface({ input, output });
  const ans = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
  rl.close();
  return ans === "y" || ans === "yes";
}

const [, , subcmd, ...rest] = process.argv;

switch (subcmd) {
  case "up": {
    compose(["up", "-d"]);
    console.log("\nBackend:   http://127.0.0.1:3210");
    console.log("Site:      http://127.0.0.1:3211");
    console.log("Dashboard: http://localhost:6791");
    console.log("\nNext: npm run convex:selfhost key");
    break;
  }
  case "down": {
    compose(["down"]);
    break;
  }
  case "logs": {
    const svc = rest[0] || "backend";
    compose(["logs", "-f", svc]);
    break;
  }
  case "status": {
    compose(["ps"]);
    break;
  }
  case "key": {
    const r = compose(["exec", "backend", "./generate_admin_key.sh"], {
      capture: true,
    });
    if (r.status !== 0) {
      process.stderr.write(r.stderr || "");
      process.exit(r.status ?? 1);
    }
    process.stdout.write(r.stdout);
    console.log(
      "\nAdd these to .env.local (replace any existing CONVEX_* lines):",
    );
    console.log("  CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210");
    console.log("  CONVEX_SELF_HOSTED_ADMIN_KEY=<paste the key from above>");
    console.log("  VITE_CONVEX_URL=http://127.0.0.1:3210");
    console.log("  VITE_CONVEX_SITE_URL=http://127.0.0.1:3211");
    break;
  }
  case "url": {
    console.log("Backend:   http://127.0.0.1:3210");
    console.log("Site:      http://127.0.0.1:3211");
    console.log("Dashboard: http://localhost:6791");
    break;
  }
  case "dev": {
    runConvex(["dev"], selfHostEnv());
    break;
  }
  case "deploy": {
    runConvex(["deploy"], selfHostEnv());
    break;
  }
  case "export": {
    const dir = rest[0];
    if (!dir) {
      console.error("Usage: convex-selfhost export <output-dir>");
      process.exit(1);
    }
    runConvex(["export", "--path", dir], selfHostEnv());
    break;
  }
  case "import": {
    const path = rest[0];
    if (!path) {
      console.error("Usage: convex-selfhost import <snapshot.zip>");
      process.exit(1);
    }
    runConvex(["import", path], selfHostEnv());
    break;
  }
  case "nuke": {
    const ok = await confirm(
      "Delete the self-hosted Convex data volume? This is irreversible.",
    );
    if (!ok) {
      console.log("Aborted.");
      process.exit(0);
    }
    compose(["down", "-v"]);
    break;
  }
  default:
    console.log(
      `Usage: convex-selfhost <up|down|logs|status|key|url|dev|deploy|export|import|nuke>`,
    );
    process.exit(subcmd ? 1 : 0);
}
