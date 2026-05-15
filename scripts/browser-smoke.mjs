#!/usr/bin/env node
// End-to-end smoke for the Steel + Stagehand browser integration.
// Exercises start/navigate/extract/observe/screenshot/close against a
// site that doesn't require login. Run with:
//   node --import tsx/esm scripts/browser-smoke.mjs
// Requires STEEL_API_KEY, ANTHROPIC_API_KEY (or OPENAI_API_KEY /
// GEMINI_API_KEY), and CONVEX_URL in .env.local.

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

// Same precedence the server uses: .env then .env.local (overrides).
// Must run BEFORE importing session-manager (which reads env at import time).
const envLocal = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocal)) {
  for (const line of fs.readFileSync(envLocal, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  }
}

// Dynamic import so the env loader above runs first.
const {
  startSession,
  navigate,
  extract,
  observe,
  screenshot,
  status,
  closeSession,
} = await import("../server/browser/session-manager.ts");

function log(step, data) {
  console.log(`\n— ${step} —`);
  console.log(typeof data === "string" ? data : JSON.stringify(data, null, 2));
}

async function main() {
  if (!process.env.STEEL_API_KEY) throw new Error("STEEL_API_KEY not set");
  if (!process.env.CONVEX_URL) throw new Error("CONVEX_URL not set");

  log("starting session", "goal: smoke test against example.com + news.ycombinator.com");
  const start = await startSession({
    goal: "browser-smoke: verify Steel + Stagehand end-to-end",
    startUrl: "https://example.com",
  });
  log("started", start);

  try {
    log("status", await status(start.id));

    log("extract from example.com", await extract(
      start.id,
      "the page's main heading and the link text",
      { heading: "string", linkText: "string" },
    ));

    log("navigate to news.ycombinator.com", await navigate(
      start.id,
      "https://news.ycombinator.com",
    ));

    log("observe what's on the page", (await observe(
      start.id,
      "the top 3 ways a user could interact with this page",
    )).slice(0, 3));

    log("extract top 3 story titles", await extract(
      start.id,
      "the titles of the top 3 stories on the page",
      { titles: "string[]" },
    ));

    const shot = await screenshot(start.id, { fullPage: false });
    log("screenshot", {
      bytes: shot.buffer.byteLength,
      mime: shot.mimeType,
      url: shot.url,
      title: shot.title,
    });
  } finally {
    log("closing session", start.id);
    await closeSession(start.id, "closed");
  }
  log("done", "✓ all steps completed");
}

main().catch((err) => {
  console.error("\nSMOKE FAILED:", err);
  process.exit(1);
});
