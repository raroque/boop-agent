import express from "express";
import {
  authorizeToolkit,
  CURATED_TOOLKITS,
  disconnectToolkit,
  getComposio,
  listConnectedToolkits,
} from "./composio.js";
import { refreshIntegrations } from "./integrations/registry.js";

export function createComposioRouter(): express.Router {
  const router = express.Router();

  router.get("/status", (_req, res) => {
    res.json({ enabled: Boolean(getComposio()) });
  });

  router.get("/toolkits", async (_req, res) => {
    try {
      const connected = await listConnectedToolkits();
      const byslug = new Map(connected.map((c) => [c.slug, c]));
      const curated = CURATED_TOOLKITS.map((t) => {
        const c = byslug.get(t.slug);
        return {
          slug: t.slug,
          displayName: t.displayName,
          connected: c?.status === "ACTIVE",
          status: c?.status ?? null,
          accountLabel: c?.accountLabel ?? null,
          connectionId: c?.connectionId ?? null,
        };
      });
      // Non-curated toolkits the user may have connected out-of-band.
      const extras = connected
        .filter((c) => !CURATED_TOOLKITS.some((t) => t.slug === c.slug))
        .map((c) => ({
          slug: c.slug,
          displayName: humanize(c.slug),
          connected: c.status === "ACTIVE",
          status: c.status,
          accountLabel: c.accountLabel ?? null,
          connectionId: c.connectionId,
        }));
      res.json({ enabled: Boolean(getComposio()), toolkits: [...curated, ...extras] });
    } catch (err) {
      console.error("[composio-routes] list failed", err);
      res.status(500).json({ error: String(err) });
    }
  });

  router.post("/toolkits/:slug/authorize", async (req, res) => {
    const slug = req.params.slug;
    try {
      const result = await authorizeToolkit(slug);
      res.json(result);
    } catch (err) {
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

  router.post("/refresh", async (_req, res) => {
    try {
      await refreshIntegrations();
      res.json({ ok: true });
    } catch (err) {
      console.error("[composio-routes] refresh failed", err);
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}

function humanize(slug: string): string {
  return slug
    .split(/[-_]/g)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}
