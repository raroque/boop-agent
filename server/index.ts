import "./env-setup.js";
import express from "express";
import cors, { type CorsOptions } from "cors";
import { createServer, type IncomingMessage } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { addClient, broadcast } from "./broadcast.js";
import { createSendblueRouter } from "./sendblue.js";
import { handleUserMessage } from "./interaction-agent.js";
import { loadIntegrations } from "./integrations/registry.js";
import { startCleanupLoop } from "./memory/clean.js";
import { startAutomationLoop } from "./automations.js";
import { startHeartbeatLoop } from "./heartbeat.js";
import { startConsolidationLoop } from "./consolidation.js";
import { cancelAgent, retryAgent } from "./execution-agent.js";
import { createComposioRouter } from "./composio-routes.js";
import { ensureProactiveWatcher } from "./proactive-email.js";
import { listCodexModels, resolveCodexModelInput } from "./codex-models.js";
import { describeRuntimePricing } from "./model-pricing.js";
import {
  CLAUDE_KNOWN_MODELS,
  CODEX_KNOWN_MODELS,
  OPENAI_KNOWN_MODELS,
  REASONING_EFFORTS,
  getRuntimeConfig,
  resolveModelInput,
  resolveReasoningEffortInput,
  resolveRuntimeInput,
  setRuntimeReasoningEffort,
  setRuntimeModel,
  setRuntimeName,
} from "./runtime-config.js";
import type { RuntimeName } from "./runtimes/types.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = resolve(ROOT, ".env.local");
const EDITABLE_ENV_KEYS = new Set([
  "SENDBLUE_API_KEY",
  "SENDBLUE_API_SECRET",
  "SENDBLUE_FROM_NUMBER",
  "SENDBLUE_AUTO_WEBHOOK",
  "BOOP_TUNNEL",
  "PUBLIC_URL",
  "NGROK_DOMAIN",
  "COMPOSIO_API_KEY",
  "COMPOSIO_USER_ID",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "PORT",
  "CONVEX_DEPLOYMENT",
  "CONVEX_URL",
  "VITE_CONVEX_URL",
  "VITE_CONVEX_SITE_URL",
]);

function hostHeader(req: express.Request | IncomingMessage): string {
  const host = req.headers.host;
  if (Array.isArray(host)) return host[0] ?? "";
  return host ?? "";
}

function hostnameFromHost(host: string): string {
  const value = host.trim().toLowerCase();
  if (!value) return "";
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    return end >= 0 ? value.slice(1, end) : value;
  }
  return value.split(":")[0] ?? "";
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "" ||
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "0.0.0.0" ||
    hostname === "::ffff:127.0.0.1" ||
    /^127(?:\.\d{1,3}){3}$/.test(hostname)
  );
}

function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:") && isLocalHostname(url.hostname);
  } catch {
    return false;
  }
}

function isPublicRequest(req: express.Request | IncomingMessage): boolean {
  return !isLocalHostname(hostnameFromHost(hostHeader(req)));
}

function isPublicRouteAllowed(method: string | undefined, pathname: string): boolean {
  const normalizedMethod = (method ?? "GET").toUpperCase();
  if (normalizedMethod === "OPTIONS") return true;
  if (pathname === "/health" && (normalizedMethod === "GET" || normalizedMethod === "HEAD")) {
    return true;
  }
  if (pathname === "/sendblue/webhook" && normalizedMethod === "POST") return true;
  return pathname === "/composio/webhook" && normalizedMethod === "POST";
}

function pathnameFromUrl(url: string | undefined): string {
  return new URL(url ?? "/", "http://localhost").pathname;
}

function publicTunnelGuard(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  if (!isPublicRequest(req) || isPublicRouteAllowed(req.method, req.path)) {
    next();
    return;
  }
  res.status(404).json({ error: "Not found" });
}

function isLocalControlMutation(req: express.Request): boolean {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method.toUpperCase())) return false;
  return (
    req.path === "/setup/settings" ||
    req.path === "/runtime" ||
    req.path === "/chat" ||
    req.path === "/consolidate" ||
    /^\/agents\/[^/]+\/(?:cancel|retry)$/.test(req.path) ||
    (req.path.startsWith("/composio/") && req.path !== "/composio/webhook")
  );
}

function localControlOriginGuard(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  if (!isLocalControlMutation(req)) {
    next();
    return;
  }
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
  const referer = typeof req.headers.referer === "string" ? req.headers.referer : "";
  // This guard is scoped to browser CSRF and tunnel exposure, not local process auth.
  // Requests with no Origin/Referer, like same-machine curl calls, are allowed after
  // publicTunnelGuard has already rejected non-local hosts.
  if ((origin && !isLocalOrigin(origin)) || (!origin && referer && !isLocalOrigin(referer))) {
    res.status(403).json({ error: "Local dashboard origin required" });
    return;
  }
  next();
}

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin || isLocalOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
};

function envValue(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return String(value).trim();
}

function serializeEnvValue(value: string): string {
  if (!value) return "";
  if (/[\s#"'\\\n\r]/.test(value)) return JSON.stringify(value);
  return value;
}

function updateLocalEnv(updates: Record<string, unknown>) {
  const cleanUpdates = new Map<string, string>();
  for (const [key, rawValue] of Object.entries(updates)) {
    if (!EDITABLE_ENV_KEYS.has(key)) continue;
    const value = envValue(rawValue);
    if (value == null) continue;
    if (key === "BOOP_TUNNEL" && !["none", "free", "ngrok-domain", "static"].includes(value)) {
      throw new Error(`Invalid BOOP_TUNNEL value "${value}"`);
    }
    if (key === "PORT" && value && !/^\d+$/.test(value)) {
      throw new Error("PORT must be a number");
    }
    cleanUpdates.set(key, value);
  }

  if (!cleanUpdates.size) return;

  const existing = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
  const lines = existing ? existing.split(/\r?\n/) : [];
  const seen = new Set<string>();
  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!match) return line;
    const key = match[1];
    if (!cleanUpdates.has(key)) return line;
    seen.add(key);
    return `${key}=${serializeEnvValue(cleanUpdates.get(key) ?? "")}`;
  });

  for (const [key, value] of cleanUpdates) {
    if (!seen.has(key)) nextLines.push(`${key}=${serializeEnvValue(value)}`);
    process.env[key] = value;
  }

  writeFileSync(ENV_PATH, `${nextLines.join("\n").replace(/\n+$/, "")}\n`, "utf8");
}

function hasBinary(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    const lookup = process.platform === "win32" ? "where" : "which";
    const child = spawn(lookup, [name], { stdio: "ignore" });
    child.on("exit", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

async function runtimePayload() {
  const [config, codexInstalled] = await Promise.all([
    getRuntimeConfig(),
    hasBinary("codex"),
  ]);
  let codexModels = [...CODEX_KNOWN_MODELS];
  let codexModelSource = "fallback";
  if (codexInstalled) {
    try {
      const listed = await listCodexModels();
      if (listed.length) {
        codexModels = listed.map((model) => model.model);
        codexModelSource = "codex app-server model/list";
      }
    } catch (err) {
      console.warn("[runtime] codex model/list failed", err);
    }
  }
  const availableModels = {
    claude: [...CLAUDE_KNOWN_MODELS],
    codex: codexModels,
    openai: [...OPENAI_KNOWN_MODELS],
  };
  const pricingByModel = Object.fromEntries(
    (Object.entries(availableModels) as [RuntimeName, string[]][]).map(([runtime, models]) => [
      runtime,
      Object.fromEntries(models.map((model) => [model, describeRuntimePricing(runtime, model)])),
    ]),
  ) as Record<RuntimeName, Record<string, ReturnType<typeof describeRuntimePricing>>>;
  return {
    ...config,
    availableRuntimes: ["claude", "codex", "openai"] as RuntimeName[],
    availableModels,
    availableReasoningEfforts: {
      claude: [],
      codex: [...REASONING_EFFORTS],
      openai: [...REASONING_EFFORTS],
    },
    pricing: {
      current: describeRuntimePricing(config.runtime, config.model),
      byModel: pricingByModel,
    },
    status: {
      claude: {
        configured: Boolean(process.env.ANTHROPIC_API_KEY),
        note: "Uses Claude Code sign-in by default; ANTHROPIC_API_KEY is optional.",
      },
      codex: {
        configured: codexInstalled,
        installed: codexInstalled,
        note:
          codexModelSource === "codex app-server model/list"
            ? "Uses local Codex app-server; model list is from model/list."
            : "Uses local Codex app-server; install/sign in to load live models.",
      },
      openai: {
        configured: Boolean(process.env.OPENAI_API_KEY),
        apiKeyPresent: Boolean(process.env.OPENAI_API_KEY),
        note: "Requires OPENAI_API_KEY in .env.local.",
      },
    },
  };
}

async function setupStatusPayload() {
  const [codexInstalled, ngrokInstalled] = await Promise.all([
    hasBinary("codex"),
    hasBinary("ngrok"),
  ]);
  const sendblueKeyPresent = Boolean(process.env.SENDBLUE_API_KEY);
  const sendblueSecretPresent = Boolean(process.env.SENDBLUE_API_SECRET);
  const sendblueFromNumber = process.env.SENDBLUE_FROM_NUMBER ?? "";
  const tunnelMode = process.env.BOOP_TUNNEL ?? (process.env.NGROK_DOMAIN ? "ngrok-domain" : "none");

  return {
    runtime: await runtimePayload(),
    messaging: {
      mode: tunnelMode === "none" ? "dashboard-only" : "sendblue",
      sendblueConfigured: sendblueKeyPresent && sendblueSecretPresent && Boolean(sendblueFromNumber),
      sendblueKeyPresent,
      sendblueSecretPresent,
      sendblueFromNumberPresent: Boolean(sendblueFromNumber),
      sendblueFromNumber,
      sendblueFromNumberMasked: sendblueFromNumber
        ? `${sendblueFromNumber.slice(0, 3)}••••${sendblueFromNumber.slice(-2)}`
        : "",
      tunnelMode,
      publicUrl: process.env.PUBLIC_URL ?? "",
      ngrokDomain: process.env.NGROK_DOMAIN ?? "",
      ngrokInstalled,
      ngrokDomainPresent: Boolean(process.env.NGROK_DOMAIN),
      autoWebhook: process.env.SENDBLUE_AUTO_WEBHOOK !== "false",
    },
    integrations: {
      composioApiKeyPresent: Boolean(process.env.COMPOSIO_API_KEY),
      composioUserId: process.env.COMPOSIO_USER_ID ?? "boop-default",
    },
    backend: {
      convexConfigured: Boolean(process.env.CONVEX_URL || process.env.VITE_CONVEX_URL),
      convexDeployment: process.env.CONVEX_DEPLOYMENT ?? "",
      convexUrl: process.env.CONVEX_URL ?? "",
      viteConvexUrl: process.env.VITE_CONVEX_URL ?? "",
      viteConvexSiteUrl: process.env.VITE_CONVEX_SITE_URL ?? "",
      convexUrlPresent: Boolean(process.env.CONVEX_URL),
      viteConvexUrlPresent: Boolean(process.env.VITE_CONVEX_URL),
      port: process.env.PORT ?? "3456",
      codexInstalled,
    },
  };
}

async function resolveModelForRuntime(input: string, runtime: RuntimeName): Promise<string | null> {
  const resolved = resolveModelInput(input, runtime);
  if (resolved || runtime !== "codex") return resolved;
  try {
    return await resolveCodexModelInput(input);
  } catch (err) {
    console.warn("[runtime] codex model validation failed", err);
    return null;
  }
}

async function main() {
  await loadIntegrations();
  startCleanupLoop();
  startAutomationLoop();
  startHeartbeatLoop();
  startConsolidationLoop();

  const stableUrl = process.env.PUBLIC_URL;
  if (stableUrl && !stableUrl.includes("localhost")) {
    ensureProactiveWatcher(stableUrl).catch((err) =>
      console.error("[proactive] startup failed", err),
    );
  }

  const app = express();
  app.use(cors(corsOptions));
  app.use(publicTunnelGuard);
  app.use(localControlOriginGuard);
  app.use("/composio/webhook", express.raw({ type: "application/json", limit: "2mb" }));
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "boop-agent" });
  });

  app.get("/setup/status", async (_req, res) => {
    try {
      res.json(await setupStatusPayload());
    } catch (err) {
      console.error("[setup] status failed", err);
      res.status(500).json({ error: String(err) });
    }
  });

  app.post("/setup/settings", async (req, res) => {
    try {
      updateLocalEnv(req.body?.updates ?? {});
      res.json(await setupStatusPayload());
    } catch (err) {
      console.error("[setup] settings update failed", err);
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.use("/sendblue", createSendblueRouter());
  app.use("/composio", createComposioRouter());

  app.get("/runtime", async (_req, res) => {
    try {
      res.json(await runtimePayload());
    } catch (err) {
      console.error("[runtime] read failed", err);
      res.status(500).json({ error: String(err) });
    }
  });

  app.post("/runtime", async (req, res) => {
    try {
      const body = req.body ?? {};
      const current = await getRuntimeConfig();
      const runtimeInput = body.runtime == null ? current.runtime : String(body.runtime);
      const runtime = resolveRuntimeInput(runtimeInput);
      if (!runtime) {
        res.status(400).json({ error: `Unknown runtime "${runtimeInput}"` });
        return;
      }

      const modelInput = body.model == null ? undefined : String(body.model);
      const model = modelInput ? await resolveModelForRuntime(modelInput, runtime) : null;
      if (modelInput && !model) {
        res.status(400).json({ error: `Unknown ${runtime} model "${modelInput}"` });
        return;
      }
      const reasoningEffortInput =
        body.reasoningEffort == null ? undefined : String(body.reasoningEffort);
      const reasoningEffort = reasoningEffortInput
        ? resolveReasoningEffortInput(reasoningEffortInput)
        : null;
      if (reasoningEffortInput && !reasoningEffort) {
        res.status(400).json({ error: `Unknown reasoning effort "${reasoningEffortInput}"` });
        return;
      }

      if (runtime !== current.runtime) await setRuntimeName(runtime);
      if (model) await setRuntimeModel(model, runtime);
      if (reasoningEffort && runtime !== "claude") {
        await setRuntimeReasoningEffort(reasoningEffort, runtime);
      }
      res.json(await runtimePayload());
    } catch (err) {
      console.error("[runtime] update failed", err);
      res.status(500).json({ error: String(err) });
    }
  });

  app.post("/agents/:id/cancel", (req, res) => {
    const ok = cancelAgent(req.params.id);
    res.json({ ok });
  });

  app.post("/consolidate", async (_req, res) => {
    try {
      const { runConsolidation } = await import("./consolidation.js");
      runConsolidation("manual").catch((err) =>
        console.error("[consolidation] manual run failed", err),
      );
      res.json({ ok: true, triggered: "manual" });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post("/agents/:id/retry", async (req, res) => {
    const result = await retryAgent(req.params.id);
    if (!result) {
      res.status(404).json({ error: "agent not found" });
      return;
    }
    res.json(result);
  });

  app.post("/chat", async (req, res) => {
    const { conversationId, content } = req.body ?? {};
    if (!conversationId || !content) {
      res.status(400).json({ error: "conversationId and content required" });
      return;
    }
    try {
      const reply = await handleUserMessage({
        conversationId,
        content,
        onThinking: (t) => broadcast("thinking", { conversationId, t }),
      });
      res.json({ reply });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: String(err) });
    }
  });

  const server = createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  wss.on("connection", (ws) => {
    addClient(ws);
    ws.send(JSON.stringify({ event: "hello", data: { ok: true }, at: Date.now() }));
  });
  server.on("upgrade", (req, socket, head) => {
    const pathname = pathnameFromUrl(req.url);
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
    if (isPublicRequest(req) || (origin && !isLocalOrigin(origin)) || pathname !== "/ws") {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  const port = Number(process.env.PORT ?? 3456);
  server.listen(port, () => {
    console.log(`boop-agent server listening on :${port}`);
    console.log(`  health      GET  http://localhost:${port}/health`);
    console.log(`  runtime     GET  http://localhost:${port}/runtime`);
    console.log(`  chat        POST http://localhost:${port}/chat`);
    console.log(`  sendblue    POST http://localhost:${port}/sendblue/webhook`);
    console.log(`  websocket   WS   ws://localhost:${port}/ws`);
  });
}

main().catch((err) => {
  console.error("fatal", err);
  process.exit(1);
});
