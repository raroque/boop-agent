// Loads .env.local (priority) then .env (fallback) from the project root.
// Imported for side effects — must run before any module reads process.env.
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

for (const name of [".env.local", ".env"]) {
  const path = resolve(root, name);
  if (existsSync(path)) config({ path });
}

const REQUIRED = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "TELEGRAM_ALLOWED_CHAT_ID",
  "ICU_ATHLETE_ID",
  "ICU_API_KEY",
  "ACTUAL_SERVER_URL",
  "ACTUAL_PASSWORD",
  "ACTUAL_BUDGET_SYNC_ID",
  "ACTUAL_BUDGET_PASSWORD",
] as const;

const CONVEX_URL_KEYS = ["CONVEX_URL", "VITE_CONVEX_URL"] as const;

const missingRequired = REQUIRED.filter((key) => !process.env[key]);
const hasConvexUrl = CONVEX_URL_KEYS.some((key) => !!process.env[key]);

if (missingRequired.length || !hasConvexUrl) {
  const missing = [
    ...missingRequired,
    ...(hasConvexUrl ? [] : ["CONVEX_URL or VITE_CONVEX_URL"]),
  ];
  console.warn(
    `[env-setup] missing env: ${missing.join(", ")} — outbound integrations will fail until set.`,
  );
}

if (!process.env.DRY_RUN) process.env.DRY_RUN = "on";
if (!process.env.USER_TIMEZONE) process.env.USER_TIMEZONE = "Europe/Amsterdam";
