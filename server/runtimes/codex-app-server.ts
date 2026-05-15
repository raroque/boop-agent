import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import readline from "node:readline";
import type { ClientNotification } from "./codex-app-server-protocol/ClientNotification.js";
import type { ClientRequest } from "./codex-app-server-protocol/ClientRequest.js";
import type { InitializeResponse } from "./codex-app-server-protocol/InitializeResponse.js";
import type { JsonValue } from "./codex-app-server-protocol/serde_json/JsonValue.js";
import type { RequestId } from "./codex-app-server-protocol/RequestId.js";
import type { ServerNotification } from "./codex-app-server-protocol/ServerNotification.js";
import type { ServerRequest } from "./codex-app-server-protocol/ServerRequest.js";
import type { DynamicToolCallResponse } from "./codex-app-server-protocol/v2/DynamicToolCallResponse.js";
import type { SandboxPolicy } from "./codex-app-server-protocol/v2/SandboxPolicy.js";
import type { ThreadStartParams } from "./codex-app-server-protocol/v2/ThreadStartParams.js";
import type { ThreadStartResponse } from "./codex-app-server-protocol/v2/ThreadStartResponse.js";
import type { TurnStartParams } from "./codex-app-server-protocol/v2/TurnStartParams.js";
import type { TurnStartResponse } from "./codex-app-server-protocol/v2/TurnStartResponse.js";
import type { RuntimeRunRequest, RuntimeRunResult, RuntimeTool } from "./types.js";
import { EMPTY_USAGE, estimateOpenAiCostUsd, type UsageTotals } from "../usage.js";
import { formatError } from "../error-format.js";

type ClientRequestForMethod<M extends ClientRequest["method"]> = Extract<
  ClientRequest,
  { method: M }
>;

type ClientRequestParams<M extends ClientRequest["method"]> =
  ClientRequestForMethod<M>["params"];

type ClientResponseByMethod = {
  initialize: InitializeResponse;
  "thread/start": ThreadStartResponse;
  "turn/start": TurnStartResponse;
};

type CodexClientMessage = ClientNotification | ClientRequest;
type CodexServerMessage = ServerNotification | ServerRequest | JsonRpcResponse;

type JsonRpcResponse<Result = unknown> = {
  id: RequestId;
  result?: Result;
  error?: unknown;
};

type Pending<Result = unknown> = {
  resolve: (value: Result) => void;
  reject: (reason?: unknown) => void;
};

function createIsolatedCodexHome(): string {
  const sourceHome = process.env.BOOP_CODEX_AUTH_HOME ?? process.env.CODEX_HOME ?? join(homedir(), ".codex");
  const sourceAuth = join(sourceHome, "auth.json");
  if (!existsSync(sourceAuth)) {
    throw new Error(
      `Codex auth not found at ${sourceAuth}. Run codex login or set BOOP_CODEX_AUTH_HOME to a Codex home containing auth.json.`,
    );
  }
  const codexHome = mkdtempSync(join(tmpdir(), "boop-codex-home."));
  mkdirSync(join(codexHome, "workspace"));
  const targetAuth = join(codexHome, "auth.json");
  try {
    symlinkSync(sourceAuth, targetAuth);
  } catch {
    copyFileSync(sourceAuth, targetAuth);
  }
  writeFileSync(
    join(codexHome, "config.toml"),
    [
      'model = "gpt-5.5"',
      'approval_policy = "never"',
      'sandbox_mode = "read-only"',
      'web_search = "disabled"',
      "",
    ].join("\n"),
  );
  return codexHome;
}

function spawnCodexAppServer(): {
  child: ChildProcessWithoutNullStreams;
  codexHome: string;
} {
  const codexHome = createIsolatedCodexHome();
  const env = { ...process.env, CODEX_HOME: codexHome };
  const args = [
    "app-server",
    "--listen",
    "stdio://",
    "--disable",
    "plugins",
    "--disable",
    "apps",
    "--disable",
    "computer_use",
    "--disable",
    "browser_use",
    "--disable",
    "in_app_browser",
    "--disable",
    "image_generation",
    "--disable",
    "multi_agent",
    "--disable",
    "shell_tool",
    "--disable",
    "unified_exec",
  ];
  if (process.platform === "win32") {
    return {
      codexHome,
      child: spawn("cmd", ["/d", "/s", "/c", "codex", ...args], {
        env,
        stdio: ["pipe", "pipe", "pipe"],
      }),
    };
  }
  return {
    codexHome,
    child: spawn("codex", args, {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    }),
  };
}

function codexConfigForMode(mode: RuntimeRunRequest["mode"]): ThreadStartParams["config"] {
  if (mode === "execution") {
    return { web_search: "live" };
  }
  return { web_search: "disabled" };
}

function codexSandboxForMode(mode: RuntimeRunRequest["mode"]): SandboxPolicy {
  if (mode === "dispatcher" || mode === "background") {
    return { type: "readOnly", networkAccess: false };
  }
  return { type: "readOnly", networkAccess: true };
}

function codexReasoningEffort(
  effort: RuntimeRunRequest["reasoningEffort"],
): TurnStartParams["effort"] {
  // Current Codex subscription models reject "minimal" even though the
  // broader protocol type includes it. Keep Boop's shared runtime setting
  // portable by choosing the nearest supported Codex value.
  if (effort === "minimal") return "low";
  return effort ?? "medium";
}

const CODEX_USER_FACING_VOICE_OVERLAY = `Codex runtime voice override:
- You are powering Boop, the user's personal iMessage agent. You are not speaking as Codex.
- Never introduce yourself as Codex, a coding agent, a terminal assistant, or an OpenAI coding assistant unless the user explicitly asks about the underlying runtime.
- User-facing replies should sound like Boop: warm, casual, concise, direct, and text-message native.
- Do not narrate implementation mechanics. Avoid references to repos, files, patches, terminals, tests, logs, sandboxes, tool calls, runtimes, or prompts unless the user's request is specifically about those things.
- When work was completed by tools or sub-agents, summarize the useful result in Boop's voice. Do not hand off a Codex-style engineering status report.
- If the user asks what you are, say you are Boop. If asked what provider is running you, you may say this turn is using Codex.`;

function developerInstructionsForRequest(request: RuntimeRunRequest): string {
  if (request.mode === "background") return request.systemPrompt;
  return `${CODEX_USER_FACING_VOICE_OVERLAY}\n\n${request.systemPrompt}`;
}

function isNoisyCodexWarning(text: string): boolean {
  return text.includes("ignoring interface.defaultPrompt") || text.includes("failed to load skill");
}

function runtimeToolId(runtimeTool: RuntimeTool): string {
  return `mcp__${runtimeTool.namespace}__${runtimeTool.name}`;
}

function matchesToolPattern(toolId: string, pattern: string): boolean {
  return pattern.endsWith("__*")
    ? toolId.startsWith(pattern.slice(0, -"__*".length))
    : toolId === pattern;
}

function isRuntimeToolAllowed(
  request: RuntimeRunRequest,
  runtimeTool: RuntimeTool,
): boolean {
  const toolId = runtimeToolId(runtimeTool);
  if (request.disallowedTools?.some((pattern) => matchesToolPattern(toolId, pattern))) {
    return false;
  }
  if (request.allowedTools) {
    return request.allowedTools.some((pattern) => matchesToolPattern(toolId, pattern));
  }
  return true;
}

function asJsonValue(value: unknown): JsonValue {
  return value as JsonValue;
}

function isJsonRpcResponse(message: CodexServerMessage): message is JsonRpcResponse {
  return typeof (message as { id?: unknown }).id === "number" && !("method" in message);
}

function isServerRequest(message: CodexServerMessage): message is ServerRequest {
  return typeof (message as { id?: unknown }).id === "number" && "method" in message;
}

class CodexAppServerClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private codexHome: string | null = null;
  private nextId = 1;
  private pending = new Map<RequestId, Pending<any>>();
  private request: RuntimeRunRequest | null = null;
  private tools = new Map<string, RuntimeTool>();
  private turnCompletion: {
    turnId: string;
    resolve: () => void;
    reject: (reason?: unknown) => void;
  } | null = null;
  private completedTurns = new Set<string>();
  private reply = "";
  private currentAgentMessageId = "";
  private currentAgentMessageText = "";
  private usage: UsageTotals = { ...EMPTY_USAGE };

  async run(request: RuntimeRunRequest): Promise<RuntimeRunResult> {
    this.request = request;
    const availableTools = request.tools.filter((runtimeTool) =>
      isRuntimeToolAllowed(request, runtimeTool),
    );
    this.tools = new Map(
      availableTools.map((runtimeTool) => [
        `${runtimeTool.namespace}:${runtimeTool.name}`,
        runtimeTool,
      ]),
    );
    this.reply = "";
    this.currentAgentMessageId = "";
    this.currentAgentMessageText = "";
    this.usage = { ...EMPTY_USAGE, model: request.model };
    const spawned = spawnCodexAppServer();
    this.child = spawned.child;
    this.codexHome = spawned.codexHome;

    const abortSignal = request.abortController?.signal;
    let abortHandled = false;
    const onAbort = () => {
      if (abortHandled) return;
      abortHandled = true;
      const err = new Error("Codex runtime aborted");
      for (const pending of this.pending.values()) pending.reject(err);
      this.pending.clear();
      const turnCompletion = this.turnCompletion;
      this.turnCompletion = null;
      turnCompletion?.reject(err);
      void this.close();
    };
    if (abortSignal?.aborted) onAbort();
    else abortSignal?.addEventListener("abort", onAbort, { once: true });

    const stdout = readline.createInterface({ input: this.child.stdout });
    stdout.on("line", (line) => this.onLine(line));
    this.child.stderr.on("data", (chunk) => {
      const text = chunk.toString().trim();
      if (text && !isNoisyCodexWarning(text)) {
        console.warn(`[codex-app-server] ${text}`);
      }
    });
    this.child.on("exit", (code, signal) => {
      const err = new Error(`codex app-server exited (${code ?? signal ?? "unknown"})`);
      for (const pending of this.pending.values()) pending.reject(err);
      this.pending.clear();
      const turnCompletion = this.turnCompletion;
      this.turnCompletion = null;
      turnCompletion?.reject(err);
    });

    try {
      await this.call("initialize", {
        clientInfo: { name: "boop-agent", title: "Boop Agent", version: "0.2.0" },
        capabilities: { experimentalApi: true },
      });
      this.notify({ method: "initialized" });
      const threadResponse = await this.call("thread/start", {
        model: request.model,
        cwd: request.cwd ?? join(spawned.codexHome, "workspace"),
        approvalPolicy: "never",
        sandbox: "read-only",
        config: codexConfigForMode(request.mode),
        developerInstructions: developerInstructionsForRequest(request),
        ephemeral: true,
        dynamicTools: availableTools.map((runtimeTool) => ({
          namespace: runtimeTool.namespace,
          name: runtimeTool.name,
          description: runtimeTool.description,
          inputSchema: asJsonValue(runtimeTool.jsonSchema),
        })),
        experimentalRawEvents: false,
        persistExtendedHistory: false,
      });
      const threadId = String(threadResponse.thread.id);
      const turnWait = this.waitForTurn();
      const turnCompletion = this.turnCompletion;
      const turnResponse = await this.call("turn/start", {
        threadId,
        input: [{ type: "text", text: request.prompt, text_elements: [] }],
        approvalPolicy: "never",
        sandboxPolicy: codexSandboxForMode(request.mode),
        model: request.model,
        effort: codexReasoningEffort(request.reasoningEffort),
      });
      const turnId = String(turnResponse.turn.id);
      if (turnCompletion && this.turnCompletion === turnCompletion) {
        turnCompletion.turnId = turnId;
        if (this.completedTurns.has(turnId)) turnCompletion.resolve();
      }
      await turnWait;
      return { text: this.reply, usage: this.usage };
    } finally {
      abortSignal?.removeEventListener("abort", onAbort);
      stdout.close();
      await this.close();
    }
  }

  private call<M extends keyof ClientResponseByMethod & ClientRequest["method"]>(
    method: M,
    params: ClientRequestParams<M>,
  ): Promise<ClientResponseByMethod[M]> {
    if (!this.child) throw new Error("codex app-server is not running");
    const id = this.nextId++;
    const promise = new Promise<ClientResponseByMethod[M]>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    const message = { id, method, params } as ClientRequestForMethod<M>;
    this.writeClientMessage(message);
    return promise;
  }

  private notify(message: ClientNotification): void {
    this.writeClientMessage(message);
  }

  private writeClientMessage(message: CodexClientMessage): void {
    this.child?.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private respond(id: RequestId, result: unknown): void {
    this.child?.stdin.write(`${JSON.stringify({ id, result })}\n`);
  }

  private onLine(line: string): void {
    const rawLine = line.trim();
    if (!rawLine) return;
    let message: CodexServerMessage;
    try {
      message = JSON.parse(rawLine) as CodexServerMessage;
    } catch (err) {
      console.warn("[codex-app-server] ignored malformed stdout line", err);
      return;
    }
    this.onMessage(message);
  }

  private onMessage(message: CodexServerMessage): void {
    if (isJsonRpcResponse(message)) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(formatError(message.error)));
      else pending.resolve(message.result);
      return;
    }

    if (isServerRequest(message)) {
      void this.onServerRequest(message);
      return;
    }

    if (message.method === "item/agentMessage/delta") {
      const { delta, itemId } = message.params;
      const messageId = itemId || this.currentAgentMessageId || "agent-message";
      if (messageId && messageId !== this.currentAgentMessageId) {
        this.currentAgentMessageId = messageId;
        this.currentAgentMessageText = "";
      }
      this.currentAgentMessageText += delta;
      this.reply = this.currentAgentMessageText || this.reply;
      void this.request?.onText?.(delta);
    } else if (message.method === "turn/completed") {
      const turnId = message.params.turn.id;
      if (turnId) this.completedTurns.add(turnId);
      if (!this.turnCompletion?.turnId || this.turnCompletion.turnId === turnId) {
        this.turnCompletion?.resolve();
        this.turnCompletion = null;
      }
    } else if (message.method === "thread/tokenUsage/updated") {
      const usage = message.params.tokenUsage.total;
      if (usage) {
        const nextUsage: UsageTotals = {
          model: this.request?.model ?? this.usage.model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheReadTokens: usage.cachedInputTokens,
          cacheCreationTokens: 0,
          costUsd: 0,
        };
        nextUsage.costUsd = estimateOpenAiCostUsd(nextUsage);
        this.usage = nextUsage;
        void this.request?.onUsage?.(nextUsage);
      }
    } else if (message.method === "error") {
      this.turnCompletion?.reject(new Error(formatError(message.params.error)));
    }
  }

  private async onServerRequest(message: ServerRequest): Promise<void> {
    try {
      switch (message.method) {
        case "item/tool/call": {
          const namespace = message.params.namespace ?? "";
          const toolName = message.params.tool;
          const runtimeTool = this.tools.get(`${namespace}:${toolName}`);
          if (!runtimeTool) {
            const response: DynamicToolCallResponse = {
              success: false,
              contentItems: [
                { type: "inputText", text: `Unknown tool ${namespace}.${toolName}` },
              ],
            };
            this.respond(message.id, response);
            return;
          }
          const args =
            message.params.arguments && typeof message.params.arguments === "object"
              ? (message.params.arguments as Record<string, unknown>)
              : {};
          await this.request?.onToolUse?.(`mcp__${namespace}__${toolName}`, args);
          const result = await runtimeTool.handle(args);
          await this.request?.onToolResult?.(`mcp__${namespace}__${toolName}`, result.text);
          const response: DynamicToolCallResponse = {
            success: result.success ?? true,
            contentItems: [{ type: "inputText", text: result.text }],
          };
          this.respond(message.id, response);
          return;
        }
        case "item/commandExecution/requestApproval":
          this.respond(message.id, { decision: "decline" });
          return;
        case "item/fileChange/requestApproval":
          this.respond(message.id, { decision: "decline" });
          return;
        case "item/permissions/requestApproval":
          this.respond(message.id, {
            permissions: {},
            scope: "turn",
            strictAutoReview: true,
          });
          return;
        case "item/tool/requestUserInput":
          this.respond(message.id, { answers: {} });
          return;
        default:
          this.respond(message.id, null);
      }
    } catch (err) {
      const response: DynamicToolCallResponse = {
        success: false,
        contentItems: [{ type: "inputText", text: formatError(err) }],
      };
      this.respond(message.id, response);
    }
  }

  private waitForTurn(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.turnCompletion = { turnId: "", resolve, reject };
    });
  }

  private async close(): Promise<void> {
    if (!this.child) return;
    const child = this.child;
    this.child = null;
    if (!child.killed) child.kill();
    await Promise.race([
      once(child, "exit").catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
    if (this.codexHome) {
      rmSync(this.codexHome, { recursive: true, force: true });
      this.codexHome = null;
    }
  }
}

export async function runCodexAppServerAgent(
  request: RuntimeRunRequest,
): Promise<RuntimeRunResult> {
  return new CodexAppServerClient().run(request);
}
