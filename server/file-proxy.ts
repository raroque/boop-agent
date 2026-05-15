// server/file-proxy.ts
//
// Self-hosted Convex returns storage URLs like
//   http://127.0.0.1:3210/api/storage/<uuid>
// pointing at the internal admin port — unreachable from Telegram's servers
// (which fetch sendDocument media) and from the user's phone. This module:
//   1. publicizeStorageUrl(): rewrites an internal URL to a public one routed
//      through this server's /files proxy at PUBLIC_URL.
//   2. createFileProxyRouter(): the matching Express handler that streams the
//      file back from the internal Convex backend.
//
// Cloud Convex returned public CDN URLs directly; this bridge keeps the
// in-channel attachment flow working after the move to self-hosted.

import { Router, type Request, type Response as ExpressResponse } from "express";
import { Readable } from "node:stream";

const CONVEX_URL = (process.env.CONVEX_URL ?? "http://127.0.0.1:3210").replace(/\/$/, "");
const PUBLIC_URL = (process.env.PUBLIC_URL ?? "").replace(/\/$/, "");
const STORAGE_PATH = "/api/storage/";
export const FILE_PROXY_MOUNT = "/files";

const ID_RE = /^[a-zA-Z0-9_-]+$/;

export function publicizeStorageUrl<T extends string | null | undefined>(url: T): T {
  if (!url || !PUBLIC_URL) return url;
  const idx = url.indexOf(STORAGE_PATH);
  if (idx === -1) return url;
  const id = url.slice(idx + STORAGE_PATH.length);
  return `${PUBLIC_URL}${FILE_PROXY_MOUNT}/${id}` as T;
}

const FORWARD_HEADERS = [
  "content-type",
  "content-length",
  "content-disposition",
  "etag",
  "last-modified",
  "cache-control",
  "accept-ranges",
];

async function proxy(req: Request, res: ExpressResponse, method: "GET" | "HEAD"): Promise<void> {
  const id = req.params.id;
  if (typeof id !== "string" || !ID_RE.test(id)) {
    res.status(400).json({ error: "invalid storage id" });
    return;
  }
  const upstream = `${CONVEX_URL}${STORAGE_PATH}${id}`;
  const headers: Record<string, string> = {};
  const range = req.headers["range"];
  if (typeof range === "string") headers["range"] = range;
  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstream, { method, headers });
  } catch (err) {
    console.error("[file-proxy] upstream fetch failed", err);
    res.status(502).json({ error: "upstream fetch failed" });
    return;
  }
  res.status(upstreamRes.status);
  for (const h of FORWARD_HEADERS) {
    const v = upstreamRes.headers.get(h);
    if (v) res.setHeader(h, v);
  }
  if (method === "HEAD" || !upstreamRes.body) {
    res.end();
    return;
  }
  Readable.fromWeb(upstreamRes.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
}

export function createFileProxyRouter(): Router {
  const router = Router();
  router.get("/:id", (req, res) => {
    proxy(req, res, "GET").catch((err) => {
      console.error("[file-proxy] handler error", err);
      if (!res.headersSent) res.status(500).end();
    });
  });
  router.head("/:id", (req, res) => {
    proxy(req, res, "HEAD").catch((err) => {
      console.error("[file-proxy] handler error", err);
      if (!res.headersSent) res.status(500).end();
    });
  });
  return router;
}
