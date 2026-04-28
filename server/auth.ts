import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export function verifyHmac(
  body: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

const PUBLIC_ALLOWLIST: Array<{ method?: string; pathPrefix: string }> = [
  { method: "GET", pathPrefix: "/health" },
  { method: "POST", pathPrefix: "/sendblue/webhook" },
];

function isPublic(req: Request): boolean {
  return PUBLIC_ALLOWLIST.some(
    (rule) =>
      (!rule.method || rule.method === req.method) &&
      req.path.startsWith(rule.pathPrefix),
  );
}

export type VerifyJwt = (token: string) => Promise<{ payload: JWTPayload }>;

export interface RequireAdminOptions {
  verifyJwt?: VerifyJwt;
}

// @convex-dev/auth signs JWTs with `CONVEX_SITE_URL` as issuer and serves
// /.well-known/jwks.json on the .convex.site host (see auth.config.ts).
// Using CONVEX_URL here would 401 every request in production.
export function defaultVerifier(): VerifyJwt {
  const siteUrl = process.env.CONVEX_SITE_URL;
  if (!siteUrl) {
    throw new Error(
      "CONVEX_SITE_URL not set — Express auth middleware requires it to fetch the Convex JWKS",
    );
  }
  const jwks = createRemoteJWKSet(new URL("/.well-known/jwks.json", siteUrl));
  return async (token) => jwtVerify(token, jwks, { issuer: siteUrl });
}

export function requireAdmin(opts: RequireAdminOptions = {}): RequestHandler {
  const verify = opts.verifyJwt ?? defaultVerifier();
  return async (req: Request, res: Response, next: NextFunction) => {
    if (isPublic(req)) {
      next();
      return;
    }
    const header = req.headers.authorization;
    if (!header || typeof header !== "string" || !header.startsWith("Bearer ")) {
      res.status(401).json({ error: "missing or malformed Authorization header" });
      return;
    }
    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      res.status(401).json({ error: "empty bearer token" });
      return;
    }
    try {
      await verify(token);
      next();
    } catch (err) {
      res.status(401).json({ error: "invalid token" });
    }
  };
}
