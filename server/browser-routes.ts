import express from "express";
import type { NextFunction, Request, Response } from "express";
import { clearBrowserSettingsCache, getBrowserSettings } from "./runtime-config.js";
import {
  closeLocalBrowser,
  getBrowserStatus,
  installPatchrightChrome,
  launchLocalBrowser,
} from "./browser/launcher.js";

function readUrl(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function browserErrorStatus(err: unknown): number {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("Local browser use is disabled") ? 409 : 500;
}

function firstHeaderValue(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(",")[0]?.trim() ?? "";
}

function headerValues(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(",") : value;
  return raw
    ? raw
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
    : [];
}

function hostWithoutPort(value: string): string {
  const host = value.trim().toLowerCase();
  if (!host) return "";
  if (host.startsWith("[") && host.includes("]")) {
    return host.slice(1, host.indexOf("]"));
  }
  if ((host.match(/:/g) ?? []).length > 1) return host;
  return host.split(":")[0] ?? "";
}

function isLocalHost(value: string): boolean {
  const host = hostWithoutPort(value);
  return host === "localhost" || host === "::1" || host === "0:0:0:0:0:0:0:1" || /^127\./.test(host);
}

function isLocalAddress(value: string): boolean {
  const address = firstHeaderValue(value).replace(/^::ffff:/, "");
  return isLocalHost(address);
}

export function isLocalBrowserControlRequest(
  headers: Record<string, string | string[] | undefined>,
  remoteAddress?: string,
): boolean {
  if (remoteAddress !== undefined && !isLocalAddress(remoteAddress)) return false;

  const forwardedFor = headerValues(headers["x-forwarded-for"]);
  if (forwardedFor.length > 0 && !forwardedFor.every(isLocalAddress)) return false;

  const forwardedHost = headerValues(headers["x-forwarded-host"]);
  if (forwardedHost.length > 0 && !forwardedHost.every(isLocalHost)) return false;

  const host = firstHeaderValue(headers.host);
  return !host || isLocalHost(host);
}

function requireLocalBrowserControl(req: Request, res: Response, next: NextFunction): void {
  if (isLocalBrowserControlRequest(req.headers, req.socket.remoteAddress ?? "")) {
    next();
    return;
  }
  res.status(403).json({
    ok: false,
    error: "Local browser control routes are only available from localhost.",
  });
}

export function createBrowserRouter(): express.Router {
  const router = express.Router();
  router.use(requireLocalBrowserControl);

  router.get("/status", async (_req, res) => {
    try {
      res.json(await getBrowserStatus());
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post("/launch", async (req, res) => {
    clearBrowserSettingsCache();
    try {
      const result = await launchLocalBrowser({
        url: readUrl(req.body?.url),
        forceVisible: req.body?.forceVisible === true,
        relaunch: req.body?.relaunch === true,
      });
      res.json(result);
    } catch (err) {
      res.status(browserErrorStatus(err)).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  router.post("/login", async (req, res) => {
    clearBrowserSettingsCache();
    try {
      const settings = await getBrowserSettings();
      if (!settings.enabled) {
        res.status(409).json({
          ok: false,
          error: "Local browser use is off. Turn it on in Settings first.",
        });
        return;
      }
      if (!settings.loginHandoffEnabled) {
        res.status(409).json({
          ok: false,
          error: "Login handoff is off. Turn on \"Spawn an instance to log in\" first.",
        });
        return;
      }
      const result = await launchLocalBrowser({
        url: readUrl(req.body?.url),
        forceVisible: true,
        relaunch: req.body?.relaunch === true,
      });
      res.json({
        ...result,
        message: "I need you to log in first. I’ve spawned an instance on your machine.",
      });
    } catch (err) {
      res.status(browserErrorStatus(err)).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  router.post("/close", async (_req, res) => {
    clearBrowserSettingsCache();
    try {
      await closeLocalBrowser();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post("/install", async (_req, res) => {
    try {
      const result = await installPatchrightChrome();
      res.json(result);
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
