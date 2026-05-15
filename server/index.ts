import "./env-setup.js";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { addClient } from "./broadcast.js";
import { mountChannelRouters, getChannelById } from "./channels/index.js";
import { handleUserMessage } from "./interaction-agent.js";
import { loadIntegrations } from "./integrations/registry.js";
import { startCleanupLoop } from "./memory/clean.js";
import { startAutomationLoop } from "./automations.js";
import { startHeartbeatLoop } from "./heartbeat.js";
import { startConsolidationLoop } from "./consolidation.js";
import { cancelAgent, retryAgent } from "./execution-agent.js";
import { createComposioRouter } from "./composio-routes.js";
import { createNativeIntegrationsRouter } from "./native-integrations-routes.js";
import { createCredentialRouter } from "./credential-routes.js";
import { createFileProxyRouter, FILE_PROXY_MOUNT } from "./file-proxy.js";
import { createIosRouter } from "./ios/router.js";
import { ensureProactiveWatcher } from "./proactive-email.js";
import { resolveActiveChannel } from "./runtime-config.js";
import { preloadLocalModel } from "./embeddings.js";
import { createMemoryRouter } from "./memory-routes.js";

async function main() {
  await loadIntegrations();
  startCleanupLoop();
  startAutomationLoop();
  startHeartbeatLoop();
  startConsolidationLoop();
  // No-op when a paid embedding key is set; otherwise downloads/loads the
  // local BGE-large model in the background so the first user-facing
  // recall() doesn't pay the model-load cost.
  preloadLocalModel();

  // If a stable public URL is configured, register the Composio webhook +
  // Gmail trigger now. For ngrok-based dev, scripts/dev.mjs drives the same
  // function once the ngrok URL is known, so we skip when only the local
  // PORT default is available.
  const stableUrl = process.env.PUBLIC_URL;
  if (stableUrl && !stableUrl.includes("localhost")) {
    ensureProactiveWatcher(stableUrl).catch((err) =>
      console.error("[proactive] startup failed", err),
    );
  }

  const app = express();
  app.use(cors());
  // Composio webhook receiver must read raw bytes for HMAC verification, so
  // its body parser is mounted BEFORE the global express.json. Without this
  // ordering the JSON parser consumes the stream first and the raw buffer
  // arrives empty.
  app.use("/composio/webhook", express.raw({ type: "application/json", limit: "2mb" }));
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "boop-agent" });
  });

  mountChannelRouters(app);

  // Warn if the active channel can't actually send (missing creds).
  try {
    const { channel } = await resolveActiveChannel();
    const ch = getChannelById(channel);
    if (!ch || !ch.isConfigured()) {
      const required =
        channel === "tg" ? "TELEGRAM_BOT_TOKEN" : "SENDBLUE_API_KEY/SENDBLUE_API_SECRET";
      console.warn(
        `[channels] Active channel is "${channel}" but its credentials are missing (${required}). ` +
        `Unsolicited messages will be dropped. Set the env var or change the active channel via "use imessage" / "use telegram".`,
      );
    }
  } catch (err) {
    console.warn("[channels] active-channel readiness check failed", err);
  }

  app.use("/composio", createComposioRouter());
  app.use("/native-integrations", createNativeIntegrationsRouter());
  app.use("/credentials", createCredentialRouter());
  app.use(FILE_PROXY_MOUNT, createFileProxyRouter());
  app.use("/memory", createMemoryRouter());
  app.use("/channels/ios", createIosRouter());

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
    console.log(`  sendblue    POST http://localhost:${port}/sendblue/webhook`);
    console.log(`  ios inbound POST http://localhost:${port}/channels/ios/inbound`);
    console.log(`  ios stream  GET  http://localhost:${port}/channels/ios/stream`);
    console.log(`  websocket   WS   ws://localhost:${port}/ws`);
  });

  // Clean shutdown: release any live Steel browser sessions so they don't
  // linger on the provider side burning idle minutes. systemd sends SIGTERM
  // on `systemctl restart`; Ctrl-C sends SIGINT during local dev.
  let shuttingDown = false;
  const cleanup = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] ${signal} received, closing browser sessions…`);
    try {
      const { closeAllSessions } = await import("./browser/session-manager.js");
      await Promise.race([
        closeAllSessions(),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);
    } catch (err) {
      console.error("[shutdown] closeAllSessions failed:", err);
    }
    process.exit(0);
  };
  process.on("SIGTERM", () => void cleanup("SIGTERM"));
  process.on("SIGINT", () => void cleanup("SIGINT"));
}

main().catch((err) => {
  console.error("fatal", err);
  process.exit(1);
});
