// Composio webhook subscription management. The JS SDK doesn't surface the
// /api/v3.1/webhook_subscriptions endpoints, so we hit them via fetch directly.
// Project-level: at most one subscription per project (POST returns 409 if one
// exists). PATCH is the right tool when the URL changes (ngrok rotation).
import { api } from "../convex/_generated/api.js";
import { convex } from "./convex-client.js";

const COMPOSIO_API_BASE = "https://backend.composio.dev";
const SUBSCRIPTIONS_PATH = "/api/v3.1/webhook_subscriptions";

const SETTINGS_SECRET_KEY = "composio_webhook_secret";
const SETTINGS_SUBSCRIPTION_ID_KEY = "composio_webhook_subscription_id";

export type WebhookEvent =
  | "composio.trigger.message"
  | "composio.connected_account.expired"
  | "composio.trigger.disabled";

export type WebhookVersion = "V1" | "V2" | "V3";

export interface WebhookSubscription {
  id: string;
  webhook_url: string;
  version: WebhookVersion;
  enabled_events: WebhookEvent[];
  // `secret` is only returned on POST. GET / PATCH responses redact it, which
  // is why we mirror it into the Convex settings table on creation.
  secret?: string;
  created_at: string;
  updated_at: string;
}

const DEFAULT_EVENTS: WebhookEvent[] = [
  "composio.trigger.message",
  "composio.connected_account.expired",
];

function apiKey(): string {
  const k = process.env.COMPOSIO_API_KEY;
  if (!k) throw new Error("[composio-webhook] COMPOSIO_API_KEY not set");
  return k;
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const resp = await fetch(`${COMPOSIO_API_BASE}${path}`, {
    method,
    headers: {
      "x-api-key": apiKey(),
      "content-type": "application/json",
      accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`[composio-webhook] ${method} ${path} ${resp.status}: ${text}`);
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

export async function listWebhookSubscriptions(): Promise<WebhookSubscription[]> {
  const resp = await request<{ items?: WebhookSubscription[] } | WebhookSubscription[]>(
    "GET",
    SUBSCRIPTIONS_PATH,
  );
  if (Array.isArray(resp)) return resp;
  return resp.items ?? [];
}

export async function createWebhookSubscription(opts: {
  webhook_url: string;
  enabled_events?: WebhookEvent[];
  version?: WebhookVersion;
}): Promise<WebhookSubscription> {
  return await request<WebhookSubscription>("POST", SUBSCRIPTIONS_PATH, {
    webhook_url: opts.webhook_url,
    enabled_events: opts.enabled_events ?? DEFAULT_EVENTS,
    version: opts.version ?? "V3",
  });
}

export async function updateWebhookSubscription(
  id: string,
  opts: { webhook_url?: string; enabled_events?: WebhookEvent[]; version?: WebhookVersion },
): Promise<WebhookSubscription> {
  return await request<WebhookSubscription>("PATCH", `${SUBSCRIPTIONS_PATH}/${id}`, opts);
}

export async function deleteWebhookSubscription(id: string): Promise<void> {
  await request<void>("DELETE", `${SUBSCRIPTIONS_PATH}/${id}`);
}

// High-level: bring the project subscription in line with `publicUrl`. POSTs
// if absent, PATCHes if present with a different URL, returns the existing
// record otherwise. Persists the secret on creation so the webhook handler
// can verify HMAC signatures across restarts.
export async function ensureWebhookSubscription(publicUrl: string): Promise<WebhookSubscription> {
  const target = `${publicUrl.replace(/\/$/, "")}/composio/webhook`;
  const existing = (await listWebhookSubscriptions())[0];
  if (!existing) {
    const created = await createWebhookSubscription({ webhook_url: target });
    // If persistence fails after the remote subscription is live we'd be
    // stuck — the URL is registered but we have no signing secret on file,
    // and on the next boot ensureWebhookSubscription would short-circuit on
    // the matching URL and never re-store the secret. Roll back the remote
    // side instead so the next attempt starts clean.
    try {
      if (created.secret) {
        await convex.mutation(api.settings.set, {
          key: SETTINGS_SECRET_KEY,
          value: created.secret,
        });
      }
      await convex.mutation(api.settings.set, {
        key: SETTINGS_SUBSCRIPTION_ID_KEY,
        value: created.id,
      });
    } catch (err) {
      console.error(
        `[composio-webhook] failed to persist subscription metadata; rolling back ${created.id}`,
        err,
      );
      try {
        await deleteWebhookSubscription(created.id);
      } catch (cleanupErr) {
        console.error(
          `[composio-webhook] cleanup of orphaned subscription ${created.id} failed`,
          cleanupErr,
        );
      }
      throw err;
    }
    console.log(`[composio-webhook] subscription created: ${created.id} → ${target}`);
    return created;
  }
  if (existing.webhook_url !== target) {
    const patched = await updateWebhookSubscription(existing.id, { webhook_url: target });
    console.log(`[composio-webhook] subscription updated: ${patched.id} → ${target}`);
    return patched;
  }
  console.log(`[composio-webhook] subscription already current: ${existing.id} → ${target}`);
  return existing;
}

// Short in-process cache so the webhook hot path doesn't query Convex on
// every incoming event. The secret only changes on a re-subscribe, which
// is rare; a 60s TTL is short enough that a rotation propagates quickly
// without making every webhook eat a network round-trip.
let secretCache: { at: number; value: string | null } | null = null;
const SECRET_CACHE_TTL_MS = 60_000;

export async function getStoredWebhookSecret(): Promise<string | null> {
  if (secretCache && Date.now() - secretCache.at < SECRET_CACHE_TTL_MS) {
    return secretCache.value;
  }
  const value = await convex.query(api.settings.get, { key: SETTINGS_SECRET_KEY });
  secretCache = { at: Date.now(), value };
  return value;
}
