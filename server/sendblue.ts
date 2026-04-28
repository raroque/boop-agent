import express from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { api } from "../convex/_generated/api.js";
import { convex } from "./convex-client.js";
import { handleUserMessage } from "./interaction-agent.js";
import { broadcast } from "./broadcast.js";

const API_BASE = "https://api.sendblue.com/api";
const MAX_CHUNK = 2900;

// NOTE: As of 2026-04, Sendblue echoes the raw secret in `sb-signing-secret`
// rather than sending an HMAC digest. The HMAC verification path below exists
// for forward-compatibility if Sendblue (or a replacement provider) adds
// proper HMAC-SHA256 payload signing in the future.
const SIGNATURE_HEADERS = [
  "x-sendblue-signature",
  "signature",
  "x-webhook-signature",
];

// Shared-secret carriers. Sendblue currently puts the raw signing secret in
// `sb-signing-secret`; the generic alternate covers proxied upstreams that
// rename the header. Use only on trusted transport (TLS).
const SHARED_SECRET_HEADERS = [
  "sb-signing-secret",
  "x-webhook-secret",
];

function bufferEquals(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function decodeSignature(value: string): Buffer | null {
  const trimmed = value.trim().replace(/^sha256=/i, "");
  // Hex-encoded: 64 hex chars = 32 bytes
  if (/^[0-9a-f]+$/i.test(trimmed) && trimmed.length === 64) {
    return Buffer.from(trimmed, "hex");
  }
  // Base64-encoded: decode and verify exactly 32 bytes
  if (/^[A-Za-z0-9+/=_-]+$/.test(trimmed)) {
    const normalized = trimmed.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(normalized, "base64");
    if (decoded.length === 32) return decoded;
    return null;
  }

  return null;
}

function verifyHmac(rawBody: Buffer, secret: string, signatureHeader: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const provided = decodeSignature(signatureHeader);
  if (!provided) return false;
  return bufferEquals(expected, provided);
}

function verifySharedSecret(provided: string, secret: string): boolean {
  // HMAC both sides so the comparison is always fixed-length (32 bytes) and
  // does not leak the real secret's length via an early length-mismatch
  // return path.
  const a = createHmac("sha256", "webhook-verify").update(provided).digest();
  const b = createHmac("sha256", "webhook-verify").update(secret).digest();
  return timingSafeEqual(a, b);
}

function clientIp(req: express.Request): string {
  // Use req.ip which respects Express's `trust proxy` setting.
  // When trust proxy is not configured, req.ip returns the socket address
  // and ignores X-Forwarded-For, preventing log spoofing.
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

function verifyWebhookRequest(
  req: express.Request,
): express.RequestHandler | true {
  const secret = process.env.SENDBLUE_SIGNING_SECRET;
  if (!secret) {
    // Graceful degradation — startup already warned. Allow through.
    return true;
  }

  const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody;

  for (const name of SIGNATURE_HEADERS) {
    const header = req.headers[name];
    const value = Array.isArray(header) ? header[0] : header;
    if (typeof value === "string" && value.length > 0) {
      if (!rawBody) {
        // HMAC header is present but no raw body to verify against — refuse.
        return (_req, res) => {
          res.status(400).json({ error: "bad request" });
        };
      }
      if (verifyHmac(rawBody, secret, value)) return true;
      const ip = clientIp(req);
      console.warn(
        `[security] sendblue webhook signature verification FAILED (header=${name}, ip=${ip})`,
      );
      return (_req, res) => {
        res.status(401).json({ error: "unauthorized" });
      };
    }
  }

  // Shared-secret path. Sendblue's actual delivery uses `sb-signing-secret`;
  // we also accept a generic alternate for proxied upstreams. Header-only —
  // query parameters leak into access logs, proxy logs, and ngrok inspection.
  for (const name of SHARED_SECRET_HEADERS) {
    const header = req.headers[name];
    const value = Array.isArray(header) ? header[0] : header;
    if (typeof value === "string" && value.length > 0) {
      if (verifySharedSecret(value, secret)) return true;
      const ip = clientIp(req);
      console.warn(
        `[security] sendblue webhook shared-secret verification FAILED (header=${name}, ip=${ip})`,
      );
      return (_req, res) => {
        res.status(401).json({ error: "unauthorized" });
      };
    }
  }

  const ip = clientIp(req);
  console.warn(
    `[security] sendblue webhook missing signature (ip=${ip})`,
  );
  return (_req, res) => {
    res.status(401).json({ error: "unauthorized" });
  };
}

function sendblueWebhookAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  const result = verifyWebhookRequest(req);
  if (result === true) {
    next();
    return;
  }
  result(req, res, next);
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?|```/g, ""))
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1 ($2)")
    .trim();
}

function chunk(text: string, size = MAX_CHUNK): string[] {
  if (text.length <= size) return [text];
  const out: string[] = [];
  let buf = "";
  for (const line of text.split(/\n/)) {
    if ((buf + "\n" + line).length > size) {
      if (buf) out.push(buf);
      buf = line;
    } else {
      buf = buf ? buf + "\n" + line : line;
    }
  }
  if (buf) out.push(buf);
  return out;
}

function headers(): Record<string, string> | null {
  const apiKey = process.env.SENDBLUE_API_KEY;
  const apiSecret = process.env.SENDBLUE_API_SECRET;
  if (!apiKey || !apiSecret) return null;
  return {
    "Content-Type": "application/json",
    "sb-api-key-id": apiKey,
    "sb-api-secret-key": apiSecret,
  };
}

function normalizeE164(n: string | undefined): string | undefined {
  if (!n) return undefined;
  const trimmed = n.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("+")) return trimmed;
  // Bare US-length numbers get a +1. Longer/shorter just get a leading +.
  if (/^\d{10}$/.test(trimmed)) return `+1${trimmed}`;
  if (/^\d{11,15}$/.test(trimmed)) return `+${trimmed}`;
  return trimmed;
}

export async function sendImessage(toNumber: string, text: string): Promise<void> {
  const h = headers();
  if (!h) {
    console.warn("[sendblue] missing credentials — not sending");
    return;
  }
  const from = normalizeE164(process.env.SENDBLUE_FROM_NUMBER);
  if (!from) {
    console.error(
      `[sendblue] SENDBLUE_FROM_NUMBER is not set. Run \`npm run sendblue:sync\` (pulls it from \`sendblue lines\`) or paste your provisioned number into .env.local, then restart \`npm run dev\`.`,
    );
    return;
  }
  const plain = stripMarkdown(text);
  for (const part of chunk(plain)) {
    const res = await fetch(`${API_BASE}/send-message`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ number: toNumber, content: part, from_number: from }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[sendblue] send failed ${res.status}: ${body}`);
      if (body.includes("missing required parameter") && body.includes("from_number")) {
        console.error(
          `[sendblue] → Set SENDBLUE_FROM_NUMBER in .env.local to your Sendblue-provisioned number and restart the server.`,
        );
      } else if (body.includes("Cannot send messages to self")) {
        console.error(
          `[sendblue] → SENDBLUE_FROM_NUMBER is your personal cell. It must be the Sendblue-provisioned number (the one people text TO).`,
        );
      } else if (body.includes("This phone number is not defined")) {
        console.error(
          `[sendblue] → Sendblue doesn't recognize from_number=${from}. Run \`npm run sendblue:sync\` to pull the correct one from \`sendblue lines\`, then restart the server.`,
        );
      }
    } else {
      console.log(`[sendblue] → sent ${part.length} chars to ${toNumber}`);
    }
  }
}

export async function sendTypingIndicator(toNumber: string): Promise<void> {
  const h = headers();
  if (!h) return;
  const from = process.env.SENDBLUE_FROM_NUMBER;
  try {
    await fetch(`${API_BASE}/send-typing-indicator`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ number: toNumber, from_number: from }),
    });
  } catch {
    /* non-fatal */
  }
}

export function startTypingLoop(toNumber: string): () => void {
  sendTypingIndicator(toNumber);
  const timer = setInterval(() => sendTypingIndicator(toNumber), 5000);
  return () => clearInterval(timer);
}

export function createSendblueRouter(): express.Router {
  const router = express.Router();

  router.post("/webhook", sendblueWebhookAuth, async (req, res) => {
    const { content, from_number, is_outbound, message_handle } = req.body ?? {};
    if (is_outbound || !content || !from_number) {
      res.json({ ok: true, skipped: true });
      return;
    }

    if (message_handle) {
      const { claimed } = await convex.mutation(api.sendblueDedup.claim, {
        handle: message_handle,
      });
      if (!claimed) {
        res.json({ ok: true, deduped: true });
        return;
      }
    }

    const conversationId = `sms:${from_number}`;
    const turnTag = Math.random().toString(36).slice(2, 8);
    const preview = content.length > 100 ? content.slice(0, 100) + "…" : content;
    console.log(`[turn ${turnTag}] ← ${from_number}: ${JSON.stringify(preview)}`);
    const start = Date.now();

    broadcast("message_in", { conversationId, content, from_number, handle: message_handle });
    res.json({ ok: true });

    const stopTyping = startTypingLoop(from_number);
    try {
      const reply = await handleUserMessage({
        conversationId,
        content,
        turnTag,
        onThinking: (t) => broadcast("thinking", { conversationId, t }),
      });
      if (reply) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        const replyPreview = reply.length > 100 ? reply.slice(0, 100) + "…" : reply;
        console.log(
          `[turn ${turnTag}] → reply (${elapsed}s, ${reply.length} chars): ${JSON.stringify(replyPreview)}`,
        );
        await sendImessage(from_number, reply);
        await convex.mutation(api.messages.send, {
          conversationId,
          role: "assistant",
          content: reply,
        });
      } else {
        console.log(`[turn ${turnTag}] → (no reply)`);
      }
    } catch (err) {
      console.error(`[turn ${turnTag}] handler error`, err);
    } finally {
      stopTyping();
    }
  });

  return router;
}
