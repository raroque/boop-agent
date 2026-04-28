# Auto-Deploy + Auth PR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the auto-deploy PR designed in `docs/superpowers/specs/2026-04-27-auto-deploy-pr-design.md`: ship Docker + Fly deployment for boop-agent coupled with single-user Convex Auth and Sendblue HMAC verification.

**Architecture:** Two perimeters — (A) iMessage path uses HMAC + phone whitelist on the Sendblue webhook, (B) human path uses Convex Auth password provider issuing one JWT that gates both Express admin endpoints and direct Convex calls. Each Convex function becomes either `internal*` (server-only) or stays public with an explicit `ctx.auth.getUserIdentity()` check. The deploy itself is a single Fly machine running a multi-stage Debian Docker image with `min_machines_running = 1` (in-process loops require single-replica).

**Tech Stack:** Node 22, Express 5, Convex, `@convex-dev/auth` (password provider), `jose` (JWT verification), `node:test` + `tsx --test` (test runner — zero new test framework deps), Docker (`node:22-slim`), Fly.io, GitHub Actions.

**Source of truth:** Always read `docs/superpowers/specs/2026-04-27-auto-deploy-pr-design.md` if any task description seems ambiguous. The spec wins.

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `server/auth.ts` | JWT verification middleware + HMAC verify helper |
| `server/auth.test.ts` | Unit tests for `verifyHmac` and `requireAdmin` |
| `server/sendblue.test.ts` | Unit tests for HMAC + phone whitelist |
| `convex/auth.config.ts` | Convex Auth provider list (password) |
| `convex/auth.ts` | Re-exports from `@convex-dev/auth/server` |
| `convex/users.ts` | `users` table touch points: `bootstrap`, `setPassword` actions |
| `debug/src/auth.tsx` | Login form (single password field) |
| `debug/src/api-client.ts` | Authed `fetch` wrapper |
| `Dockerfile` | Multi-stage build (deps → build → runtime) |
| `.dockerignore` | Build context excludes |
| `fly.toml` | Fly app config (single machine, always-on) |
| `.github/workflows/deploy.yml` | Test → Convex deploy → bootstrap → Fly deploy → smoke |
| `scripts/deploy.ts` | Interactive deploy setup mirroring `scripts/setup.ts` |
| `docs/deploying.md` | Operator-facing deploy walkthrough |

### Modified files

| Path | Why |
|---|---|
| `package.json` | Add `jose`; add `npm test` script; add `npm run deploy` script |
| `convex/schema.ts` | Add `users` table |
| `convex/agents.ts` | Classify each function (internal vs public+auth) |
| `convex/automations.ts` | Classify each function |
| `convex/consolidation.ts` | Classify each function |
| `convex/conversations.ts` | Add `ctx.auth.getUserIdentity()` checks |
| `convex/dashboard.ts` | Add `ctx.auth.getUserIdentity()` check |
| `convex/drafts.ts` | Classify each function |
| `convex/memoryEvents.ts` | Classify each function |
| `convex/memoryRecords.ts` | Classify each function |
| `convex/messages.ts` | Classify each function |
| `convex/sendblueDedup.ts` | Convert `claim` to `internalMutation` |
| `convex/usageRecords.ts` | Classify each function |
| `server/index.ts` | Register `requireAdmin` middleware globally; auth WS upgrade; serve built debug UI |
| `server/sendblue.ts` | Wire HMAC + phone whitelist at top of webhook handler |
| `server/composio-routes.ts` | Whatever is needed if Convex calls move from `api.x` → `internal.x` (likely none — composio-routes calls Express helpers, not Convex directly) |
| Many server `.ts` files calling Convex | Switch `api.x.y` → `internal.x.y` for now-internal functions |
| `debug/src/main.tsx` | Wrap `<App />` in `<ConvexAuthProvider>` |
| `debug/src/App.tsx` | Render `<LoginForm />` when not authed |
| `debug/src/components/ConsolidationPanel.tsx` | Use `apiClient` instead of bare `fetch` |
| `debug/src/components/ComposioSection.tsx` | Use `apiClient` instead of bare `fetch` |
| `debug/package.json` | Add `@convex-dev/auth` |
| `.env.example` | Add `SENDBLUE_SIGNING_SECRET`, `BOOP_ADMIN_PASSWORD`, `CLAUDE_CODE_OAUTH_TOKEN` |
| `README.md` | Add link to `docs/deploying.md` |

---

## Conventions

- **Commit cadence:** Every task ends with a commit. The commit message uses the Conventional Commits style already used in the repo (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`).
- **Type safety:** After every task, run `npx tsc --noEmit` and ensure it passes before committing.
- **Test runner:** Use `node:test` (built-in). Run with `npx tsx --test '<glob>'`. Globs are quoted because the shell would expand them otherwise.
- **TDD:** When the task adds a pure function or middleware, write the failing test first, run it to verify it fails, then implement.
- **No new top-level features.** Only what the spec lists. If a task seems to grow scope, stop and ask.
- **Production runtime uses `tsx`.** Boop already uses `tsx server/index.ts` via `npm start`. The Docker image runs the same way — no compile step. `tsx` moves from `devDependencies` to `dependencies`.

---

## Task 1: Add `jose` dependency, `tsx` to dependencies, and `npm test` script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the dependencies and the test script**

Edit `package.json`:

- Move `tsx` out of `devDependencies` and into `dependencies` (the production Docker image needs it at runtime).
- Add `"jose": "^5.9.0"` to `dependencies`.
- Add a `test` script and a `deploy` script:

```json
"scripts": {
  "setup": "tsx scripts/setup.ts",
  "deploy": "tsx scripts/deploy.ts",
  "test": "tsx --test 'server/**/*.test.ts' 'convex/**/*.test.ts'",
  "...": "(everything else unchanged)"
}
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: install succeeds, `package-lock.json` updates with `jose` and the move of `tsx`.

- [ ] **Step 3: Verify the test script runs (with no tests yet)**

Run: `npm test`
Expected: exit code 0 with `# tests 0` (no test files match the glob yet, that's fine).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add jose, promote tsx to runtime dep, add test script"
```

---

## Task 2: Write `server/auth.ts` HMAC helper (TDD)

**Files:**
- Create: `server/auth.ts`
- Create: `server/auth.test.ts`

The file `server/auth.ts` will eventually export both `verifyHmac` and `requireAdmin`. We'll start with `verifyHmac` since it's a pure function and easy to TDD.

- [ ] **Step 1: Write the failing test**

Create `server/auth.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyHmac } from "./auth.ts";

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: failure — `Cannot find module './auth.ts'` or similar (file doesn't exist yet).

- [ ] **Step 3: Implement `verifyHmac` minimally**

Create `server/auth.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyHmac(
  body: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — all 5 `verifyHmac` cases pass.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add server/auth.ts server/auth.test.ts
git commit -m "feat(auth): add verifyHmac helper with timing-safe comparison"
```

---

## Task 3: Add `requireAdmin` JWT middleware to `server/auth.ts` (TDD)

**Files:**
- Modify: `server/auth.ts`
- Modify: `server/auth.test.ts`

`requireAdmin` is Express middleware that:
- Lets the public allowlist through unconditionally (`/health`, `/sendblue/webhook`).
- For everything else, reads `Authorization: Bearer <jwt>`, verifies it against Convex's JWKS endpoint via the `jose` library, and lets the request through if valid. Otherwise returns 401.

Convex Auth issues JWTs. Convex exposes a JWKS endpoint at `${CONVEX_URL}/.well-known/jwks.json` (Convex Auth ships this for you). We use `jose`'s `createRemoteJWKSet` + `jwtVerify`.

- [ ] **Step 1: Add the failing tests**

Append to `server/auth.test.ts`:

```ts
import { describe, it, mock, beforeEach } from "node:test";
import { requireAdmin } from "./auth.ts";
import type { Request, Response, NextFunction } from "express";

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
    assert.equal(verify.mock.calls[0]!.arguments[0], "good.jwt.value");
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: failure — `requireAdmin is not a function` or similar.

- [ ] **Step 3: Implement `requireAdmin`**

Append to `server/auth.ts`:

```ts
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const PUBLIC_ALLOWLIST: Array<{ method?: string; pathPrefix: string }> = [
  { method: "GET", pathPrefix: "/health" },
  { method: "POST", pathPrefix: "/sendblue/webhook" },
];

function isPublic(req: Request): boolean {
  return PUBLIC_ALLOWLIST.some(
    (rule) =>
      (!rule.method || rule.method === req.method) &&
      req.path.startsWith(rule.pathPrefix),
  );
}

export type VerifyJwt = (token: string) => Promise<{ payload: JWTPayload }>;

export interface RequireAdminOptions {
  verifyJwt?: VerifyJwt;
}

function defaultVerifier(): VerifyJwt {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) {
    throw new Error(
      "CONVEX_URL not set — Express auth middleware requires it to fetch the Convex JWKS",
    );
  }
  const jwks = createRemoteJWKSet(new URL("/.well-known/jwks.json", convexUrl));
  return async (token) => jwtVerify(token, jwks, { issuer: convexUrl });
}

export function requireAdmin(opts: RequireAdminOptions = {}): RequestHandler {
  const verify = opts.verifyJwt ?? defaultVerifier();
  return async (req: Request, res: Response, next: NextFunction) => {
    if (isPublic(req)) {
      next();
      return;
    }
    const header = req.headers.authorization;
    if (!header || typeof header !== "string" || !header.startsWith("Bearer ")) {
      res.status(401).json({ error: "missing or malformed Authorization header" });
      return;
    }
    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      res.status(401).json({ error: "empty bearer token" });
      return;
    }
    try {
      await verify(token);
      next();
    } catch (err) {
      res.status(401).json({ error: "invalid token" });
    }
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all 11 tests across `verifyHmac` and `requireAdmin` pass.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add server/auth.ts server/auth.test.ts
git commit -m "feat(auth): add requireAdmin JWT middleware with public allowlist"
```

---

## Task 4: Wire HMAC + phone whitelist into `server/sendblue.ts` (TDD)

**Files:**
- Modify: `server/sendblue.ts`
- Create: `server/sendblue.test.ts`

The Sendblue webhook needs to:
1. Capture the raw body (Express's `express.json` already gave us the parsed object, but we need the raw bytes for HMAC). Use a body-parser verify hook to stash the raw buffer on the request.
2. HMAC-verify the raw body against `X-Sendblue-Signature` using `SENDBLUE_SIGNING_SECRET`. Reject with 401 on mismatch.
3. After parsing, reject with 403 if `from_number !== SENDBLUE_FROM_NUMBER`.

**Important:** Express's global `express.json()` parser is configured at the top of `server/index.ts`. We want a per-route raw-body capture so the global JSON parsing still works for everything else. Pass a `verify` function on a route-scoped JSON middleware.

- [ ] **Step 1: Refactor the webhook to be testable**

Edit `server/sendblue.ts`. Replace the `router.post("/webhook", ...)` block so we can extract the auth check as a separate, callable handler. Insert at the top of the existing webhook handler — before the `req.body` destructure:

```ts
import { verifyHmac } from "./auth.js";
// ... (existing imports)

export function createSendblueRouter(): express.Router {
  const router = express.Router();

  // Capture the raw body for HMAC verification. Stored as a Buffer on the
  // request via the `verify` hook on a route-scoped JSON parser. We must
  // NOT use the globally-installed express.json() parser — we need the raw
  // bytes BEFORE JSON parsing happens.
  const jsonWithRaw = express.json({
    limit: "2mb",
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  });

  router.post("/webhook", jsonWithRaw, async (req, res) => {
    const signingSecret = process.env.SENDBLUE_SIGNING_SECRET;
    const expectedFrom = process.env.SENDBLUE_FROM_NUMBER;

    // Perimeter A check 1: HMAC signature.
    if (signingSecret) {
      const sig = req.header("x-sendblue-signature") ?? undefined;
      const raw = (req as any).rawBody as Buffer | undefined;
      const ok = raw && verifyHmac(raw.toString("utf8"), sig, signingSecret);
      if (!ok) {
        res.status(401).json({ error: "invalid signature" });
        return;
      }
    } else {
      console.warn(
        "[sendblue] SENDBLUE_SIGNING_SECRET not set — webhook accepts unsigned requests. " +
          "Required for any non-localhost deployment.",
      );
    }

    const { content, from_number, is_outbound, message_handle } = req.body ?? {};
    if (is_outbound || !content || !from_number) {
      res.json({ ok: true, skipped: true });
      return;
    }

    // Perimeter A check 2: phone whitelist.
    if (expectedFrom && from_number !== expectedFrom) {
      res.status(403).json({ error: "phone not allowed" });
      return;
    }

    // (rest of the existing handler is unchanged from here down)
    if (message_handle) {
      // ... existing dedup + processing logic stays as-is
    }
    // ... etc
  });

  return router;
}
```

The replacement must keep all existing logic that follows the dedup check — only the top of the handler changes. Read the existing `server/sendblue.ts` to preserve every behavior below the new checks.

Note: there's an existing globally-installed `express.json({ limit: "2mb" })` in `server/index.ts`. The route-scoped `jsonWithRaw` runs before the global parser sees this route, so the raw bytes are captured first. Express's matchers run middleware in registration order; route handlers' route-scoped middleware always runs in addition to global ones, but since both parse the same body once parsed, only the first one wins. To be safe in the test, the raw-body grab should happen on a route-mounted parser as written above.

- [ ] **Step 2: Write the failing tests**

Create `server/sendblue.test.ts`:

```ts
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import express from "express";
import type { Server } from "node:http";
import { createSendblueRouter } from "./sendblue.ts";

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
```

- [ ] **Step 3: Run tests to verify they fail or pass as expected**

Run: `npm test`
Expected: all 4 cases pass (the implementation in step 1 already covers them). If a case fails, fix the implementation; do not skip the failing test.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add server/sendblue.ts server/sendblue.test.ts
git commit -m "feat(sendblue): verify HMAC signature and phone whitelist on inbound webhook"
```

---

## Task 5: Add `convex/auth.config.ts` and `convex/auth.ts`, install `@convex-dev/auth`

**Files:**
- Modify: `package.json`
- Create: `convex/auth.config.ts`
- Create: `convex/auth.ts`
- Modify: `convex/schema.ts`

We add the Convex Auth library (which manages the `users` and `authAccounts` tables) at the schema level so subsequent tasks can reference it.

- [ ] **Step 1: Install `@convex-dev/auth` and `@auth/core` (peer)**

Run: `npm install @convex-dev/auth @auth/core`
Expected: install succeeds. `@auth/core` is the peer dep used by Convex Auth's password provider.

- [ ] **Step 2: Create `convex/auth.config.ts`**

```ts
// Convex Auth provider config — single password provider, single user.
// See https://labs.convex.dev/auth for full docs.
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
```

- [ ] **Step 3: Create `convex/auth.ts`**

```ts
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
});
```

- [ ] **Step 4: Update `convex/schema.ts`**

Add the auth tables. Replace the top of `convex/schema.ts`:

```ts
import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,

  // ... (everything else unchanged)
});
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json convex/auth.config.ts convex/auth.ts convex/schema.ts
git commit -m "feat(convex): add Convex Auth password provider"
```

---

## Task 6: Add `convex/users.ts` with `bootstrap` and `setPassword` actions

**Files:**
- Create: `convex/users.ts`

Two `internalAction`s:

- `bootstrap` — checks if any user exists; if not, creates one using `BOOP_ADMIN_PASSWORD` from Convex env. Idempotent.
- `setPassword` — finds the single user, updates their password hash. Used for rotation.

Both rely on Convex Auth's `signIn` action with the password provider's `flow: "signUp"` for creation. There's no clean public API to mutate password hashes without going through the provider; for rotation we can leverage `signIn` with `flow: "reset"` if the password provider supports it, or call the underlying account-store helpers. Convex Auth exposes a `Password` provider with `verify` and `crypto` hooks; the simplest reliable rotation is delete-and-recreate.

- [ ] **Step 1: Create `convex/users.ts`**

We use `createAccount` from `@convex-dev/auth/server` for headless bootstrap. This is the documented server-side path — calling `signIn` from an internalAction is not the right pattern (it's a public action surfaced via `api.auth.signIn`, intended for client → server flow).

```ts
import { internalAction, internalQuery, internalMutation } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import { createAccount } from "@convex-dev/auth/server";

const ADMIN_EMAIL = "admin@boop.local";

export const countUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").take(2);
    return users.length;
  },
});

export const deleteAllUsersAndAccounts = internalMutation({
  args: {},
  handler: async (ctx) => {
    for await (const user of ctx.db.query("users")) {
      await ctx.db.delete(user._id);
    }
    for await (const acc of ctx.db.query("authAccounts")) {
      await ctx.db.delete(acc._id);
    }
    for await (const sess of ctx.db.query("authSessions")) {
      await ctx.db.delete(sess._id);
    }
  },
});

// Idempotent: safe to run on every deploy.
export const bootstrap = internalAction({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.runQuery(internal.users.countUsers, {});
    if (existing > 0) return { created: false, reason: "user already exists" };

    const password = process.env.BOOP_ADMIN_PASSWORD;
    if (!password) {
      throw new Error(
        "BOOP_ADMIN_PASSWORD is not set in Convex env — cannot bootstrap admin user.",
      );
    }

    await createAccount(ctx, {
      provider: "password",
      account: { id: ADMIN_EMAIL, secret: password },
      profile: { email: ADMIN_EMAIL },
    });

    return { created: true };
  },
});

// Rotation: wipe and recreate from the current BOOP_ADMIN_PASSWORD env var.
// Old sessions invalidate naturally on next token expiry.
export const setPassword = internalAction({
  args: {},
  handler: async (ctx) => {
    await ctx.runMutation(internal.users.deleteAllUsersAndAccounts, {});
    const password = process.env.BOOP_ADMIN_PASSWORD;
    if (!password) {
      throw new Error("BOOP_ADMIN_PASSWORD is not set");
    }
    await createAccount(ctx, {
      provider: "password",
      account: { id: ADMIN_EMAIL, secret: password },
      profile: { email: ADMIN_EMAIL },
    });
    return { rotated: true };
  },
});
```

If `createAccount`'s exact argument shape differs in the installed version, check `node_modules/@convex-dev/auth/dist/server/index.d.ts` for the type signature and adjust. The function is the documented server-side bootstrap path.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add convex/users.ts
git commit -m "feat(convex): add bootstrap + setPassword admin actions"
```

---

## Task 7: Classify Convex functions and migrate Express callers (combined)

**Files modified:** all `convex/*.ts` source files except `auth.ts`, `auth.config.ts`, `schema.ts`, `users.ts`. **Also:** every `server/*.ts` file that calls a Convex function which becomes internal.

This task is intentionally larger than the others — splitting it would commit a non-compiling state to `main` (broken Express types). Do the Convex side, then immediately fix the Express callers, then commit once.

For each function in each Convex source file, decide:

- **Public + auth-checked** (`query` / `mutation`) — called by the browser dashboard. Must add `await ctx.auth.getUserIdentity()` and `throw new Error("unauthenticated")` if null at the top of the handler.
- **Internal** (`internalQuery` / `internalMutation` / `internalAction`) — called only by Express server-side. Convert the export, no auth check needed.

Use the classification below. It is the source of truth for this task. After classification, the Express server will need to update its imports from `api.x.y` → `internal.x.y` for everything that became internal. That follow-up happens in Task 8.

**Classification table** (read carefully — picking the wrong category breaks the dashboard or the server):

| File | Function | Category |
|---|---|---|
| `agents.ts` | `create` | internal |
| `agents.ts` | `update` | internal |
| `agents.ts` | `addLog` | internal |
| `agents.ts` | `list` | public+auth |
| `agents.ts` | `get` | public+auth |
| `agents.ts` | `getLogs` | public+auth |
| `automations.ts` | `create` | internal |
| `automations.ts` | `list` | public+auth |
| `automations.ts` | `get` | public+auth |
| `automations.ts` | `setEnabled` | public+auth |
| `automations.ts` | `remove` | public+auth |
| `automations.ts` | `markRan` | internal |
| `automations.ts` | `createRun` | internal |
| `automations.ts` | `updateRun` | internal |
| `automations.ts` | `recentRuns` | public+auth |
| `consolidation.ts` | `createRun` | internal |
| `consolidation.ts` | `updateRun` | internal |
| `consolidation.ts` | `listRuns` | public+auth |
| `conversations.ts` | `list` | public+auth |
| `conversations.ts` | `get` | public+auth |
| `dashboard.ts` | `metrics` | public+auth |
| `drafts.ts` | `create` | internal |
| `drafts.ts` | `get` | public+auth |
| `drafts.ts` | `pendingByConversation` | public+auth |
| `drafts.ts` | `recent` | public+auth |
| `drafts.ts` | `setStatus` | internal |
| `memoryEvents.ts` | `emit` | internal |
| `memoryEvents.ts` | `recent` | public+auth |
| `memoryEvents.ts` | `byConversation` | public+auth |
| `memoryRecords.ts` | `upsert` | internal |
| `memoryRecords.ts` | `getByIds` | internal |
| `memoryRecords.ts` | `vectorSearch` | internal (action) |
| `memoryRecords.ts` | `list` | public+auth |
| `memoryRecords.ts` | `search` | public+auth |
| `memoryRecords.ts` | `markAccessed` | internal |
| `memoryRecords.ts` | `setLifecycle` | internal |
| `memoryRecords.ts` | `countsByTier` | public+auth |
| `messages.ts` | `send` | internal |
| `messages.ts` | `list` | public+auth |
| `messages.ts` | `recent` | public+auth |
| `sendblueDedup.ts` | `claim` | internal |
| `usageRecords.ts` | `record` | internal |
| `usageRecords.ts` | `byConversation` | public+auth |
| `usageRecords.ts` | `recent` | public+auth |
| `usageRecords.ts` | `summary` | public+auth |

- [ ] **Step 0: Verify the classification table against actual usage**

Before changing any function visibility, sanity-check the table by grepping the dashboard's Convex usage:

Run: `grep -rn "api\.[a-zA-Z]*\." debug/src/`
Expected: every `api.X.Y` reference in the output corresponds to a row marked **public+auth** in the table below. If you find a usage that the table marks as **internal**, the dashboard would break — stop and surface the discrepancy before proceeding. (Reference: at the time the plan was written, the dashboard uses `api.memoryRecords.{countsByTier,list}`, `api.memoryEvents.recent`, `api.automations.{list,get,recentRuns,setEnabled,remove}`, `api.agents.{list,get,getLogs}`, `api.dashboard.metrics`, `api.consolidation.listRuns`. All of these are public+auth in the table.)

- [ ] **Step 1: Define a shared auth-check helper**

Append to `convex/auth.ts`:

```ts
import type { GenericQueryCtx, GenericMutationCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel.js";

export async function requireUser(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("unauthenticated");
  }
}
```

- [ ] **Step 2: Convert each file per the classification table**

For each file in the table:

For **internal** rows: change the import — `mutation` → `internalMutation`, `query` → `internalQuery`, `action` → `internalAction`. Adjust each affected `export const X = mutation(...)` → `export const X = internalMutation(...)`, etc.

For **public+auth** rows: keep the `mutation` / `query` import. Add `import { requireUser } from "./auth.js";` (only once per file). At the top of the `handler` (immediately inside the `async (ctx, args) => {` line), add `await requireUser(ctx);`.

Example — before:

```ts
import { query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("conversations").order("desc").take(50);
  },
});
```

After (this function is public+auth):

```ts
import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./auth.js";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.db.query("conversations").order("desc").take(50);
  },
});
```

Example — before (function is internal):

```ts
import { mutation } from "./_generated/server";

export const send = mutation({
  args: { /* ... */ },
  handler: async (ctx, args) => { /* ... */ },
});
```

After:

```ts
import { internalMutation } from "./_generated/server";

export const send = internalMutation({
  args: { /* ... */ },
  handler: async (ctx, args) => { /* ... */ },
});
```

A file may contain a mix — import both `mutation` and `internalMutation` as needed.

- [ ] **Step 3: For files containing both internal and public functions**

Update the imports at the top of the file to bring in only what's used. E.g., a file that has only public-with-auth functions keeps `mutation`/`query` imports; a file that has only internal functions imports only `internalMutation`/`internalQuery`; a mixed file imports both.

- [ ] **Step 4: Find Express callers that need migrating to `internal.X`**

After step 3 the Convex side compiles, but Express files still reference `api.X.Y` for things that just became internal — those won't typecheck.

Run: `npx tsc --noEmit 2>&1 | grep -i "Property .* does not exist"` (or simply read the typecheck output).

- [ ] **Step 5: Update each broken Express caller**

For every broken `convex.mutation(api.X.Y, ...)` / `convex.query(api.X.Y, ...)` / `convex.action(api.X.Y, ...)`, swap `api` → `internal` and update the import at the top of the file. Files calling a mix of public + internal need both imports:

```ts
import { api, internal } from "../convex/_generated/api.js";
```

The `convex` client (`server/convex-client.ts`) supports both shapes — only the function reference changes.

- [ ] **Step 6: Typecheck and test**

Run: `npx tsc --noEmit`
Expected: zero errors anywhere.

Run: `npm test`
Expected: all tests still pass.

- [ ] **Step 7: Commit (Convex + Express together)**

```bash
git add convex/ server/
git commit -m "refactor: classify Convex functions as internal vs public+auth"
```

---

## Task 8: Wire `requireAdmin` middleware globally + auth WS upgrade + serve debug UI from `server/index.ts`

**Files:**
- Modify: `server/index.ts`

Wire the auth middleware into the main Express app and add WebSocket upgrade authentication. Also serve the built debug UI as static assets from `debug/dist`. Static assets must be served BEFORE `requireAdmin` mounts — otherwise the SPA can't even load the login page. Data fetches from the SPA still go through JWT-gated APIs because the data routes are mounted AFTER `requireAdmin`.

- [ ] **Step 1: Update `server/index.ts` middleware ordering**

Add imports near the top of the file:

```ts
import { requireAdmin } from "./auth.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
```

(Some imports may already exist — keep the file's existing import block and add only the missing ones.)

Inside `main()`, replace the middleware-and-route registrations from `app.use(cors())` through `app.use("/composio", ...)` so the final ordering looks like this:

```ts
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// PUBLIC: health check.
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "boop-agent" });
});

// PUBLIC (in production): the built debug UI bundle. Static assets must
// load before the SPA can render the login form, so they're served
// BEFORE requireAdmin gates the API surface.
if (process.env.NODE_ENV === "production") {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const debugDist = path.resolve(here, "../../debug/dist");
  app.use(express.static(debugDist));
  app.get("/debug/*", (_req, res) => {
    res.sendFile(path.join(debugDist, "index.html"));
  });
}

// AUTH GATE: every route below requires a valid Convex Auth JWT, except
// the explicit allowlist inside requireAdmin() (/sendblue/webhook + /health).
app.use(requireAdmin());

app.use("/sendblue", createSendblueRouter());
app.use("/composio", createComposioRouter());
// ... existing /agents/:id/cancel, /consolidate, /agents/:id/retry,
// /chat routes follow unchanged
```

- [ ] **Step 2: Add WebSocket upgrade auth**

Replace the existing WebSocket setup at the bottom of `main()`:

```ts
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", async (req, socket, head) => {
  if (req.url !== "/ws") {
    socket.destroy();
    return;
  }
  // Token is passed as a ?token=<jwt> query param. The browser EventSource /
  // WebSocket APIs can't set custom headers on the handshake, so query is
  // the standard workaround.
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get("token");
  if (!token) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  try {
    const { jwtVerify, createRemoteJWKSet } = await import("jose");
    const convexUrl = process.env.CONVEX_URL!;
    const jwks = createRemoteJWKSet(new URL("/.well-known/jwks.json", convexUrl));
    await jwtVerify(token, jwks, { issuer: convexUrl });
  } catch {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws) => {
  addClient(ws);
  ws.send(JSON.stringify({ event: "hello", data: { ok: true }, at: Date.now() }));
});
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Smoke test locally**

Run: `npm start`
- In another terminal: `curl -i http://localhost:3456/health` → expect `200 OK`.
- `curl -i http://localhost:3456/chat -X POST -H 'content-type: application/json' -d '{}'` → expect `401`.
- `curl -i http://localhost:3456/sendblue/webhook -X POST -H 'content-type: application/json' -d '{}'` → expect `401` (signing secret missing in env triggers unsigned-request rejection in production-like flow; in local dev with no `SENDBLUE_SIGNING_SECRET` set, it falls through and returns 200 with `skipped:true`. Both are valid.)

Stop the server.

- [ ] **Step 5: Commit**

```bash
git add server/index.ts
git commit -m "feat(server): wire requireAdmin middleware, auth WS upgrade, serve debug UI"
```

---

## Task 9: Wrap debug UI in `<ConvexAuthProvider>` and add login form

**Files:**
- Modify: `debug/package.json`
- Modify: `debug/src/main.tsx`
- Modify: `debug/src/App.tsx`
- Create: `debug/src/auth.tsx`

- [ ] **Step 1: Install `@convex-dev/auth` in the debug workspace**

The repo uses a single root `package.json`, but `@convex-dev/auth/react` will be resolved from there. Verify it's listed in the root `package.json` `dependencies` from Task 5; if not, add it. The debug build via `vite` will pick it up automatically.

Run: `npm ls @convex-dev/auth`
Expected: shows the package installed.

- [ ] **Step 2: Wrap the app in `ConvexAuthProvider`**

Edit `debug/src/main.tsx`. Replace the `<ConvexProvider client={convex}>` wrapper:

```tsx
import { ConvexAuthProvider } from "@convex-dev/auth/react";
// ... rest of imports

// inside the ReactDOM.createRoot(...).render block:
<ConvexAuthProvider client={convex}>
  <App />
</ConvexAuthProvider>
```

(Removing the bare `<ConvexProvider>` — `<ConvexAuthProvider>` is a superset.)

- [ ] **Step 3: Create the login form**

Create `debug/src/auth.tsx`:

```tsx
import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";

export function LoginForm() {
  const { signIn } = useAuthActions();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signIn("password", {
        email: "admin@boop.local",
        password,
        flow: "signIn",
      });
    } catch (err) {
      setError("Wrong password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 p-6">
        <div className="text-center">
          <img src="/lunagotchi.png" alt="Boop" className="w-12 h-12 mx-auto rounded-lg" />
          <h1 className="mt-3 text-lg font-semibold">Boop Debug</h1>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          autoFocus
          className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm"
        />
        {error && <div className="text-rose-400 text-sm">{error}</div>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded px-3 py-2 text-sm font-medium"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Gate `<App />` on auth state**

Edit `debug/src/App.tsx`. At the top of the existing `export function App()` body:

```tsx
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { LoginForm } from "./auth.js";

export function App() {
  return (
    <>
      <AuthLoading>
        <div className="h-full flex items-center justify-center">Loading…</div>
      </AuthLoading>
      <Unauthenticated>
        <LoginForm />
      </Unauthenticated>
      <Authenticated>
        <AppInner />
      </Authenticated>
    </>
  );
}

function AppInner() {
  // ... the original App body goes here, unchanged
}
```

The split keeps the original `App` body intact — only renamed to `AppInner`.

- [ ] **Step 5: Build the debug UI**

Run: `npm run build:debug`
Expected: `debug/dist/` is created with `index.html` and built assets.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add debug/src/main.tsx debug/src/App.tsx debug/src/auth.tsx debug/package.json
git commit -m "feat(debug): wrap UI in ConvexAuthProvider and add login form"
```

---

## Task 10: Add `debug/src/api-client.ts` and migrate `fetch` calls

**Files:**
- Create: `debug/src/api-client.ts`
- Modify: `debug/src/components/ConsolidationPanel.tsx`
- Modify: `debug/src/components/ComposioSection.tsx`

`@convex-dev/auth/react` exposes a way to read the current JWT via the `useAuthToken` hook (or fetched via the auth client). The `apiClient` wraps `fetch` to attach the token automatically.

- [ ] **Step 1: Write `debug/src/api-client.ts`**

```ts
import { useCallback } from "react";
import { useAuthToken } from "@convex-dev/auth/react";

export function useApiClient() {
  const token = useAuthToken();

  return useCallback(
    async (input: string, init: RequestInit = {}): Promise<Response> => {
      const headers = new Headers(init.headers);
      if (token) headers.set("authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers });
    },
    [token],
  );
}
```

- [ ] **Step 2: Migrate `ConsolidationPanel.tsx`**

Find the existing `fetch("/api/consolidate", { method: "POST" })` call (line ~108). Convert the component to use `useApiClient`:

```tsx
import { useApiClient } from "../api-client.js";

// inside the component:
const apiClient = useApiClient();
// inside the relevant async handler:
await apiClient("/api/consolidate", { method: "POST" });
```

- [ ] **Step 3: Migrate `ComposioSection.tsx`**

There are 6 `fetch(...)` calls in `debug/src/components/ComposioSection.tsx` (lines 103, 122, 159, 179, 206, 232). Wire `useApiClient()` once at the top of the component and replace each `fetch(` with `apiClient(`. Argument shapes are identical.

- [ ] **Step 4: Build the debug UI**

Run: `npm run build:debug`
Expected: build succeeds.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add debug/src/api-client.ts debug/src/components/ConsolidationPanel.tsx debug/src/components/ComposioSection.tsx
git commit -m "feat(debug): add authed apiClient wrapper and migrate fetch calls"
```

---

## Task 11: Add `Dockerfile` and `.dockerignore`

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

The Dockerfile uses `node:22-slim` (Debian Bookworm slim) — Debian for SSH-friendliness when operators `fly ssh console` in, slim to keep the image small. We **don't** compile TS to JS; we run with `tsx` at runtime, matching the existing `npm start` script.

- [ ] **Step 1: Create `Dockerfile`**

```dockerfile
# ---- Stage 1: install deps ----
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Stage 2: build debug UI bundle ----
FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# convex/_generated is gitignored, so it's not in the build context.
# Generate it inside the image so the debug UI build (which imports types
# from ../convex/_generated/api) can resolve them.
RUN npx convex codegen --typecheck=disable
RUN npm run build:debug

# ---- Stage 3: runtime ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/convex ./convex
COPY --from=build /app/debug/dist ./debug/dist
COPY --from=build /app/scripts/preflight.mjs ./scripts/preflight.mjs
COPY package.json tsconfig.json ./
EXPOSE 3456
USER node
CMD ["npx", "tsx", "server/index.ts"]
```

- [ ] **Step 2: Create `.dockerignore`**

```
node_modules
debug/dist
debug/node_modules
.env
.env.local
.env.*.local
.git
.github
.claude
.cursor
.idea
.vscode
docs
assets
*.md
tests
__tests__
**/*.test.ts
```

- [ ] **Step 3: Build the image locally**

Run: `docker build -t boop-agent .`
Expected: build succeeds; final image size < 300 MB.

If `docker` is not available on the host, skip this step and run it in a later task or note in the PR description.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "feat(deploy): add multi-stage Dockerfile (node:22-slim, tsx runtime)"
```

---

## Task 12: Add `fly.toml`

**Files:**
- Create: `fly.toml`

- [ ] **Step 1: Write `fly.toml`**

```toml
# Fly app config. Generated by scripts/deploy.ts on first deploy and
# checked in for reproducibility.
#
# IMPORTANT: min_machines_running = 1 + auto_stop_machines = false is the
# explicit "exactly one replica, always running" config required by boop's
# in-process background loops (cleanup, automation, heartbeat, consolidation).
# Scaling beyond one replica without a Convex-level coordination lock causes
# automation double-fire and consolidation duplicate-cost.

app = "boop-agent"
primary_region = "iad"

[build]
  # uses Dockerfile

[http_service]
  internal_port = 3456
  force_https = true
  auto_stop_machines = false
  auto_start_machines = false
  min_machines_running = 1
  processes = ["app"]

[[http_service.checks]]
  grace_period = "10s"
  interval = "30s"
  method = "GET"
  path = "/health"
  timeout = "5s"

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
```

The `app` value will be overwritten per-fork by `scripts/deploy.ts` on first run via `fly apps create <name>` + `flyctl deploy --app <name>`. We commit a default of `boop-agent` so `flyctl deploy` from the repo works once a fork has run `scripts/deploy.ts` and edited it (or set `FLY_APP_NAME` in CI).

- [ ] **Step 2: Commit**

```bash
git add fly.toml
git commit -m "feat(deploy): add fly.toml (single machine, always-on)"
```

---

## Task 13: Update `.env.example`

**Files:**
- Modify: `.env.example`

Add three new sections in Chris's existing comment style. Order follows the file's existing flow (Sendblue → Claude → Boop dashboard).

- [ ] **Step 1: Add the new sections**

Insert after the existing Sendblue section (after `SENDBLUE_FROM_NUMBER=`):

```bash

# ---- Sendblue webhook signing ----
# Get this from your Sendblue dashboard under Webhook Settings → Signing Secret.
# Required when running on a public URL — the webhook handler verifies every
# incoming request's HMAC-SHA256 signature against this secret.
SENDBLUE_SIGNING_SECRET=
```

After the existing Claude section (after the `# ANTHROPIC_API_KEY=` line), append:

```bash

# When deploying to a server, prefer CLAUDE_CODE_OAUTH_TOKEN (subscription)
# over ANTHROPIC_API_KEY. Generate one locally with `claude setup-token`,
# paste it as a Fly secret. Token lasts 1 year, then regenerate.
# CLAUDE_CODE_OAUTH_TOKEN=
```

After the existing Server section (after the `# SENDBLUE_AUTO_WEBHOOK=true` line), append:

```bash

# ---- Boop dashboard / admin auth (deployment only) ----
# The single password for the dashboard and admin endpoints when deployed.
# `npm run deploy` will offer to auto-generate a 32-char random value.
# Set as both a Fly secret AND a Convex env var (the dashboard auth
# verifies via Convex; the bootstrap action reads from Convex env).
BOOP_ADMIN_PASSWORD=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs(env): document SENDBLUE_SIGNING_SECRET, BOOP_ADMIN_PASSWORD, CLAUDE_CODE_OAUTH_TOKEN"
```

---

## Task 14: Add `.github/workflows/deploy.yml`

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    concurrency:
      group: deploy-${{ github.ref }}
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      - name: Run unit tests
        run: npm test

      - name: Push Convex backend
        run: npx convex deploy --yes
        env:
          CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_DEPLOY_KEY }}

      - name: Bootstrap admin user (idempotent)
        # CONVEX_DEPLOY_KEY scopes the call to the production deployment
        # automatically. If the Convex CLI version in use rejects this,
        # add `--prod` explicitly.
        run: npx convex run users:bootstrap
        env:
          CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_DEPLOY_KEY }}

      - uses: superfly/flyctl-actions/setup-flyctl@master

      - name: Deploy to Fly
        run: flyctl deploy --remote-only --app "$FLY_APP_NAME"
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
          FLY_APP_NAME: ${{ secrets.FLY_APP_NAME }}

      - name: Smoke test
        run: |
          for i in {1..30}; do
            if curl -fsS "https://${FLY_APP_NAME}.fly.dev/health"; then
              exit 0
            fi
            sleep 5
          done
          echo "health check failed after 150s"
          exit 1
        env:
          FLY_APP_NAME: ${{ secrets.FLY_APP_NAME }}
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "feat(ci): add deploy workflow (test → convex → bootstrap → fly → smoke)"
```

---

## Task 15: Add `scripts/deploy.ts` interactive deploy setup

**Files:**
- Create: `scripts/deploy.ts`

This script mirrors `scripts/setup.ts` patterns. It is **standalone** — no imports from `setup.ts`. Re-implement the helpers (`banner`, `hasBinary`, `runInherit`, `runCapture`, `openInBrowser`) inline.

The script flow is the 9-step sequence in the design spec's "scripts/deploy.ts" section. ~280 lines. Do not write it from scratch in one go; build it section by section.

- [ ] **Step 1: Scaffold the script with helpers**

```ts
#!/usr/bin/env tsx
import prompts from "prompts";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const ENV_PATH = resolve(ROOT, ".env.local");

function banner(s: string) {
  console.log("\n" + "━".repeat(60));
  console.log("  " + s);
  console.log("━".repeat(60));
}

function readEnv(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function hasBinary(name: string): Promise<boolean> {
  return new Promise((ok) => {
    const lookup = process.platform === "win32" ? "where" : "which";
    const child = spawn(lookup, [name], { stdio: "ignore" });
    child.on("exit", (code) => ok(code === 0));
    child.on("error", () => ok(false));
  });
}

function openInBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true }).unref();
  } catch {
    /* ignore */
  }
}

function runInherit(cmd: string, args: string[]): Promise<void> {
  return new Promise((ok, fail) => {
    const child = spawn(cmd, args, { stdio: "inherit", cwd: ROOT });
    child.on("exit", (code) =>
      code === 0 ? ok() : fail(new Error(`${cmd} ${args.join(" ")} exited ${code}`)),
    );
    child.on("error", fail);
  });
}

function runCapture(cmd: string, args: string[]): Promise<string> {
  return new Promise((ok, fail) => {
    const child = spawn(cmd, args, { stdio: ["inherit", "pipe", "pipe"], cwd: ROOT });
    let out = "";
    child.stdout.on("data", (d) => {
      const s = d.toString();
      out += s;
      process.stdout.write(s);
    });
    child.stderr.on("data", (d) => process.stderr.write(d));
    child.on("exit", (code) =>
      code === 0 ? ok(out) : fail(new Error(`${cmd} exited ${code}`)),
    );
    child.on("error", fail);
  });
}

function genPassword(): string {
  return randomBytes(24).toString("base64url");
}

async function main() {
  banner("Boop deploy — sets up Fly + Convex production deploy");

  // ... (filled in by following steps)
}

main().catch((err) => {
  console.error("\n[deploy] failed:", err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Step 1 of the deploy flow — verify dev setup**

Inside `main()`, after the banner:

```ts
banner("1. Verifying local setup");
const env = readEnv(ENV_PATH);
if (!env.CONVEX_DEPLOYMENT) {
  const { runSetup } = await prompts({
    type: "confirm",
    name: "runSetup",
    message: "No CONVEX_DEPLOYMENT in .env.local — run `npm run setup` first?",
    initial: true,
  });
  if (runSetup) {
    await runInherit("npm", ["run", "setup"]);
    Object.assign(env, readEnv(ENV_PATH));
  } else {
    throw new Error("CONVEX_DEPLOYMENT must be set before deploying.");
  }
}
console.log("✓ Local Convex deployment configured.");
```

- [ ] **Step 3: Step 2 — Fly account and app creation**

```ts
banner("2. Fly.io app");
if (!(await hasBinary("fly"))) {
  console.log(
    "Fly CLI not found. Install with: curl -L https://fly.io/install.sh | sh",
  );
  throw new Error("Install fly CLI and re-run.");
}
try {
  await runCapture("fly", ["auth", "whoami"]);
} catch {
  console.log("Not logged in. Running `fly auth login`...");
  await runInherit("fly", ["auth", "login"]);
}

const { appName } = await prompts({
  type: "text",
  name: "appName",
  message: "Fly app name (must be globally unique):",
  initial: env.FLY_APP_NAME ?? "",
  validate: (v: string) => /^[a-z0-9-]{3,40}$/.test(v) || "lowercase letters, digits, dashes",
});

let appExists = false;
try {
  await runCapture("fly", ["apps", "list", "--json"]).then((out) => {
    const apps = JSON.parse(out);
    appExists = apps.some((a: { Name: string }) => a.Name === appName);
  });
} catch {
  /* fall through — try to create */
}

if (!appExists) {
  await runInherit("fly", ["apps", "create", appName]);
}

const PUBLIC_URL = `https://${appName}.fly.dev`;
console.log(`✓ App ready: ${PUBLIC_URL}`);
```

- [ ] **Step 4: Step 3 — generate secrets**

```ts
banner("3. Generate secrets for production");

let llmAuth: { name: string; value: string };
const { llmChoice } = await prompts({
  type: "select",
  name: "llmChoice",
  message: "Which LLM auth?",
  choices: [
    { title: "Claude Code subscription token (recommended)", value: "oauth" },
    { title: "Anthropic API key (per-token billing)", value: "api" },
  ],
  initial: 0,
});

if (llmChoice === "oauth") {
  console.log("\nIn another terminal, run: claude setup-token");
  console.log("It will print a token. Paste it below.");
  const { token } = await prompts({
    type: "password",
    name: "token",
    message: "CLAUDE_CODE_OAUTH_TOKEN:",
  });
  llmAuth = { name: "CLAUDE_CODE_OAUTH_TOKEN", value: token };
} else {
  const { key } = await prompts({
    type: "password",
    name: "key",
    message: "ANTHROPIC_API_KEY:",
  });
  llmAuth = { name: "ANTHROPIC_API_KEY", value: key };
}

const { signingSecret } = await prompts({
  type: "password",
  name: "signingSecret",
  message: "SENDBLUE_SIGNING_SECRET (Sendblue dashboard → Webhook → Signing Secret):",
});

const adminPassword = env.BOOP_ADMIN_PASSWORD || genPassword();
console.log(`\nGenerated BOOP_ADMIN_PASSWORD: ${adminPassword}`);
console.log("(Save this — you'll use it to log into the dashboard.)");
```

- [ ] **Step 5: Step 4 — push secrets to Fly**

```ts
banner("4. Pushing secrets to Fly");

const flySecrets: Record<string, string> = {
  [llmAuth.name]: llmAuth.value,
  SENDBLUE_API_KEY: env.SENDBLUE_API_KEY ?? "",
  SENDBLUE_API_SECRET: env.SENDBLUE_API_SECRET ?? "",
  SENDBLUE_FROM_NUMBER: env.SENDBLUE_FROM_NUMBER ?? "",
  SENDBLUE_SIGNING_SECRET: signingSecret,
  CONVEX_DEPLOYMENT: env.CONVEX_DEPLOYMENT ?? "",
  CONVEX_URL: env.CONVEX_URL ?? "",
  COMPOSIO_API_KEY: env.COMPOSIO_API_KEY ?? "",
  BOOP_ADMIN_PASSWORD: adminPassword,
  PUBLIC_URL,
  NODE_ENV: "production",
};

const setArgs = ["secrets", "set", "--app", appName];
for (const [k, v] of Object.entries(flySecrets)) {
  if (v) setArgs.push(`${k}=${v}`);
}
await runInherit("fly", setArgs);
```

- [ ] **Step 6: Step 5 — Convex env**

```ts
banner("5. Configuring Convex env");
console.log("Setting BOOP_ADMIN_PASSWORD on the production Convex deployment...");
await runInherit("npx", [
  "convex",
  "env",
  "set",
  "BOOP_ADMIN_PASSWORD",
  adminPassword,
]);
```

- [ ] **Step 7: Step 6 — Sendblue webhook**

```ts
banner("6. Sendblue webhook");
console.log(`Open the Sendblue dashboard and set the INBOUND webhook to:`);
console.log(`  ${PUBLIC_URL}/sendblue/webhook`);
openInBrowser("https://app.sendblue.com/settings/webhooks");
const { webhookSet } = await prompts({
  type: "confirm",
  name: "webhookSet",
  message: "Done?",
  initial: true,
});
if (!webhookSet) {
  console.log("⚠️  Skipping for now — you must set this before iMessages reach the server.");
}
```

- [ ] **Step 8: Step 7 — GitHub repo secrets**

```ts
banner("7. GitHub Actions secrets");
if (await hasBinary("gh")) {
  const { useGh } = await prompts({
    type: "confirm",
    name: "useGh",
    message: "Push secrets to GitHub via `gh secret set`?",
    initial: true,
  });
  if (useGh) {
    const flyToken = await runCapture("fly", ["auth", "token"]).then((s) => s.trim());
    const convexDeployKey = await prompts({
      type: "password",
      name: "k",
      message: "Convex deploy key (https://dashboard.convex.dev → project → Deploy Keys):",
    }).then((r) => r.k);
    await runInherit("gh", ["secret", "set", "FLY_API_TOKEN", "--body", flyToken]);
    await runInherit("gh", ["secret", "set", "FLY_APP_NAME", "--body", appName]);
    await runInherit("gh", [
      "secret",
      "set",
      "CONVEX_DEPLOY_KEY",
      "--body",
      convexDeployKey,
    ]);
  }
} else {
  console.log("Install `gh` CLI to auto-set secrets, or set them manually:");
  console.log("  - FLY_API_TOKEN  (run `fly auth token`)");
  console.log(`  - FLY_APP_NAME = ${appName}`);
  console.log("  - CONVEX_DEPLOY_KEY  (Convex dashboard → Deploy Keys)");
}
```

- [ ] **Step 9: Step 8 — first deploy**

```ts
banner("8. First deploy");
const { deployNow } = await prompts({
  type: "confirm",
  name: "deployNow",
  message: "Run `fly deploy --remote-only` now?",
  initial: true,
});
if (deployNow) {
  await runInherit("fly", ["deploy", "--remote-only", "--app", appName]);
  console.log("\nBootstrapping admin user...");
  await runInherit("npx", ["convex", "run", "users:bootstrap"]);
}
```

- [ ] **Step 10: Step 9 — closing footer**

```ts
banner("Done!");
console.log(`Dashboard:  ${PUBLIC_URL}/`);
console.log(`Health:     ${PUBLIC_URL}/health`);
console.log(`Webhook:    ${PUBLIC_URL}/sendblue/webhook`);
console.log("");
console.log("Future deploys: `git push origin main` triggers GitHub Actions.");
console.log("Annual: rotate CLAUDE_CODE_OAUTH_TOKEN by re-running `claude setup-token`.");
```

- [ ] **Step 11: Test that the script at least loads (no execution)**

Run: `npx tsx --no-warnings -e 'import("./scripts/deploy.ts").catch((e) => { console.error(e); process.exit(1); })'`
Expected: imports without throwing (the script's `main()` only runs when invoked, so this just typechecks the imports).

Alternatively just typecheck:

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add scripts/deploy.ts
git commit -m "feat(deploy): add interactive scripts/deploy.ts (mirrors setup.ts patterns)"
```

---

## Task 16: Add `docs/deploying.md` and link from README

**Files:**
- Create: `docs/deploying.md`
- Modify: `README.md`

- [ ] **Step 1: Write `docs/deploying.md`**

```markdown
# Deploying Boop

Boop runs as a single Fly.io machine with Convex as the backend. This doc walks through the one-shot deploy flow.

## Prerequisites

- Local dev set up — run `npm run setup` first if you haven't.
- A [Fly.io](https://fly.io) account and `fly` CLI installed (`curl -L https://fly.io/install.sh | sh`).
- Either:
  - **A Claude subscription** (Pro/Max/Team/Enterprise) — generate a 1-year token via `claude setup-token` locally. Recommended.
  - **An Anthropic API key** if you'd rather pay per token.
- Your Sendblue dashboard's **webhook signing secret** (Webhook Settings → Signing Secret).
- (Optional but recommended) `gh` CLI for auto-pushing GitHub Actions secrets.

## One command

```bash
npm run deploy
```

The interactive script walks you through:

1. Verifying your local setup (Convex deployment, Sendblue keys).
2. Creating a Fly app and printing your stable public URL (`https://<your-app>.fly.dev`).
3. Picking your LLM auth method (subscription token or API key) and a webhook signing secret.
4. Generating a strong dashboard password and storing it as both a Fly secret and a Convex env var.
5. Pushing all secrets to Fly.
6. Reminding you to set the Sendblue inbound webhook to `https://<your-app>.fly.dev/sendblue/webhook`.
7. Setting GitHub Actions secrets (`FLY_API_TOKEN`, `FLY_APP_NAME`, `CONVEX_DEPLOY_KEY`) so future pushes to `main` auto-deploy.
8. Running the first deploy.

After it finishes:

- Visit `https://<your-app>.fly.dev/` and log in with the dashboard password.
- Send yourself an iMessage. Watch the Events panel light up.
- Future deploys: `git push origin main` triggers GitHub Actions.

## Operational tasks

### Annual: rotate the Claude OAuth token

The `CLAUDE_CODE_OAUTH_TOKEN` expires after 1 year. When it does, the agent will start replying "Sorry — I hit an error" to your messages. To rotate:

```bash
claude setup-token   # local — prints a new token
fly secrets set CLAUDE_CODE_OAUTH_TOKEN=<new-token> --app <your-app>
```

Fly restarts the machine automatically.

### Rotate the dashboard password

```bash
fly secrets set BOOP_ADMIN_PASSWORD=<new-value> --app <your-app>
npx convex env set BOOP_ADMIN_PASSWORD=<same-new-value>
npx convex run users:setPassword
```

### Background loop constraint (single-replica)

Boop's four background loops (cleanup, automation, heartbeat, consolidation) run in-process. The `fly.toml` sets `min_machines_running = 1` and `auto_stop_machines = false` so exactly one machine runs continuously. **Do not scale horizontally** — duplicate automations and consolidation runs would cost real money.

### WebSocket token in logs

The dashboard's live WebSocket connection authenticates via a `?token=<jwt>` query parameter (browsers can't set custom headers on the WS handshake). That token will appear in Fly access logs and in any reverse proxy you put in front of Fly. If your logs ever leak, rotate the dashboard password to invalidate any captured token. Single-user severity is low, but worth knowing.

## Alternative platforms

The Dockerfile is platform-neutral. To deploy elsewhere:

- **Coolify on Hetzner / your own VPS** — point Coolify at the repo, replace `fly.toml` with a Coolify service config.
- **PikaPods** — single Docker container, identical environment variable set. Drop `fly.toml`, configure the same secrets in the PikaPods dashboard.
- **Render / Railway / Fly Machines via API** — same shape.

The thing you need to provide on any platform: a stable HTTPS URL with port 3456 reachable, all environment variables from `.env.example` set, and a single replica with persistent process.

## Layering an SSO edge (optional)

If you want SSO on top of the password gate (e.g., for a small team), put **Cloudflare Access** in front of the Fly app. Cloudflare Access enforces SSO at the edge before traffic reaches Fly; the password gate then becomes redundant but harmless.
```

- [ ] **Step 2: Add a link to `README.md`**

Find a sensible spot in the existing README (likely in a "Run it" or "What you get" section) and insert one line:

```markdown
- **Deploy** — one-command production setup with `npm run deploy`. See [`docs/deploying.md`](docs/deploying.md).
```

- [ ] **Step 3: Commit**

```bash
git add docs/deploying.md README.md
git commit -m "docs: add deploying.md and link from README"
```

---

## Task 17: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: all tests pass. Should be ~15 tests across `auth.test.ts` and `sendblue.test.ts`.

- [ ] **Step 3: Build the debug UI**

Run: `npm run build:debug`
Expected: succeeds, `debug/dist/` contains `index.html` + assets.

- [ ] **Step 4: Build the Docker image**

Run: `docker build -t boop-agent .`
Expected: succeeds. (If Docker isn't available locally, skip and note in PR description that this still needs verification.)

- [ ] **Step 5: Sanity-check the Convex schema and codegen**

Run: `npx convex codegen`
Expected: `convex/_generated/` regenerates without error. This validates the schema, function signatures, and auth provider config without actually deploying. Real deploy validation happens in CI when the PR is opened against a branch with `CONVEX_DEPLOY_KEY` configured.

- [ ] **Step 6: Final commit (if anything was tweaked)**

If the verification surfaced any small fixes, commit them with `chore: post-verification cleanup`.

- [ ] **Step 7: Open the draft PR**

Out of scope for this plan — done by the user when they're ready. The PR description should follow the spec's "Author's testing posture" — explicitly state what was and wasn't verified by the contributor.

---

## Self-Review Notes

**Spec coverage check:** every section of the design spec maps to one or more tasks above:

| Spec section | Task(s) |
|---|---|
| Two auth perimeters → Perimeter A (HMAC + phone) | 4 |
| Two auth perimeters → Perimeter B (Convex Auth) | 5, 6, 8, 9 |
| Route allowlist | 3, 8 |
| Single-user model + bootstrap | 6, 14 |
| Password rotation | 6, 16 |
| LLM auth (OAuth token vs API key) | 15, 16 |
| Convex function classification + Express migration | 7 |
| Deployment shape (fly.toml) | 12 |
| Express server changes | 2, 3, 4, 8 |
| Convex layer changes | 5, 6, 7 |
| Debug UI changes | 9, 10 |
| Dockerfile + .dockerignore | 11 |
| GitHub Actions workflow | 14 |
| scripts/deploy.ts | 15 |
| .env.example additions | 13 |
| docs/deploying.md | 16 |
| README link | 16 |
| Testing (unit tests, node:test, npm test) | 1, 2, 3, 4 |
| Operational notes | 16 |

**Type consistency:** the `requireUser` helper signature in Task 7 matches its caller usage. The `verifyHmac` signature `(body, signature, secret) => boolean` is identical between Tasks 2 and 4. The `requireAdmin` signature `() => RequestHandler` (with optional verifier override) is identical between Tasks 3 and 8.

**Out-of-scope guard:** no task adds rate limiting, body size hardening, multi-user, or any other expressly out-of-scope concern from the spec.

**Risks called out:**
- Task 6: Bootstrap uses `createAccount` from `@convex-dev/auth/server`. If the installed package version's argument shape differs, check the type definitions and adjust — this is the documented headless-bootstrap path but versions move.
- Task 8: WebSocket upgrade auth uses `?token=<jwt>` query param because browsers can't set custom headers on the handshake. The token leaks to Fly access logs and any reverse-proxy logs. Documented in `docs/deploying.md`.
- Task 11: The Dockerfile runs with `tsx` at runtime (not a compiled `dist/`). The runtime image carries devDependency-style tooling. Acceptable trade-off for keeping changes minimal — matches Chris's existing `npm start = tsx server/index.ts` pattern.
