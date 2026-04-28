import * as anthropic from "@anthropic-ai/claude-agent-sdk";
import * as codex from "./codex.js";

const provider = process.env.AI_PROVIDER || "anthropic";

export const tool = (provider === "codex") ? codex.tool : anthropic.tool;
export const createSdkMcpServer = (provider === "codex") ? codex.createSdkMcpServer : anthropic.createSdkMcpServer;
export const query = (provider === "codex") ? codex.query : anthropic.query;

export type { Query, Options, SDKUserMessage, SDKResultMessage, SdkMcpToolDefinition, McpSdkServerConfigWithInstance, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
