import { Router } from "express";
import {
  saveCredential,
  listCredentials,
  deleteCredential,
} from "./browser/credentials.js";
import type { Id } from "../convex/_generated/dataModel.js";

// REST surface for the Credentials section of the debug dashboard. Mounted
// at /credentials (proxied as /api/credentials from the Vite dev server).
// The dashboard sits behind the same trust boundary as everything else on
// this server, so no auth gate beyond network reach.

export function createCredentialRouter(): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    try {
      const configured = Boolean(process.env.BROWSER_CREDENTIAL_KEY);
      if (!configured) {
        res.json({ configured: false, credentials: [] });
        return;
      }
      const credentials = await listCredentials();
      res.json({ configured: true, credentials });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  router.post("/", async (req, res) => {
    try {
      const { label, host, username, password, totpSecret, notes } = req.body ?? {};
      if (typeof label !== "string" || label.trim().length === 0) {
        res.status(400).json({ error: "label is required" });
        return;
      }
      if (typeof host !== "string" || host.trim().length === 0) {
        res.status(400).json({ error: "host is required" });
        return;
      }
      if (typeof username !== "string" || username.length === 0) {
        res.status(400).json({ error: "username is required" });
        return;
      }
      if (typeof password !== "string" || password.length === 0) {
        res.status(400).json({ error: "password is required" });
        return;
      }
      await saveCredential({
        label,
        host,
        username,
        password,
        totpSecret: typeof totpSecret === "string" && totpSecret.length > 0 ? totpSecret : undefined,
        notes: typeof notes === "string" ? notes : undefined,
      });
      res.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  });

  router.delete("/:id", async (req, res) => {
    try {
      await deleteCredential(req.params.id as Id<"userCredentials">);
      res.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  return router;
}
