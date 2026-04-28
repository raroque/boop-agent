#!/usr/bin/env tsx
import prompts from "prompts";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const ENV_PATH = resolve(ROOT, ".env.local");

function banner(s: string) {
  console.log("\n" + "━".repeat(60));
  console.log("  " + s);
  console.log("━".repeat(60));
}

function readEnv(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
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
    /* ignore */
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

function genPassword(): string {
  return randomBytes(24).toString("base64url");
}

async function main() {
  banner("Boop deploy — sets up Fly + Convex production deploy");

  // ── Step 1: Verify local setup ──────────────────────────────────────────────
  banner("1. Verifying local setup");
  const env = readEnv(ENV_PATH);
  if (!env.CONVEX_DEPLOYMENT) {
    const { runSetup } = await prompts({
      type: "confirm",
      name: "runSetup",
      message: "No CONVEX_DEPLOYMENT in .env.local — run `npm run setup` first?",
      initial: true,
    });
    if (runSetup) {
      await runInherit("npm", ["run", "setup"]);
      Object.assign(env, readEnv(ENV_PATH));
    } else {
      throw new Error("CONVEX_DEPLOYMENT must be set before deploying.");
    }
  }
  console.log("✓ Local Convex deployment configured.");

  // ── Step 2: Fly.io app ──────────────────────────────────────────────────────
  banner("2. Fly.io app");
  if (!(await hasBinary("fly"))) {
    console.log(
      "Fly CLI not found. Install with: curl -L https://fly.io/install.sh | sh",
    );
    throw new Error("Install fly CLI and re-run.");
  }
  try {
    await runCapture("fly", ["auth", "whoami"]);
  } catch {
    console.log("Not logged in. Running `fly auth login`...");
    await runInherit("fly", ["auth", "login"]);
  }

  const { appName } = await prompts({
    type: "text",
    name: "appName",
    message: "Fly app name (must be globally unique):",
    initial: env.FLY_APP_NAME ?? "",
    validate: (v: string) => /^[a-z0-9-]{3,40}$/.test(v) || "lowercase letters, digits, dashes",
  });

  let appExists = false;
  try {
    await runCapture("fly", ["apps", "list", "--json"]).then((out) => {
      const apps = JSON.parse(out);
      appExists = apps.some((a: { Name: string }) => a.Name === appName);
    });
  } catch {
    /* fall through — try to create */
  }

  if (!appExists) {
    await runInherit("fly", ["apps", "create", appName]);
  }

  const PUBLIC_URL = `https://${appName}.fly.dev`;
  console.log(`✓ App ready: ${PUBLIC_URL}`);

  // ── Step 3: Generate secrets for production ─────────────────────────────────
  banner("3. Generate secrets for production");

  let llmAuth: { name: string; value: string };
  const { llmChoice } = await prompts({
    type: "select",
    name: "llmChoice",
    message: "Which LLM auth?",
    choices: [
      { title: "Claude Code subscription token (recommended)", value: "oauth" },
      { title: "Anthropic API key (per-token billing)", value: "api" },
    ],
    initial: 0,
  });

  if (llmChoice === "oauth") {
    console.log("\nIn another terminal, run: claude setup-token");
    console.log("It will print a token. Paste it below.");
    const { token } = await prompts({
      type: "password",
      name: "token",
      message: "CLAUDE_CODE_OAUTH_TOKEN:",
    });
    llmAuth = { name: "CLAUDE_CODE_OAUTH_TOKEN", value: token };
  } else {
    const { key } = await prompts({
      type: "password",
      name: "key",
      message: "ANTHROPIC_API_KEY:",
    });
    llmAuth = { name: "ANTHROPIC_API_KEY", value: key };
  }

  const { signingSecret } = await prompts({
    type: "password",
    name: "signingSecret",
    message: "SENDBLUE_SIGNING_SECRET (Sendblue dashboard → Webhook → Signing Secret):",
  });

  const adminPassword = env.BOOP_ADMIN_PASSWORD || genPassword();
  console.log(`\nGenerated BOOP_ADMIN_PASSWORD: ${adminPassword}`);
  console.log("(Save this — you'll use it to log into the dashboard.)");

  // ── Step 4: Push secrets to Fly ─────────────────────────────────────────────
  banner("4. Pushing secrets to Fly");

  // CONVEX_SITE_URL hosts /.well-known/jwks.json (the .convex.site domain).
  // The Express auth middleware needs it to verify Convex Auth JWTs. Convex
  // sets it automatically in .env.local; fall back to deriving it from
  // CONVEX_URL by swapping .convex.cloud → .convex.site if it's missing.
  const convexSiteUrl =
    env.CONVEX_SITE_URL ??
    env.CONVEX_URL?.replace(".convex.cloud", ".convex.site") ??
    "";

  const flySecrets: Record<string, string> = {
    [llmAuth.name]: llmAuth.value,
    SENDBLUE_API_KEY: env.SENDBLUE_API_KEY ?? "",
    SENDBLUE_API_SECRET: env.SENDBLUE_API_SECRET ?? "",
    SENDBLUE_FROM_NUMBER: env.SENDBLUE_FROM_NUMBER ?? "",
    SENDBLUE_SIGNING_SECRET: signingSecret,
    CONVEX_DEPLOYMENT: env.CONVEX_DEPLOYMENT ?? "",
    CONVEX_URL: env.CONVEX_URL ?? "",
    CONVEX_SITE_URL: convexSiteUrl,
    COMPOSIO_API_KEY: env.COMPOSIO_API_KEY ?? "",
    BOOP_ADMIN_PASSWORD: adminPassword,
    PUBLIC_URL,
    NODE_ENV: "production",
  };

  const setArgs = ["secrets", "set", "--app", appName];
  for (const [k, v] of Object.entries(flySecrets)) {
    if (v) setArgs.push(`${k}=${v}`);
  }
  await runInherit("fly", setArgs);

  // ── Step 5: Convex env ──────────────────────────────────────────────────────
  banner("5. Configuring Convex env");
  console.log("Setting BOOP_ADMIN_PASSWORD on the production Convex deployment...");
  await runInherit("npx", [
    "convex",
    "env",
    "set",
    "BOOP_ADMIN_PASSWORD",
    adminPassword,
  ]);

  // ── Step 6: Sendblue webhook ────────────────────────────────────────────────
  banner("6. Sendblue webhook");
  console.log(`Open the Sendblue dashboard and set the INBOUND webhook to:`);
  console.log(`  ${PUBLIC_URL}/sendblue/webhook`);
  openInBrowser("https://app.sendblue.com/settings/webhooks");
  const { webhookSet } = await prompts({
    type: "confirm",
    name: "webhookSet",
    message: "Done?",
    initial: true,
  });
  if (!webhookSet) {
    console.log("⚠️  Skipping for now — you must set this before iMessages reach the server.");
  }

  // ── Step 7: GitHub Actions secrets ─────────────────────────────────────────
  banner("7. GitHub Actions secrets");
  if (await hasBinary("gh")) {
    const { useGh } = await prompts({
      type: "confirm",
      name: "useGh",
      message: "Push secrets to GitHub via `gh secret set`?",
      initial: true,
    });
    if (useGh) {
      const flyToken = await runCapture("fly", ["auth", "token"]).then((s) => s.trim());
      const convexDeployKey = await prompts({
        type: "password",
        name: "k",
        message: "Convex deploy key (https://dashboard.convex.dev → project → Deploy Keys):",
      }).then((r) => r.k);
      await runInherit("gh", ["secret", "set", "FLY_API_TOKEN", "--body", flyToken]);
      await runInherit("gh", ["secret", "set", "FLY_APP_NAME", "--body", appName]);
      await runInherit("gh", [
        "secret",
        "set",
        "CONVEX_DEPLOY_KEY",
        "--body",
        convexDeployKey,
      ]);
    }
  } else {
    console.log("Install `gh` CLI to auto-set secrets, or set them manually:");
    console.log("  - FLY_API_TOKEN  (run `fly auth token`)");
    console.log(`  - FLY_APP_NAME = ${appName}`);
    console.log("  - CONVEX_DEPLOY_KEY  (Convex dashboard → Deploy Keys)");
  }

  // ── Step 8: First deploy ────────────────────────────────────────────────────
  banner("8. First deploy");
  const { deployNow } = await prompts({
    type: "confirm",
    name: "deployNow",
    message: "Run `fly deploy --remote-only` now?",
    initial: true,
  });
  if (deployNow) {
    await runInherit("fly", ["deploy", "--remote-only", "--app", appName]);
    console.log("\nBootstrapping admin user...");
    await runInherit("npx", ["convex", "run", "users:bootstrap"]);
  }

  // ── Done ────────────────────────────────────────────────────────────────────
  banner("Done!");
  console.log(`Dashboard:  ${PUBLIC_URL}/`);
  console.log(`Health:     ${PUBLIC_URL}/health`);
  console.log(`Webhook:    ${PUBLIC_URL}/sendblue/webhook`);
  console.log("");
  console.log("Future deploys: `git push origin main` triggers GitHub Actions.");
  console.log("Annual: rotate CLAUDE_CODE_OAUTH_TOKEN by re-running `claude setup-token`.");
}

main().catch((err) => {
  console.error("\n[deploy] failed:", err.message);
  process.exit(1);
});
