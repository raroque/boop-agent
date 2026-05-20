import { Router, type NextFunction, type Request, type Response } from "express";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { runTurn } from "../channels/index.js";
import { broadcast, subscribe, type BroadcastMessage } from "../broadcast.js";
import type { ConversationId } from "../channels/types.js";
import { convex } from "../convex-client.js";
import { api } from "../../convex/_generated/api.js";

const randomId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * iOS channel router. Pairing flow:
 *   1. Phone POSTs /pair/create with a deviceId (UUID). Server returns
 *      a 6-digit code + 10min expiry. Code hash is stored in the
 *      devices row; cleartext only lives in the HTTP response.
 *   2. User types the code into the dashboard. Dashboard POSTs
 *      /pair/consume which marks the device paired, generates a bearer
 *      token, hashes+stores the hash, and stashes the cleartext in an
 *      in-memory delivery map keyed by deviceId (TTL 10 min).
 *   3. Phone polls /pair/check; the first poll after consume returns
 *      the bearer and evicts it from the delivery map.
 *   4. Phone uses Authorization: Bearer <token> for /inbound and
 *      /stream. The middleware hashes and looks up the device row.
 *
 * Rate limits are in-process (single-process server). Pairing-code
 * delivery lives in-process too; restart drops pending pickups.
 */

// ---------- helpers ----------

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const generatePairingCode = () => {
  // randomInt for uniform 6-digit values; padStart so 000123 stays valid.
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
};

const generateBearerToken = () => randomBytes(32).toString("base64url");

const PAIR_TTL_MS = 10 * 60 * 1000;
const BEARER_DELIVERY_TTL_MS = 10 * 60 * 1000;

// ---------- rate limiting ----------

type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();

function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= max) return false;
  bucket.count += 1;
  return true;
}

const ipOf = (req: Request) =>
  (req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "unknown");

// ---------- bearer delivery (in-memory pickup) ----------

type BearerDelivery = { bearerToken: string; expiresAt: number };
const bearerDeliveries = new Map<string, BearerDelivery>();

function stashBearer(deviceId: string, bearerToken: string): void {
  bearerDeliveries.set(deviceId, {
    bearerToken,
    expiresAt: Date.now() + BEARER_DELIVERY_TTL_MS,
  });
}

function pickupBearer(deviceId: string): string | null {
  const entry = bearerDeliveries.get(deviceId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    bearerDeliveries.delete(deviceId);
    return null;
  }
  bearerDeliveries.delete(deviceId);
  return entry.bearerToken;
}

// ---------- auth middleware ----------

interface AuthedRequest extends Request {
  deviceId?: string;
}

async function requireBearer(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    res.status(401).json({ error: "missing bearer" });
    return;
  }
  const token = header.slice(7).trim();
  if (!token) {
    res.status(401).json({ error: "missing bearer" });
    return;
  }
  try {
    const result = await convex.mutation(api.devices.verifyBearer, {
      bearerTokenHash: sha256(token),
    });
    if (!result) {
      res.status(401).json({ error: "invalid bearer" });
      return;
    }
    req.deviceId = result.deviceId;
    next();
  } catch (err) {
    console.error("[ios] verifyBearer failed", err);
    res.status(500).json({ error: "auth check failed" });
  }
}

// ---------- SSE event allowlist ----------

const STREAM_EVENTS = new Set([
  "assistant_delta",
  "assistant_message",
  "assistant_ack",
  "assistant_attachments",
  "thinking",
  "error",
  "thread_icon",
  "agent_spawned",
  "agent_tool",
  "agent_done",
]);

// ---------- router ----------

export function createIosRouter(): Router {
  const router = Router();

  // GET /threads — list open threads for the authed device.
  router.get("/threads", requireBearer, async (req: AuthedRequest, res) => {
    try {
      const threads = await convex.query(api.threads.listOpen, {
        deviceId: req.deviceId!,
      });
      res.json({ threads });
    } catch (err) {
      console.error("[ios] threads:list failed", err);
      res.status(500).json({ error: "list threads failed" });
    }
  });

  // POST /threads/create — create a new open thread (max 4).
  router.post("/threads/create", requireBearer, async (req: AuthedRequest, res) => {
    try {
      const { threadId } = await convex.mutation(api.threads.createThread, {
        deviceId: req.deviceId!,
      });
      res.json({ threadId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("no more than 4")) {
        res.status(409).json({ error: "max open threads reached" });
        return;
      }
      console.error("[ios] threads:create failed", err);
      res.status(500).json({ error: "create thread failed" });
    }
  });

  // POST /threads/:threadId/archive — archive a thread.
  router.post("/threads/:threadId/archive", requireBearer, async (req: AuthedRequest, res) => {
    try {
      await convex.mutation(api.threads.archive, {
        threadId: req.params.threadId as any,
      });
      res.json({ ok: true });
    } catch (err) {
      console.error("[ios] threads:archive failed", err);
      res.status(500).json({ error: "archive thread failed" });
    }
  });

  // GET /threads/archived — list archived threads, newest-first.
  router.get("/threads/archived", requireBearer, async (req: AuthedRequest, res) => {
    try {
      const threads = await convex.query(api.threads.listArchived, {
        deviceId: req.deviceId!,
      });
      res.json({ threads });
    } catch (err) {
      console.error("[ios] threads:listArchived failed", err);
      res.status(500).json({ error: "list archived failed" });
    }
  });

  // POST /apns/register — phone reports its device token + environment
  // after the OS hands one over. Idempotent: every app launch re-POSTs
  // so the latest token Apple is vending wins.
  router.post("/apns/register", requireBearer, async (req: AuthedRequest, res) => {
    const { deviceToken, environment } = (req.body ?? {}) as {
      deviceToken?: string;
      environment?: string;
    };
    if (!deviceToken || typeof deviceToken !== "string" || !/^[0-9a-fA-F]{32,}$/.test(deviceToken)) {
      res.status(400).json({ error: "deviceToken (hex) required" });
      return;
    }
    if (environment !== "development" && environment !== "production") {
      res.status(400).json({ error: "environment must be development|production" });
      return;
    }
    try {
      await convex.mutation(api.devices.setApnsToken, {
        deviceId: req.deviceId!,
        apnsDeviceToken: deviceToken,
        apnsEnvironment: environment,
      });
      res.json({ ok: true });
    } catch (err) {
      console.error("[ios] apns:register failed", err);
      res.status(500).json({ error: "apns register failed" });
    }
  });

  // POST /apns/unregister — phone says "drop my token". Called on
  // logout / unpair from the iOS side.
  router.post("/apns/unregister", requireBearer, async (req: AuthedRequest, res) => {
    const { deviceToken } = (req.body ?? {}) as { deviceToken?: string };
    if (!deviceToken || typeof deviceToken !== "string") {
      res.status(400).json({ error: "deviceToken required" });
      return;
    }
    try {
      await convex.mutation(api.devices.clearApnsTokenByToken, {
        apnsDeviceToken: deviceToken,
      });
      res.json({ ok: true });
    } catch (err) {
      console.error("[ios] apns:unregister failed", err);
      res.status(500).json({ error: "apns unregister failed" });
    }
  });

  // POST /threads/:threadId/unarchive — restore an archived thread.
  // Rejected with 409 when the device already has 4 open threads.
  router.post("/threads/:threadId/unarchive", requireBearer, async (req: AuthedRequest, res) => {
    try {
      await convex.mutation(api.threads.unarchive, {
        threadId: req.params.threadId as any,
      });
      res.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("no more than")) {
        res.status(409).json({ error: "max open threads reached" });
        return;
      }
      console.error("[ios] threads:unarchive failed", err);
      res.status(500).json({ error: "unarchive thread failed" });
    }
  });

  // DELETE /threads/:threadId — permanently drop a thread + its
  // messages + agent rows. Idempotent: deleting an already-deleted
  // thread still returns 200. 403 when the thread belongs to a
  // different device (defense-in-depth against bearer-token misuse).
  router.delete("/threads/:threadId", requireBearer, async (req: AuthedRequest, res) => {
    try {
      await convex.mutation(api.threads.remove, {
        threadId: req.params.threadId as any,
        expectedDeviceId: req.deviceId!,
      });
      res.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("forbidden")) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      console.error("[ios] threads:remove failed", err);
      res.status(500).json({ error: "remove thread failed" });
    }
  });

  // PATCH /threads/:threadId/icon — set the thread icon.
  router.patch("/threads/:threadId/icon", requireBearer, async (req: AuthedRequest, res) => {
    const { icon } = (req.body ?? {}) as { icon?: string };
    if (!icon || typeof icon !== "string") {
      res.status(400).json({ error: "icon required" });
      return;
    }
    try {
      await convex.mutation(api.threads.setIcon, {
        threadId: req.params.threadId as any,
        icon,
      });
      res.json({ ok: true });
    } catch (err) {
      console.error("[ios] threads:setIcon failed", err);
      res.status(500).json({ error: "set icon failed" });
    }
  });

  // POST /pair/create — phone-initiated, no auth, rate-limited per IP.
  // 10/hour is enough for ~3 reinstall-and-pair iterations during dev
  // without sliding into a hard wall, while still keeping brute force
  // expensive on the 6-digit code (~600K guesses needed).
  router.post("/pair/create", async (req, res) => {
    const ip = ipOf(req);
    if (!rateLimit(`pair-create:${ip}`, 10, 60 * 60 * 1000)) {
      res.status(429).json({ error: "too many pairing attempts" });
      return;
    }
    const { deviceId } = (req.body ?? {}) as { deviceId?: string };
    if (!deviceId || typeof deviceId !== "string" || deviceId.length < 8) {
      res.status(400).json({ error: "deviceId required" });
      return;
    }
    const code = generatePairingCode();
    const expiresAt = Date.now() + PAIR_TTL_MS;
    try {
      await convex.mutation(api.devices.createPairing, {
        deviceId,
        pairingCodeHash: sha256(code),
        pairingExpiresAt: expiresAt,
      });
      res.json({ deviceId, code, expiresAt });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // "already paired; revoke first" → 409
      if (msg.includes("already paired")) {
        res.status(409).json({ error: msg });
        return;
      }
      console.error("[ios] pair/create failed", err);
      res.status(500).json({ error: "pair create failed" });
    }
  });

  // POST /pair/check — phone polls; one-shot bearer pickup.
  router.post("/pair/check", (req, res) => {
    const { deviceId } = (req.body ?? {}) as { deviceId?: string };
    if (!deviceId) {
      res.status(400).json({ error: "deviceId required" });
      return;
    }
    const bearer = pickupBearer(deviceId);
    if (!bearer) {
      res.json({ paired: false });
      return;
    }
    res.json({ paired: true, bearerToken: bearer });
  });

  // POST /pair/consume — dashboard-initiated. Rate-limited per IP to
  // make brute-forcing 6-digit codes hopeless.
  router.post("/pair/consume", async (req, res) => {
    const ip = ipOf(req);
    if (!rateLimit(`pair-consume:${ip}`, 20, 60 * 60 * 1000)) {
      res.status(429).json({ error: "too many consume attempts" });
      return;
    }
    const { code, label } = (req.body ?? {}) as { code?: string; label?: string };
    if (!code || !/^\d{6}$/.test(code)) {
      res.status(400).json({ error: "6-digit code required" });
      return;
    }
    const bearerToken = generateBearerToken();
    try {
      const result = await convex.mutation(api.devices.consumePairing, {
        pairingCodeHash: sha256(code),
        bearerTokenHash: sha256(bearerToken),
        label,
      });
      stashBearer(result.deviceId, bearerToken);
      // Dashboard never sees the bearer — only the phone picks it up.
      res.json({ deviceId: result.deviceId, label: result.label });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("invalid code") ||
        msg.includes("expired") ||
        msg.includes("already paired")
      ) {
        res.status(400).json({ error: "code expired or invalid" });
        return;
      }
      console.error("[ios] pair/consume failed", err);
      res.status(500).json({ error: "pair consume failed" });
    }
  });

  // POST /inbound — authed.
  router.post("/inbound", requireBearer, async (req: AuthedRequest, res) => {
    const { text, threadId } = (req.body ?? {}) as { text?: string; threadId?: string };
    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "text required" });
      return;
    }
    const deviceId = req.deviceId!;

    let effectiveThreadId = threadId;
    if (!effectiveThreadId) {
      const { threadId: defaultId } = await convex.mutation(api.threads.ensureDefault, { deviceId });
      effectiveThreadId = defaultId;
    }

    const conversationId = `ios:${deviceId}:${effectiveThreadId}` as ConversationId;

    // Generate a single turnId here so the user-message row and every
    // assistant row the agent writes in this turn share the same grouping key.
    // If we let handleUserMessage generate its own turnId, the user row
    // (persisted below) would have turnId: undefined while assistant rows
    // carry a turnId, silently breaking any tooling that groups by turn.
    const turnId = randomId("turn");

    // Persist the inbound user message synchronously so we can return
    // the canonical Convex id to the client. The agent turn fires
    // fire-and-forget below — handleUserMessage skips its own persist
    // because we pass precomputedUserMessageId through.
    let userMessageId: string;
    try {
      userMessageId = await convex.mutation(api.messages.send, {
        conversationId,
        role: "user",
        content: text,
        threadId: effectiveThreadId as any,
        turnId,
      });
      broadcast("user_message", { conversationId, content: text });
    } catch (err) {
      console.error("[ios] /inbound persist failed", err);
      res.status(500).json({ error: "persist failed" });
      return;
    }

    runTurn({
      conversationId,
      from: `ios:${deviceId}`,
      content: text,
      threadId: effectiveThreadId,
      precomputedUserMessageId: userMessageId,
      precomputedTurnId: turnId,
    }).catch((err) => console.error("[ios] runTurn failed", err));

    res.json({ ok: true, conversationId, threadId: effectiveThreadId, userMessageId });
  });

  // ---------- Agents (read-only) ----------

  // GET /agents?threadId=<id>&status=<filter>&limit=N — list execution
  // agents that ran for the given thread, newest first. Drives the Live
  // Agents sheet on iOS. Requires the thread to belong to the authed
  // device (we scope via the conversationId `ios:<deviceId>:<threadId>`).
  router.get("/agents", requireBearer, async (req: AuthedRequest, res) => {
    const deviceId = req.deviceId!;
    const threadId = typeof req.query.threadId === "string" ? req.query.threadId : null;
    if (!threadId) {
      res.status(400).json({ error: "threadId required" });
      return;
    }
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const limit = Math.min(Number(req.query.limit ?? 30) || 30, 100);
    const conversationId = `ios:${deviceId}:${threadId}`;
    try {
      const agents = await convex.query(api.agents.listForConversation, {
        conversationId,
        status: status as any,
        limit,
      });
      res.json({ agents });
    } catch (err) {
      console.error("[ios] agents:list failed", err);
      res.status(500).json({ error: "agents fetch failed" });
    }
  });

  // GET /agents/:agentId — single agent row.
  router.get("/agents/:agentId", requireBearer, async (req: AuthedRequest, res) => {
    const agentId = req.params.agentId;
    try {
      const agent = await convex.query(api.agents.get, { agentId });
      if (!agent) {
        res.status(404).json({ error: "agent not found" });
        return;
      }
      // Defence-in-depth: ensure the agent's conversation belongs to this device.
      const deviceId = req.deviceId!;
      if (agent.conversationId && !agent.conversationId.startsWith(`ios:${deviceId}:`)) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      res.json({ agent });
    } catch (err) {
      console.error("[ios] agents:get failed", err);
      res.status(500).json({ error: "agent fetch failed" });
    }
  });

  // GET /agents/:agentId/logs — the tool/text/error timeline for an agent.
  router.get("/agents/:agentId/logs", requireBearer, async (req: AuthedRequest, res) => {
    const agentId = req.params.agentId;
    const limit = Math.min(Number(req.query.limit ?? 200) || 200, 500);
    try {
      const agent = await convex.query(api.agents.get, { agentId });
      if (!agent) {
        res.status(404).json({ error: "agent not found" });
        return;
      }
      const deviceId = req.deviceId!;
      if (agent.conversationId && !agent.conversationId.startsWith(`ios:${deviceId}:`)) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const logs = await convex.query(api.agents.getLogs, { agentId, limit });
      res.json({ agent, logs });
    } catch (err) {
      console.error("[ios] agents:logs failed", err);
      res.status(500).json({ error: "agent logs fetch failed" });
    }
  });

  // GET /files — authed. Returns all files (message attachments) across
  // every thread for the authed device, newest-first. Powers the Files
  // screen surfaced from the menu sheet.
  router.get("/files", requireBearer, async (req: AuthedRequest, res) => {
    const deviceId = req.deviceId!;
    const limit = Math.min(Number(req.query.limit ?? 100) || 100, 500);
    try {
      const files = await convex.query(api.messages.listFilesForDevice, {
        deviceId,
        limit,
      });
      res.json({ files });
    } catch (err) {
      console.error("[ios] files:list failed", err);
      res.status(500).json({ error: "files fetch failed" });
    }
  });

  // GET /messages — authed history fetch. Returns newest-first, like
  // the dashboard's existing messages.list. iOS client reverses for
  // chat-order display.
  router.get("/messages", requireBearer, async (req: AuthedRequest, res) => {
    const deviceId = req.deviceId!;
    const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
    const queryThreadId = typeof req.query.threadId === "string" ? req.query.threadId : null;

    try {
      let threadId = queryThreadId;
      if (!threadId) {
        const r = await convex.mutation(api.threads.ensureDefault, { deviceId });
        threadId = r.threadId;
      }
      const messages = await convex.query(api.messages.listForThread, {
        threadId: threadId as any,
        limit,
      });
      res.json({ threadId, messages });
    } catch (err) {
      console.error("[ios] messages:list failed", err);
      res.status(500).json({ error: "history fetch failed" });
    }
  });

  // GET /stream — authed SSE. Requires ?threadId=<id>.
  router.get("/stream", requireBearer, (req: AuthedRequest, res) => {
    const deviceId = req.deviceId!;
    const threadId = typeof req.query.threadId === "string" ? req.query.threadId : null;
    if (!threadId) {
      res.status(400).json({ error: "threadId required" });
      return;
    }
    const conversationId = `ios:${deviceId}:${threadId}`;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Disable Nagle's algorithm on the underlying TCP socket. Without
    // this, small writes (single SSE events) sit in the OS send-buffer
    // for up to ~200ms waiting to coalesce with more data — making
    // every reply feel laggy on iOS.
    req.socket.setNoDelay(true);
    // Also disable the socket's read timeout so the long-lived SSE
    // connection isn't killed mid-stream by Node's default.
    req.socket.setTimeout(0);

    res.write(`: connected to ${conversationId}\n\n`);
    // express-compress sometimes monkey-patches res to expose flush;
    // if so, call it.
    (res as { flush?: () => void }).flush?.();

    const unsubscribe = subscribe((msg: BroadcastMessage) => {
      if (!STREAM_EVENTS.has(msg.event)) return;
      const data = msg.data as { conversationId?: string } | null;
      if (!data || data.conversationId !== conversationId) return;
      res.write(`event: ${msg.event}\n`);
      res.write(`data: ${JSON.stringify(msg.data)}\n\n`);
      (res as { flush?: () => void }).flush?.();
    });

    const heartbeat = setInterval(() => {
      res.write(`: ping\n\n`);
      (res as { flush?: () => void }).flush?.();
    }, 25_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  // GET /fanout — authed, device-scoped SSE. Forwards a single
  // `thread_activity` event for any `assistant_message` or
  // `thread_icon` broadcast on this device's threads, so iOS can
  // mark inactive threads unread (or update their icon) without
  // opening one SSE per open thread.
  router.get("/fanout", requireBearer, (req: AuthedRequest, res) => {
    const deviceId = req.deviceId!;
    const prefix = `ios:${deviceId}:`;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    req.socket.setNoDelay(true);
    req.socket.setTimeout(0);

    res.write(`: fanout for ${deviceId}\n\n`);
    (res as { flush?: () => void }).flush?.();

    const unsubscribe = subscribe((msg: BroadcastMessage) => {
      if (msg.event !== "assistant_message" && msg.event !== "thread_icon") return;
      const data = msg.data as { conversationId?: string } | null;
      if (!data || typeof data.conversationId !== "string") return;
      if (!data.conversationId.startsWith(prefix)) return;
      const threadId = data.conversationId.slice(prefix.length);
      if (!threadId) return;
      const kind = msg.event === "assistant_message" ? "message" : "icon";
      const icon = msg.event === "thread_icon"
        ? (msg.data as { icon?: string }).icon
        : undefined;
      const payload = { threadId, kind, ...(icon ? { icon } : {}) };
      res.write(`event: thread_activity\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
      (res as { flush?: () => void }).flush?.();
    });

    const heartbeat = setInterval(() => {
      res.write(`: ping\n\n`);
      (res as { flush?: () => void }).flush?.();
    }, 25_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  return router;
}
