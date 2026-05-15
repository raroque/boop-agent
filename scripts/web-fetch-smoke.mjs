#!/usr/bin/env node
// Smoke test for the `web` integration's fetch_url tool.
// Exercises tier-1 (plain HTTP), tier-1 → tier-2 fallback (sparse content),
// and force_render (Firecrawl/crawl4ai direct).
//
// Run: node --import tsx/esm scripts/web-fetch-smoke.mjs

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

// Load .env.local on top of .env (same precedence the server uses).
const envLocal = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocal)) {
  const lines = fs.readFileSync(envLocal, "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  }
}

const { runFetchUrl } = await import("../server/integrations/web.ts");

const cases = [
  { name: "static (Wikipedia)", args: { url: "https://en.wikipedia.org/wiki/Markdown", max_chars: 2000 } },
  { name: "tiny (example.com — should fall back if Firecrawl set)", args: { url: "https://example.com/", max_chars: 2000 } },
  { name: "SPA-ish (vercel.com)", args: { url: "https://vercel.com/", max_chars: 2000 } },
  { name: "force_render (Firecrawl direct)", args: { url: "https://example.com/", force_render: true, max_chars: 2000 } },
];

for (const c of cases) {
  const t0 = Date.now();
  let out;
  try {
    out = await runFetchUrl(c.args);
  } catch (err) {
    console.log(`\n=== ${c.name} ===\nERROR: ${err.message}`);
    continue;
  }
  const ms = Date.now() - t0;
  const sourceLine = out.split("\n").find((l) => l.startsWith("_Source:")) ?? "(no source line)";
  console.log(`\n=== ${c.name}  (${ms}ms, ${out.length} chars) ===`);
  console.log(sourceLine);
  console.log("---");
  console.log(out.slice(0, 600));
  if (out.length > 600) console.log(`… [+${out.length - 600} more chars]`);
}
