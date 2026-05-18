// Auto-register the Composio webhook subscription + per-Gmail-account
// trigger instances with the current public URL. Invoked from
// `scripts/dev.mjs` once an ngrok tunnel is up. Mirrors the Sendblue
// auto-register flow so the user doesn't have to touch the Composio
// dashboard on every restart.
//
// Usage: tsx scripts/composio-webhook.ts <publicUrl>
import "../server/env-setup.js";
import { ensureProactiveWatcher } from "../server/proactive-email.js";

const publicUrl = process.argv[2];
if (!publicUrl) {
  console.error("usage: tsx scripts/composio-webhook.ts <publicUrl>");
  process.exit(2);
}
if (!process.env.COMPOSIO_API_KEY) {
  console.log("COMPOSIO_API_KEY not set; skipping Composio webhook registration");
  process.exit(0);
}

try {
  await ensureProactiveWatcher(publicUrl);
} catch (err) {
  console.error("failed:", err);
  process.exit(1);
}
