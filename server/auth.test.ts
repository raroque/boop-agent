import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyHmac } from "./auth.js";

const SECRET = "test-secret-abc-123";

function sign(body: string, secret: string = SECRET): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

describe("verifyHmac", () => {
  it("accepts a valid signature", () => {
    const body = '{"hello":"world"}';
    const sig = sign(body);
    assert.equal(verifyHmac(body, sig, SECRET), true);
  });

  it("rejects a wrong signature", () => {
    const body = '{"hello":"world"}';
    assert.equal(verifyHmac(body, "deadbeef".repeat(8), SECRET), false);
  });

  it("rejects when signature is missing", () => {
    const body = '{"hello":"world"}';
    assert.equal(verifyHmac(body, undefined, SECRET), false);
    assert.equal(verifyHmac(body, "", SECRET), false);
  });

  it("rejects when secret is empty", () => {
    const body = '{"hello":"world"}';
    const sig = sign(body, "");
    assert.equal(verifyHmac(body, sig, ""), false);
  });

  it("rejects on length mismatch (timing-safe)", () => {
    const body = '{"hello":"world"}';
    const sig = sign(body);
    assert.equal(verifyHmac(body, sig.slice(0, -2), SECRET), false);
  });
});
