#!/usr/bin/env node
// Pulls your Sendblue-provisioned number from `sendblue show-keys` and writes
// it to .env.local as SENDBLUE_FROM_NUMBER. Saves you from manually finding it.

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const envPath = resolve(root, ".env.local");

const IS_WIN = process.platform === "win32";
const NPM_CMDS = new Set(["npx", "npm", "sendblue"]);
function spawnChild(cmd, args, options) {
  if (IS_WIN && NPM_CMDS.has(cmd)) {
    const line = [cmd, ...args].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ");
    return spawn(line, [], { ...options, shell: true, windowsHide: true });
  }
  return spawn(cmd, args, options);
}

function hasBinary(name) {
  return new Promise((ok) => {
    const p = spawn(IS_WIN ? "where" : "which", [name], { stdio: "ignore" });
    p.on("exit", (code) => ok(code === 0));
    p.on("error", () => ok(false));
  });
}

function runCapture(cmd, args) {
  return new Promise((ok, fail) => {
    const p = spawnChild(cmd, args, { cwd: root });
    let out = "";
    p.stdout.on("data", (d) => {
      const s = d.toString();
      out += s;
      process.stdout.write(s);
    });
    p.stderr.on("data", (d) => process.stderr.write(d));
    p.on("exit", (code) =>
      code === 0 ? ok(out) : fail(new Error(`${cmd} exited ${code}`)),
    );
    p.on("error", fail);
  });
}

function parsePhones(output) {
  const clean = output.replace(/\x1b\[[0-9;]*m/g, "");
  const seen = new Set();
  const numbers = [];

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
    /* not JSON */
  }

  // The sendblue CLI formats like "+1 (305) 336-9541".
  // Process line-by-line so we don't greedily span into e.g. "1 line total".
  for (const rawLine of clean.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("+")) continue;
    // Allow digits, spaces, parens, dashes, dots inside a single line only.
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

async function main() {
  const useGlobal = await hasBinary("sendblue");
  const cmd = useGlobal ? "sendblue" : "npx";
  const leading = useGlobal ? [] : ["-y", "@sendblue/cli"];

  console.log(`Running \`${cmd} ${[...leading, "lines"].join(" ")}\`…\n`);

  let output;
  try {
    output = await runCapture(cmd, [...leading, "lines"]);
  } catch (err) {
    console.error(`\n✗ Command failed: ${err.message}`);
    console.error(
      `\nIf you aren't logged in yet, run:\n  npx @sendblue/cli login\nthen try again.`,
    );
    process.exit(1);
  }

  const phones = parsePhones(output);
  if (phones.length === 0) {
    console.error(`\n✗ Couldn't find any phone numbers in the \`lines\` output above.`);
    console.error(
      `  Fall back to:  grab the number from your Sendblue dashboard → Numbers,\n               then set SENDBLUE_FROM_NUMBER=+1… in .env.local manually.`,
    );
    process.exit(1);
  }

  let phone = phones[0];
  if (phones.length > 1) {
    console.log(`\nFound ${phones.length} numbers on your account:`);
    for (const [i, p] of phones.entries()) console.log(`  [${i}] ${p}`);
    console.log(`Using [0] ${phone}. Edit .env.local if you want a different one.`);
  }

  if (!existsSync(envPath)) {
    console.error(`\n✗ .env.local not found. Run \`npm run setup\` first.`);
    process.exit(1);
  }

  let content = readFileSync(envPath, "utf8");
  if (/^SENDBLUE_FROM_NUMBER=.*$/m.test(content)) {
    content = content.replace(
      /^SENDBLUE_FROM_NUMBER=.*$/m,
      `SENDBLUE_FROM_NUMBER=${phone}`,
    );
  } else {
    content = content.trimEnd() + `\nSENDBLUE_FROM_NUMBER=${phone}\n`;
  }
  writeFileSync(envPath, content);

  console.log(`\n✓ Updated .env.local → SENDBLUE_FROM_NUMBER=${phone}`);
  console.log(`  Restart \`npm run dev\` to pick up the change.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
