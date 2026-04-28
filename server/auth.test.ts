import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyHmac, requireAdmin } from "./auth.js";
import type { Request, Response, NextFunction } from "express";

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

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    path: "/chat",
    method: "POST",
    headers: {},
    ...overrides,
  } as Request;
}

function mockRes(): { res: Response; status: number; body: unknown } {
  const captured = { status: 200, body: undefined as unknown };
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(payload: unknown) {
      captured.body = payload;
      return this;
    },
  } as unknown as Response;
  return { res, get status() { return captured.status; }, get body() { return captured.body; } } as any;
}

describe("requireAdmin", () => {
  it("lets /health through without a token", async () => {
    const verify = mock.fn(async () => ({ payload: {} }) as any);
    const middleware = requireAdmin({ verifyJwt: verify });
    const req = mockReq({ path: "/health", method: "GET" });
    const { res } = mockRes();
    let nextCalled = false;
    const next: NextFunction = () => {
      nextCalled = true;
    };
    await middleware(req, res, next);
    assert.equal(nextCalled, true);
    assert.equal(verify.mock.callCount(), 0);
  });

  it("lets /sendblue/webhook through without a token", async () => {
    const verify = mock.fn(async () => ({ payload: {} }) as any);
    const middleware = requireAdmin({ verifyJwt: verify });
    const req = mockReq({ path: "/sendblue/webhook", method: "POST" });
    const { res } = mockRes();
    let nextCalled = false;
    await middleware(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
  });

  it("rejects an admin path with no Authorization header", async () => {
    const verify = mock.fn(async () => ({ payload: {} }) as any);
    const middleware = requireAdmin({ verifyJwt: verify });
    const req = mockReq();
    const captured = mockRes();
    let nextCalled = false;
    await middleware(req, captured.res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal((captured as any).status, 401);
  });

  it("rejects an admin path with a malformed Authorization header", async () => {
    const verify = mock.fn(async () => ({ payload: {} }) as any);
    const middleware = requireAdmin({ verifyJwt: verify });
    const req = mockReq({ headers: { authorization: "NotBearer foo" } });
    const captured = mockRes();
    let nextCalled = false;
    await middleware(req, captured.res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal((captured as any).status, 401);
  });

  it("calls next() when the JWT verifies", async () => {
    const verify = mock.fn(async () => ({ payload: { sub: "user_123" } }) as any);
    const middleware = requireAdmin({ verifyJwt: verify });
    const req = mockReq({ headers: { authorization: "Bearer good.jwt.value" } });
    const captured = mockRes();
    let nextCalled = false;
    await middleware(req, captured.res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
    assert.equal(verify.mock.callCount(), 1);
    assert.equal((verify.mock.calls[0]! as any).arguments[0], "good.jwt.value");
  });

  it("rejects when the JWT verifier throws", async () => {
    const verify = mock.fn(async () => {
      throw new Error("expired");
    });
    const middleware = requireAdmin({ verifyJwt: verify });
    const req = mockReq({ headers: { authorization: "Bearer bad.jwt.value" } });
    const captured = mockRes();
    let nextCalled = false;
    await middleware(req, captured.res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal((captured as any).status, 401);
  });
});
