import {
  createSdkMcpServer,
  query,
  tool,
  type McpServerConfig,
  type McpSdkServerConfigWithInstance,
} from "@anthropic-ai/claude-agent-sdk";
import type { RuntimeRunRequest, RuntimeRunResult, RuntimeTool } from "./types.js";
import { aggregateUsageFromResult, EMPTY_USAGE } from "../usage.js";

export function createClaudeMcpServer(
  name: string,
  tools: RuntimeTool[],
): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name,
    version: "0.1.0",
    tools: tools.map((runtimeTool) =>
      tool(
        runtimeTool.name,
        runtimeTool.description,
        runtimeTool.inputSchema,
        async (args) => {
          const result = await runtimeTool.handle(args as Record<string, unknown>);
          return {
            content: [{ type: "text" as const, text: result.text }],
          };
        },
      ),
    ),
  });
}

export async function runClaudeAgent(request: RuntimeRunRequest): Promise<RuntimeRunResult> {
  const runtimeServers = new Map<string, RuntimeTool[]>();
  for (const runtimeTool of request.tools) {
    const list = runtimeServers.get(runtimeTool.namespace) ?? [];
    list.push(runtimeTool);
    runtimeServers.set(runtimeTool.namespace, list);
  }

  const mcpServers = {
    ...(request.claudeMcpServers ?? {}),
    ...Object.fromEntries(
      [...runtimeServers.entries()].map(([name, tools]) => [
        name,
        createClaudeMcpServer(name, tools),
      ]),
    ),
  } as Record<string, McpServerConfig>;

  let text = "";
  let lastAssistantText = "";
  let usage = { ...EMPTY_USAGE, model: request.model };

  for await (const msg of query({
    prompt: request.prompt,
    options: {
      systemPrompt: request.systemPrompt,
      model: request.model,
      mcpServers,
      allowedTools: request.allowedTools,
      disallowedTools: request.disallowedTools,
      ...(request.mode === "execution" ? { settingSources: ["project"] as const } : {}),
      permissionMode: "bypassPermissions",
      abortController: request.abortController,
    },
  })) {
    if (msg.type === "assistant") {
      let assistantText = "";
      for (const block of msg.message.content) {
        if (block.type === "text") {
          text += block.text;
          assistantText += block.text;
          await request.onText?.(block.text);
        } else if (block.type === "tool_use") {
          await request.onToolUse?.(block.name, block.input);
        }
      }
      if (assistantText.trim()) lastAssistantText = assistantText;
    } else if (msg.type === "user") {
      for (const block of msg.message.content) {
        if (typeof block !== "string" && block.type === "tool_result") {
          const resultText = Array.isArray(block.content)
            ? block.content
                .map((c: string | { type: string; text?: string }) =>
                  typeof c === "string" ? c : c.type === "text" ? (c.text ?? "") : "",
                )
                .join("")
            : String(block.content ?? "");
          await request.onToolResult?.("tool_result", resultText);
        }
      }
    } else if (msg.type === "result") {
      usage = aggregateUsageFromResult(msg, request.model);
      await request.onUsage?.(usage);
    }
  }

  return { text: lastAssistantText || text, usage };
}
