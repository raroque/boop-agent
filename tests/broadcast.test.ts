import { test } from "node:test";
import { strict as assert } from "node:assert";
import { broadcast, subscribe, type BroadcastMessage } from "../server/broadcast.js";

test("subscribe receives broadcast events", () => {
  const received: BroadcastMessage[] = [];
  const unsubscribe = subscribe((msg) => received.push(msg));

  broadcast("test_event", { foo: "bar" });
  broadcast("other_event", { n: 1 });

  assert.equal(received.length, 2);
  assert.equal(received[0].event, "test_event");
  assert.deepEqual(received[0].data, { foo: "bar" });
  assert.equal(received[1].event, "other_event");
  assert.ok(typeof received[0].at === "number");

  unsubscribe();
});

test("unsubscribe stops receiving events", () => {
  const received: BroadcastMessage[] = [];
  const unsubscribe = subscribe((msg) => received.push(msg));

  broadcast("before", {});
  unsubscribe();
  broadcast("after", {});

  assert.equal(received.length, 1);
  assert.equal(received[0].event, "before");
});

test("multiple subscribers each receive every event", () => {
  const a: string[] = [];
  const b: string[] = [];
  const ua = subscribe((m) => a.push(m.event));
  const ub = subscribe((m) => b.push(m.event));

  broadcast("e1", {});
  broadcast("e2", {});

  assert.deepEqual(a, ["e1", "e2"]);
  assert.deepEqual(b, ["e1", "e2"]);

  ua();
  ub();
});
