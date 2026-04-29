import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { execa } from "execa";
import { browserBaseArgs, CHROME_PATH, getBrowserEnv } from "./config.js";
import { ensureStealthChrome } from "./stealth-launcher.js";

if (CHROME_PATH) {
  console.log(`[browser] using real Chrome at ${CHROME_PATH}`);
} else {
  console.log("[browser] no real Chrome found — falling back to Chrome for Testing");
}

const TIMEOUT_MS = 30_000;

interface Result {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

async function ab(args: string[]): Promise<Result> {
  try {
    await ensureStealthChrome();
    const r = await execa("agent-browser", [...browserBaseArgs(), ...args], {
      preferLocal: true,
      timeout: TIMEOUT_MS,
      reject: false,
      env: await getBrowserEnv(),
    });
    return {
      stdout: r.stdout?.toString() ?? "",
      stderr: r.stderr?.toString() ?? "",
      exitCode: r.exitCode ?? null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { stdout: "", stderr: message, exitCode: null };
  }
}

function fmt(r: Result): { content: [{ type: "text"; text: string }] } {
  const ok = r.exitCode === 0;
  if (ok) {
    return { content: [{ type: "text" as const, text: r.stdout || "(no output)" }] };
  }
  const hint =
    r.stderr.includes("ENOENT") || r.exitCode === null
      ? "\n\nIs agent-browser installed? Run `npx agent-browser install` once on this machine."
      : "";
  const body = `[browser error] exit=${r.exitCode}\n${r.stderr || r.stdout || "(no output)"}${hint}`;
  return { content: [{ type: "text" as const, text: body }] };
}

const FALLBACK_DISCLAIMER =
  "FALLBACK ONLY. Use a native integration (gmail, calendar, slack, github, notion, linear, etc.) when one covers the task — they're faster, structured, and more reliable. Reach for the browser only for sites/services with no Composio toolkit, or for tasks that genuinely need a real browser (visual layouts, JS-heavy UIs, sites you're already logged into via the boop Chrome profile).";

export function createBrowserMcp() {
  return createSdkMcpServer({
    name: "browser",
    version: "0.1.0",
    tools: [
      tool(
        "browser_open",
        `Launch (or reuse) a Chrome session and navigate to a URL. Uses a dedicated boop Chrome profile so logged-in cookies persist across runs. ${FALLBACK_DISCLAIMER}`,
        {
          url: z.string().describe("URL to navigate to. Include the scheme (https://...)."),
        },
        async (args) => fmt(await ab(["open", args.url])),
      ),
      tool(
        "browser_snapshot",
        "Return the page's accessibility tree with @e1, @e2, ... refs you can pass to click/fill/get_text. PRIMARY perception tool — call this instead of screenshot whenever possible (much cheaper in tokens). Returns interactive elements, structure, and visible text.",
        {},
        async () => fmt(await ab(["snapshot", "-i", "-c"])),
      ),
      tool(
        "browser_click",
        "Click an element by ref (@e2) or CSS selector. Get refs from browser_snapshot first.",
        {
          selector: z.string().describe("Ref like '@e2' or a CSS selector like '#submit'."),
        },
        async (args) => fmt(await ab(["click", args.selector])),
      ),
      tool(
        "browser_fill",
        "Clear an input and type text into it. Use a ref (@e3) or CSS selector.",
        {
          selector: z.string().describe("Ref like '@e3' or a CSS selector."),
          text: z.string().describe("Text to type (will replace existing value)."),
        },
        async (args) => fmt(await ab(["fill", args.selector, args.text])),
      ),
      tool(
        "browser_press",
        "Press a key (Enter, Tab, Escape, or chords like Control+a). Acts on the focused element.",
        {
          key: z.string().describe("Key name. Examples: 'Enter', 'Tab', 'Escape', 'Control+a'."),
        },
        async (args) => fmt(await ab(["press", args.key])),
      ),
      tool(
        "browser_get_text",
        "Get the visible text content of an element by ref or CSS selector.",
        {
          selector: z.string().describe("Ref like '@e1' or a CSS selector."),
        },
        async (args) => fmt(await ab(["get", "text", args.selector])),
      ),
      tool(
        "browser_get_url",
        "Return the current page URL. Useful after a click/redirect to confirm where you ended up.",
        {},
        async () => fmt(await ab(["get", "url"])),
      ),
      tool(
        "browser_wait",
        "Wait for an element to appear OR a fixed duration in milliseconds. Use selector form for navigation/load waits, ms form sparingly.",
        {
          target: z
            .string()
            .describe("CSS selector to wait for, OR a number of ms (e.g. '1500')."),
        },
        async (args) => fmt(await ab(["wait", args.target])),
      ),
      tool(
        "browser_screenshot",
        "Take an annotated screenshot (writes a PNG to disk and returns the path). Use ONLY when browser_snapshot isn't enough — visual layout questions, charts, image content. Otherwise prefer snapshot.",
        {},
        async () => fmt(await ab(["screenshot", "--annotate"])),
      ),
      // Intentionally no browser_close: the agent-browser daemon is shared across
      // every sub-agent (single --session boop). If one agent closed it, parallel
      // browser-using agents would see their next call fail. The server owns
      // lifecycle; agents just borrow tabs.
    ],
  });
}
