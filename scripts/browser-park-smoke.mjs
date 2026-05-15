#!/usr/bin/env node
// Phase 4 smoke: park-and-resume mechanics.
//
// Drives the session-manager helpers directly (skipping Telegram dispatch
// and the interaction-agent intercept, which need a human in the loop) to
// verify the core invariants:
//   1. parkSession → in-memory map drops the session, Convex row flips to
//      "parked" with the right metadata, Steel session stays alive.
//   2. resumeSession → fresh Stagehand attaches to the same Steel session
//      via CDP, cookies/URL/tabs survive, in-memory map gets the session
//      back, Convex row flips back to "active".
//   3. After resume, normal tools (navigate, screenshot) work.
//
// Run with:
//   node --import tsx/esm scripts/browser-park-smoke.mjs

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

const {
  startSession,
  navigate,
  parkSession,
  resumeSession,
  typeUserInput,
  closeSession,
  listLiveSessions,
} = await import("../server/browser/session-manager.ts");

const { ConvexHttpClient } = await import("convex/browser");
const { api } = await import("../convex/_generated/api.js");
const convex = new ConvexHttpClient(process.env.CONVEX_URL);

function log(step, data) {
  console.log(`\n— ${step} —`);
  console.log(typeof data === "string" ? data : JSON.stringify(data, null, 2));
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function main() {
  for (const k of ["STEEL_API_KEY", "CONVEX_URL"]) {
    if (!process.env[k]) throw new Error(`${k} not set`);
  }

  // Use the-internet.herokuapp.com/login because it has a real form, so the
  // pending-field-target path can be exercised. We don't actually submit.
  log("starting session", "destination: the-internet.herokuapp.com/login");
  const start = await startSession({
    goal: "phase4-smoke: park-and-resume",
    startUrl: "https://the-internet.herokuapp.com/login",
    conversationId: "phase4-smoke",
  });
  const sessionId = start.id;
  log("session", start);

  try {
    log("park session", { reason: "2fa", question: "what's the code?", pendingFieldTarget: "the username input field" });
    const beforeParkLive = listLiveSessions().some((s) => s.id === sessionId);
    assert(beforeParkLive, "session is in live registry before park");
    await parkSession(sessionId, {
      reason: "2fa",
      question: "phase4-smoke: what's the code?",
      pendingFieldTarget: "the username input field",
    });
    const afterParkLive = listLiveSessions().some((s) => s.id === sessionId);
    assert(!afterParkLive, "session removed from live registry after park");

    const parkedRow = await convex.query(api.browserSessions.get, { sessionId });
    log("parked row", {
      status: parkedRow.status,
      parkedReason: parkedRow.parkedReason,
      parkedQuestion: parkedRow.parkedQuestion,
      pendingFieldTarget: parkedRow.pendingFieldTarget,
      hasParkedAt: typeof parkedRow.parkedAt === "number",
    });
    assert(parkedRow.status === "parked", 'Convex row status === "parked"');
    assert(parkedRow.parkedReason === "2fa", "parkedReason persisted");
    assert(parkedRow.parkedQuestion.includes("what's the code"), "parkedQuestion persisted");
    assert(parkedRow.pendingFieldTarget === "the username input field", "pendingFieldTarget persisted");
    assert(typeof parkedRow.parkedAt === "number", "parkedAt timestamp set");

    log("findParked query", "should return this row (within freshness window)");
    const found = await convex.query(api.browserSessions.findParked, {
      conversationId: "phase4-smoke",
      maxAgeMs: 60_000,
    });
    assert(found && found.sessionId === sessionId, "findParked returns our session");

    log("findParked with tiny maxAgeMs", "should treat row as stale");
    await new Promise((r) => setTimeout(r, 1100)); // age out for the 1s window
    const foundStale = await convex.query(api.browserSessions.findParked, {
      conversationId: "phase4-smoke",
      maxAgeMs: 1000,
    });
    assert(foundStale === null, "stale parked row filtered out by maxAgeMs");

    log("resume session", "fresh Stagehand → same Steel CDP URL");
    const resumed = await resumeSession(sessionId);
    log("resumed", resumed);
    assert(
      resumed.pendingFieldTarget === "the username input field",
      "resumeSession returns pendingFieldTarget so caller knows where to type",
    );
    const afterResumeLive = listLiveSessions().some((s) => s.id === sessionId);
    assert(afterResumeLive, "session back in live registry after resume");

    const activeRow = await convex.query(api.browserSessions.get, { sessionId });
    assert(activeRow.status === "active", 'Convex row status === "active" after resume');
    assert(activeRow.parkedQuestion === undefined, "parkedQuestion cleared on resume");
    assert(activeRow.parkedAt === undefined, "parkedAt cleared on resume");

    log("typing user input into the pending field", "exercises typeUserInput on resumed session");
    await typeUserInput(sessionId, "the username input field", "typed-after-resume");
    log("type ok", "no exceptions thrown");

    log("navigating on resumed session", "verifies CDP still functional");
    const nav = await navigate(sessionId, "https://example.com");
    log("nav result", nav);
    assert(nav.url.startsWith("https://example.com"), "navigation works on resumed session");
  } finally {
    log("closing session", sessionId);
    await closeSession(sessionId, "closed");
  }
  log("done", "✓ park-and-resume cycle works end-to-end");
}

main().catch((err) => {
  console.error("\nSMOKE FAILED:", err);
  process.exit(1);
});
