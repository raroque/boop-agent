#!/usr/bin/env tsx
import prompts from "prompts";
import kleur from "kleur";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ENV_PATH = resolve(ROOT, ".env.local");
const EXAMPLE_PATH = resolve(ROOT, ".env.example");
const DRY_RUN = process.argv.includes("--dry-run") || process.argv.includes("--demo");
const PLAIN_OUTPUT = process.argv.includes("--no-color") || process.env.BOOP_NO_COLOR === "1";

if (!PLAIN_OUTPUT) {
  process.env.FORCE_COLOR ??= "1";
  delete process.env.NO_COLOR;
  kleur.enabled = true;
}

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

function c(color: keyof typeof colors, value: string): string {
  if (PLAIN_OUTPUT) return value;
  return `${colors[color]}${value}${colors.reset}`;
}

function label(value: string): string {
  return c("cyan", c("bold", value));
}

function ok(value: string): string {
  return `${c("green", "✓")} ${value}`;
}

function warn(value: string): string {
  return `${c("yellow", "⚠")} ${value}`;
}

function muted(value: string): string {
  return c("dim", value);
}

function notice(value: string): string {
  return `${c("yellow", "[preview]")} ${value}`;
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
  if (DRY_RUN) {
    console.log(notice(`Would write ${path}`));
    const interesting = [
      "BOOP_RUNTIME",
      "BOOP_MODEL",
      "BOOP_CODEX_MODEL",
      "BOOP_CODEX_REASONING_EFFORT",
      "BOOP_OPENAI_MODEL",
      "BOOP_OPENAI_REASONING_EFFORT",
      "PORT",
      "BOOP_TUNNEL",
      "PUBLIC_URL",
      "COMPOSIO_API_KEY",
      "SENDBLUE_FROM_NUMBER",
    ];
    for (const key of interesting) {
      if (env[key]) {
        const safe = key.includes("KEY") || key.includes("SECRET") ? "(set)" : env[key];
        console.log(`  ${muted(key)}=${safe}`);
      }
    }
    return;
  }

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
  if (DRY_RUN) {
    console.log(notice(`Would let Convex refresh VITE_CONVEX_URL in ${path}`));
    return;
  }
  const envContent = readFileSync(path, "utf8");
  const updated = envContent.replace(/^VITE_CONVEX_URL=.*(\r?\n)?/gm, "");
  writeFileSync(path, updated);
}

function banner(s: string) {
  const line = "═".repeat(62);
  console.log("\n" + c("cyan", line));
  console.log(`  ${label(s)}`);
  console.log(c("cyan", line));
}

function callout(title: string, lines: string[]): void {
  console.log(`\n${label(title)}`);
  for (const line of lines) console.log(`  ${line}`);
}

function stepList(title: string, steps: string[]): void {
  callout(
    title,
    steps.map((step, index) => `${c("green", `${index + 1}.`)} ${step}`),
  );
}

const SELECT_HINT = `${c("dim", "↑/↓ move")}  ${c("cyan", "Enter")} select  ${c("dim", "Tab cycles")}`;

function option<T extends string>(title: string, value: T, description: string) {
  return { title, value, description };
}

function sectionRule(labelText: string): void {
  console.log(`\n${c("cyan", "──")} ${label(labelText)} ${c("cyan", "─".repeat(42))}`);
}

function spawnCli(
  command: string,
  args: string[],
  options: Parameters<typeof spawn>[2] = {},
) {
  if (process.platform !== "win32") return spawn(command, args, options);
  return spawn("cmd", ["/d", "/s", "/c", command, ...args], options);
}

async function runConvexDev(): Promise<void> {
  if (DRY_RUN) {
    console.log(notice("Would run Convex setup, but no project or env file will be changed."));
    return;
  }

  // If CONVEX_DEPLOYMENT is already set, `convex dev` reuses that deployment.
  // Only pass --configure new if this is a first-time setup — otherwise re-running
  // setup would silently create a new project and abandon all existing data.
  const existing = readEnv(ENV_PATH);
  const args = existing.CONVEX_DEPLOYMENT
    ? ["convex", "dev", "--once"]
    : ["convex", "dev", "--once", "--configure", "new"];

  if (!existing.CONVEX_DEPLOYMENT) {
    // Remove VITE_CONVEX_URL from the env file to allow convex cli to populate it.
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
    const child = spawnCli("npx", args, { stdio: "inherit", cwd: ROOT });
    child.on("exit", (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`convex dev exited ${code}`)),
    );
    child.on("error", reject);
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
  if (DRY_RUN) {
    console.log(notice(`Would open ${url}`));
    return;
  }

  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {
      /* ignore - fall back to the printed URL */
    });
    child.unref();
  } catch {
    /* ignore - fall back to the printed URL */
  }
}

function runInherit(cmd: string, args: string[]): Promise<void> {
  return new Promise((ok, fail) => {
    const child = spawnCli(cmd, args, { stdio: "inherit", cwd: ROOT });
    child.on("exit", (code) =>
      code === 0 ? ok() : fail(new Error(`${cmd} ${args.join(" ")} exited ${code}`)),
    );
    child.on("error", fail);
  });
}

function runCapture(cmd: string, args: string[]): Promise<string> {
  return new Promise((ok, fail) => {
    const child = spawnCli(cmd, args, { stdio: ["inherit", "pipe", "pipe"], cwd: ROOT });
    if (!child.stdout || !child.stderr) {
      fail(new Error(`${cmd} did not expose stdout/stderr`));
      return;
    }
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

type RuntimeChoice = "claude" | "codex" | "openai";

function runtimeChoice(value: string | undefined): RuntimeChoice {
  return value === "codex" || value === "openai" ? value : "claude";
}

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

async function importSendblueFromCli(): Promise<SendblueKeys | null> {
  sectionRule("Sendblue");
  const { method } = await prompts(
    {
      type: "select",
      name: "method",
      message: "How do you want to configure Sendblue?",
      choices: [
        option("[1] Use Sendblue CLI", "cli", "Fastest path. In demo mode this uses fake values."),
        option("[2] Paste API keys manually", "manual", "Use this if you already have key id + secret."),
        option("[3] Skip for now", "skip", "Best for dashboard-only testing; no texting yet."),
      ],
      hint: SELECT_HINT,
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
  if (method === "skip") return { apiKey: "", apiSecret: "", fromNumber: "" };
  if (DRY_RUN) {
    console.log(notice("Would run Sendblue CLI login/show-keys/lines."));
    return {
      apiKey: "dry-run-sendblue-key-id",
      apiSecret: "dry-run-sendblue-secret",
      fromNumber: "+15555550123",
    };
  }

  const { account } = await prompts({
    type: "select",
    name: "account",
    message: "Do you already have a Sendblue account?",
    choices: [
      option("[1] Yes, log in", "login", "Runs Sendblue login and imports your existing keys."),
      option("[2] No, create one", "setup", "Runs `sendblue setup`, then imports the keys."),
    ],
    hint: SELECT_HINT,
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

  if (DRY_RUN) {
    callout("Preview mode", [
      notice("No files will be written."),
      notice("No browser will open."),
      notice("Convex and Sendblue will not be changed."),
    ]);
  }

  stepList("Setup flow", [
    "Choose Sendblue now, skip it, or preview fake values",
    "Choose the AI runtime: Claude, Codex, or OpenAI API",
    "Pick the model and reasoning effort for that runtime",
    "Configure Composio integrations if you want connected tools",
    "Choose tunnel mode for real inbound iMessage/SMS",
    "Optionally configure Convex and write .env.local",
  ]);

  callout("Before you start", [
    "Claude runtime: Claude Code subscription and CLI sign-in",
    "Codex runtime: `npm install -g @openai/codex`, then run `codex` once",
    "OpenAI API runtime: an OPENAI_API_KEY from https://platform.openai.com/api-keys",
    "Convex: free account at https://convex.dev",
    "Sendblue: only needed for real inbound iMessage/SMS",
  ]);

  const existing = readEnv(ENV_PATH);
  const cli = await importSendblueFromCli();
  const skippedSendblue =
    cli?.apiKey === "" && cli?.apiSecret === "" && cli?.fromNumber === "";

  const sendblueDefaults = {
    SENDBLUE_API_KEY: cli?.apiKey ?? existing.SENDBLUE_API_KEY ?? "",
    SENDBLUE_API_SECRET: cli?.apiSecret ?? existing.SENDBLUE_API_SECRET ?? "",
    SENDBLUE_FROM_NUMBER: cli?.fromNumber ?? existing.SENDBLUE_FROM_NUMBER ?? "",
  };

  const sendbluePrompts = [] as any[];
  if (!skippedSendblue && !sendblueDefaults.SENDBLUE_API_KEY) {
    sendbluePrompts.push({
      type: "text",
      name: "SENDBLUE_API_KEY",
      message: "Sendblue API key id (sb-api-key-id value)",
      initial: "",
    });
  }
  if (!skippedSendblue && !sendblueDefaults.SENDBLUE_API_SECRET) {
    sendbluePrompts.push({
      type: "password",
      name: "SENDBLUE_API_SECRET",
      message: "Sendblue API secret",
      initial: "",
    });
  }
  if (!skippedSendblue && !sendblueDefaults.SENDBLUE_FROM_NUMBER) {
    sendbluePrompts.push({
      type: "text",
      name: "SENDBLUE_FROM_NUMBER",
      message:
        "Your Sendblue-provisioned number (the one people text TO, e.g. +14695551234). Required by Sendblue.",
      initial: "",
    });
  }

  sectionRule("Runtime");
  const setupAnswers = await prompts(
    [
      ...sendbluePrompts,
      {
        type: "select",
        name: "BOOP_RUNTIME",
        message: "Which AI runtime should Boop use by default?",
        choices: [
          option("[default] Claude", "claude", "Claude Code subscription. Existing behavior."),
          option("[local] Codex", "codex", "Uses local `codex app-server` and your signed-in Codex session."),
          option("[api] OpenAI API", "openai", "Uses OPENAI_API_KEY and OpenAI Responses API."),
        ],
        hint: SELECT_HINT,
        initial: ["claude", "codex", "openai"].indexOf(runtimeChoice(existing.BOOP_RUNTIME)),
      },
    ],
    {
      onCancel: () => {
        console.log("Setup cancelled.");
        process.exit(1);
      },
    },
  );

  const selectedRuntime = runtimeChoice(setupAnswers.BOOP_RUNTIME);
  if (selectedRuntime === "codex" && !(await hasBinary("codex"))) {
    console.log(
      "\n⚠ Codex CLI was not found on PATH. Install it and sign in before using the Codex runtime.",
    );
  }

  const providerAnswers: Record<string, any> = {};
  if (selectedRuntime === "openai") {
    sectionRule("OpenAI API key");
    const existingOpenAIKey = existing.OPENAI_API_KEY ?? "";
    if (existingOpenAIKey) {
      const { openaiKeyMode } = await prompts(
        {
          type: "select",
          name: "openaiKeyMode",
          message: "OPENAI_API_KEY detected. Keep it or replace?",
          choices: [
            option("[safe] Keep existing key", "keep", "Do not touch the saved key."),
            option("[update] Replace key", "replace", "Paste a new OpenAI key."),
          ],
          hint: SELECT_HINT,
          initial: 0,
        },
        {
          onCancel: () => {
            console.log("Setup cancelled.");
            process.exit(1);
          },
        },
      );
      if (openaiKeyMode === "replace") {
        const { OPENAI_API_KEY } = await prompts({
          type: "password",
          name: "OPENAI_API_KEY",
          message: "Paste your OpenAI API key:",
          initial: "",
        });
        providerAnswers.OPENAI_API_KEY =
          OPENAI_API_KEY || existingOpenAIKey || (DRY_RUN ? "dry-run-openai-key" : "");
      } else {
        providerAnswers.OPENAI_API_KEY = existingOpenAIKey;
      }
    } else {
      const { OPENAI_API_KEY } = await prompts({
        type: "password",
        name: "OPENAI_API_KEY",
        message: "Paste your OpenAI API key:",
        initial: "",
      });
      providerAnswers.OPENAI_API_KEY =
        OPENAI_API_KEY || (DRY_RUN ? "dry-run-openai-key" : "");
    }
  }
  const runtimePrompts: any[] = [];
  if (selectedRuntime === "claude") {
    runtimePrompts.push({
      type: "select",
      name: "BOOP_MODEL",
      message: "Which Claude model should Boop use?",
      choices: [
        option("[balanced] claude-sonnet-4-6", "claude-sonnet-4-6", "Recommended default."),
        option("[deep] claude-opus-4-7", "claude-opus-4-7", "Most capable, slower."),
        option("[fast] claude-haiku-4-5-20251001", "claude-haiku-4-5-20251001", "Fastest/cheapest Claude path."),
      ],
      hint: SELECT_HINT,
      initial: Math.max(
        0,
        ["claude-sonnet-4-6", "claude-opus-4-7", "claude-haiku-4-5-20251001"].indexOf(
          existing.BOOP_MODEL ?? "claude-sonnet-4-6",
        ),
      ),
    });
  } else if (selectedRuntime === "codex") {
    runtimePrompts.push({
      type: "select",
      name: "BOOP_CODEX_MODEL",
      message: "Which Codex model should Boop use?",
      choices: [
        option("[recommended] gpt-5.5", "gpt-5.5", "Best quality default for agent work."),
        option("[stable] gpt-5.4", "gpt-5.4", "Strong general-purpose model."),
        option("[fast] gpt-5.4-mini", "gpt-5.4-mini", "Lower latency and lighter cost."),
        option("[code] gpt-5.3-codex", "gpt-5.3-codex", "Coding-focused Codex model."),
        option("[spark] gpt-5.3-codex-spark", "gpt-5.3-codex-spark", "Fast Codex coding model."),
        option("[legacy] gpt-5.2", "gpt-5.2", "Older fallback if needed."),
      ],
      hint: SELECT_HINT,
      initial: Math.max(
        0,
        [
          "gpt-5.5",
          "gpt-5.4",
          "gpt-5.4-mini",
          "gpt-5.3-codex",
          "gpt-5.3-codex-spark",
          "gpt-5.2",
        ].indexOf(
          existing.BOOP_CODEX_MODEL ?? "gpt-5.5",
        ),
      ),
    });
    runtimePrompts.push({
      type: "select",
      name: "BOOP_CODEX_REASONING_EFFORT",
      message: "How much thinking effort should Codex use?",
      choices: [
        option("[balanced] medium", "medium", "Recommended. Good depth without dragging."),
        option("[quick] low", "low", "Faster responses, less reasoning."),
        option("[deep] high", "high", "More reasoning for complex tasks."),
        option("[max] xhigh", "xhigh", "Deepest, slowest path."),
        option("[tiny] minimal", "minimal", "Fastest, least reasoning."),
      ],
      hint: SELECT_HINT,
      initial: Math.max(
        0,
        ["medium", "low", "high", "xhigh", "minimal"].indexOf(
          existing.BOOP_CODEX_REASONING_EFFORT ?? "medium",
        ),
      ),
    });
  } else {
    runtimePrompts.push({
      type: "select",
      name: "BOOP_OPENAI_MODEL",
      message: "Which OpenAI API model should Boop use?",
      choices: [
        option("[recommended] gpt-5.5", "gpt-5.5", "Best quality default for OpenAI API users."),
        option("[stable] gpt-5.4", "gpt-5.4", "Strong general-purpose model."),
        option("[fast] gpt-5.4-mini", "gpt-5.4-mini", "Lower latency and lighter cost."),
        option("[fallback] gpt-5.2", "gpt-5.2", "Older fallback if needed."),
        option("[code] gpt-5.2-codex", "gpt-5.2-codex", "Coding-focused API option."),
        option("[code] gpt-5.3-codex", "gpt-5.3-codex", "Newer coding-focused API option."),
        option("[mini] gpt-4.1-mini", "gpt-4.1-mini", "Small, cheap fallback."),
      ],
      hint: SELECT_HINT,
      initial: Math.max(
        0,
        [
          "gpt-5.5",
          "gpt-5.4",
          "gpt-5.4-mini",
          "gpt-5.2",
          "gpt-5.2-codex",
          "gpt-5.3-codex",
          "gpt-4.1-mini",
        ].indexOf(
          existing.BOOP_OPENAI_MODEL ?? "gpt-5.5",
        ),
      ),
    });
    runtimePrompts.push({
      type: "select",
      name: "BOOP_OPENAI_REASONING_EFFORT",
      message: "How much thinking effort should OpenAI use?",
      choices: [
        option("[balanced] medium", "medium", "Recommended. Good depth without dragging."),
        option("[quick] low", "low", "Faster responses, less reasoning."),
        option("[deep] high", "high", "More reasoning for complex tasks."),
        option("[max] xhigh", "xhigh", "Deepest, slowest path."),
        option("[tiny] minimal", "minimal", "Fastest, least reasoning."),
      ],
      hint: SELECT_HINT,
      initial: Math.max(
        0,
        ["medium", "low", "high", "xhigh", "minimal"].indexOf(
          existing.BOOP_OPENAI_REASONING_EFFORT ?? "medium",
        ),
      ),
    });
  }

  const runtimeAnswers = await prompts(
    [
      ...runtimePrompts,
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

  const answers = { ...setupAnswers, ...providerAnswers, ...runtimeAnswers } as Record<string, any>;

  // Merge CLI-sourced defaults with what the user answered (answer wins).
  Object.assign(answers, {
    SENDBLUE_API_KEY: answers.SENDBLUE_API_KEY ?? sendblueDefaults.SENDBLUE_API_KEY,
    SENDBLUE_API_SECRET: answers.SENDBLUE_API_SECRET ?? sendblueDefaults.SENDBLUE_API_SECRET,
    SENDBLUE_FROM_NUMBER: answers.SENDBLUE_FROM_NUMBER ?? sendblueDefaults.SENDBLUE_FROM_NUMBER,
  });

  // ---- Composio API key ---------------------------------------------------
  banner("Composio - integrations");
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
            option("[safe] Keep existing key", "keep", "Use the key already in .env.local."),
            option("[update] Replace key", "replace", "Open the dashboard and paste a fresh key."),
            option("[later] Skip", "skip", "Leave integrations disconnected for now."),
          ]
        : [
            option("[connect] Open dashboard + paste key", "replace", "Needed for Gmail, Slack, GitHub, Linear, Notion, and more."),
            option("[later] Skip for now", "skip", "You can connect integrations from the dashboard later."),
          ],
      hint: SELECT_HINT,
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
    (answers as any).COMPOSIO_API_KEY =
      COMPOSIO_API_KEY || existingComposio || (DRY_RUN ? "dry-run-composio-key" : "");
  } else if (composioMode === "keep") {
    (answers as any).COMPOSIO_API_KEY = existingComposio;
  } else {
    (answers as any).COMPOSIO_API_KEY = existingComposio;
    console.log(
      `\nSkipped. Add COMPOSIO_API_KEY to .env.local later to enable integrations.`,
    );
  }

  // ---- Tunnel configuration ------------------------------------------------
  banner("Tunnel - public URL");
  console.log(`
This only matters for real inbound iMessage/SMS. The local dashboard works
without any tunnel.

For easiest local testing, pick free ngrok. Boop will auto-register the
rotating webhook with Sendblue when \`npm run dev\` starts.
`);

  const { tunnelChoice } = await prompts(
    {
      type: "select",
      name: "tunnelChoice",
      message: "Which option are you using?",
      choices: [
        option("[easy] Free ngrok", "free", "Auto-registers Sendblue webhook on each dev start."),
        option("[local] No tunnel yet", "none", "Use only the local dashboard chat for now."),
        option("[paid] ngrok reserved domain", "ngrok-domain", "Stable URL that survives restarts."),
        option("[custom] Cloudflare/other URL", "static", "Use a stable tunnel you already manage."),
      ],
      hint: SELECT_HINT,
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
    (answers as any).BOOP_TUNNEL = "ngrok-domain";
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
    (answers as any).BOOP_TUNNEL = "static";
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
  } else if (tunnelChoice === "none") {
    (answers as any).BOOP_TUNNEL = "none";
    (answers as any).NGROK_DOMAIN = "";
    (answers as any).SENDBLUE_AUTO_WEBHOOK = "false";
    (answers as any).PUBLIC_URL = `http://localhost:${answers.PORT ?? existing.PORT ?? "3456"}`;
  } else {
    // free ngrok — clear any stale domain and keep PUBLIC_URL at the localhost default
    (answers as any).BOOP_TUNNEL = "free";
    (answers as any).NGROK_DOMAIN = "";
    (answers as any).SENDBLUE_AUTO_WEBHOOK = "true";
    (answers as any).PUBLIC_URL = `http://localhost:${answers.PORT ?? existing.PORT ?? "3456"}`;
  }

  const env: Record<string, string> = { ...existing, ...answers };
  delete (env as any).runConvex;
  if (!env.PUBLIC_URL) env.PUBLIC_URL = `http://localhost:${env.PORT ?? "3456"}`;
  // Clear stale / stub Convex values so `convex dev` can populate them freshly.
  // (`convex dev` uses .convex/ to identify the deployment, not these env vars.)
  if (env.CONVEX_URL?.includes("example.convex.cloud")) delete env.CONVEX_URL;
  if (env.VITE_CONVEX_URL?.includes("example.convex.cloud")) delete env.VITE_CONVEX_URL;
  writeEnv(ENV_PATH, env);

  banner("Runtime authentication");
  if (selectedRuntime === "claude") {
    console.log(`Boop is set to Claude.

If you haven't already:
  • Install Claude Code:  npm install -g @anthropic-ai/claude-code
  • Run once:              claude
  • Sign in when prompted

The Claude Agent SDK reads the credentials Claude Code saves on disk.
You can override with ANTHROPIC_API_KEY in .env.local if you'd rather use an API key.
`);
  } else if (selectedRuntime === "codex") {
    console.log(`Boop is set to Codex.

If you haven't already:
  • Install Codex CLI:  npm install -g @openai/codex
  • Run once:           codex
  • Sign in when prompted

Boop talks to Codex through \`codex app-server\`, so your local Codex session is used instead of Claude.
`);
  } else {
    console.log(`Boop is set to OpenAI API.

Required:
  • OPENAI_API_KEY in .env.local
  • BOOP_OPENAI_MODEL=${answers.BOOP_OPENAI_MODEL ?? "gpt-5.5"}
  • BOOP_OPENAI_REASONING_EFFORT=${answers.BOOP_OPENAI_REASONING_EFFORT ?? "medium"}

Tools, memory, drafts, and connected integrations stay on Boop's side; only the model provider changes.
`);
  }
  if (answers.runConvex) {
    await runConvexDev();
    const after = readEnv(ENV_PATH);

    // CONVEX_URL or VITE_CONVEX_URL is written to .env.local as part of `convex dev`; derive CONVEX_URL from it
    // if not available, fallback to deriving from CONVEX_DEPLOYMENT.
    const deploymentMatch =
      after.CONVEX_DEPLOYMENT?.match(/^([a-z]+):([\w-]+)/);

    if (deploymentMatch) {
      const url =
        after.CONVEX_URL ||
        after.VITE_CONVEX_URL ||
        `https://${deploymentMatch[2]}.convex.cloud`;
      if (after.CONVEX_URL !== url || after.VITE_CONVEX_URL !== url) {
        writeEnv(ENV_PATH, {
          ...after,
          CONVEX_URL: url,
          VITE_CONVEX_URL: url,
        });
        console.log(`\n✓ Synced CONVEX_URL + VITE_CONVEX_URL → ${url}`);
      }
    }
  } else {
    console.log("\nSkipped Convex. Run `npx convex dev` yourself when ready.");
  }

  if (DRY_RUN) {
    banner("Dry run complete. Nothing changed.");
    console.log(`
This was a full setup rehearsal.

Apply it for real:

  npm run setup

Preview it again:

  npm run setup:demo

Dashboard after real setup:
  http://localhost:5173
`);
    return;
  }

  banner("You're set up. Here's how to actually run it.");
  console.log(`
Run ONE command:

  npm run dev

That starts the server, Convex watcher, debug dashboard, and tunnel if enabled.

Dashboard:
  http://localhost:5173

Inbound iMessage/SMS:
  • If BOOP_TUNNEL=free, install/auth ngrok once and Boop auto-registers
    the Sendblue webhook each dev start.
  • If BOOP_TUNNEL=none, skip Sendblue for now and use the dashboard chat.

ngrok one-time setup, only if using the free tunnel:
  ngrok config add-authtoken <your-token>      # https://dashboard.ngrok.com

Gotcha to double-check:
  SENDBLUE_FROM_NUMBER in .env.local must be your Sendblue-provisioned
  number (the one people text TO), NOT your personal cell. Sendblue
  rejects sends with "Cannot send messages to self" or "missing required
  parameter: from_number" otherwise.

Integrations (via Composio):
  1. Set COMPOSIO_API_KEY in .env.local.
  2. Open the debug dashboard → Connections tab.
  3. Click Connect on any toolkit (Gmail, Slack, GitHub, Linear, Notion, …).
  4. Composio handles OAuth; the toolkit becomes available to the agent.
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
