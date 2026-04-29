import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import type { RuntimeRunRequest, RuntimeRunResult, RuntimeTool } from "./types.js";
import { estimateOpenAITextCostUsd } from "../model-pricing.js";
import { EMPTY_RUNTIME_USAGE } from "./types.js";
import { formatError } from "../error-format.js";

type JsonRpcMessage = {
  id?: number;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
};

type Pending = {
  resolve: (value: any) => void;
  reject: (reason?: unknown) => void;
};

function isNoisyCodexSkillWarning(text: string): boolean {
  return text.includes("failed to load skill") && text.includes(".agents\\skills");
}

function spawnCodexAppServer(): ChildProcessWithoutNullStreams {
  if (process.platform === "win32") {
    return spawn("cmd", ["/d", "/s", "/c", "codex", "app-server", "--listen", "stdio://"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
  }
  return spawn("codex", ["app-server", "--listen", "stdio://"], {
    stdio: ["pipe", "pipe", "pipe"],
  });
}

class CodexAppServerClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private lineBuffer = "";
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
  private usage = { ...EMPTY_RUNTIME_USAGE };

  async run(request: RuntimeRunRequest): Promise<RuntimeRunResult> {
    this.request = request;
    this.tools = new Map(
      request.tools.map((runtimeTool) => [
        `${runtimeTool.namespace}:${runtimeTool.name}`,
        runtimeTool,
      ]),
    );
    this.reply = "";
    this.currentAgentMessageId = "";
    this.currentAgentMessageText = "";
    this.usage = { ...EMPTY_RUNTIME_USAGE, model: request.model };
    this.child = spawnCodexAppServer();
    this.child.stdout.on("data", (chunk) => this.onStdout(chunk));
    this.child.stderr.on("data", (chunk) => {
      const text = chunk.toString().trim();
      if (text && !isNoisyCodexSkillWarning(text)) {
        console.warn(`[codex-app-server] ${text}`);
      }
    });
    this.child.on("exit", (code, signal) => {
      const err = new Error(`codex app-server exited (${code ?? signal ?? "unknown"})`);
      for (const pending of this.pending.values()) pending.reject(err);
      this.pending.clear();
      this.turnCompletion?.reject(err);
    });

    try {
      await this.call("initialize", {
        clientInfo: { name: "boop-agent", title: "Boop Agent", version: "0.1.0" },
        capabilities: { experimentalApi: true },
      });
      const threadResponse = await this.call("thread/start", {
        model: request.model,
        reasoningEffort: request.reasoningEffort,
        cwd: request.cwd ?? process.cwd(),
        approvalPolicy: "never",
        permissionProfile:
          request.mode === "dispatcher"
            ? { type: "disabled" }
            : {
                type: "managed",
                network: { enabled: true },
                fileSystem: { type: "restricted", entries: [], globScanMaxDepth: 1 },
              },
        developerInstructions: request.systemPrompt,
        ephemeral: true,
        dynamicTools: request.tools.map((runtimeTool) => ({
          namespace: runtimeTool.namespace,
          name: runtimeTool.name,
          description: runtimeTool.description,
          inputSchema: runtimeTool.jsonSchema,
        })),
        experimentalRawEvents: false,
        persistExtendedHistory: false,
      });
      const threadId = threadResponse.thread.id as string;
      const turnWait = this.waitForTurn();
      const turnCompletion = this.turnCompletion;
      const turnResponse = await this.call("turn/start", {
        threadId,
        input: [{ type: "text", text: request.prompt, text_elements: [] }],
      });
      const turnId = turnResponse.turn.id as string;
      if (turnCompletion && this.turnCompletion === turnCompletion) {
        turnCompletion.turnId = turnId;
        if (this.completedTurns.has(turnId)) turnCompletion.resolve();
      }
      await turnWait;
      return { text: this.reply, usage: this.usage };
    } finally {
      await this.close();
    }
  }

  private call(method: string, params: unknown): Promise<any> {
    if (!this.child) throw new Error("codex app-server is not running");
    const id = this.nextId++;
    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    return promise;
  }

  private respond(id: number, result: unknown): void {
    this.child?.stdin.write(`${JSON.stringify({ id, result })}\n`);
  }

  private onStdout(chunk: Buffer): void {
    this.lineBuffer += chunk.toString();
    let newline = this.lineBuffer.indexOf("\n");
    while (newline >= 0) {
      const rawLine = this.lineBuffer.slice(0, newline).trim();
      this.lineBuffer = this.lineBuffer.slice(newline + 1);
      if (rawLine) this.onMessage(JSON.parse(rawLine) as JsonRpcMessage);
      newline = this.lineBuffer.indexOf("\n");
    }
  }

  private onMessage(message: JsonRpcMessage): void {
    if (typeof message.id === "number" && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(formatError(message.error)));
      else pending.resolve(message.result);
      return;
    }

    if (typeof message.id === "number" && message.method) {
      void this.onServerRequest(message);
      return;
    }

    if (!message.method) return;
    if (message.method === "item/agentMessage/delta") {
      const delta = String(message.params?.delta ?? "");
      const messageId = String(
        message.params?.itemId ??
          message.params?.item_id ??
          message.params?.messageId ??
          message.params?.message_id ??
          message.params?.item?.id ??
          this.currentAgentMessageId ??
          "agent-message",
      );
      if (messageId && messageId !== this.currentAgentMessageId) {
        this.currentAgentMessageId = messageId;
        this.currentAgentMessageText = "";
      }
      this.currentAgentMessageText += delta;
      this.reply = this.currentAgentMessageText || this.reply;
      this.request?.onText?.(delta);
    } else if (message.method === "turn/completed") {
      const turnId = String(message.params?.turn?.id ?? "");
      if (turnId) this.completedTurns.add(turnId);
      if (!this.turnCompletion?.turnId || this.turnCompletion.turnId === turnId) {
        this.turnCompletion?.resolve();
        this.turnCompletion = null;
      }
    } else if (message.method === "thread/tokenUsage/updated") {
      const usage = message.params?.tokenUsage?.total;
      if (usage) {
        const nextUsage = {
          model: this.request?.model ?? this.usage.model,
          inputTokens: Number(usage.inputTokens ?? 0),
          outputTokens: Number(usage.outputTokens ?? 0),
          cacheReadTokens: Number(usage.cachedInputTokens ?? 0),
          cacheCreationTokens: 0,
          costUsd: 0,
        };
        nextUsage.costUsd = estimateOpenAITextCostUsd(nextUsage) ?? 0;
        this.usage = nextUsage;
        void this.request?.onUsage?.(nextUsage);
      }
    } else if (message.method === "error") {
      this.turnCompletion?.reject(new Error(formatError(message.params ?? "Codex app-server error")));
    }
  }

  private async onServerRequest(message: JsonRpcMessage): Promise<void> {
    if (typeof message.id !== "number") return;
    try {
      switch (message.method) {
        case "item/tool/call": {
          const namespace = String(message.params?.namespace ?? "");
          const toolName = String(message.params?.tool ?? "");
          const runtimeTool = this.tools.get(`${namespace}:${toolName}`);
          if (!runtimeTool) {
            this.respond(message.id, {
              success: false,
              contentItems: [{ type: "inputText", text: `Unknown tool ${namespace}.${toolName}` }],
            });
            return;
          }
          const args =
            message.params?.arguments && typeof message.params.arguments === "object"
              ? (message.params.arguments as Record<string, unknown>)
              : {};
          await this.request?.onToolUse?.(`mcp__${namespace}__${toolName}`, args);
          const result = await runtimeTool.handle(args);
          await this.request?.onToolResult?.(`mcp__${namespace}__${toolName}`, result.text);
          this.respond(message.id, {
            success: result.success ?? true,
            contentItems: [{ type: "inputText", text: result.text }],
          });
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
      this.respond(message.id, {
        success: false,
        contentItems: [{ type: "inputText", text: formatError(err) }],
      });
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
  }
}

export async function runCodexAppServerAgent(
  request: RuntimeRunRequest,
): Promise<RuntimeRunResult> {
  return new CodexAppServerClient().run(request);
}
