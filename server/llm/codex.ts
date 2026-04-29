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
import { zodToJsonSchema } from "zod-to-json-schema";
import { SdkMcpToolDefinition, McpSdkServerConfigWithInstance } from "./types.js";
import { z } from "zod";

type CodexApprovalPolicy = "never" | "on-request" | "on-failure" | "untrusted";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isZodSchema(value: unknown): value is z.ZodTypeAny {
  return isRecord(value) && "_def" in value && typeof (value as { parse?: unknown }).parse === "function";
}

function isJsonSchemaLike(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  if (Object.keys(value).length === 0) return true;
  return (
    typeof value.type === "string" ||
    "properties" in value ||
    "$schema" in value ||
    "oneOf" in value ||
    "anyOf" in value ||
    "allOf" in value
  );
}

function normalizeInputSchema(inputSchema: unknown): {
  jsonSchema: unknown;
  zodSchema?: z.ZodTypeAny;
} {
  if (isJsonSchemaLike(inputSchema)) {
    return { jsonSchema: inputSchema };
  }
  const zodSchema = isZodSchema(inputSchema)
    ? inputSchema
    : z.object((isRecord(inputSchema) ? inputSchema : {}) as Record<string, z.ZodTypeAny>);
  return {
    jsonSchema: zodToJsonSchema(zodSchema, { target: "openAi" }),
    zodSchema,
  };
}

function serializePrompt(prompt: unknown): string {
  if (typeof prompt === "string") return prompt;
  if (Array.isArray(prompt)) {
    return prompt
      .map((m) => {
        if (typeof m === "string") return m;
        if (isRecord(m)) {
          if (typeof m.text === "string") return m.text;
          if (Array.isArray(m.content)) {
            return m.content
              .map((c) => {
                if (!isRecord(c)) return "";
                return typeof c.text === "string" ? c.text : "";
              })
              .join("\n");
          }
        }
        try {
          return JSON.stringify(m);
        } catch {
          return String(m);
        }
      })
      .join("\n");
  }
  try {
    return JSON.stringify(prompt);
  } catch {
    return String(prompt ?? "");
  }
}

function buildInput(prompt: unknown, systemPrompt?: unknown): string {
  const userPrompt = serializePrompt(prompt);
  if (typeof systemPrompt !== "string" || !systemPrompt.trim()) {
    return userPrompt;
  }
  return [
    "System instructions:",
    systemPrompt.trim(),
    "",
    "User request:",
    userPrompt,
  ].join("\n");
}

function mapPermissionModeToApprovalPolicy(permissionMode: unknown): CodexApprovalPolicy | undefined {
  if (permissionMode === "bypassPermissions") return "never";
  if (permissionMode === "on-request") return "on-request";
  if (permissionMode === "on-failure") return "on-failure";
  if (permissionMode === "untrusted") return "untrusted";
  return undefined;
}

function abortError(): Error {
  const err = new Error("Codex query aborted");
  err.name = "AbortError";
  return err;
}

export function tool(name: string, description: string, inputSchema: any, handler: any): SdkMcpToolDefinition<any> {
  return { name, description, inputSchema, handler };
}

export function createSdkMcpServer(options: { name: string; version?: string; tools?: SdkMcpToolDefinition<any>[] }): McpSdkServerConfigWithInstance {
  const server = new Server(
    { name: options.name, version: options.version || "0.1.0" },
    { capabilities: { tools: {} } }
  );

  const normalizedTools = (options.tools || []).map((t: any) => {
    const normalized = normalizeInputSchema(t.inputSchema);
    return {
      ...t,
      normalizedInputSchema: normalized.jsonSchema,
      normalizedZodSchema: normalized.zodSchema,
    };
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: normalizedTools.map((t: any) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.normalizedInputSchema,
      })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const t = normalizedTools.find((tool: any) => tool.name === request.params.name);
    if (!t) {
      throw new Error(`Tool not found: ${request.params.name}`);
    }
    const rawArguments = request.params.arguments || {};
    const parsedArguments = t.normalizedZodSchema
      ? t.normalizedZodSchema.parse(rawArguments)
      : rawArguments;
    const result = await t.handler(parsedArguments, {});
    return result;
  });

  return { instance: server as any, name: options.name, type: "sdk" } as McpSdkServerConfigWithInstance;
}

export async function* query(params: { prompt: any; options?: any }): AsyncGenerator<any> {
  const { prompt, options } = params;
  const mcpServers = options?.mcpServers || {};
  const socketDir = fs.mkdtempSync(path.join(os.tmpdir(), "boop-mcp-"));
  fs.chmodSync(socketDir, 0o700);

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
        command: process.execPath,
        args: [
          "-e",
          "const { createConnection } = require('net'); const socketPath = process.argv[process.argv.length - 1]; if (!socketPath) process.exit(1); const c = createConnection(socketPath, () => { process.stdin.pipe(c); c.pipe(process.stdout); }); c.on('error', () => process.exit(1)); c.on('close', () => process.exit(0));",
          socketPath
        ],
      };
    }

    const disallowed = new Set<string>(options?.disallowedTools || []);
    const allowed = new Set<string>(options?.allowedTools || []);
    const hasWhitelist = allowed.size > 0;

    let sandboxMode: "read-only" | "workspace-write" | "danger-full-access" = "workspace-write";
    if (options?.sandboxMode === "read-only" || options?.sandboxMode === "workspace-write" || options?.sandboxMode === "danger-full-access") {
      sandboxMode = options.sandboxMode;
    } else {
      const disallowWrites = disallowed.has("Write") || disallowed.has("Edit");
      const whitelistDisallowsWrites = hasWhitelist && !allowed.has("Write") && !allowed.has("Edit");
      if (disallowWrites || whitelistDisallowsWrites) {
        sandboxMode = "read-only";
      }
    }

    const webAllowedByWhitelist = hasWhitelist ? (allowed.has("WebSearch") || allowed.has("WebFetch")) : undefined;
    const webBlockedByBlacklist = disallowed.has("WebSearch") || disallowed.has("WebFetch");
    const webSearchMode = options?.webSearchMode ?? (webAllowedByWhitelist === false || webBlockedByBlacklist ? "disabled" : "live");
    const networkAccessEnabled =
      typeof options?.networkAccessEnabled === "boolean"
        ? options.networkAccessEnabled
        : hasWhitelist
          ? webAllowedByWhitelist === true
          : !webBlockedByBlacklist;

    const approvalPolicy =
      options?.approvalPolicy ??
      mapPermissionModeToApprovalPolicy(options?.permissionMode);

    const knownOptionKeys = new Set([
      "mcpServers",
      "allowedTools",
      "disallowedTools",
      "model",
      "systemPrompt",
      "permissionMode",
      "approvalPolicy",
      "abortController",
      "settingSources",
      "workingDirectory",
      "additionalDirectories",
      "skipGitRepoCheck",
      "sandboxMode",
      "networkAccessEnabled",
      "webSearchMode",
      "webSearchEnabled",
      "modelReasoningEffort",
      "config",
    ]);
    if (isRecord(options)) {
      const ignored = Object.keys(options).filter((key) => !knownOptionKeys.has(key));
      if (ignored.length > 0) {
        console.warn(`[codex] Ignoring unsupported query options: ${ignored.join(", ")}`);
      }
      if (Array.isArray(options.settingSources) && options.settingSources.length > 0) {
        console.warn("[codex] `settingSources` is not supported by Codex SDK and will be ignored.");
      }
    }

    const codex = new Codex({
      config: {
        mcp: { servers: mcpConfig },
        ...(options?.config && isRecord(options.config) ? options.config : {}),
      },
    });

    const thread = codex.startThread({
      skipGitRepoCheck: typeof options?.skipGitRepoCheck === "boolean" ? options.skipGitRepoCheck : true,
      ...(typeof options?.model === "string" ? { model: options.model } : {}),
      ...(typeof options?.workingDirectory === "string" ? { workingDirectory: options.workingDirectory } : {}),
      ...(Array.isArray(options?.additionalDirectories) ? { additionalDirectories: options.additionalDirectories } : {}),
      ...(typeof options?.modelReasoningEffort === "string" ? { modelReasoningEffort: options.modelReasoningEffort } : {}),
      ...(typeof options?.webSearchEnabled === "boolean" ? { webSearchEnabled: options.webSearchEnabled } : {}),
      ...(webSearchMode === "disabled" || webSearchMode === "cached" || webSearchMode === "live" ? { webSearchMode } : {}),
      ...(typeof networkAccessEnabled === "boolean" ? { networkAccessEnabled } : {}),
      ...(approvalPolicy ? { approvalPolicy } : {}),
      sandboxMode,
    });

    const input = buildInput(prompt, options?.systemPrompt);

    const abortSignal = options?.abortController?.signal;
    if (abortSignal?.aborted) {
      throw abortError();
    }
    const { events } = await thread.runStreamed(input, { signal: abortSignal });

    let fullText = "";
    for await (const event of events) {
      if (abortSignal?.aborted) {
        throw abortError();
      }

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
        const u = event.usage;
        const model = options?.model || "codex";
        yield {
          type: "result",
          modelUsage: {
            [model]: {
              inputTokens: u?.input_tokens ?? 0,
              outputTokens: u?.output_tokens ?? 0,
              cacheReadInputTokens: u?.cached_input_tokens ?? 0,
              cacheCreationInputTokens: 0, // Codex doesn't report cache creation separately
            },
          },
          total_cost_usd: 0, // Codex is subscription-based, no per-token cost
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
    fs.rmSync(socketDir, { recursive: true, force: true });
  }
}
