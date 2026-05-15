import { Router, type NextFunction, type Request, type Response } from "express";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { runTurn } from "../channels/index.js";
import { subscribe, type BroadcastMessage } from "../broadcast.js";
import type { ConversationId } from "../channels/types.js";
import { convex } from "../convex-client.js";
import { api } from "../../convex/_generated/api.js";

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
  "thinking",
  "error",
]);

// ---------- router ----------

export function createIosRouter(): Router {
  const router = Router();

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
    const { text } = (req.body ?? {}) as { text?: string };
    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "text required" });
      return;
    }
    const deviceId = req.deviceId!;
    const conversationId = `ios:${deviceId}` as ConversationId;
    runTurn({
      conversationId,
      from: `ios:${deviceId}`,
      content: text,
    }).catch((err) => console.error("[ios] runTurn failed", err));
    res.json({ ok: true, conversationId });
  });

  // GET /messages — authed history fetch. Returns newest-first, like
  // the dashboard's existing messages.list. iOS client reverses for
  // chat-order display.
  router.get("/messages", requireBearer, async (req: AuthedRequest, res) => {
    const deviceId = req.deviceId!;
    const conversationId = `ios:${deviceId}`;
    const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
    try {
      const messages = await convex.query(api.messages.list, {
        conversationId,
        limit,
      });
      res.json({ conversationId, messages });
    } catch (err) {
      console.error("[ios] messages.list failed", err);
      res.status(500).json({ error: "history fetch failed" });
    }
  });

  // GET /stream — authed SSE.
  router.get("/stream", requireBearer, (req: AuthedRequest, res) => {
    const deviceId = req.deviceId!;
    const conversationId = `ios:${deviceId}`;
    // Sanity: the phone may also pass conversationId for clarity,
    // but we always derive it from the authenticated deviceId.
    const requested = String(req.query.conversationId ?? conversationId);
    if (requested !== conversationId) {
      res.status(403).json({ error: "conversationId mismatch" });
      return;
    }

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

  return router;
}
