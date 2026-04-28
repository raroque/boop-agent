import { Codex } from "@openai/codex-sdk";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { NetServerTransport } from "./net-transport.js";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { randomBytes } from "crypto";
import { zodToJsonSchema } from "zod-to-json-schema";
import { SdkMcpToolDefinition, McpSdkServerConfigWithInstance } from "./index.js";
import { z } from "zod";

import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function tool(name: string, description: string, inputSchema: any, handler: any): SdkMcpToolDefinition<any> {
  return { name, description, inputSchema, handler };
}

export function createSdkMcpServer(options: { name: string; version?: string; tools?: SdkMcpToolDefinition<any>[] }): McpSdkServerConfigWithInstance {
  const server = new Server(
    { name: options.name, version: options.version || "0.1.0" },
    { capabilities: { tools: {} } }
  );

  const tools = options.tools || [];

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t: any) => {
      let schema;
      if (t.inputSchema && typeof t.inputSchema === "object" && t.inputSchema.type === "object") {
        // If it's already a plain JSON schema (e.g. from Composio), use it directly
        schema = t.inputSchema;
      } else {
        // Otherwise, treat as Zod object or raw Zod shape and convert
        const zodObj = t.inputSchema._def ? t.inputSchema : z.object(t.inputSchema);
        schema = zodToJsonSchema(zodObj, { target: "openAi" });
      }

      return {
        name: t.name,
        description: t.description,
        inputSchema: schema,
      };
    }),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const t = tools.find((tool: any) => tool.name === request.params.name);
    if (!t) {
      throw new Error(`Tool not found: ${request.params.name}`);
    }
    const result = await t.handler(request.params.arguments || {}, {});
    return result;
  });

  return { instance: server as any, name: options.name, type: "sdk" } as McpSdkServerConfigWithInstance;
}

export async function* query(params: { prompt: any; options?: any }): AsyncGenerator<any> {
  const { prompt, options } = params;
  const mcpServers = options?.mcpServers || {};
  const socketDir = path.join(os.tmpdir(), `boop-mcp-${randomBytes(4).toString("hex")}`);
  fs.mkdirSync(socketDir, { recursive: true, mode: 0o700 });

  const activeServers: { transport: NetServerTransport; socketPath: string }[] = [];
  const mcpConfig: Record<string, any> = {};

  try {
    // Start MCP servers on sockets
    for (const [name, serverConfig] of Object.entries(mcpServers) as [string, any][]) {
      const socketPath = path.join(socketDir, `${name}.sock`);
      const transport = new NetServerTransport(socketPath);
      await transport.start();
      
      // Register BEFORE connecting to ensure cleanup if connect() fails
      activeServers.push({ transport, socketPath });

      // SECURITY: Strictly limit socket access so other VPS users cannot hijack MCPs
      try {
        fs.chmodSync(socketPath, 0o600);
      } catch (err) {
        console.warn(`[codex-mcp] Could not chmod 0600 on ${socketPath}`, err);
      }
      
      await serverConfig.instance.connect(transport);

      mcpConfig[name] = {
        command: "node",
        args: [path.join(__dirname, "mcp-bridge.js"), socketPath],
      };
    }

    const disallowed = options?.disallowedTools || [];
    const allowed = options?.allowedTools || [];

    // Map high-level tool names to Codex CLI config features
    const features: Record<string, boolean> = {};

    if (allowed.length > 0) {
      // If a whitelist is provided, start by disabling common built-ins
      features["shell_tool"] = allowed.includes("Bash");
      features["web_search"] = allowed.includes("WebSearch");
      features["web_fetch"] = allowed.includes("WebFetch");
      features["multi_agent"] = allowed.includes("Agent") || allowed.includes("Skill");
    } else {
      // Fallback to blacklist logic if no whitelist is present
      if (disallowed.includes("Bash")) features["shell_tool"] = false;
      if (disallowed.includes("WebSearch")) features["web_search"] = false;
      if (disallowed.includes("WebFetch")) features["web_fetch"] = false;
      if (disallowed.includes("Agent") || disallowed.includes("Skill")) features["multi_agent"] = false;
    }

    // Decide sandbox mode based on disallowed write/edit tools
    let sandboxMode = "workspace-write";
    if (disallowed.includes("Write") || disallowed.includes("Edit") || disallowed.includes("Read")) {
      sandboxMode = "read-only";
    }
    // Also enforce read-only if we have a whitelist that DOES NOT include Write/Edit
    if (allowed.length > 0 && !allowed.includes("Write") && !allowed.includes("Edit")) {
      sandboxMode = "read-only";
    }

    const codex = new Codex({
      config: {
        mcp: { servers: mcpConfig },
        features,
        sandbox: { mode: sandboxMode },
        ...(options?.model ? { model: options.model } : {}),
      },
    });

    const thread = codex.startThread({
      skipGitRepoCheck: true,
      ...(options?.systemPrompt ? { instructions: options.systemPrompt } : {}),
    });

    const input = typeof prompt === "string" ? prompt : "Continue conversation";
    const { events } = await thread.runStreamed(input);

    let fullText = "";
    for await (const event of events) {
      if (event.type === "item.updated" || event.type === "item.completed") {
        if (event.item.type === "agent_message") {
          const delta = event.item.text.slice(fullText.length);
          fullText = event.item.text;
          yield {
            type: "assistant",
            message: {
              content: [{ type: "text", text: delta }],
            },
          };
        }
      } else if (event.type === "turn.completed") {
        yield {
          type: "result",
          usage: event.usage,
        };
      } else if (event.type === "item.started" && event.item.type === "mcp_tool_call") {
        yield {
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                name: event.item.tool,
                input: event.item.arguments,
              },
            ],
          },
        };
      }
    }
  } finally {
    // Cleanup
    for (const s of activeServers) {
      await s.transport.close();
      try {
        fs.unlinkSync(s.socketPath);
      } catch {}
    }
    try {
      fs.rmdirSync(socketDir);
    } catch {}
  }
}
