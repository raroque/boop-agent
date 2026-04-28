import type {
  McpSdkServerConfigWithInstance,
  Query,
  SdkMcpToolDefinition,
} from "./types.js";

const provider = process.env.AI_PROVIDER || "anthropic";

const { tool: t, createSdkMcpServer: c, query: q } = provider === "codex"
  ? await import("./codex.js")
  : await import("@anthropic-ai/claude-agent-sdk");

export const tool = t as <T = unknown>(
  name: string,
  description: string,
  inputSchema: unknown,
  handler: (args: any, extra: any) => any,
) => SdkMcpToolDefinition<T>;
export const createSdkMcpServer = c as (options: {
  name: string;
  version?: string;
  tools?: SdkMcpToolDefinition<any>[];
}) => McpSdkServerConfigWithInstance;
export const query = q as Query;

export * from "./types.js";
