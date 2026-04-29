import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export interface CodexModelInfo {
  id: string;
  model: string;
  displayName: string;
  description: string;
  hidden: boolean;
  isDefault: boolean;
  upgrade?: string | null;
  defaultReasoningEffort?: string;
  supportedReasoningEfforts?: Array<{ reasoningEffort: string; description: string }>;
}

const CODEX_MODEL_CACHE_MS = 60_000;
const CODEX_MODEL_LIST_TIMEOUT_MS = 8_000;

let cachedCodexModels: { at: number; models: CodexModelInfo[] } | null = null;

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

async function queryCodexModels(): Promise<CodexModelInfo[]> {
  const child = spawnCodexAppServer();
  let nextId = 1;
  let buffer = "";
  const pending = new Map<
    number,
    { resolve: (value: any) => void; reject: (reason?: unknown) => void }
  >();

  const rejectPending = (reason: unknown) => {
    for (const current of pending.values()) current.reject(reason);
    pending.clear();
  };

  const timeout = setTimeout(() => {
    rejectPending(new Error("codex app-server model/list timed out"));
    if (!child.killed) child.kill();
  }, CODEX_MODEL_LIST_TIMEOUT_MS);

  const call = (method: string, params: unknown): Promise<any> => {
    const id = nextId++;
    const promise = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    return promise;
  };

  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const rawLine = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (rawLine) {
        let message: { id?: number; method?: string; result?: any; error?: any };
        try {
          message = JSON.parse(rawLine);
        } catch (err) {
          console.warn("[codex-models] ignored malformed app-server message", err);
          newline = buffer.indexOf("\n");
          continue;
        }
        if (typeof message.id === "number" && !message.method) {
          const current = pending.get(message.id);
          if (current) {
            pending.delete(message.id);
            message.error ? current.reject(message.error) : current.resolve(message.result);
          }
        } else if (typeof message.id === "number" && message.method) {
          child.stdin.write(`${JSON.stringify({ id: message.id, result: null })}\n`);
        }
      }
      newline = buffer.indexOf("\n");
    }
  });

  child.stderr.on("data", (chunk) => {
    const text = chunk.toString().trim();
    if (text && !text.includes("failed to load skill")) {
      console.warn(`[codex-models] ${text}`);
    }
  });

  child.on("exit", (code, signal) => {
    const err = new Error(`codex app-server exited while listing models (${code ?? signal ?? "unknown"})`);
    rejectPending(err);
  });
  child.on("error", rejectPending);

  try {
    await call("initialize", {
      clientInfo: { name: "boop-agent", title: "Boop Agent", version: "0.1.0" },
      capabilities: { experimentalApi: true },
    });
    const response = await call("model/list", { includeHidden: false, limit: 100 });
    return ((response?.data ?? []) as CodexModelInfo[]).filter((model) => !model.hidden);
  } finally {
    clearTimeout(timeout);
    if (!child.killed) child.kill();
  }
}

export async function listCodexModels(): Promise<CodexModelInfo[]> {
  if (cachedCodexModels && Date.now() - cachedCodexModels.at < CODEX_MODEL_CACHE_MS) {
    return cachedCodexModels.models;
  }
  const models = await queryCodexModels();
  cachedCodexModels = { at: Date.now(), models };
  return models;
}

export async function listCodexModelNames(): Promise<string[]> {
  return (await listCodexModels()).map((model) => model.model);
}

export async function resolveCodexModelInput(input: string): Promise<string | null> {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return null;
  const models = await listCodexModels();
  const match = models.find((model) => {
    return (
      model.model.toLowerCase() === normalized ||
      model.id.toLowerCase() === normalized ||
      model.displayName.toLowerCase() === normalized
    );
  });
  return match?.model ?? null;
}
