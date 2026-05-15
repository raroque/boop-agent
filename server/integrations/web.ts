import { tool, createSdkMcpServer, type McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { registerIntegration, type IntegrationModule } from "./registry.js";

// Tiered URL fetcher: cheap path first (HTTP + Readability + Turndown),
// rendered fallback (Firecrawl or self-hosted crawl4ai) only when the cheap
// path returns suspiciously little content or hits an obvious bot wall.
//
// Hardened sites (LinkedIn, Instagram, Booking…) still belong on Apify;
// this tool is for the long-tail "render this URL as markdown for the agent".

const HTTP_TIMEOUT_MS = 15_000;
const HTTP_MAX_BYTES = 5 * 1024 * 1024; // 5MB — refuse anything heavier
const RENDERED_TIMEOUT_MS = 45_000;
const SPARSE_THRESHOLD_CHARS = 500; // below this, Readability likely lost to a SPA shell
const RESULT_CHAR_BUDGET = 30_000;

// User-agent picked to look like a real browser without lying about being one.
const UA = "Mozilla/5.0 (compatible; BoopAgent/0.1; +https://github.com/anthropics/boop)";

const FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY ?? "";
const CRAWL4AI_BASE = (process.env.CRAWL4AI_BASE_URL ?? "").replace(/\/+$/, "");

type RenderedSource = "firecrawl" | "crawl4ai" | null;
function renderedSource(): RenderedSource {
  if (CRAWL4AI_BASE) return "crawl4ai";
  if (FIRECRAWL_KEY) return "firecrawl";
  return null;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n\n…(truncated, ${s.length - max} more chars)`;
}

interface PlainFetchResult {
  ok: boolean;
  status: number;
  contentType: string;
  body: string;
  blocked: boolean; // 403/429/Cloudflare-like
}

async function plainFetch(url: string): Promise<PlainFetchResult> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: ctl.signal,
    });
    const contentType = res.headers.get("content-type") ?? "";
    const blocked = res.status === 403 || res.status === 429 || res.status === 503;

    // Read with a byte cap so a multi-GB response can't OOM the server.
    const reader = res.body?.getReader();
    let received = 0;
    const chunks: Uint8Array[] = [];
    if (reader) {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          received += value.byteLength;
          if (received > HTTP_MAX_BYTES) {
            await reader.cancel();
            break;
          }
          chunks.push(value);
        }
      }
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    const body = buf.toString("utf8");
    return { ok: res.ok, status: res.status, contentType, body, blocked };
  } finally {
    clearTimeout(timer);
  }
}

function htmlToMarkdown(html: string, _url: string): { markdown: string; title: string | null } {
  const { document } = parseHTML(html);
  // Readability mutates the document; cast through unknown because linkedom's
  // Document is structurally compatible but not nominally the same type.
  const reader = new Readability(document as unknown as Document);
  const article = reader.parse();
  const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
  if (article?.content) {
    const md = td.turndown(article.content);
    return { markdown: md.trim(), title: article.title ?? null };
  }
  // Readability bailed (paywall page, very short docs, weird markup) —
  // fall through to whole-body conversion so the agent at least sees something.
  const body = document.body?.innerHTML ?? "";
  return { markdown: td.turndown(body).trim(), title: document.title || null };
}

interface RenderedResult {
  markdown: string;
  title: string | null;
  source: "firecrawl" | "crawl4ai";
}

async function firecrawlScrape(url: string): Promise<RenderedResult> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), RENDERED_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
      signal: ctl.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => res.statusText);
      throw new Error(`Firecrawl ${res.status}: ${txt.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      success?: boolean;
      data?: { markdown?: string; metadata?: { title?: string } };
    };
    const md = json.data?.markdown?.trim() ?? "";
    return { markdown: md, title: json.data?.metadata?.title ?? null, source: "firecrawl" };
  } finally {
    clearTimeout(timer);
  }
}

async function crawl4aiScrape(url: string): Promise<RenderedResult> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), RENDERED_TIMEOUT_MS);
  try {
    // crawl4ai docker server exposes POST /md → { url } returning markdown.
    // If your deployment uses a different endpoint, swap here.
    const res = await fetch(`${CRAWL4AI_BASE}/md`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: ctl.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => res.statusText);
      throw new Error(`crawl4ai ${res.status}: ${txt.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      markdown?: string | { raw_markdown?: string; fit_markdown?: string };
      title?: string;
    };
    let md = "";
    if (typeof json.markdown === "string") md = json.markdown;
    else if (json.markdown) md = json.markdown.fit_markdown ?? json.markdown.raw_markdown ?? "";
    return { markdown: md.trim(), title: json.title ?? null, source: "crawl4ai" };
  } finally {
    clearTimeout(timer);
  }
}

async function renderedFallback(url: string): Promise<RenderedResult | null> {
  const src = renderedSource();
  if (!src) return null;
  return src === "crawl4ai" ? crawl4aiScrape(url) : firecrawlScrape(url);
}

function looksSparse(markdown: string): boolean {
  return markdown.replace(/\s+/g, " ").trim().length < SPARSE_THRESHOLD_CHARS;
}

export interface FetchUrlArgs {
  url: string;
  force_render?: boolean;
  max_chars?: number;
}

// Exported so smoke tests / scripts can drive the same path the MCP tool runs.
export async function runFetchUrl(args: FetchUrlArgs): Promise<string> {
  const cap = args.max_chars ?? RESULT_CHAR_BUDGET;
  const notes: string[] = [];

  if (args.force_render) {
    const rendered = await renderedFallback(args.url);
    if (!rendered) {
      return (
        "force_render=true but no rendered fallback is configured. " +
        "Set FIRECRAWL_API_KEY or CRAWL4AI_BASE_URL."
      );
    }
    const header = `_Source: ${rendered.source} (forced) · ${args.url}_\n\n`;
    return truncate(header + rendered.markdown, cap);
  }

  let plain: PlainFetchResult;
  try {
    plain = await plainFetch(args.url);
  } catch (err) {
    notes.push(`plain fetch failed: ${(err as Error).message}`);
    const rendered = await renderedFallback(args.url).catch((e) => {
      notes.push(`rendered fallback failed: ${(e as Error).message}`);
      return null;
    });
    if (rendered && rendered.markdown) {
      const header = `_Source: ${rendered.source} · ${args.url}_\n_Notes: ${notes.join("; ")}_\n\n`;
      return truncate(header + rendered.markdown, cap);
    }
    return `Failed to fetch ${args.url}. ${notes.join("; ")}`;
  }

  const ct = plain.contentType.toLowerCase();
  const isHtml = ct.includes("html") || ct === "" || ct.startsWith("text/");
  if (!isHtml) {
    return truncate(
      `_Source: plain fetch · ${args.url} · ${ct || "unknown content-type"}_\n\n${plain.body}`,
      cap,
    );
  }

  let tier1Markdown = "";
  if (plain.body) {
    try {
      tier1Markdown = htmlToMarkdown(plain.body, args.url).markdown;
    } catch (err) {
      notes.push(`readability failed: ${(err as Error).message}`);
    }
  }

  const shouldFallback = !plain.ok || plain.blocked || looksSparse(tier1Markdown);

  if (shouldFallback) {
    const reason = !plain.ok
      ? `HTTP ${plain.status}`
      : plain.blocked
        ? "blocked"
        : "sparse content";
    const rendered = await renderedFallback(args.url).catch((e) => {
      notes.push(`rendered fallback failed: ${(e as Error).message}`);
      return null;
    });
    if (rendered && rendered.markdown && rendered.markdown.length > tier1Markdown.length) {
      const header =
        `_Source: ${rendered.source} (tier-1 ${reason}) · ${args.url}_` +
        (notes.length ? `\n_Notes: ${notes.join("; ")}_` : "") +
        "\n\n";
      return truncate(header + rendered.markdown, cap);
    }
    const header =
      `_Source: plain fetch · ${args.url} · tier-1 ${reason}; ` +
      `${rendered ? "rendered fallback returned no improvement" : "no rendered fallback configured"}_` +
      (notes.length ? `\n_Notes: ${notes.join("; ")}_` : "") +
      "\n\n";
    return truncate(header + (tier1Markdown || "(empty)"), cap);
  }

  const header = `_Source: plain fetch · ${args.url}_\n\n`;
  return truncate(header + tier1Markdown, cap);
}

function buildWebServer(): McpSdkServerConfigWithInstance {
  const fallback = renderedSource();
  const fallbackBlurb =
    fallback === "crawl4ai"
      ? "Self-hosted crawl4ai is configured as the rendered fallback."
      : fallback === "firecrawl"
        ? "Firecrawl is configured as the rendered fallback."
        : "No rendered fallback configured (set FIRECRAWL_API_KEY or CRAWL4AI_BASE_URL).";

  return createSdkMcpServer({
    name: "web",
    version: "0.1.0",
    tools: [
      tool(
        "fetch_url",
        `Fetch a URL and return its main content as markdown.

Two-tier strategy: tries a plain HTTP GET + Readability extraction first (fast, free).
If the page looks JS-rendered or returns a bot wall, transparently retries through a
headless renderer. ${fallbackBlurb}

Good for: articles, blog posts, docs, GitHub READMEs, news, plain product pages.
Not good for: hardened sites with strong bot protection (LinkedIn, Instagram, Booking) —
prefer the apify integration for those.`,
        {
          url: z.string().url().describe("Absolute URL to fetch."),
          force_render: z
            .boolean()
            .optional()
            .describe("Skip the plain-fetch tier and go straight to the rendered fallback. Default false."),
          max_chars: z
            .number()
            .int()
            .min(500)
            .max(120_000)
            .optional()
            .describe(`Truncate output to this many chars. Default ${RESULT_CHAR_BUDGET}.`),
        },
        async (args) => {
          const text = await runFetchUrl(args);
          return { content: [{ type: "text" as const, text }] };
        },
      ),
    ],
  });
}

const webModule: IntegrationModule = {
  name: "web",
  description:
    "Fetch arbitrary URLs as clean markdown for the agent. Plain HTTP first, " +
    "Firecrawl/crawl4ai fallback for JS-rendered or bot-walled pages.",
  createServer: async () => buildWebServer(),
};

export function registerWebIntegration(): void {
  registerIntegration(webModule);
  const src = renderedSource();
  console.log(
    `[web] registered — rendered fallback: ${src ?? "none (set FIRECRAWL_API_KEY or CRAWL4AI_BASE_URL)"}`,
  );
}
