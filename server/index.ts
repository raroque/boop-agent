import "./env-setup.js";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
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
import { ensureProactiveWatcher } from "./proactive-email.js";
import { preloadLocalModel } from "./embeddings.js";
import { createMemoryRouter } from "./memory-routes.js";
import {
  getRuntimeConfig,
  resolveModelInput,
  resolveReasoningEffortInput,
  resolveRuntimeInput,
  setCodexReasoningEffort,
  setRuntimeModel,
  setRuntimeProvider,
} from "./runtime-config.js";

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

  app.get("/runtime-config", async (_req, res) => {
    try {
      res.json(await getRuntimeConfig());
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post("/runtime-config", async (req, res) => {
    try {
      const body = req.body as {
        runtime?: unknown;
        model?: unknown;
        reasoningEffort?: unknown;
      };
      let runtime =
        body.runtime === undefined
          ? undefined
          : resolveRuntimeInput(String(body.runtime));
      if (body.runtime !== undefined && !runtime) {
        res.status(400).json({ error: `Unknown runtime "${String(body.runtime)}"` });
        return;
      }

      if (runtime) {
        await setRuntimeProvider(runtime);
      }

      runtime ??= (await getRuntimeConfig()).runtime;

      if (body.model !== undefined) {
        const model = resolveModelInput(String(body.model), runtime);
        if (!model) {
          res
            .status(400)
            .json({ error: `Unknown ${runtime} model "${String(body.model)}"` });
          return;
        }
        await setRuntimeModel(model, runtime);
      }

      if (body.reasoningEffort !== undefined) {
        const effort = resolveReasoningEffortInput(String(body.reasoningEffort));
        if (!effort) {
          res.status(400).json({
            error: `Unknown Codex reasoning effort "${String(body.reasoningEffort)}"`,
          });
          return;
        }
        await setCodexReasoningEffort(effort);
      }

      res.json(await getRuntimeConfig());
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.use("/sendblue", createSendblueRouter());
  app.use("/composio", createComposioRouter());
  app.use("/memory", createMemoryRouter());

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
      const reply = await handleUserMessage({
        conversationId,
        content,
        persistAssistantReply: true,
      });
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
    console.log(`  websocket   WS   ws://localhost:${port}/ws`);
  });
}

main().catch((err) => {
  console.error("fatal", err);
  process.exit(1);
});
