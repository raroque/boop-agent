import "./env-setup.js";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { addClient } from "./broadcast.js";
import { bot, webhookPaths } from "./bot.js";
import { handleUserMessage } from "./interaction-agent.js";
import { loadIntegrations } from "./integrations/registry.js";
import { startCleanupLoop } from "./memory/clean.js";
import { startAutomationLoop } from "./automations.js";
import { startHeartbeatLoop } from "./heartbeat.js";
import { startConsolidationLoop } from "./consolidation.js";
import { cancelAgent, retryAgent } from "./execution-agent.js";
import { createComposioRouter } from "./composio-routes.js";

const DEBUG_WEBHOOKS = process.env.DEBUG_WEBHOOKS === "true";

/** Bridge Express req/res to Web API Request/Response (used by Chat SDK webhooks) */
async function bridgeWebhook(
  name: string,
  req: express.Request & { rawBody?: Buffer },
  res: express.Response,
  handler: ((r: Request, opts?: { waitUntil?: (p: Promise<unknown>) => void }) => Promise<Response>) | undefined,
): Promise<void> {
  if (!handler) {
    console.error(`[webhook:${name}] handler not found on bot.webhooks`);
    res.status(500).json({ error: `no handler for adapter "${name}"` });
    return;
  }
  const url = `http://localhost${req.originalUrl}`;
  // Forward all incoming headers so adapter verification logic (e.g. x-webhook-secret) works
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string") headers[k] = v;
  }
  // Preserve original bytes for HMAC signature verification (Slack, GitHub, Discord, etc.)
  const body = req.rawBody?.toString("utf-8") ?? JSON.stringify(req.body);
  if (DEBUG_WEBHOOKS) {
    console.log(`[webhook:${name}] incoming POST ${body.length}b`);
  }
  const webReq = new Request(url, { method: req.method, headers, body });
  const webRes = await handler(webReq);
  if (DEBUG_WEBHOOKS) {
    console.log(`[webhook:${name}] handler status=${webRes.status}`);
  }
  // Proxy response faithfully — some adapters return plain text (URL verification challenges)
  for (const [k, v] of webRes.headers.entries()) {
    res.setHeader(k, v);
  }
  const responseBody = Buffer.from(await webRes.arrayBuffer());
  res.status(webRes.status).send(responseBody);
}

async function main() {
  await loadIntegrations();
  startCleanupLoop();
  startAutomationLoop();
  startHeartbeatLoop();
  startConsolidationLoop();

  const app = express();
  app.use(cors());
  // Capture raw body bytes before parsing so HMAC signature verification works in all adapters
  app.use(express.json({
    limit: "2mb",
    verify: (req: express.Request & { rawBody?: Buffer }, _res, buf) => {
      req.rawBody = buf;
    },
  }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "boop-agent" });
  });

  // Mount webhook routes for all registered chat adapters
  for (const [name, path] of Object.entries(webhookPaths)) {
    const handler = (bot.webhooks as Record<string, (r: Request) => Promise<Response>>)[name];
    app.post(path, (req, res) => {
      bridgeWebhook(name, req, res, handler).catch((err) => {
        console.error(`[${name}] webhook error`, err);
        if (!res.headersSent) res.status(500).json({ error: String(err) });
      });
    });
  }

  app.use("/composio", createComposioRouter());

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

  // Chat endpoint for local testing and the debug dashboard
  app.post("/chat", async (req, res) => {
    const { conversationId, content } = req.body ?? {};
    if (!conversationId || !content) {
      res.status(400).json({ error: "conversationId and content required" });
      return;
    }
    try {
      const reply = await handleUserMessage({ conversationId, content });
      res.json({ reply });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: String(err) });
    }
  });

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (ws) => {
    addClient(ws);
    ws.send(JSON.stringify({ event: "hello", data: { ok: true }, at: Date.now() }));
  });

  const port = Number(process.env.PORT ?? 3456);
  server.listen(port, () => {
    console.log(`boop-agent server listening on :${port}`);
    console.log(`  health      GET  http://localhost:${port}/health`);
    console.log(`  chat        POST http://localhost:${port}/chat`);
    for (const [name, path] of Object.entries(webhookPaths)) {
      console.log(`  ${name.padEnd(12)}POST http://localhost:${port}${path}`);
    }
    console.log(`  websocket   WS   ws://localhost:${port}/ws`);
  });
}

main().catch((err) => {
  console.error("fatal", err);
  process.exit(1);
});
