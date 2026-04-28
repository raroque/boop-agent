import "./env-setup.js";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addClient } from "./broadcast.js";
import { createSendblueRouter } from "./sendblue.js";
import { handleUserMessage } from "./interaction-agent.js";
import { loadIntegrations } from "./integrations/registry.js";
import { startCleanupLoop } from "./memory/clean.js";
import { startAutomationLoop } from "./automations.js";
import { startHeartbeatLoop } from "./heartbeat.js";
import { startConsolidationLoop } from "./consolidation.js";
import { cancelAgent, retryAgent } from "./execution-agent.js";
import { createComposioRouter } from "./composio-routes.js";
import { requireAdmin, defaultVerifier } from "./auth.js";

async function main() {
  await loadIntegrations();
  startCleanupLoop();
  startAutomationLoop();
  startHeartbeatLoop();
  startConsolidationLoop();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  // PUBLIC: health check.
  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "boop-agent" });
  });

  // PUBLIC (in production): the built debug UI bundle. Static assets must
  // load before the SPA can render the login form, so they're served
  // BEFORE requireAdmin gates the API surface.
  if (process.env.NODE_ENV === "production") {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const debugDist = path.resolve(here, "../../debug/dist");
    app.use(express.static(debugDist));
    app.get("/debug/*", (_req, res) => {
      res.sendFile(path.join(debugDist, "index.html"));
    });
  }

  // Single JWT verifier shared between HTTP middleware and the WS upgrade
  // handler — `createRemoteJWKSet` keeps an in-memory JWKS cache per
  // instance, so reusing one verifier avoids a fresh HTTP fetch per request.
  const verifyJwt = defaultVerifier();

  // AUTH GATE: every route below requires a valid Convex Auth JWT, except
  // the explicit allowlist inside requireAdmin() (/sendblue/webhook + /health).
  app.use(requireAdmin({ verifyJwt }));

  app.use("/sendblue", createSendblueRouter());
  app.use("/composio", createComposioRouter());

  app.post("/agents/:id/cancel", (req, res) => {
    const ok = cancelAgent(req.params.id);
    res.json({ ok });
  });

  app.post("/consolidate", async (_req, res) => {
    try {
      const { runConsolidation } = await import("./consolidation.js");
      // Fire-and-forget so the HTTP request returns immediately.
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
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req, socket, head) => {
    const requestUrl = new URL(req.url ?? "", `http://${req.headers.host}`);
    if (requestUrl.pathname !== "/ws") {
      socket.destroy();
      return;
    }
    // Token is passed as a ?token=<jwt> query param. The browser EventSource /
    // WebSocket APIs can't set custom headers on the handshake, so query is
    // the standard workaround.
    const token = requestUrl.searchParams.get("token");
    if (!token) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    try {
      await verifyJwt(token);
    } catch {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws) => {
    addClient(ws);
    ws.send(JSON.stringify({ event: "hello", data: { ok: true }, at: Date.now() }));
  });

  const port = Number(process.env.PORT ?? 3456);
  server.listen(port, () => {
    console.log(`boop-agent server listening on :${port}`);
    console.log(`  health      GET  http://localhost:${port}/health`);
    console.log(`  chat        POST http://localhost:${port}/chat`);
    console.log(`  sendblue    POST http://localhost:${port}/sendblue/webhook`);
    console.log(`  websocket   WS   ws://localhost:${port}/ws`);
  });
}

main().catch((err) => {
  console.error("fatal", err);
  process.exit(1);
});
