/**
 * OpenAI Codex provider for boop-agent.
 *
 * Implements the same query() interface as the Claude provider, using the
 * OpenAI Responses API. Supports:
 *   - web_search_preview built-in tool (equivalent to claude-agent-sdk's WebSearch)
 *   - WebFetch as a manual function tool
 *   - All in-process MCP servers bridged via @modelcontextprotocol/sdk InMemoryTransport
 *
 * Required env: OPENAI_API_KEY
 * Optional env: OPENAI_MODEL (default: codex-mini-latest)
 */
import OpenAI from "openai";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type { BoopMessage } from "./types.js";

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("[provider:openai] OPENAI_API_KEY is required");
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Tool name helpers
// ---------------------------------------------------------------------------

/** Convert an MCP server name + tool name to a valid OpenAI function tool name. */
function toOpenAIToolName(serverName: string, toolName: string): string {
  // OpenAI function names: ^[a-zA-Z0-9_-]+$, max 64 chars
  const safe = serverName.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${safe}__${toolName}`.slice(0, 64);
}

/** Parse an OpenAI function name back to { server, tool }. */
function parseOpenAIToolName(funcName: string): { server: string; tool: string } | null {
  const idx = funcName.indexOf("__");
  if (idx < 0) return null;
  return { server: funcName.slice(0, idx), tool: funcName.slice(idx + 2) };
}

// ---------------------------------------------------------------------------
// Tool filtering
// ---------------------------------------------------------------------------

/**
 * Check whether a tool name matches an allowed/disallowed pattern.
 * Supports exact names and wildcard patterns ending with *.
 * The patterns can use the mcp__{server}__{tool} convention from claude-agent-sdk;
 * we normalise by stripping the leading mcp__ prefix for comparison.
 */
function matchesPattern(toolName: string, pattern: string): boolean {
  if (pattern === toolName) return true;
  const norm = (s: string) => (s.startsWith("mcp__") ? s.slice(5) : s);
  if (pattern.endsWith("*")) {
    return norm(toolName).startsWith(norm(pattern.slice(0, -1)));
  }
  return norm(toolName) === norm(pattern);
}

function isToolAllowed(
  toolName: string,
  allowedTools?: string[],
  disallowedTools?: string[],
): boolean {
  if (disallowedTools?.some((p) => matchesPattern(toolName, p))) return false;
  if (!allowedTools || allowedTools.length === 0) return true;
  return allowedTools.some((p) => matchesPattern(toolName, p));
}

// ---------------------------------------------------------------------------
// Cost estimation
// ---------------------------------------------------------------------------

/** Rough pricing (USD per million tokens) — updated 2025. */
const PRICING: Record<string, { input: number; output: number }> = {
  "codex-mini-latest": { input: 1.5, output: 6.0 },
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "o4-mini": { input: 1.1, output: 4.4 },
};

function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] ?? { input: 2.0, output: 8.0 };
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

// ---------------------------------------------------------------------------
// Built-in WebFetch tool handler
// ---------------------------------------------------------------------------

async function executeWebFetch(args: { url?: string; prompt?: string }): Promise<string> {
  const url = args.url;
  if (!url) return "Error: url is required";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; boop-agent/1.0)" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return `Error fetching ${url}: HTTP ${res.status}`;
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("text/") || contentType.includes("application/json")) {
      const text = await res.text();
      return text.length > 15_000 ? text.slice(0, 15_000) + "\n...(truncated)" : text;
    }
    return `Non-text content at ${url}: ${contentType}`;
  } catch (err) {
    return `Error fetching ${url}: ${String(err)}`;
  }
}

// ---------------------------------------------------------------------------
// query() — main entry point
// ---------------------------------------------------------------------------

type McpServerMap = Record<string, McpSdkServerConfigWithInstance>;

interface OpenAIQueryOptions {
  systemPrompt?: string;
  model?: string;
  mcpServers?: McpServerMap;
  allowedTools?: string[];
  disallowedTools?: string[];
  permissionMode?: string;
  abortController?: AbortController;
  settingSources?: string[];
}

export async function* query(opts: {
  prompt: string;
  options: OpenAIQueryOptions;
}): AsyncGenerator<BoopMessage> {
  const openai = getClient();
  const { prompt, options } = opts;
  const {
    systemPrompt,
    model: modelOpt,
    mcpServers,
    allowedTools,
    disallowedTools,
    abortController,
  } = options;

  const model = modelOpt ?? process.env.OPENAI_MODEL ?? "codex-mini-latest";

  // ---- Connect to in-process MCP servers via InMemoryTransport ----
  // Maps sanitised server name → connected MCP Client
  const mcpClients = new Map<string, Client>();
  // Flat list of OpenAI function tool definitions gathered from all MCP servers
  const allFunctionTools: OpenAI.Responses.FunctionTool[] = [];

  for (const [name, config] of Object.entries(mcpServers ?? {})) {
    try {
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      // Connect the McpServer instance (created by createSdkMcpServer) to the server transport
      await config.instance.connect(serverTransport);
      const mcpClient = new Client({ name: "boop-openai-bridge", version: "1.0.0" });
      await mcpClient.connect(clientTransport);

      const toolsResult = await mcpClient.listTools();
      const prefix = name.replace(/[^a-zA-Z0-9_-]/g, "_");
      mcpClients.set(prefix, mcpClient);

      for (const t of toolsResult.tools) {
        allFunctionTools.push({
          type: "function",
          name: toOpenAIToolName(name, t.name),
          description: t.description ?? "",
          parameters: (t.inputSchema ?? {
            type: "object",
            properties: {},
          }) as Record<string, unknown>,
          strict: false,
        });
      }
    } catch (err) {
      console.error(`[provider:openai] failed to connect MCP server "${name}":`, err);
    }
  }

  // ---- Apply tool allow/disallow filtering ----
  const filteredFunctionTools = allFunctionTools.filter((t) =>
    isToolAllowed(t.name, allowedTools, disallowedTools),
  );

  // ---- Build the full tools array for the API call ----
  const apiTools: OpenAI.Responses.Tool[] = [...filteredFunctionTools];

  if (isToolAllowed("WebSearch", allowedTools, disallowedTools)) {
    apiTools.push({ type: "web_search_preview" });
  }

  if (isToolAllowed("WebFetch", allowedTools, disallowedTools)) {
    apiTools.push({
      type: "function",
      name: "WebFetch",
      description:
        "Fetch the HTML or text content of a specific URL. Use when you have a known URL and need to read its contents.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL to fetch" },
          prompt: { type: "string", description: "What you are looking for on this page" },
        },
        required: ["url"],
      },
      strict: false,
    });
  }

  // ---- Stateless agent loop (Responses API) ----
  // We maintain the full conversation client-side and pass it on every turn.
  // This avoids server-side session storage and works with store:false.
  let conversationInput: OpenAI.Responses.ResponseInputItem[] = [
    { role: "user", content: prompt } as OpenAI.Responses.EasyInputMessage,
  ];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  let continueLoop = true;
  while (continueLoop) {
    continueLoop = false;

    const response = await openai.responses.create(
      {
        model,
        instructions: systemPrompt,
        input: conversationInput,
        ...(apiTools.length > 0 ? { tools: apiTools } : {}),
        store: false,
      },
      { signal: abortController?.signal },
    );

    totalInputTokens += response.usage?.input_tokens ?? 0;
    totalOutputTokens += response.usage?.output_tokens ?? 0;

    // Collect function calls from this turn
    const pendingCalls: OpenAI.Responses.ResponseFunctionToolCall[] = [];

    for (const item of response.output) {
      if (item.type === "message") {
        // Yield text content
        for (const content of item.content) {
          if (content.type === "output_text" && content.text) {
            yield {
              type: "assistant",
              message: { content: [{ type: "text", text: content.text }] },
            };
          }
        }
      } else if (item.type === "function_call") {
        pendingCalls.push(item);
        // Yield a tool_use block so execution-agent can log it
        yield {
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                id: item.call_id,
                name: item.name,
                input: (() => {
                  try {
                    return JSON.parse(item.arguments || "{}");
                  } catch {
                    return {};
                  }
                })(),
              },
            ],
          },
        };
      }
    }

    if (pendingCalls.length > 0) {
      continueLoop = true;

      // Append this turn's output to conversation so the next call has full context
      conversationInput = [
        ...conversationInput,
        ...(response.output as OpenAI.Responses.ResponseInputItem[]),
      ];

      // Execute each tool call and collect results
      const toolResultItems: OpenAI.Responses.ResponseInputItem[] = [];

      for (const call of pendingCalls) {
        let result: string;
        try {
          if (call.name === "WebFetch") {
            result = await executeWebFetch(
              JSON.parse(call.arguments || "{}") as { url?: string; prompt?: string },
            );
          } else {
            const parsed = parseOpenAIToolName(call.name);
            if (!parsed) throw new Error(`Unknown tool: ${call.name}`);
            const mcpClient = mcpClients.get(parsed.server);
            if (!mcpClient) throw new Error(`No MCP client for server: "${parsed.server}"`);
            const mcpResult = await mcpClient.callTool({
              name: parsed.tool,
              arguments: JSON.parse(call.arguments || "{}") as Record<string, unknown>,
            });
            result = (
              mcpResult.content as Array<{ type: string; text?: string }>
            )
              .map((c) => (c.type === "text" ? (c.text ?? "") : JSON.stringify(c)))
              .join("");
          }
        } catch (err) {
          result = `Error: ${String(err)}`;
        }

        // Yield so execution-agent can log tool results
        yield {
          type: "user",
          message: { content: [{ type: "tool_result", content: result }] },
        };

        toolResultItems.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: result,
        } as unknown as OpenAI.Responses.ResponseInputItem);
      }

      conversationInput = [...conversationInput, ...toolResultItems];
    }
  }

  // ---- Emit result with aggregated usage ----
  const costUsd = estimateCostUsd(model, totalInputTokens, totalOutputTokens);
  yield {
    type: "result",
    total_cost_usd: costUsd,
    modelUsage: {
      [model]: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
    },
  } as unknown as BoopMessage;

  // ---- Clean up MCP clients ----
  await Promise.allSettled([...mcpClients.values()].map((c) => c.close()));
}
