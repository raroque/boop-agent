export interface SDKTextBlock {
  type: "text";
  text: string;
}

export interface SDKToolUseBlock {
  type: "tool_use";
  name: string;
  input: unknown;
}

export type SDKContentBlock = SDKTextBlock | SDKToolUseBlock;

export interface SDKAssistantMessage {
  type: "assistant";
  message: {
    content: SDKContentBlock[];
  };
}

export interface SDKResultMessage {
  type: "result";
  modelUsage?: Record<
    string,
    {
      inputTokens?: number;
      outputTokens?: number;
      cacheReadInputTokens?: number;
      cacheCreationInputTokens?: number;
    }
  >;
  total_cost_usd?: number;
  [key: string]: unknown;
}

export interface SDKToolResultBlock {
  type: "tool_result";
  content?: unknown;
}

export interface SDKToolResultMessage {
  type: "user";
  message: {
    content: SDKToolResultBlock[];
  };
}

export type SDKMessage = SDKAssistantMessage | SDKResultMessage | SDKToolResultMessage;

export interface SDKUserMessage {
  role: "user";
  content: unknown;
}

export interface Options {
  systemPrompt?: string;
  model?: string;
  mcpServers?: Record<string, McpSdkServerConfigWithInstance>;
  allowedTools?: string[];
  disallowedTools?: string[];
  permissionMode?: string;
  approvalPolicy?: "never" | "on-request" | "on-failure" | "untrusted";
  abortController?: AbortController;
  settingSources?: string[];
  workingDirectory?: string;
  additionalDirectories?: string[];
  skipGitRepoCheck?: boolean;
  sandboxMode?: "read-only" | "workspace-write" | "danger-full-access";
  networkAccessEnabled?: boolean;
  webSearchMode?: "disabled" | "cached" | "live";
  webSearchEnabled?: boolean;
  modelReasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SdkMcpToolDefinition<T = unknown> {
  name: string;
  description: string;
  inputSchema: unknown;
  handler: (args: T, extra: unknown) => any;
}

export interface McpSdkServerConfigWithInstance {
  name: string;
  type: "sdk";
  instance: {
    connect: (transport: any) => Promise<void>;
  };
}

export type Query = (params: {
  prompt: unknown;
  options?: Options;
}) => AsyncGenerator<SDKMessage>;
