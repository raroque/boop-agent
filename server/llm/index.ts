const provider = process.env.AI_PROVIDER || "anthropic";

const { tool: t, createSdkMcpServer: c, query: q } = provider === "codex"
  ? await import("./codex.js")
  : await import("@anthropic-ai/claude-agent-sdk");

export const tool = t;
export const createSdkMcpServer = c;
export const query = q;

export * from "./types.js";
