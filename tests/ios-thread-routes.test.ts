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
  const body = (await res.json()) as {
    ok: boolean;
    threadId: string;
    userMessageId: string;
  };
  assert.equal(res.status, 200);
  assert.ok(body.threadId);
  assert.ok(
    typeof body.userMessageId === "string" && body.userMessageId.length > 0,
    "userMessageId should be a non-empty Convex id",
  );
});

test("archive → GET /threads/archived → POST /unarchive round-trips", async () => {
  const bearer = await pair(crypto.randomUUID());

  const created = await fetch(`${BASE}/channels/ios/threads/create`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}` },
  }).then((r) => r.json()) as { threadId: string };

  const archive = await fetch(
    `${BASE}/channels/ios/threads/${created.threadId}/archive`,
    { method: "POST", headers: { Authorization: `Bearer ${bearer}` } },
  );
  assert.equal(archive.status, 200);

  const archivedList = await fetch(`${BASE}/channels/ios/threads/archived`, {
    headers: { Authorization: `Bearer ${bearer}` },
  }).then((r) => r.json()) as { threads: Array<{ _id: string }> };
  assert.ok(archivedList.threads.some((t) => t._id === created.threadId));

  // After archive the open list should not include it.
  const openList = await fetch(`${BASE}/channels/ios/threads`, {
    headers: { Authorization: `Bearer ${bearer}` },
  }).then((r) => r.json()) as { threads: Array<{ _id: string }> };
  assert.ok(!openList.threads.some((t) => t._id === created.threadId));

  const restore = await fetch(
    `${BASE}/channels/ios/threads/${created.threadId}/unarchive`,
    { method: "POST", headers: { Authorization: `Bearer ${bearer}` } },
  );
  assert.equal(restore.status, 200);

  const afterRestore = await fetch(`${BASE}/channels/ios/threads`, {
    headers: { Authorization: `Bearer ${bearer}` },
  }).then((r) => r.json()) as { threads: Array<{ _id: string }> };
  assert.ok(afterRestore.threads.some((t) => t._id === created.threadId));
});

test("unarchive returns 409 when 4 threads are already open", async () => {
  const bearer = await pair(crypto.randomUUID());

  // Create one extra thread, archive it, then fill the open slots.
  const extra = await fetch(`${BASE}/channels/ios/threads/create`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}` },
  }).then((r) => r.json()) as { threadId: string };

  const archive = await fetch(
    `${BASE}/channels/ios/threads/${extra.threadId}/archive`,
    { method: "POST", headers: { Authorization: `Bearer ${bearer}` } },
  );
  assert.equal(archive.status, 200);

  for (let i = 0; i < 4; i++) {
    const r = await fetch(`${BASE}/channels/ios/threads/create`, {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}` },
    });
    assert.equal(r.status, 200, `fill thread ${i + 1} should succeed`);
  }

  const restore = await fetch(
    `${BASE}/channels/ios/threads/${extra.threadId}/unarchive`,
    { method: "POST", headers: { Authorization: `Bearer ${bearer}` } },
  );
  assert.equal(restore.status, 409);
});

test("DELETE /threads/:id removes the thread from archived + open lists", async () => {
  const bearer = await pair(crypto.randomUUID());

  const created = await fetch(`${BASE}/channels/ios/threads/create`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}` },
  }).then((r) => r.json()) as { threadId: string };

  const archive = await fetch(
    `${BASE}/channels/ios/threads/${created.threadId}/archive`,
    { method: "POST", headers: { Authorization: `Bearer ${bearer}` } },
  );
  assert.equal(archive.status, 200);

  const del = await fetch(
    `${BASE}/channels/ios/threads/${created.threadId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${bearer}` } },
  );
  assert.equal(del.status, 200);

  const archivedList = await fetch(`${BASE}/channels/ios/threads/archived`, {
    headers: { Authorization: `Bearer ${bearer}` },
  }).then((r) => r.json()) as { threads: Array<{ _id: string }> };
  assert.ok(
    !archivedList.threads.some((t) => t._id === created.threadId),
    "deleted thread should be gone from archived list",
  );

  // Idempotent: deleting again still returns 200.
  const delAgain = await fetch(
    `${BASE}/channels/ios/threads/${created.threadId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${bearer}` } },
  );
  assert.equal(delAgain.status, 200);
});

test("DELETE /threads/:id returns 403 when targeting another device's thread", async () => {
  const alice = await pair(crypto.randomUUID());
  const bob = await pair(crypto.randomUUID());

  const aliceThread = await fetch(`${BASE}/channels/ios/threads/create`, {
    method: "POST",
    headers: { Authorization: `Bearer ${alice}` },
  }).then((r) => r.json()) as { threadId: string };

  const forbidden = await fetch(
    `${BASE}/channels/ios/threads/${aliceThread.threadId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${bob}` } },
  );
  assert.equal(forbidden.status, 403);

  // Alice's thread should still be present.
  const aliceList = await fetch(`${BASE}/channels/ios/threads`, {
    headers: { Authorization: `Bearer ${alice}` },
  }).then((r) => r.json()) as { threads: Array<{ _id: string }> };
  assert.ok(aliceList.threads.some((t) => t._id === aliceThread.threadId));
});

test("GET /fanout streams thread_activity for assistant_message broadcasts", async () => {
  const bearer = await pair(crypto.randomUUID());

  const created = await fetch(`${BASE}/channels/ios/threads/create`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}` },
  }).then((r) => r.json()) as { threadId: string };

  // Open the fanout stream first, then dispatch.
  const controller = new AbortController();
  const fanoutPromise = fetch(`${BASE}/channels/ios/fanout`, {
    headers: { Authorization: `Bearer ${bearer}`, Accept: "text/event-stream" },
    signal: controller.signal,
  });

  // Give the SSE subscription a moment to register before broadcasting.
  await new Promise((r) => setTimeout(r, 250));

  await fetch(`${BASE}/channels/ios/inbound`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: "hello fanout", threadId: created.threadId }),
  });

  const fanoutRes = await fanoutPromise;
  assert.equal(fanoutRes.status, 200);

  // Read up to ~6s of SSE bytes, looking for our event.
  const reader = fanoutRes.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawActivity = false;
  const deadline = Date.now() + 6_000;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value);
    if (buffer.includes("event: thread_activity") && buffer.includes(created.threadId)) {
      sawActivity = true;
      break;
    }
  }
  controller.abort();
  assert.ok(sawActivity, "expected thread_activity event for the test thread");
});
