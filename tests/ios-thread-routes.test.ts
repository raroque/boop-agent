import { test } from "node:test";
import { strict as assert } from "node:assert";

/** End-to-end against a running dev server.
 *  Requires `npm run dev:server` to be running on :3456. */

const BASE = "http://localhost:3456";

async function pair(deviceIdSeed: string): Promise<string> {
  const deviceId = `test-${deviceIdSeed}`;
  const code = await fetch(`${BASE}/channels/ios/pair/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId }),
  }).then((r) => r.json());

  await fetch(`${BASE}/channels/ios/pair/consume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: (code as { code: string }).code, label: "test" }),
  });

  const checked = await fetch(`${BASE}/channels/ios/pair/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId }),
  }).then((r) => r.json());

  return (checked as { bearerToken: string }).bearerToken;
}

test("GET /threads returns empty list initially", async () => {
  const bearer = await pair(crypto.randomUUID());
  const res = await fetch(`${BASE}/channels/ios/threads`, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  const body = (await res.json()) as { threads: unknown[] };
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(body.threads));
});

test("POST /threads/create yields a threadId, GET /threads reflects it", async () => {
  const bearer = await pair(crypto.randomUUID());
  const create = await fetch(`${BASE}/channels/ios/threads/create`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}` },
  });
  assert.equal(create.status, 200);
  const { threadId } = (await create.json()) as { threadId: string };
  assert.ok(threadId);

  const list = await fetch(`${BASE}/channels/ios/threads`, {
    headers: { Authorization: `Bearer ${bearer}` },
  }).then((r) => r.json()) as { threads: Array<{ _id: string }> };
  assert.equal(list.threads.length, 1);
  assert.equal(list.threads[0]._id, threadId);
});

test("creating a 5th thread returns 409", async () => {
  const bearer = await pair(crypto.randomUUID());
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`${BASE}/channels/ios/threads/create`, {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}` },
    });
    assert.equal(r.status, 200, `thread ${i + 1} should succeed`);
  }
  const fifth = await fetch(`${BASE}/channels/ios/threads/create`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}` },
  });
  assert.equal(fifth.status, 409);
});

test("POST /inbound without threadId uses the default thread", async () => {
  const bearer = await pair(crypto.randomUUID());
  const res = await fetch(`${BASE}/channels/ios/inbound`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: "hello" }),
  });
  const body = (await res.json()) as { ok: boolean; threadId: string };
  assert.equal(res.status, 200);
  assert.ok(body.threadId);
});
