#!/usr/bin/env node
// Registers (or re-registers) the inbound message webhook with Sendblue via
// their CLI, so free-ngrok users don't have to paste into the dashboard
// every time their tunnel URL rotates.
//
// Usage:
//   node scripts/sendblue-webhook.mjs <public-webhook-url>
//
// Behavior:
//   1. Runs `sendblue webhooks` to list current inbound hooks.
//   2. Removes any stale *.ngrok-free.app / *.ngrok-free.dev / *.ngrok.app / trycloudflare.com
//      webhooks of type=receive that don't match the new URL.
//   3. Adds the new URL as type=receive (unless already registered).

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const envPath = resolve(root, ".env.local");

function readEnv() {
  if (!existsSync(envPath)) return {};
  const env = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*?)(?:\s+#.*)?$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

function hasBinary(name) {
  return new Promise((ok) => {
    const p = spawn(process.platform === "win32" ? "where" : "which", [name], {
      stdio: "ignore",
    });
    p.on("exit", (code) => ok(code === 0));
    p.on("error", () => ok(false));
  });
}

function runCapture(cmd, args) {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { cwd: root });
    let out = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", () => {});
    p.on("exit", (code) =>
      code === 0 ? ok(out) : fail(new Error(`${cmd} exited ${code}`)),
    );
    p.on("error", fail);
  });
}

function parseWebhookLines(output) {
  const clean = output.replace(/\x1b\[[0-9;]*m/g, "");
  const hooks = [];
  for (const line of clean.split(/\r?\n/)) {
    const urlMatch = line.match(/(https?:\/\/[^\s)]+)/);
    const typeMatch = line.match(
      /\b(receive|outbound|call_log|line_blocked|line_assigned|contact_created)\b/,
    );
    if (urlMatch && typeMatch) {
      hooks.push({ url: urlMatch[1], type: typeMatch[1] });
    }
  }
  return hooks;
}

const STALE_DOMAIN_RE = /(ngrok-free\.(app|dev)|ngrok\.app|trycloudflare\.com|loca\.lt)/;

async function main() {
  const url = process.argv[2];
  if (!url || !/^https?:\/\//.test(url)) {
    console.error("Usage: node scripts/sendblue-webhook.mjs <public-webhook-url>");
    process.exit(1);
  }

  const env = readEnv();
  if (!env.SENDBLUE_API_KEY || !env.SENDBLUE_API_SECRET) {
    console.log("[webhook] skipping — SENDBLUE_API_KEY/SECRET not set in .env.local");
    return;
  }

  const useGlobal = await hasBinary("sendblue");
  const cmd = useGlobal ? "sendblue" : "npx";
  const leading = useGlobal ? [] : ["-y", "@sendblue/cli"];

  let listing;
  try {
    listing = await runCapture(cmd, [...leading, "webhooks", "list"]);
  } catch (err) {
    console.error(`[webhook] couldn't list webhooks (${err.message}). Make sure you've logged in with \`npx @sendblue/cli login\`.`);
    return;
  }
  const current = parseWebhookLines(listing);

  // 1. Remove stale ngrok/tunnel URLs so we don't accumulate zombie hooks.
  for (const wh of current) {
    if (wh.type !== "receive") continue;
    if (wh.url === url) continue;
    if (!STALE_DOMAIN_RE.test(wh.url)) continue;
    try {
      await runCapture(cmd, [...leading, "webhooks", "remove", wh.url, "--type", "receive"]);
      console.log(`[webhook] removed stale ${wh.url}`);
    } catch (err) {
      console.warn(`[webhook] could not remove ${wh.url}: ${err.message}`);
    }
  }

  // 2. Skip if already registered.
  if (current.some((w) => w.url === url && w.type === "receive")) {
    console.log(`[webhook] already registered: ${url}`);
    return;
  }

  // 3. Register new.
  try {
    await runCapture(cmd, [...leading, "webhooks", "add", url, "--type", "receive"]);
    console.log(`[webhook] registered ${url} (type=receive)`);
  } catch (err) {
    console.error(`[webhook] failed to register ${url}: ${err.message}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
