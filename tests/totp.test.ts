import { test } from "node:test";
import { strict as assert } from "node:assert";
import { generateTotp } from "../server/browser/totp.js";

// RFC 6238 Appendix B test vectors. The secret is the ASCII string
// "12345678901234567890" — base32 encoded below. Vectors are for SHA-1,
// 30s step, 8-digit codes. Tightest possible guarantee that our impl
// matches the spec; covers byte-order, dynamic truncation, and the
// big-endian counter encoding.
const RFC_SECRET_B32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

test("totp matches RFC 6238 vector at t=59s", () => {
  assert.equal(
    generateTotp(RFC_SECRET_B32, { digits: 8, timestampMs: 59 * 1000 }),
    "94287082",
  );
});

test("totp matches RFC 6238 vector at t=1111111109s", () => {
  assert.equal(
    generateTotp(RFC_SECRET_B32, { digits: 8, timestampMs: 1111111109 * 1000 }),
    "07081804",
  );
});

test("totp matches RFC 6238 vector at t=1234567890s", () => {
  assert.equal(
    generateTotp(RFC_SECRET_B32, { digits: 8, timestampMs: 1234567890 * 1000 }),
    "89005924",
  );
});

test("totp matches RFC 6238 vector at t=2000000000s", () => {
  assert.equal(
    generateTotp(RFC_SECRET_B32, { digits: 8, timestampMs: 2000000000 * 1000 }),
    "69279037",
  );
});

test("6-digit default produces zero-padded fixed-width output", () => {
  // At certain timestamps the dynamic-truncated code mod 1_000_000 has
  // leading zeros — the formatter must pad. Picking t=0 deterministically
  // exercises this for the canonical "JBSWY3DPEHPK3PXP" demo secret.
  const code = generateTotp("JBSWY3DPEHPK3PXP", { timestampMs: 0 });
  assert.equal(code.length, 6);
  assert.match(code, /^\d{6}$/);
});

test("rejects invalid base32 characters with a clear error", () => {
  assert.throws(
    () => generateTotp("INVALID-CHARS-IN-SECRET", { timestampMs: 0 }),
    /Invalid base32 character/i,
  );
});

test("two calls inside the same 30s window return the same code", () => {
  // Align to a step boundary so t and t+29_999 are guaranteed to be in
  // the same counter window. An arbitrary t can land near the end of a
  // window — t+29_999 then crosses the boundary and the test flakes.
  const stepMs = 30_000;
  const aligned = Math.floor(1_700_000_000_000 / stepMs) * stepMs;
  const a = generateTotp(RFC_SECRET_B32, { timestampMs: aligned });
  const b = generateTotp(RFC_SECRET_B32, { timestampMs: aligned + 29_999 });
  assert.equal(a, b);
});

test("crossing the 30s boundary changes the code", () => {
  // Pick a timestamp aligned to a 30s step boundary so the next ms
  // increments the counter.
  const stepMs = 30_000;
  const aligned = Math.floor(1_700_000_000_000 / stepMs) * stepMs;
  const a = generateTotp(RFC_SECRET_B32, { timestampMs: aligned });
  const b = generateTotp(RFC_SECRET_B32, { timestampMs: aligned + stepMs });
  assert.notEqual(a, b);
});
