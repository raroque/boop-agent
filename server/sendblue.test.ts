import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import express from "express";
import type { Server } from "node:http";
import { createSendblueRouter } from "./sendblue.js";

const SIGNING_SECRET = "test-signing-secret";
const FROM_NUMBER = "+15555550100";
const OTHER_NUMBER = "+15555550999";

function sign(body: string): string {
  return createHmac("sha256", SIGNING_SECRET).update(body).digest("hex");
}

let server: Server;
let baseUrl: string;

before(async () => {
  process.env.SENDBLUE_SIGNING_SECRET = SIGNING_SECRET;
  process.env.SENDBLUE_FROM_NUMBER = FROM_NUMBER;

  const app = express();
  app.use("/sendblue", createSendblueRouter());
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  if (typeof addr === "object" && addr) {
    baseUrl = `http://127.0.0.1:${addr.port}`;
  } else {
    throw new Error("server did not bind");
  }
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("sendblue webhook auth", () => {
  it("rejects with 401 on missing signature", async () => {
    const body = JSON.stringify({ content: "hi", from_number: FROM_NUMBER });
    const res = await fetch(`${baseUrl}/sendblue/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    assert.equal(res.status, 401);
  });

  it("rejects with 401 on mismatched signature", async () => {
    const body = JSON.stringify({ content: "hi", from_number: FROM_NUMBER });
    const res = await fetch(`${baseUrl}/sendblue/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sendblue-signature": "deadbeef".repeat(8),
      },
      body,
    });
    assert.equal(res.status, 401);
  });

  it("rejects with 403 on wrong from_number", async () => {
    const body = JSON.stringify({ content: "hi", from_number: OTHER_NUMBER });
    const res = await fetch(`${baseUrl}/sendblue/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sendblue-signature": sign(body),
      },
      body,
    });
    assert.equal(res.status, 403);
  });

  it("accepts an outbound echo with valid sig (skipped)", async () => {
    // is_outbound=true short-circuits to skipped before phone check, so this
    // path verifies a happy-case signature with no Convex side effects.
    const body = JSON.stringify({ is_outbound: true, content: "hi", from_number: FROM_NUMBER });
    const res = await fetch(`${baseUrl}/sendblue/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sendblue-signature": sign(body),
      },
      body,
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as { skipped?: boolean };
    assert.equal(json.skipped, true);
  });
});
