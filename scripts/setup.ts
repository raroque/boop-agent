#!/usr/bin/env tsx
import prompts from "prompts";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const ENV_PATH = resolve(ROOT, ".env.local");
const EXAMPLE_PATH = resolve(ROOT, ".env.example");

type RuntimeChoice = "claude" | "codex";

const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6";
const DEFAULT_CODEX_MODEL = "gpt-5.5";
const DEFAULT_CODEX_REASONING_EFFORT = "medium";

const CLAUDE_MODEL_CHOICES = [
  { title: "claude-sonnet-4-6 (recommended)", value: "claude-sonnet-4-6" },
  { title: "claude-opus-4-6 (slowest, most capable)", value: "claude-opus-4-6" },
  { title: "claude-haiku-4-5 (fastest, cheapest)", value: "claude-haiku-4-5" },
];

const CODEX_MODEL_CHOICES = [
  { title: "gpt-5.5 (most capable)", value: "gpt-5.5" },
  { title: "gpt-5.4-mini (faster local testing)", value: "gpt-5.4-mini" },
  { title: "gpt-5.4 (balanced)", value: "gpt-5.4" },
  { title: "gpt-5.3-codex (coding optimized)", value: "gpt-5.3-codex" },
];

const CODEX_REASONING_CHOICES = [
  { title: "low (fastest)", value: "low" },
  { title: "medium (recommended)", value: "medium" },
  { title: "high (deeper reasoning)", value: "high" },
  { title: "xhigh (maximum reasoning)", value: "xhigh" },
];

function runtimeFromEnv(value: string | undefined): RuntimeChoice {
  return value === "codex" ? "codex" : "claude";
}

function initialForChoice<T extends readonly { value: string }[]>(
  choices: T,
  value: string | undefined,
  fallback = 0,
): number {
  const index = choices.findIndex((choice) => choice.value === value);
  return index >= 0 ? index : fallback;
}

function readEnv(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const lines = readFileSync(path, "utf8").split("\n");
  const env: Record<string, string> = {};
  for (const line of lines) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function writeEnv(path: string, env: Record<string, string>): void {
  const example = existsSync(EXAMPLE_PATH) ? readFileSync(EXAMPLE_PATH, "utf8") : "";

  let out = "";
  const seen = new Set<string>();
  const sections = example.split(/\n(?=# ----)/);

  for (const section of sections) {
    const sectionKeys = [...section.matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1]);
    let s = section;
    for (const k of sectionKeys) {
      // Remove ALL existing occurrences of this key in the section (dedupe).
      const pattern = new RegExp(`^${k}=.*(\\r?\\n)?`, "gm");
      const matches = [...s.matchAll(pattern)];
      if (matches.length === 0) continue;

      if (seen.has(k)) {
        // Already written in an earlier section — just strip any re-occurrences.
        s = s.replace(pattern, "");
        continue;
      }

      const v = env[k] ?? "";
      // Replace first occurrence, remove the rest.
      let replaced = false;
      s = s.replace(pattern, (match) => {
        if (!replaced) {
          replaced = true;
          return `${k}=${v}` + (match.endsWith("\n") ? "\n" : "");
        }
        return "";
      });
      seen.add(k);
    }
    out += s + "\n";
  }
  writeFileSync(path, out.trim() + "\n");
}

function cleanConvexUrlEnv(path: string): void {
  const envContent = readFileSync(path, "utf8");
  const updated = envContent.replace(/^(?:CONVEX_URL|VITE_CONVEX_URL)=.*(\r?\n)?/gm, "");
  writeFileSync(path, updated);
}

function banner(s: string) {
  console.log("\n" + "━".repeat(60));
  console.log("  " + s);
  console.log("━".repeat(60));
}

async function runConvexDev(): Promise<void> {
  // If CONVEX_DEPLOYMENT is already set, `convex dev` reuses that deployment.
  // Only pass --configure new if this is a first-time setup — otherwise re-running
  // setup would silently create a new project and abandon all existing data.
  const existing = readEnv(ENV_PATH);
  const args = existing.CONVEX_DEPLOYMENT
    ? ["convex", "dev", "--once"]
    : ["convex", "dev", "--once", "--configure", "new"];

  if (!existing.CONVEX_DEPLOYMENT) {
    // Remove old Convex URLs from the env file to allow convex cli to populate
    // the Vite URL cleanly.
    cleanConvexUrlEnv(ENV_PATH);
  }

  console.log(
    `\nLaunching \`npx ${args.join(" ")}\` to configure your deployment.`,
  );
  console.log("Convex will open a browser window if you're not logged in.");
  if (existing.CONVEX_DEPLOYMENT) {
    console.log(`Reusing existing deployment: ${existing.CONVEX_DEPLOYMENT}`);
  }

  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn("npx", args, { stdio: "inherit", cwd: ROOT });
    child.on("exit", (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`convex dev exited ${code}`)),
    );
  });
}

function hasBinary(name: string): Promise<boolean> {
  return new Promise((ok) => {
    const lookup = process.platform === "win32" ? "where" : "which";
    const child = spawn(lookup, [name], { stdio: "ignore" });
    child.on("exit", (code) => ok(code === 0));
    child.on("error", () => ok(false));
  });
}

function openInBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true }).unref();
  } catch {
    /* ignore — fall back to the printed URL */
  }
}

function runInherit(cmd: string, args: string[]): Promise<void> {
  return new Promise((ok, fail) => {
    const child = spawn(cmd, args, { stdio: "inherit", cwd: ROOT });
    child.on("exit", (code) =>
      code === 0 ? ok() : fail(new Error(`${cmd} ${args.join(" ")} exited ${code}`)),
    );
    child.on("error", fail);
  });
}

function runCapture(cmd: string, args: string[]): Promise<string> {
  return new Promise((ok, fail) => {
    const child = spawn(cmd, args, { stdio: ["inherit", "pipe", "pipe"], cwd: ROOT });
    let out = "";
    child.stdout.on("data", (d) => {
      const s = d.toString();
      out += s;
      process.stdout.write(s);
    });
    child.stderr.on("data", (d) => process.stderr.write(d));
    child.on("exit", (code) =>
      code === 0 ? ok(out) : fail(new Error(`${cmd} exited ${code}`)),
    );
    child.on("error", fail);
  });
}

async function sendblueInvoker(): Promise<{ cmd: string; leading: string[] }> {
  if (await hasBinary("sendblue")) return { cmd: "sendblue", leading: [] };
  return { cmd: "npx", leading: ["-y", "@sendblue/cli"] };
}

interface SendblueKeys {
  apiKey?: string;
  apiSecret?: string;
  fromNumber?: string;
}

type SendblueImportResult = SendblueKeys | "skip" | null;

function parseSendblueKeys(output: string): SendblueKeys {
  const clean = output.replace(/\x1b\[[0-9;]*m/g, "");
  const keys: SendblueKeys = {};

  try {
    const json = JSON.parse(clean);
    if (json.api_key_id || json.apiKeyId) keys.apiKey = json.api_key_id ?? json.apiKeyId;
    if (json.api_secret_key || json.apiSecretKey)
      keys.apiSecret = json.api_secret_key ?? json.apiSecretKey;
    if (json.phone_number || json.phoneNumber)
      keys.fromNumber = json.phone_number ?? json.phoneNumber;
    if (keys.apiKey && keys.apiSecret) return keys;
  } catch {
    /* not json, fall through to text parsing */
  }

  const idMatch = clean.match(
    /(?:API[- ]?Key[- ]?ID|sb[- ]?api[- ]?key[- ]?id|api_key_id|Key Id|API[- ]?Key)[:\s]+\"?([A-Za-z0-9_-]{16,})/i,
  );
  const secretMatch = clean.match(
    /(?:Secret[- ]?Key|API[- ]?Secret|sb[- ]?api[- ]?secret[- ]?key|api_secret|Secret)[:\s]+\"?([A-Za-z0-9_-]{16,})/i,
  );
  const numMatch = clean.match(
    /(?:Phone[- ]?Number|From[- ]?Number|number)[:\s]+\"?(\+?\d{10,15})/i,
  );

  if (idMatch) keys.apiKey = idMatch[1];
  if (secretMatch) keys.apiSecret = secretMatch[1];
  if (numMatch) keys.fromNumber = numMatch[1];
  return keys;
}

function parseSendbluePhones(output: string): string[] {
  const clean = output.replace(/\x1b\[[0-9;]*m/g, "");
  const seen = new Set<string>();
  const numbers: string[] = [];

  try {
    const json = JSON.parse(clean);
    const lines = Array.isArray(json) ? json : (json.lines ?? json.numbers ?? []);
    for (const entry of lines) {
      const n = entry?.phone_number ?? entry?.phoneNumber ?? entry?.number ?? entry;
      if (typeof n === "string" && /^\+?\d{10,15}$/.test(n.replace(/[^\d+]/g, ""))) {
        const norm = n.startsWith("+") ? n : `+${n}`;
        if (!seen.has(norm)) {
          seen.add(norm);
          numbers.push(norm);
        }
      }
    }
    if (numbers.length) return numbers;
  } catch {
    /* not JSON, fall through to text parsing */
  }

  // `sendblue lines` formats like "+1 (305) 336-9541".
  for (const rawLine of clean.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("+")) continue;
    const match = line.match(/^\+[\d ()\-.]{9,25}/);
    if (!match) continue;
    const e164 = "+" + match[0].replace(/\D/g, "");
    if (/^\+\d{10,15}$/.test(e164) && !seen.has(e164)) {
      seen.add(e164);
      numbers.push(e164);
    }
  }
  return numbers;
}

async function importSendblueFromCli(): Promise<SendblueImportResult> {
  const { method } = await prompts(
    {
      type: "select",
      name: "method",
      message: "How do you want to configure Sendblue?",
      choices: [
        { title: "Use the Sendblue CLI (I'll run it — fastest)", value: "cli" },
        { title: "Paste my API keys manually", value: "manual" },
        { title: "Skip for now", value: "skip" },
      ],
      initial: 0,
    },
    {
      onCancel: () => {
        console.log("Setup cancelled.");
        process.exit(1);
      },
    },
  );

  if (method === "manual") return null;
  if (method === "skip") return "skip";

  const { account } = await prompts({
    type: "select",
    name: "account",
    message: "Do you already have a Sendblue account?",
    choices: [
      { title: "Yes — log in", value: "login" },
      { title: "No — create one with `sendblue setup`", value: "setup" },
    ],
    initial: 0,
  });

  const { cmd, leading } = await sendblueInvoker();

  banner("Sendblue CLI");
  try {
    await runInherit(cmd, [...leading, account === "setup" ? "setup" : "login"]);
    console.log("\nFetching your Sendblue keys…\n");
    const output = await runCapture(cmd, [...leading, "show-keys"]);
    const parsed = parseSendblueKeys(output);
    if (!parsed.apiKey || !parsed.apiSecret) {
      console.log(
        `\nCouldn't auto-parse keys from the CLI output. I'll ask for them below — copy/paste from the output above.`,
      );
      return null;
    }
    console.log(`\n✓ Pulled your Sendblue keys from the CLI.`);

    // `show-keys` doesn't include the phone number — it lives in `sendblue lines`.
    if (!parsed.fromNumber) {
      try {
        console.log("\nFetching your provisioned number…\n");
        const linesOutput = await runCapture(cmd, [...leading, "lines"]);
        const phones = parseSendbluePhones(linesOutput);
        if (phones.length === 1) {
          parsed.fromNumber = phones[0];
          console.log(`\n✓ Using ${phones[0]} as SENDBLUE_FROM_NUMBER.`);
        } else if (phones.length > 1) {
          const { pickedNumber } = await prompts({
            type: "select",
            name: "pickedNumber",
            message: "You have multiple Sendblue numbers — which one should Boop reply from?",
            choices: phones.map((p) => ({ title: p, value: p })),
            initial: 0,
          });
          if (pickedNumber) parsed.fromNumber = pickedNumber;
        } else {
          console.log(
            `\n⚠ No provisioned numbers found in \`sendblue lines\`. I'll ask for one below.`,
          );
        }
      } catch (err) {
        console.log(`\n⚠ \`sendblue lines\` failed: ${err}. I'll ask for the number below.`);
      }
    }
    return parsed;
  } catch (err) {
    console.log(`\n⚠ Sendblue CLI failed: ${err}`);
    console.log(`Falling back to manual prompts.`);
    return null;
  }
}

async function main() {
  banner("boop-agent setup");

  console.log(`
What this does:
  1. Pulls your Sendblue keys (via their CLI, or you paste them)
  2. Asks whether Boop should use your Claude Code or Codex subscription
  3. Runs \`npx convex dev\` to create a Convex project
  4. Writes .env.local

Before you start:
  • Claude Code subscription if choosing Claude: https://claude.com/code
  • Codex/ChatGPT account if choosing Codex:     run \`codex login\`
  • Convex account (free tier):                  https://convex.dev
  • Sendblue (free on agent plan):               https://sendblue.com
`);

  const existing = readEnv(ENV_PATH);
  const runtimeDefault = runtimeFromEnv(existing.BOOP_RUNTIME);
  const cli = await importSendblueFromCli();
  const sendblueSkipped = cli === "skip";
  const cliKeys = cli && cli !== "skip" ? cli : null;

  const sendblueDefaults = {
    SENDBLUE_API_KEY: cliKeys?.apiKey ?? existing.SENDBLUE_API_KEY ?? "",
    SENDBLUE_API_SECRET: cliKeys?.apiSecret ?? existing.SENDBLUE_API_SECRET ?? "",
    SENDBLUE_FROM_NUMBER: cliKeys?.fromNumber ?? existing.SENDBLUE_FROM_NUMBER ?? "",
  };

  const sendbluePrompts = [] as any[];
  if (!sendblueSkipped && !sendblueDefaults.SENDBLUE_API_KEY) {
    sendbluePrompts.push({
      type: "text",
      name: "SENDBLUE_API_KEY",
      message: "Sendblue API key id (sb-api-key-id value)",
      initial: "",
    });
  }
  if (!sendblueSkipped && !sendblueDefaults.SENDBLUE_API_SECRET) {
    sendbluePrompts.push({
      type: "password",
      name: "SENDBLUE_API_SECRET",
      message: "Sendblue API secret",
      initial: "",
    });
  }
  if (!sendblueSkipped && !sendblueDefaults.SENDBLUE_FROM_NUMBER) {
    sendbluePrompts.push({
      type: "text",
      name: "SENDBLUE_FROM_NUMBER",
      message:
        "Your Sendblue-provisioned number (the one people text TO, e.g. +14695551234). Required by Sendblue.",
      initial: "",
    });
  }

  const answers = await prompts(
    [
      ...sendbluePrompts,
      {
        type: "select",
        name: "BOOP_RUNTIME",
        message: "Which subscription should Boop use for the agent runtime?",
        choices: [
          {
            title: "Claude Code subscription",
            value: "claude",
            description: "Uses the Claude Agent SDK and your local `claude` login.",
          },
          {
            title: "Codex / ChatGPT subscription",
            value: "codex",
            description: "Uses local `codex app-server` auth from `codex login`.",
          },
        ],
        initial: runtimeDefault === "codex" ? 1 : 0,
      },
      {
        type: (_prev: unknown, values: Record<string, unknown>) =>
          values.BOOP_RUNTIME === "claude" ? "select" : null,
        name: "BOOP_MODEL",
        message: "Which Claude model should the agent use?",
        choices: CLAUDE_MODEL_CHOICES,
        initial: initialForChoice(CLAUDE_MODEL_CHOICES, existing.BOOP_MODEL),
      },
      {
        type: (_prev: unknown, values: Record<string, unknown>) =>
          values.BOOP_RUNTIME === "codex" ? "select" : null,
        name: "BOOP_CODEX_MODEL",
        message: "Which Codex model should the agent use?",
        choices: CODEX_MODEL_CHOICES,
        initial: initialForChoice(CODEX_MODEL_CHOICES, existing.BOOP_CODEX_MODEL),
      },
      {
        type: (_prev: unknown, values: Record<string, unknown>) =>
          values.BOOP_RUNTIME === "codex" ? "select" : null,
        name: "BOOP_CODEX_REASONING_EFFORT",
        message: "How much Codex reasoning effort should Boop use?",
        choices: CODEX_REASONING_CHOICES,
        initial: initialForChoice(
          CODEX_REASONING_CHOICES,
          existing.BOOP_CODEX_REASONING_EFFORT,
          1,
        ),
      },
      {
        type: "text",
        name: "PORT",
        message: "Local server port",
        initial: existing.PORT ?? "3456",
      },
      {
        type: "confirm",
        name: "runConvex",
        message: "Run `convex dev` now to configure your Convex deployment?",
        initial: true,
      },
    ],
    {
      onCancel: () => {
        console.log("Setup cancelled.");
        process.exit(1);
      },
    },
  );

  // Merge CLI-sourced defaults with what the user answered (answer wins).
  Object.assign(answers, {
    BOOP_RUNTIME: answers.BOOP_RUNTIME ?? runtimeDefault,
    BOOP_MODEL: answers.BOOP_MODEL ?? existing.BOOP_MODEL ?? DEFAULT_CLAUDE_MODEL,
    BOOP_CODEX_MODEL:
      answers.BOOP_CODEX_MODEL ?? existing.BOOP_CODEX_MODEL ?? DEFAULT_CODEX_MODEL,
    BOOP_CODEX_REASONING_EFFORT:
      answers.BOOP_CODEX_REASONING_EFFORT ??
      existing.BOOP_CODEX_REASONING_EFFORT ??
      DEFAULT_CODEX_REASONING_EFFORT,
    SENDBLUE_API_KEY: answers.SENDBLUE_API_KEY ?? sendblueDefaults.SENDBLUE_API_KEY,
    SENDBLUE_API_SECRET: answers.SENDBLUE_API_SECRET ?? sendblueDefaults.SENDBLUE_API_SECRET,
    SENDBLUE_FROM_NUMBER: answers.SENDBLUE_FROM_NUMBER ?? sendblueDefaults.SENDBLUE_FROM_NUMBER,
  });

  // ---- Composio API key ---------------------------------------------------
  banner("Composio — integrations (Gmail, Slack, GitHub, Linear, 1000+ more)");
  const composioSettingsUrl = "https://platform.composio.dev/settings";
  const existingComposio = existing.COMPOSIO_API_KEY ?? "";
  const { composioMode } = await prompts(
    {
      type: "select",
      name: "composioMode",
      message: existingComposio
        ? "Composio API key detected. Keep it or replace?"
        : "Configure Composio now? (needed to connect any integration)",
      choices: existingComposio
        ? [
            { title: "Keep existing key", value: "keep" },
            { title: "Replace (opens the Composio dashboard)", value: "replace" },
            { title: "Skip", value: "skip" },
          ]
        : [
            { title: "Yes — open the Composio dashboard and paste my key", value: "replace" },
            { title: "Skip for now", value: "skip" },
          ],
      initial: 0,
    },
    {
      onCancel: () => {
        console.log("Setup cancelled.");
        process.exit(1);
      },
    },
  );

  if (composioMode === "replace") {
    console.log(`\nOpening ${composioSettingsUrl} — grab your API key there.`);
    console.log(`(If the browser doesn't open, copy the URL above.)\n`);
    openInBrowser(composioSettingsUrl);
    const { COMPOSIO_API_KEY } = await prompts(
      {
        type: "password",
        name: "COMPOSIO_API_KEY",
        message: "Paste your Composio API key (leave blank to skip):",
        initial: "",
      },
      {
        onCancel: () => {
          console.log("Setup cancelled.");
          process.exit(1);
        },
      },
    );
    (answers as any).COMPOSIO_API_KEY = COMPOSIO_API_KEY || existingComposio;
  } else if (composioMode === "keep") {
    (answers as any).COMPOSIO_API_KEY = existingComposio;
  } else {
    (answers as any).COMPOSIO_API_KEY = existingComposio;
    console.log(
      `\nSkipped. Add COMPOSIO_API_KEY to .env.local later to enable integrations.`,
    );
  }

  // ---- Embedding provider --------------------------------------------------
  banner("Memory search — embedding provider");
  const existingVoyage = existing.VOYAGE_API_KEY ?? "";
  const existingOpenai = existing.OPENAI_API_KEY ?? "";
  const inferredCurrent = existingVoyage
    ? "voyage"
    : existingOpenai
      ? "openai"
      : "local";
  console.log(`
Boop's recall() searches your stored memories by semantic similarity. Pick
how you want to generate embeddings:

  • Local  — free, runs in-process via @huggingface/transformers
            (Xenova/bge-large-en-v1.5, 1024-dim). First run downloads
            ~440MB and caches forever. No API key.
  • Voyage — paid, ~$0.06/M tokens. Slightly stronger English retrieval.
  • OpenAI — paid, ~$0.13/M tokens. Comparable to Voyage.

All three produce 1024-dim vectors (compatible with the same Convex index)
so you can switch later by adding/removing the API key.
`);
  const { embeddingProvider } = await prompts(
    {
      type: "select",
      name: "embeddingProvider",
      message: "Which embedding provider should boop use?",
      choices: [
        { title: "Local (free, recommended)", value: "local" },
        { title: "Voyage (paid — I have a key)", value: "voyage" },
        { title: "OpenAI (paid — I have a key)", value: "openai" },
      ],
      initial:
        inferredCurrent === "voyage" ? 1 : inferredCurrent === "openai" ? 2 : 0,
    },
    {
      onCancel: () => {
        console.log("Setup cancelled.");
        process.exit(1);
      },
    },
  );

  if (embeddingProvider === "voyage") {
    const { VOYAGE_API_KEY } = await prompts({
      type: "password",
      name: "VOYAGE_API_KEY",
      message: "Paste your Voyage API key (https://dash.voyageai.com):",
      initial: existingVoyage,
    });
    (answers as any).VOYAGE_API_KEY = VOYAGE_API_KEY || "";
    (answers as any).OPENAI_API_KEY = "";
  } else if (embeddingProvider === "openai") {
    const { OPENAI_API_KEY } = await prompts({
      type: "password",
      name: "OPENAI_API_KEY",
      message: "Paste your OpenAI API key:",
      initial: existingOpenai,
    });
    (answers as any).OPENAI_API_KEY = OPENAI_API_KEY || "";
    (answers as any).VOYAGE_API_KEY = "";
  } else {
    // Local — clear any stale paid keys so embeddings.ts falls through to
    // the local provider on next start.
    (answers as any).VOYAGE_API_KEY = "";
    (answers as any).OPENAI_API_KEY = "";

    const { preload } = await prompts({
      type: "confirm",
      name: "preload",
      message:
        "Pre-download the local model now? (~440MB, ~30s on broadband — saves the wait on first recall)",
      initial: true,
    });
    if (preload) {
      console.log("\nDownloading Xenova/bge-large-en-v1.5… (Ctrl+C to skip)\n");
      try {
        await runInherit("npx", ["tsx", "scripts/preload-embeddings.ts"]);
        console.log("✓ Local model cached.");
      } catch (err) {
        console.warn(
          "Preload failed — model will download on first recall instead.",
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  // ---- Tunnel configuration ------------------------------------------------
  banner("Tunnel — public URL for Sendblue to reach your server");
  console.log(`
ngrok's FREE plan gives you a NEW public URL every restart, which means
re-pasting into Sendblue every time. For a stable URL, pick one of:

  1. Free ngrok             (fine for testing / demos — re-paste each restart)
  2. ngrok RESERVED domain  (paid — stays the same across restarts)
  3. Cloudflare Tunnel / other static tunnel you set up yourself
`);

  const { tunnelChoice } = await prompts(
    {
      type: "select",
      name: "tunnelChoice",
      message: "Which option are you using?",
      choices: [
        { title: "Free ngrok — I'll paste a new URL each restart", value: "free" },
        { title: "ngrok reserved domain (paid)", value: "ngrok-domain" },
        { title: "Cloudflare Tunnel or another stable URL", value: "static" },
      ],
      initial: 0,
    },
    {
      onCancel: () => {
        console.log("Setup cancelled.");
        process.exit(1);
      },
    },
  );

  if (tunnelChoice === "ngrok-domain") {
    const { NGROK_DOMAIN } = await prompts({
      type: "text",
      name: "NGROK_DOMAIN",
      message: "Your ngrok reserved domain (e.g. boop.ngrok.app, no https://):",
      initial: existing.NGROK_DOMAIN ?? "",
    });
    const clean = (NGROK_DOMAIN ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (clean) {
      (answers as any).NGROK_DOMAIN = clean;
      (answers as any).PUBLIC_URL = `https://${clean}`;
    }
  } else if (tunnelChoice === "static") {
    const { PUBLIC_URL } = await prompts({
      type: "text",
      name: "PUBLIC_URL",
      message: "Your stable public URL (e.g. https://boop.mydomain.com):",
      initial: existing.PUBLIC_URL ?? "",
    });
    if (PUBLIC_URL) {
      (answers as any).PUBLIC_URL = PUBLIC_URL.replace(/\/$/, "");
      (answers as any).NGROK_DOMAIN = "";
    }
  } else {
    // free ngrok — clear any stale domain and keep PUBLIC_URL at the localhost default
    (answers as any).NGROK_DOMAIN = "";
  }

  const env: Record<string, string> = { ...existing, ...answers };
  delete (env as any).runConvex;
  if (!env.PUBLIC_URL) env.PUBLIC_URL = `http://localhost:${env.PORT ?? "3456"}`;
  // Clear stale / stub Convex values so `convex dev` can populate them freshly.
  // (`convex dev` uses .convex/ to identify the deployment, not these env vars.)
  if (env.CONVEX_URL?.includes("example.convex.cloud")) delete env.CONVEX_URL;
  if (env.VITE_CONVEX_URL?.includes("example.convex.cloud")) delete env.VITE_CONVEX_URL;
  writeEnv(ENV_PATH, env);

  if (env.BOOP_RUNTIME === "codex") {
    const codexInstalled = await hasBinary("codex");
    banner("Codex authentication");
    console.log(`This project uses your Codex / ChatGPT subscription through local Codex auth — no OpenAI API key needed.

If you haven't already:
  • Install Codex CLI:  npm install -g @openai/codex
  • Run once:           codex login
  • Sign in when prompted

Boop reads the Codex credentials saved on disk. Set BOOP_CODEX_AUTH_HOME in
.env.local only if you need Boop to read a different Codex home containing
auth.json.

${codexInstalled ? "✓ Codex CLI found on PATH." : "⚠ Codex CLI was not found on PATH. Install it before running `npm run dev`."}
`);
  } else {
    const claudeInstalled = await hasBinary("claude");
    banner("Claude authentication");
    console.log(`This project uses your Claude Code subscription — no Anthropic API key needed.

If you haven't already:
  • Install Claude Code:  npm install -g @anthropic-ai/claude-code
  • Run once:              claude
  • Sign in when prompted

The Claude Agent SDK reads the credentials Claude Code saves on disk.
You can override with ANTHROPIC_API_KEY in .env.local if you'd rather use an API key.

${claudeInstalled ? "✓ Claude Code found on PATH." : "⚠ Claude Code was not found on PATH. Install it before running `npm run dev`."}
`);
  }

  if (answers.runConvex) {
    await runConvexDev();
    const after = readEnv(ENV_PATH);

    // VITE_CONVEX_URL is written to .env.local as part of `convex dev`. The
    // server falls back to it, so avoid writing an active CONVEX_URL too; Convex
    // CLI treats multiple Convex URL env vars as ambiguous.
    const deploymentMatch =
      after.CONVEX_DEPLOYMENT?.match(/^([a-z]+):([\w-]+)/);

    if (deploymentMatch) {
      const url =
        after.VITE_CONVEX_URL ||
        after.CONVEX_URL ||
        `https://${deploymentMatch[2]}.convex.cloud`;
      if (after.VITE_CONVEX_URL !== url || after.CONVEX_URL) {
        writeEnv(ENV_PATH, {
          ...after,
          VITE_CONVEX_URL: url,
        });
        console.log(`\n✓ Synced VITE_CONVEX_URL → ${url}`);
      }
    }
  } else {
    console.log("\nSkipped Convex. Run `npx convex dev` yourself when ready.");
  }

  const port = answers.PORT ?? "3456";
  banner("You're set up. Here's how to actually run it.");
  console.log(`
Before you start: install ngrok (one-time).

  brew install ngrok                           # macOS
  # or download:  https://ngrok.com/download
  ngrok config add-authtoken <your-token>      # free at https://dashboard.ngrok.com

⚠ ngrok's FREE plan gives you a NEW URL every restart. That means
  re-pasting into Sendblue every time.  For anything beyond a demo,
  use a stable URL:
    • ngrok paid plan (reserved domain), or
    • Cloudflare Tunnel: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/

Then run ONE command:

  npm run dev

That starts the server, Convex watcher, debug dashboard, AND ngrok all
together — color-prefixed output so you can tell who's saying what. Once
the tunnel is live, you'll see a banner with your public URL.

Wire up Sendblue (one-time, takes ~30 seconds):

  1. Copy the "Sendblue webhook" URL printed by ngrok.
  2. Sendblue dashboard → API Settings → Webhook Configuration
  3. Add it as an INBOUND MESSAGE webhook.
  4. Paste the URL. Save.

Test it:
  • Open http://localhost:5173 for the debug dashboard (Chat tab works
    without Sendblue).
  • Or text your Sendblue number from a different phone. The agent replies.

Gotcha to double-check:
  SENDBLUE_FROM_NUMBER in .env.local must be your Sendblue-provisioned
  number (the one people text TO), NOT your personal cell. Sendblue
  rejects sends with "Cannot send messages to self" or "missing required
  parameter: from_number" otherwise.

Integrations (via Composio):
  1. Set COMPOSIO_API_KEY in .env.local (get one at https://app.composio.dev/developers?utm_source=chris&utm_medium=youtube&utm_campaign=collab).
  2. Open the debug dashboard → Connections tab.
  3. Click Connect on any toolkit (Gmail, Slack, GitHub, Linear, Notion, …).
  4. Composio handles OAuth; the toolkit becomes available to the agent.
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
