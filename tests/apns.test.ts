// CONVEX_URL must be set before importing apns.ts (transitively pulls in
// server/convex-client.ts, which throws at import time without it). The
// stub URL is never actually used — every test injects its own deps.
process.env.CONVEX_URL = process.env.CONVEX_URL || "http://test.invalid";

import { test, afterEach, beforeEach } from "node:test";
import { strict as assert } from "node:assert";
import { createVerify, generateKeyPairSync } from "node:crypto";

// Dynamic import (with top-level await) runs AFTER the env mutation
// above, even though static imports above don't.
const {
  __resetApnsConfigForTests,
  buildApsPayload,
  getJwt,
  handleBroadcastForApns,
  shutdownApns,
} = await import("../server/apns.js");

function generateEs256Pem(): { privatePem: string; publicPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return {
    privatePem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {
    APNS_TEAM_ID: process.env.APNS_TEAM_ID,
    APNS_KEY_ID: process.env.APNS_KEY_ID,
    APNS_PRIVATE_KEY: process.env.APNS_PRIVATE_KEY,
    APNS_BUNDLE_ID: process.env.APNS_BUNDLE_ID,
  };
  __resetApnsConfigForTests();
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  __resetApnsConfigForTests();
  shutdownApns();
});

test("getJwt produces an ES256 token that verifies against the source key", () => {
  const { privatePem, publicPem } = generateEs256Pem();
  process.env.APNS_TEAM_ID = "TEAM12345";
  process.env.APNS_KEY_ID = "KEY67890";
  process.env.APNS_PRIVATE_KEY = privatePem;

  const token = getJwt();
  const [headerB64, claimsB64, sigB64] = token.split(".");
  assert.ok(headerB64 && claimsB64 && sigB64);

  const header = JSON.parse(Buffer.from(headerB64, "base64").toString("utf8")) as {
    alg: string;
    kid: string;
  };
  assert.equal(header.alg, "ES256");
  assert.equal(header.kid, "KEY67890");

  const claims = JSON.parse(Buffer.from(claimsB64, "base64").toString("utf8")) as {
    iss: string;
    iat: number;
  };
  assert.equal(claims.iss, "TEAM12345");
  assert.ok(typeof claims.iat === "number");

  const sig = Buffer.from(sigB64.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const verifier = createVerify("SHA256");
  verifier.update(`${headerB64}.${claimsB64}`);
  verifier.end();
  const ok = verifier.verify({ key: publicPem, dsaEncoding: "ieee-p1363" }, sig);
  assert.ok(ok, "JWT signature must verify with the source public key");
});

test("getJwt accepts a private key with escaped \\n newlines", () => {
  const { privatePem } = generateEs256Pem();
  process.env.APNS_TEAM_ID = "TEAM";
  process.env.APNS_KEY_ID = "KEY";
  process.env.APNS_PRIVATE_KEY = privatePem.replace(/\n/g, "\\n");

  // Should not throw and should produce a sane JWT.
  const token = getJwt();
  assert.ok(token.split(".").length === 3);
});

test("buildApsPayload caps body at 240 chars and carries threadId for deep-link", () => {
  const longBody = "x".repeat(500);
  const payload = buildApsPayload({
    deviceToken: "abc123",
    environment: "development",
    title: "Boop",
    body: longBody,
    threadId: "thread_xyz",
    conversationId: "ios:device-1:thread_xyz",
  }) as {
    aps: { alert: { title: string; body: string }; "thread-id"?: string };
    threadId?: string;
    conversationId?: string;
  };

  assert.equal(payload.aps.alert.title, "Boop");
  assert.ok(payload.aps.alert.body.length <= 240);
  assert.ok(payload.aps.alert.body.endsWith("…"));
  assert.equal(payload.aps["thread-id"], "thread_xyz");
  assert.equal(payload.threadId, "thread_xyz");
  assert.equal(payload.conversationId, "ios:device-1:thread_xyz");
});

test("handleBroadcastForApns: skips non-pushable events", async () => {
  const result = await handleBroadcastForApns(
    { event: "assistant_delta", data: { conversationId: "ios:d1:t1", text: "hi" }, at: 0 },
    {
      push: async () => { throw new Error("should not be called"); },
      resolveTarget: async () => { throw new Error("should not be called"); },
      clearToken: async () => { throw new Error("should not be called"); },
    },
  );
  assert.equal(result.pushed, false);
  assert.equal(result.reason, "skip:event");
});

test("handleBroadcastForApns: skips broadcasts whose conversationId isn't ios:", async () => {
  const result = await handleBroadcastForApns(
    { event: "assistant_message", data: { conversationId: "sms:+15551234567", content: "hi" }, at: 0 },
    {
      push: async () => { throw new Error("should not be called"); },
      resolveTarget: async () => { throw new Error("should not be called"); },
      clearToken: async () => { throw new Error("should not be called"); },
    },
  );
  assert.equal(result.pushed, false);
  assert.equal(result.reason, "skip:non-ios");
});

test("handleBroadcastForApns: 410 Gone clears the token via injected mutation", async () => {
  let clearedToken: string | null = null;
  const result = await handleBroadcastForApns(
    { event: "assistant_message", data: { conversationId: "ios:device-1:thread-A", content: "Reply!" }, at: 0 },
    {
      push: async () => ({ status: 410, reason: "Unregistered" }),
      resolveTarget: async (deviceId: string) => {
        assert.equal(deviceId, "device-1");
        return {
          apnsDeviceToken: "DEADBEEF",
          apnsEnvironment: "development" as const,
          label: "Test iPhone",
        };
      },
      clearToken: async (token: string) => { clearedToken = token; },
    },
  );
  assert.equal(result.pushed, false);
  assert.equal(result.reason, "cleared:410");
  assert.equal(clearedToken, "DEADBEEF");
});

test("handleBroadcastForApns: 200 OK reports pushed and includes parsed threadId", async () => {
  const pushedArgs: Array<{ deviceToken: string; environment: string; threadId?: string }> = [];
  const result = await handleBroadcastForApns(
    { event: "assistant_message", data: { conversationId: "ios:dev1:thread99", content: "Hi" }, at: 0 },
    {
      push: async (args) => { pushedArgs.push(args); return { status: 200 }; },
      resolveTarget: async () => ({
        apnsDeviceToken: "TOKEN",
        apnsEnvironment: "production" as const,
        label: "Phone",
      }),
      clearToken: async () => { throw new Error("should not be called"); },
    },
  );
  assert.equal(result.pushed, true);
  const sent = pushedArgs[0];
  assert.equal(sent.deviceToken, "TOKEN");
  assert.equal(sent.environment, "production");
  assert.equal(sent.threadId, "thread99");
});

test("handleBroadcastForApns: missing device token short-circuits before push", async () => {
  const result = await handleBroadcastForApns(
    { event: "proactive_notice", data: { conversationId: "ios:dx:tx", summary: "Email arrived" }, at: 0 },
    {
      push: async () => { throw new Error("should not be called"); },
      resolveTarget: async () => null,
      clearToken: async () => {},
    },
  );
  assert.equal(result.pushed, false);
  assert.equal(result.reason, "skip:no-token");
});
