import http2 from "node:http2";
import { createSign, createPrivateKey } from "node:crypto";
import { subscribe, type BroadcastMessage } from "./broadcast.js";
import { convex } from "./convex-client.js";
import { api } from "../convex/_generated/api.js";

/**
 * Apple Push Notification service (APNs) sender + subscriber.
 *
 * Token-based JWT auth (ES256 over the .p8 key). One HTTP/2 session per
 * environment ({development, production}), reconnected lazily. APS
 * payloads are minimal: alert title + body + threadId in `userInfo` for
 * deep-linking.
 *
 * Triggered by `broadcast()` events. Only `assistant_message` and
 * `proactive_notice` payloads with iOS-prefixed conversationIds reach
 * APNs — Sendblue / Telegram broadcasts are filtered out.
 *
 * On 410 Gone the device's `apnsDeviceToken` is cleared (token is dead).
 * On any other failure the push is dropped — best-effort delivery only;
 * SSE remains the source of truth for foreground delivery.
 */

// ---------- config ----------

interface ApnsConfig {
  teamId: string;
  keyId: string;
  privateKeyPem: string;
  bundleId: string;
}

let config: ApnsConfig | null = null;
let configChecked = false;

function loadConfig(): ApnsConfig | null {
  if (configChecked) return config;
  configChecked = true;

  const teamId = process.env.APNS_TEAM_ID?.trim();
  const keyId = process.env.APNS_KEY_ID?.trim();
  const bundleId = process.env.APNS_BUNDLE_ID?.trim() || "dev.boop.Boop";
  // APNS_PRIVATE_KEY accepts either the literal multi-line PEM (newlines
  // preserved) or the same PEM with `\n` escape sequences (the form most
  // dotenv loaders emit when round-tripping a multi-line value).
  const rawKey = process.env.APNS_PRIVATE_KEY?.trim();

  if (!teamId || !keyId || !rawKey) return null;
  const privateKeyPem = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;

  config = { teamId, keyId, privateKeyPem, bundleId };
  return config;
}

// ---------- JWT ----------

const JWT_TTL_MS = 50 * 60 * 1000; // Apple allows up to 60min; rotate at 50 to dodge clock skew.

interface CachedJwt {
  token: string;
  expiresAt: number;
}

let cachedJwt: CachedJwt | null = null;

function base64UrlEncode(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** Builds (or returns cached) ES256 JWT for the APNs provider connection.
 *  `iat` is current epoch seconds; Apple rejects tokens older than 1h. */
export function getJwt(now: number = Date.now(), forceRefresh = false): string {
  const cfg = loadConfig();
  if (!cfg) throw new Error("APNs config missing");
  if (!forceRefresh && cachedJwt && cachedJwt.expiresAt > now) return cachedJwt.token;

  const header = base64UrlEncode(JSON.stringify({ alg: "ES256", kid: cfg.keyId }));
  const claims = base64UrlEncode(
    JSON.stringify({ iss: cfg.teamId, iat: Math.floor(now / 1000) }),
  );
  const signingInput = `${header}.${claims}`;

  const key = createPrivateKey({ key: cfg.privateKeyPem, format: "pem" });
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  const derSignature = signer.sign({ key, dsaEncoding: "ieee-p1363" });
  const signature = base64UrlEncode(derSignature);

  const token = `${signingInput}.${signature}`;
  cachedJwt = { token, expiresAt: now + JWT_TTL_MS };
  return token;
}

// ---------- payload ----------

interface PushArgs {
  deviceToken: string;
  environment: "development" | "production";
  title: string;
  body: string;
  threadId?: string;
  conversationId?: string;
}

const ALERT_BODY_MAX = 240;

/** Builds the APS payload — kept lean (Apple caps at 4KB but the iOS
 *  notification UI truncates ~6 lines anyway). */
export function buildApsPayload(args: PushArgs): Record<string, unknown> {
  const body = args.body.length > ALERT_BODY_MAX
    ? args.body.slice(0, ALERT_BODY_MAX - 1).trimEnd() + "…"
    : args.body;
  return {
    aps: {
      alert: { title: args.title, body },
      sound: "default",
      "mutable-content": 1,
      "thread-id": args.threadId,
    },
    ...(args.threadId ? { threadId: args.threadId } : {}),
    ...(args.conversationId ? { conversationId: args.conversationId } : {}),
  };
}

// ---------- HTTP/2 ----------

type Environment = "development" | "production";

const HOSTS: Record<Environment, string> = {
  development: "https://api.sandbox.push.apple.com",
  production: "https://api.push.apple.com",
};

interface Session {
  client: http2.ClientHttp2Session;
  destroyAt: number;
}

const sessions: Partial<Record<Environment, Session>> = {};
const SESSION_TTL_MS = 55 * 60 * 1000; // Apple drops idle sessions after ~1h; rotate at 55min.

function getSession(env: Environment): http2.ClientHttp2Session {
  const existing = sessions[env];
  const now = Date.now();
  if (existing && !existing.client.closed && !existing.client.destroyed && existing.destroyAt > now) {
    return existing.client;
  }
  if (existing) {
    try { existing.client.close(); } catch { /* ignore */ }
  }
  const client = http2.connect(HOSTS[env]);
  client.on("error", (err) => {
    console.error(`[apns] session error (${env}):`, err.message);
  });
  client.on("close", () => {
    if (sessions[env]?.client === client) delete sessions[env];
  });
  sessions[env] = { client, destroyAt: now + SESSION_TTL_MS };
  return client;
}

/** Closes any open HTTP/2 sessions. Used by tests + shutdown hooks. */
export function shutdownApns(): void {
  for (const key of Object.keys(sessions) as Environment[]) {
    const s = sessions[key];
    if (s) {
      try { s.client.close(); } catch { /* ignore */ }
      delete sessions[key];
    }
  }
  cachedJwt = null;
}

/** Test-only: resets the cached config + JWT so a subsequent `getJwt`
 *  call re-reads `process.env`. Production code should never call this. */
export function __resetApnsConfigForTests(): void {
  config = null;
  configChecked = false;
  cachedJwt = null;
}

interface PushResult {
  status: number;
  reason?: string;
}

/** Low-level send. Resolves with the HTTP status + parsed `reason` (if
 *  any). Doesn't retry — that's the subscriber's job (one retry on
 *  ExpiredProviderToken / 403, then drop). */
async function sendOne(args: PushArgs): Promise<PushResult> {
  const cfg = loadConfig();
  if (!cfg) throw new Error("APNs config missing");

  const client = getSession(args.environment);
  const payload = JSON.stringify(buildApsPayload(args));
  const jwt = getJwt();

  return await new Promise<PushResult>((resolve, reject) => {
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${args.deviceToken}`,
      "authorization": `bearer ${jwt}`,
      "apns-topic": cfg.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
      "content-length": Buffer.byteLength(payload),
    });

    let status = 0;
    let body = "";

    req.on("response", (headers) => {
      status = Number(headers[":status"]) || 0;
    });
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => { body += chunk; });
    req.on("end", () => {
      let reason: string | undefined;
      if (body) {
        try {
          const parsed = JSON.parse(body) as { reason?: string };
          reason = parsed.reason;
        } catch { /* ignore */ }
      }
      resolve({ status, reason });
    });
    req.on("error", (err) => reject(err));
    req.write(payload);
    req.end();
  });
}

/** Public push entrypoint. Handles JWT-expiry retry once, surfaces 410
 *  to caller so they can evict the token. */
export async function push(args: PushArgs): Promise<PushResult> {
  let result: PushResult;
  try {
    result = await sendOne(args);
  } catch (err) {
    console.error("[apns] send error:", err instanceof Error ? err.message : err);
    return { status: 0, reason: "network" };
  }
  if (result.status === 403 && result.reason === "ExpiredProviderToken") {
    getJwt(Date.now(), true); // force rotate
    try {
      result = await sendOne(args);
    } catch (err) {
      console.error("[apns] retry error:", err instanceof Error ? err.message : err);
      return { status: 0, reason: "network" };
    }
  }
  return result;
}

// ---------- broadcast subscriber ----------

const IOS_PREFIX = "ios:";

/** Parses an iOS conversationId `ios:<deviceId>:<threadId>` and returns
 *  the parts; returns null on non-iOS or malformed ids. */
function parseIosConversationId(id: string): { deviceId: string; threadId: string } | null {
  if (!id.startsWith(IOS_PREFIX)) return null;
  const rest = id.slice(IOS_PREFIX.length);
  const colon = rest.indexOf(":");
  if (colon <= 0 || colon === rest.length - 1) return null;
  return { deviceId: rest.slice(0, colon), threadId: rest.slice(colon + 1) };
}

interface PushDeps {
  push: (args: PushArgs) => Promise<PushResult>;
  resolveTarget: (deviceId: string) => Promise<
    | { apnsDeviceToken: string; apnsEnvironment: Environment; label: string | undefined }
    | null
  >;
  clearToken: (token: string) => Promise<void>;
}

const defaultDeps: PushDeps = {
  push,
  resolveTarget: async (deviceId) => {
    const target = await convex.query(api.devices.apnsTargetForDevice, { deviceId });
    if (!target) return null;
    return {
      apnsDeviceToken: target.apnsDeviceToken,
      apnsEnvironment: target.apnsEnvironment as Environment,
      label: target.label ?? undefined,
    };
  },
  clearToken: async (token) => {
    await convex.mutation(api.devices.clearApnsTokenByToken, { apnsDeviceToken: token });
  },
};

const PUSHABLE_EVENTS = new Set(["assistant_message", "proactive_notice"]);

/** One-shot handler. Exported for tests so we can inject deps and skip
 *  the live broadcast bus. */
export async function handleBroadcastForApns(
  msg: BroadcastMessage,
  deps: PushDeps = defaultDeps,
): Promise<{ pushed: boolean; reason?: string }> {
  if (!PUSHABLE_EVENTS.has(msg.event)) return { pushed: false, reason: "skip:event" };
  const data = msg.data as { conversationId?: string; content?: string; summary?: string } | null;
  const conversationId = data?.conversationId;
  if (typeof conversationId !== "string") return { pushed: false, reason: "skip:no-conversation" };
  const parsed = parseIosConversationId(conversationId);
  if (!parsed) return { pushed: false, reason: "skip:non-ios" };

  const target = await deps.resolveTarget(parsed.deviceId);
  if (!target) return { pushed: false, reason: "skip:no-token" };

  const title = msg.event === "proactive_notice" ? "Boop" : target.label ?? "Boop";
  const body = (data?.content ?? data?.summary ?? "").trim() || "New message";

  const result = await deps.push({
    deviceToken: target.apnsDeviceToken,
    environment: target.apnsEnvironment,
    title,
    body,
    threadId: parsed.threadId,
    conversationId,
  });

  if (result.status === 410) {
    await deps.clearToken(target.apnsDeviceToken);
    return { pushed: false, reason: "cleared:410" };
  }
  if (result.status >= 200 && result.status < 300) {
    return { pushed: true };
  }
  return { pushed: false, reason: `apns:${result.status}:${result.reason ?? "unknown"}` };
}

let unsubscribe: (() => void) | null = null;

/** Boot-time init. No-op (with a single log line) when config is missing.
 *  Safe to call multiple times — subsequent calls re-register the
 *  subscriber so dev reloads don't leak listeners. */
export function initApns(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  shutdownApns();
  const cfg = loadConfig();
  if (!cfg) {
    console.log("[apns] disabled (config missing)");
    return;
  }
  unsubscribe = subscribe((msg) => {
    handleBroadcastForApns(msg).catch((err) => {
      console.error("[apns] handler error:", err instanceof Error ? err.message : err);
    });
  });
  console.log(`[apns] enabled (bundle=${cfg.bundleId})`);
}
