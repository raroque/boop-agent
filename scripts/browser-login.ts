#!/usr/bin/env tsx
// Manually log in to a site once so the agent can reuse the cookies forever.
//
// Usage:
//   npx tsx scripts/browser-login.ts https://mail.google.com
//
// What it does:
//   - Launches Chrome under the shared "boop" profile (env: AGENT_BROWSER_PROFILE).
//   - Navigates to the URL you pass.
//   - You log in by hand. Cookies persist in the profile dir.
//   - Future agent runs that use the "browser" integration share the same login.
//
// Don't use this for login flows the agent should automate — those would call
// agent-browser commands themselves. This is for the one-time "I logged into
// my landlord portal in Chrome" handoff.

import { spawn } from "node:child_process";
import { browserBaseArgs, CHROME_PATH, PROFILE_DIR } from "../server/browser/config.js";

const url = process.argv[2];
if (!url) {
  console.error("Usage: npx tsx scripts/browser-login.ts <url>");
  console.error("Example: npx tsx scripts/browser-login.ts https://mail.google.com");
  process.exit(1);
}

console.log(`[browser-login] profile=${PROFILE_DIR}`);
console.log(`[browser-login] chrome=${CHROME_PATH ?? "(Chrome for Testing fallback)"}`);
console.log(`[browser-login] url=${url}`);
console.log("[browser-login] Log in by hand in the Chrome window that opens.");
console.log("[browser-login] When you're done, run `npx agent-browser close` (or close Chrome).");

// Login script always runs headed — the whole point is for the user to see the
// Chrome window and sign in by hand. Independent from the runtime headed
// toggle, which controls behavior of agent-driven tool calls.
const child = spawn("npx", ["agent-browser", ...browserBaseArgs(), "open", url], {
  stdio: "inherit",
  env: { ...process.env, AGENT_BROWSER_HEADED: "1" },
});

child.on("exit", (code) => process.exit(code ?? 0));
