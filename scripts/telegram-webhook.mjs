#!/usr/bin/env node
// Register (or clear) the Telegram webhook for this bot.
// Usage:
//   node scripts/telegram-webhook.mjs <webhookUrl>   — register
//   node scripts/telegram-webhook.mjs --clear         — delete webhook

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

function readEnv() {
  const p = resolve(root, ".env.local");
  if (!existsSync(p)) return {};
  const env = {};
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*?)(?:\s+#.*)?$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = readEnv();
const token = process.env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN not set in .env.local — skipping webhook registration.");
  process.exit(0);
}

const arg = process.argv[2];
const apiBase = `https://api.telegram.org/bot${token}`;

if (arg === "--clear") {
  const res = await fetch(`${apiBase}/deleteWebhook`, { method: "POST" });
  const data = await res.json();
  console.log(data.ok ? "Telegram webhook cleared." : `Failed: ${data.description}`);
  process.exit(data.ok ? 0 : 1);
}

if (!arg || !arg.startsWith("http")) {
  console.error("Usage: node scripts/telegram-webhook.mjs <webhookUrl>");
  process.exit(1);
}

const webhookUrl = arg;
const res = await fetch(`${apiBase}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: webhookUrl,
    allowed_updates: ["message", "edited_message", "callback_query"],
    drop_pending_updates: true,
  }),
});
const data = await res.json();

if (data.ok) {
  console.log(`Telegram webhook registered: ${webhookUrl}`);
} else {
  console.error(`Telegram webhook registration failed: ${data.description}`);
  process.exit(1);
}
