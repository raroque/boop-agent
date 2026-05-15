import { test } from "node:test";
import { strict as assert } from "node:assert";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

/**
 * These tests assume `npx convex dev --once` has been run so the
 * convex/threads functions are deployed. They run against the deployment
 * URL in .env.local, so they create + clean real rows. We tag deviceId
 * with a fresh UUID per run so we don't collide with prod data.
 */

function client() {
  const url = process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL;
  if (!url) throw new Error("CONVEX_URL not set");
  return new ConvexHttpClient(url);
}

test("ensureDefault creates a thread on first call, reuses on second", async () => {
  const c = client();
  const deviceId = `test-${crypto.randomUUID()}`;
  const a = await c.mutation(api.threads.ensureDefault, { deviceId });
  const b = await c.mutation(api.threads.ensureDefault, { deviceId });
  assert.equal(a.threadId, b.threadId);
});

test("listOpen returns threads ordered, max 4 open enforced", async () => {
  const c = client();
  const deviceId = `test-${crypto.randomUUID()}`;
  for (let i = 0; i < 4; i++) {
    await c.mutation(api.threads.createThread, { deviceId });
  }
  const open = await c.query(api.threads.listOpen, { deviceId });
  assert.equal(open.length, 4);
  await assert.rejects(
    c.mutation(api.threads.createThread, { deviceId }),
    /no more than 4 open/i,
  );
});

test("setIcon updates a thread", async () => {
  const c = client();
  const deviceId = `test-${crypto.randomUUID()}`;
  const { threadId } = await c.mutation(api.threads.createThread, { deviceId });
  await c.mutation(api.threads.setIcon, { threadId, icon: "calendar" });
  const open = await c.query(api.threads.listOpen, { deviceId });
  assert.equal(open[0].icon, "calendar");
});

test("archive hides thread from listOpen", async () => {
  const c = client();
  const deviceId = `test-${crypto.randomUUID()}`;
  const { threadId } = await c.mutation(api.threads.createThread, { deviceId });
  await c.mutation(api.threads.archive, { threadId });
  const open = await c.query(api.threads.listOpen, { deviceId });
  assert.equal(open.length, 0);
});
