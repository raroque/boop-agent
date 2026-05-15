#!/usr/bin/env node
// End-to-end smoke for Phase 3: credential vault → browser session → fill
// login form → submit.
//
// Uses the-internet.herokuapp.com/login, a public Selenium/Playwright
// tutorial site by Dave Haeffner. The credentials `tomsmith` /
// `SuperSecretPassword!` are PUBLIC TEST CREDENTIALS documented in their
// repo (https://github.com/saucelabs/the-internet) — committing them is
// intentional and safe. Pre-commit secret scans should ignore this file.
//
// Run with:
//   node --import tsx/esm scripts/browser-login-smoke.mjs
//
// Requires STEEL_API_KEY, ANTHROPIC_API_KEY (or OPENAI/Gemini key),
// BROWSER_CREDENTIAL_KEY, and CONVEX_URL in .env.local.

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const envLocal = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocal)) {
  for (const line of fs.readFileSync(envLocal, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  }
}

const { startSession, navigate, act, extract, fillCredential, closeSession } =
  await import("../server/browser/session-manager.ts");
const { saveCredential, deleteCredential, listCredentials } =
  await import("../server/browser/credentials.ts");

const TEST_LABEL = `phase3-smoke-${Date.now()}`;

function log(step, data) {
  console.log(`\n— ${step} —`);
  console.log(typeof data === "string" ? data : JSON.stringify(data, null, 2));
}

async function cleanupExistingTestRows() {
  const all = await listCredentials();
  const stale = all.filter((r) => r.label.startsWith("phase3-smoke-"));
  for (const row of stale) {
    await deleteCredential(row._id);
    console.log(`  cleaned up stale credential: ${row.label}`);
  }
}

async function main() {
  for (const k of ["STEEL_API_KEY", "BROWSER_CREDENTIAL_KEY", "CONVEX_URL"]) {
    if (!process.env[k]) throw new Error(`${k} not set`);
  }

  await cleanupExistingTestRows();

  log("saving test credential", { label: TEST_LABEL, host: "the-internet.herokuapp.com" });
  await saveCredential({
    label: TEST_LABEL,
    host: "the-internet.herokuapp.com",
    username: "tomsmith",
    password: "SuperSecretPassword!",
    notes: "phase 3 smoke test — public test creds, safe to commit",
  });

  let sessionId;
  try {
    log("starting browser session", "navigating to /login");
    const start = await startSession({
      goal: "phase3-smoke: log in to the-internet.herokuapp.com",
      startUrl: "https://the-internet.herokuapp.com/login",
    });
    sessionId = start.id;
    log("session", start);

    log("filling credential", "username + password — secret never enters LLM context");
    const fillResult = await fillCredential(sessionId, TEST_LABEL);
    log("fill result", fillResult);

    log("clicking login button", "via browser_act");
    const actResult = await act(sessionId, "click the Login button");
    log("act result", actResult);

    // Wait briefly for the post-submit page to render.
    await new Promise((r) => setTimeout(r, 1500));

    log("verifying login succeeded", "extract the flash message");
    const verify = await extract(
      sessionId,
      "the success/flash message at the top of the page",
      { message: "string", isLoggedIn: "boolean" },
    );
    log("verify result", verify);

    const ok = String(verify.message ?? "").toLowerCase().includes("logged into a secure area");
    if (!ok) {
      throw new Error(
        `Login verification failed. Expected "logged into a secure area" in flash message, got: ${JSON.stringify(verify)}`,
      );
    }
    log("done", "✓ logged in successfully — password never touched LLM context");
  } finally {
    if (sessionId) {
      log("closing session", sessionId);
      await closeSession(sessionId, "closed");
    }
    log("deleting test credential", TEST_LABEL);
    const rows = await listCredentials();
    const ours = rows.find((r) => r.label === TEST_LABEL);
    if (ours) await deleteCredential(ours._id);
  }
}

main().catch((err) => {
  console.error("\nSMOKE FAILED:", err);
  process.exit(1);
});
