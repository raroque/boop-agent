#!/usr/bin/env node
/**
 * Thin proxy between Claude Code CLI and LiteLLM.
 * Intercepts /v1/messages/count_tokens (LiteLLM+Gemini sends empty body → 500)
 * and returns a mock token count. All other requests proxy to LiteLLM.
 *
 * Runs on port 4000. LiteLLM must run on LITELLM_PORT (default 4001).
 */
import { createServer } from "node:http";
import { request as httpRequest } from "node:http";

const PROXY_PORT = Number(process.env.ANTHROPIC_PROXY_PORT ?? 4000);
const LITELLM_PORT = Number(process.env.LITELLM_PORT ?? 4001);

createServer((req, res) => {
  // Intercept count_tokens — return a large fake count so Claude Code never
  // truncates context. The 500 from LiteLLM is a bug (empty body to Gemini).
  if (req.url?.startsWith("/v1/messages/count_tokens")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ input_tokens: 10000 }));
    return;
  }

  // Forward everything else to LiteLLM
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const upstream = httpRequest(
      {
        host: "127.0.0.1",
        port: LITELLM_PORT,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `127.0.0.1:${LITELLM_PORT}` },
      },
      (upRes) => {
        res.writeHead(upRes.statusCode ?? 502, upRes.headers);
        upRes.pipe(res);
      },
    );
    upstream.on("error", (err) => {
      console.error("[proxy] upstream error", err.message);
      if (!res.headersSent) {
        res.writeHead(502);
        res.end("upstream error");
      }
    });
    upstream.end(body);
  });
}).listen(PROXY_PORT, "0.0.0.0", () => {
  console.log(`[anthropic-proxy] listening :${PROXY_PORT} → LiteLLM :${LITELLM_PORT}`);
});
