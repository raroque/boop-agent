import express from "express";
import { execa } from "execa";
import { browserBaseArgs, getBrowserEnv, PROFILE_DIR } from "./browser/config.js";
import {
  ensureStealthChrome,
  stopStealthChromeAndWait,
} from "./browser/stealth-launcher.js";
import {
  importCookiesForService,
  listDailyProfiles,
  scanProfile,
  SERVICES,
  verifyService,
} from "./browser/cookies.js";
import { runningAgentIds } from "./execution-agent.js";
import { convex } from "./convex-client.js";
import { api } from "../convex/_generated/api.js";

interface BrowserStatus {
  installed: boolean;
  cliVersion: string | null;
  chromeVersion: string | null;
  raw?: string;
}

async function getStatus(): Promise<BrowserStatus> {
  try {
    const r = await execa("agent-browser", ["doctor"], {
      preferLocal: true,
      timeout: 15_000,
      reject: false,
    });
    const raw = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const cliMatch = raw.match(/CLI version\s+([\d.]+)/);
    const chromeMatch = raw.match(/Google Chrome for Testing\s+([\d.]+)/);
    return {
      installed: Boolean(chromeMatch),
      cliVersion: cliMatch?.[1] ?? null,
      chromeVersion: chromeMatch?.[1] ?? null,
    };
  } catch (err) {
    return {
      installed: false,
      cliVersion: null,
      chromeVersion: null,
      raw: err instanceof Error ? err.message : String(err),
    };
  }
}

export function createBrowserRouter(): express.Router {
  const router = express.Router();

  router.get("/status", async (_req, res) => {
    res.json(await getStatus());
  });

  router.post("/install", async (_req, res) => {
    // Chrome for Testing is ~150MB. Bound at 5min — covers slow connections
    // without leaving the request hanging forever if something is wedged.
    try {
      const r = await execa("agent-browser", ["install"], {
        preferLocal: true,
        timeout: 5 * 60_000,
        reject: false,
      });
      const after = await getStatus();
      res.json({
        ok: r.exitCode === 0 && after.installed,
        exitCode: r.exitCode,
        output: `${r.stdout ?? ""}\n${r.stderr ?? ""}`.trim().slice(-4000),
        status: after,
      });
    } catch (err) {
      res
        .status(500)
        .json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/cookies/profiles", async (_req, res) => {
    try {
      const profiles = listDailyProfiles().map((p) => ({
        dir: p.dir,
        name: p.name,
        userName: p.userName,
      }));
      res.json({ profiles });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  router.get("/cookies/scan", async (req, res) => {
    const profile = typeof req.query.profile === "string" ? req.query.profile : "";
    if (!profile) {
      res.status(400).json({ error: "profile query param required" });
      return;
    }
    try {
      const services = scanProfile(profile);
      const imports = await convex.query(api.cookieImports.list, {});
      res.json({ profile, services, imports });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  router.post("/cookies/import", async (req, res) => {
    const profile = typeof req.body?.profile === "string" ? req.body.profile.trim() : "";
    const service = typeof req.body?.service === "string" ? req.body.service.trim() : "";
    const verify = req.body?.verify !== false; // default on
    if (!profile || !service) {
      res.status(400).json({ error: "profile and service required" });
      return;
    }
    if (!SERVICES.some((s) => s.id === service)) {
      res.status(400).json({ error: `unknown service: ${service}` });
      return;
    }

    // Restarting Chrome would kill any tab a sub-agent is currently using.
    // Refuse rather than wedge an in-flight task.
    if (runningAgentIds().length > 0) {
      res.status(409).json({
        error: "browser is in use by a sub-agent — try again when it finishes",
        runningAgents: runningAgentIds(),
      });
      return;
    }

    try {
      // Make sure boop Chrome was at least bootstrapped so its profile dir
      // and Cookies DB schema exist, THEN stop it for the SQLite write.
      await ensureStealthChrome();
      await stopStealthChromeAndWait();

      const result = importCookiesForService(profile, service);

      // Re-boot Chrome with the new cookies in place.
      await ensureStealthChrome();

      let verified: {
        state: "logged_in" | "needs_challenge" | "not_logged_in";
        finalUrl?: string;
        title?: string;
      } | null = null;
      if (verify) {
        try {
          const v = await verifyService(service);
          verified = { state: v.state, finalUrl: v.finalUrl, title: v.title };
        } catch (err) {
          console.warn("[cookies] verify failed:", err);
        }
      }

      // Read the user_name off the source profile so the UI can show
      // "Active as user@example.com" without a separate scan call.
      const sp = listDailyProfiles().find((p) => p.dir === profile);
      const identity = sp?.userName ?? undefined;

      await convex.mutation(api.cookieImports.record, {
        service,
        sourceProfile: profile,
        identity,
        cookieCount: result.imported,
        // Only treat the green "Active" path as verifiedOk; both
        // not_logged_in and needs_challenge are explicit "do something"
        // states the UI should distinguish.
        verifiedOk: verified ? verified.state === "logged_in" : undefined,
      });

      res.json({
        ok: true,
        imported: result.imported,
        identity,
        verified,
      });
    } catch (err) {
      // Best-effort restart even on error so we don't leave Chrome stopped.
      try {
        await ensureStealthChrome();
      } catch {
        /* ignore — surface the original error */
      }
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  router.post("/login", async (req, res) => {
    const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
    if (!url) {
      res.status(400).json({ error: "url required" });
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      res.status(400).json({ error: "invalid url" });
      return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      res.status(400).json({ error: "url must be http(s)" });
      return;
    }
    // Make sure stealth Chrome is up + connected, then open the URL in a tab.
    // Stealth bootstrap is awaited so a 200 response means Chrome is actually
    // open on the user's screen (not just queued).
    try {
      await ensureStealthChrome();
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    const child = execa("agent-browser", [...browserBaseArgs(), "open", parsed.toString()], {
      preferLocal: true,
      timeout: 30_000,
      reject: false,
      env: await getBrowserEnv(),
    });
    child.catch((err) => console.error("[browser-login] post-launch error", err));
    res.json({ ok: true, url: parsed.toString(), profile: PROFILE_DIR });
  });

  return router;
}
