import express from "express";
import {
  authorizeToolkit,
  ComposioNeedsAuthConfigError,
  CURATED_TOOLKITS,
  disconnectToolkit,
  displayNameFor,
  getComposio,
  listConnectedToolkits,
  listToolkitMeta,
  listToolkitSlugsWithAuthConfig,
  listToolsForToolkit,
  renameConnection,
} from "./composio.js";
import { refreshIntegrations } from "./integrations/registry.js";
import { getStoredWebhookSecret } from "./composio-webhook.js";
import { handleEmailEvent } from "./proactive-email.js";

export function createComposioRouter(): express.Router {
  const router = express.Router();

  router.get("/status", (_req, res) => {
    res.json({ enabled: Boolean(getComposio()) });
  });

  router.get("/toolkits", async (_req, res) => {
    try {
      const [connected, configured, meta] = await Promise.all([
        listConnectedToolkits(),
        listToolkitSlugsWithAuthConfig(),
        listToolkitMeta(),
      ]);

      const connectionsBySlug = new Map<string, typeof connected>();
      for (const c of connected) {
        const arr = connectionsBySlug.get(c.slug) ?? [];
        arr.push(c);
        connectionsBySlug.set(c.slug, arr);
      }
      // Stable ordering: oldest connection first.
      for (const arr of connectionsBySlug.values()) {
        arr.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
      }

      const toConnectionView = (c: (typeof connected)[number]) => ({
        id: c.connectionId,
        status: c.status,
        alias: c.alias ?? null,
        accountLabel: c.accountLabel ?? null,
        accountEmail: c.accountEmail ?? null,
        accountName: c.accountName ?? null,
        accountAvatarUrl: c.accountAvatarUrl ?? null,
        createdAt: c.createdAt ?? null,
      });

      const curated = CURATED_TOOLKITS.map((t) => {
        const m = meta.get(t.slug);
        const conns = connectionsBySlug.get(t.slug) ?? [];
        return {
          slug: t.slug,
          displayName: t.displayName,
          authMode: t.authMode,
          hasAuthConfig: configured.has(t.slug),
          logoUrl: m?.logo ?? null,
          description: m?.description ?? null,
          toolCount: m?.toolsCount ?? null,
          connections: conns.map(toConnectionView),
        };
      });

      const extras = [...connectionsBySlug.entries()]
        .filter(([slug]) => !CURATED_TOOLKITS.some((t) => t.slug === slug))
        .map(([slug, conns]) => {
          const m = meta.get(slug);
          // Non-curated toolkit — we don't actually know its auth mode from
          // here. Infer: if an auth config exists on this account, the user
          // set it up themselves (BYO). Otherwise assume managed (it got
          // connected without one, which only works for Composio-managed).
          const authMode: "managed" | "byo" = configured.has(slug) ? "byo" : "managed";
          return {
            slug,
            displayName: m?.name ?? displayNameFor(slug),
            authMode,
            hasAuthConfig: configured.has(slug),
            logoUrl: m?.logo ?? null,
            description: m?.description ?? null,
            toolCount: m?.toolsCount ?? null,
            connections: conns.map(toConnectionView),
          };
        });

      res.json({ enabled: Boolean(getComposio()), toolkits: [...curated, ...extras] });
    } catch (err) {
      console.error("[composio-routes] list failed", err);
      res.status(500).json({ error: String(err) });
    }
  });

  router.get("/toolkits/:slug/tools", async (req, res) => {
    try {
      const tools = await listToolsForToolkit(req.params.slug);
      res.json({ tools });
    } catch (err) {
      console.error(`[composio-routes] list tools for ${req.params.slug} failed`, err);
      res.status(500).json({ error: String(err) });
    }
  });

  router.post("/toolkits/:slug/authorize", async (req, res) => {
    const slug = req.params.slug;
    const alias = typeof req.body?.alias === "string" ? req.body.alias : undefined;
    try {
      const result = await authorizeToolkit(slug, alias ? { alias } : undefined);
      res.json(result);
    } catch (err) {
      if (err instanceof ComposioNeedsAuthConfigError) {
        console.warn(`[composio-routes] ${slug} needs an auth config`);
        res.status(409).json({
          error: err.message,
          needsAuthConfig: true,
          toolkit: slug,
          setupUrl: `https://dashboard.composio.dev`,
        });
        return;
      }
      console.error(`[composio-routes] authorize ${slug} failed`, err);
      res.status(500).json({ error: String(err) });
    }
  });

  router.post("/toolkits/:slug/disconnect", async (req, res) => {
    const slug = req.params.slug;
    const connectionId = req.body?.connectionId as string | undefined;
    if (!connectionId) {
      res.status(400).json({ error: "connectionId required in body" });
      return;
    }
    try {
      await disconnectToolkit(connectionId);
      await refreshIntegrations();
      res.json({ ok: true });
    } catch (err) {
      console.error(`[composio-routes] disconnect ${slug} failed`, err);
      res.status(500).json({ error: String(err) });
    }
  });

  router.post("/connections/:id/rename", async (req, res) => {
    const id = req.params.id;
    const alias = typeof req.body?.alias === "string" ? req.body.alias.trim() : "";
    if (!alias) {
      res.status(400).json({ error: "alias required in body" });
      return;
    }
    try {
      await renameConnection(id, alias);
      res.json({ ok: true });
    } catch (err) {
      console.error(`[composio-routes] rename ${id} failed`, err);
      res.status(500).json({ error: String(err) });
    }
  });

  router.post("/refresh", async (_req, res) => {
    try {
      await refreshIntegrations();
      res.json({ ok: true });
    } catch (err) {
      console.error("[composio-routes] refresh failed", err);
      res.status(500).json({ error: String(err) });
    }
  });

  // Composio webhook receiver. The raw-body parser is mounted in
  // server/index.ts BEFORE express.json (otherwise the JSON parser would
  // consume the stream first and we'd lose the bytes needed for HMAC
  // verification). Respond 200 fast — Composio only retries on non-2xx, so
  // post-ack failures in the async dispatch don't trigger redeliveries.
  router.post(
    "/webhook",
    async (req, res) => {
      const composio = getComposio();
      if (!composio) {
        res.status(503).json({ error: "composio disabled" });
        return;
      }
      const id = String(req.header("webhook-id") ?? "");
      const signature = String(req.header("webhook-signature") ?? "");
      const timestamp = String(req.header("webhook-timestamp") ?? "");
      const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf-8") : "";
      if (!id || !signature || !timestamp || !rawBody) {
        res.status(400).json({ error: "missing webhook headers/body" });
        return;
      }
      const secret = await getStoredWebhookSecret();
      if (!secret) {
        console.warn("[composio-webhook] no stored secret; cannot verify — rejecting");
        res.status(401).end();
        return;
      }
      let verified;
      try {
        verified = await composio.triggers.verifyWebhook({
          id,
          signature,
          timestamp,
          payload: rawBody,
          secret,
        });
      } catch (err) {
        console.warn("[composio-webhook] signature verification failed", err);
        res.status(401).end();
        return;
      }
      // Ack immediately; dispatch is fire-and-forget.
      res.json({ ok: true });
      // Defensive null-guard: verifyWebhook normally throws on bad
      // signature, but if a future SDK version resolves with a falsy /
      // payload-less result instead, accessing verified.payload would crash
      // post-ack and surface as an unhandled rejection.
      const payload = verified?.payload;
      if (!payload) {
        console.warn("[composio-webhook] verified result had no payload; skipping dispatch");
        return;
      }
      Promise.resolve()
        .then(() => handleEmailEvent(payload))
        .catch((err) => console.error("[composio-webhook] dispatch failed", err));
    },
  );

  return router;
}
