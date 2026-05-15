import { tool, createSdkMcpServer, type McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import { registerIntegration, type IntegrationContext, type IntegrationModule } from "./registry.js";

// Google's Gemini 2.5 Flash Image ("Nano Banana"): best agent-friendly model
// for both generate-from-text and edit-existing-image, with character
// consistency across edits. Override via env if you want a different model.
const MODEL = process.env.GEMINI_IMAGE_MODEL ?? "gemini-2.5-flash-image";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Hard ceiling on a single tool call's wall-clock — generations are usually
// 5–15s, but the model occasionally stalls. Abort instead of hanging the turn.
const REQUEST_TIMEOUT_MS = 90_000;

// Refuse to download/edit input images bigger than this. 20MB matches the
// inbound-attachment cap in server/attachments.ts.
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

interface GeminiInlinePart {
  inlineData?: { mimeType: string; data: string };
  inline_data?: { mime_type: string; data: string };
  text?: string;
}
interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiInlinePart[] };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

function extractImagePart(res: GeminiResponse): { mimeType: string; base64: string } | null {
  for (const cand of res.candidates ?? []) {
    for (const p of cand.content?.parts ?? []) {
      const mimeType = p.inlineData?.mimeType ?? p.inline_data?.mime_type;
      const data = p.inlineData?.data ?? p.inline_data?.data;
      if (data && mimeType?.startsWith("image/")) {
        return { mimeType, base64: data };
      }
    }
  }
  return null;
}

function extractTextPart(res: GeminiResponse): string {
  const out: string[] = [];
  for (const cand of res.candidates ?? []) {
    for (const p of cand.content?.parts ?? []) {
      if (p.text) out.push(p.text);
    }
  }
  return out.join("\n").trim();
}

async function fetchInputImage(url: string): Promise<{ mimeType: string; bytes: Buffer }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30_000);
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: "follow" });
    if (!res.ok) throw new Error(`input image fetch ${res.status}`);
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.startsWith("image/")) {
      throw new Error(`input URL is not an image (content-type: ${ct || "unknown"})`);
    }
    const reader = res.body?.getReader();
    let received = 0;
    const chunks: Uint8Array[] = [];
    if (reader) {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          received += value.byteLength;
          if (received > MAX_INPUT_BYTES) {
            await reader.cancel();
            throw new Error(`input image > ${MAX_INPUT_BYTES} bytes`);
          }
          chunks.push(value);
        }
      }
    }
    return { mimeType: ct, bytes: Buffer.concat(chunks.map((c) => Buffer.from(c))) };
  } finally {
    clearTimeout(timer);
  }
}

let _convex: ConvexHttpClient | null = null;
function convex(): ConvexHttpClient {
  if (!_convex) {
    const url = process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL;
    if (!url) throw new Error("CONVEX_URL not set");
    _convex = new ConvexHttpClient(url);
  }
  return _convex;
}

interface GenerateRequest {
  prompt: string;
  inputImages?: Array<{ mimeType: string; bytes: Buffer }>;
}

async function callGemini(apiKey: string, req: GenerateRequest): Promise<GeminiResponse> {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  for (const img of req.inputImages ?? []) {
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.bytes.toString("base64") } });
  }
  parts.push({ text: req.prompt });

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${API_BASE}/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { responseModalities: ["IMAGE"] },
        }),
        signal: ctl.signal,
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => res.statusText);
      throw new Error(`Gemini ${res.status}: ${body.slice(0, 500)}`);
    }
    return (await res.json()) as GeminiResponse;
  } finally {
    clearTimeout(timer);
  }
}

function buildGeminiServer(
  apiKey: string,
  conversationId: string | undefined,
): McpSdkServerConfigWithInstance {
  async function persist(
    image: { mimeType: string; base64: string },
    prompt: string,
    source: "generate" | "edit",
  ): Promise<{ artifactId: string; signedUrl: string; fileSizeBytes: number }> {
    return await convex().action(api.imageArtifacts.generate, {
      imageBase64: image.base64,
      mimeType: image.mimeType,
      conversationId,
      prompt,
      source,
      model: MODEL,
    });
  }

  function formatResult(opts: {
    artifactId: string;
    sizeBytes: number;
    modelText: string;
    action: "generated" | "edited";
  }): string {
    const sizeKb = (opts.sizeBytes / 1024).toFixed(1);
    const lines = [
      `Image ${opts.action} (${MODEL}).`,
      `artifactId: ${opts.artifactId}`,
      `size: ${sizeKb} KB`,
    ];
    if (opts.modelText) {
      lines.push("", `Model note: ${opts.modelText.slice(0, 500)}`);
    }
    lines.push(
      "",
      "Reminder: do NOT paste the URL. The interaction agent attaches the image automatically.",
    );
    return lines.join("\n");
  }

  return createSdkMcpServer({
    name: "gemini",
    version: "0.1.0",
    tools: [
      tool(
        "generate_image",
        `Generate an image from a text prompt using Google's Gemini 2.5 Flash Image
("Nano Banana"). Strong at: legible text rendering, character consistency,
photoreal scenes, design-y compositions.

Tips for good prompts:
- Describe subject, setting, lighting, mood, and style in one paragraph.
- Add aspect ratio words ("widescreen", "square", "portrait") if it matters.
- For text-in-image, quote the exact words and specify font feel
  ("bold sans-serif", "hand-lettered").

The interaction agent attaches the resulting image to the user's message
automatically. Do NOT paste the URL in your response — just say what you
produced ("Made a sunset poster with the headline you asked for.").`,
        {
          prompt: z.string().min(1).describe("What to generate. Be specific about subject, style, and composition."),
        },
        async (args) => {
          try {
            const res = await callGemini(apiKey, { prompt: args.prompt });
            if (res.promptFeedback?.blockReason) {
              return {
                content: [{
                  type: "text" as const,
                  text: `Gemini refused the prompt: ${res.promptFeedback.blockReason}. Rephrase and try again.`,
                }],
              };
            }
            const img = extractImagePart(res);
            if (!img) {
              const finish = res.candidates?.[0]?.finishReason ?? "no image returned";
              return {
                content: [{
                  type: "text" as const,
                  text: `Gemini didn't return an image (${finish}). Try rephrasing the prompt or simplifying it.`,
                }],
              };
            }
            const stored = await persist(img, args.prompt, "generate");
            return {
              content: [{
                type: "text" as const,
                text: formatResult({
                  artifactId: stored.artifactId,
                  sizeBytes: stored.fileSizeBytes,
                  modelText: extractTextPart(res),
                  action: "generated",
                }),
              }],
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { content: [{ type: "text" as const, text: `generate_image failed: ${msg}` }] };
          }
        },
      ),
      tool(
        "edit_image",
        `Edit an existing image with Gemini 2.5 Flash Image. Pass one or more
input image URLs (a URL the user shared, or a previously generated image
artifact URL) plus a natural-language edit instruction. Gemini keeps subject
identity across edits — good for "same person, new outfit" style changes,
swapping backgrounds, adding/removing objects, and style transfer.

The interaction agent attaches the edited image to the user's message
automatically. Do NOT paste the URL in your response.`,
        {
          image_urls: z.array(z.string().url()).min(1).max(4)
            .describe("URLs of input images to edit. 1–4 images; first one is the primary subject."),
          instruction: z.string().min(1)
            .describe('What to change, e.g. "put the dog on a beach at sunset" or "make the text say HAPPY BIRTHDAY in gold."'),
        },
        async (args) => {
          try {
            const inputs = await Promise.all(args.image_urls.map((u) => fetchInputImage(u)));
            const res = await callGemini(apiKey, {
              prompt: args.instruction,
              inputImages: inputs,
            });
            if (res.promptFeedback?.blockReason) {
              return {
                content: [{
                  type: "text" as const,
                  text: `Gemini refused the edit: ${res.promptFeedback.blockReason}. Rephrase and try again.`,
                }],
              };
            }
            const img = extractImagePart(res);
            if (!img) {
              const finish = res.candidates?.[0]?.finishReason ?? "no image returned";
              return {
                content: [{
                  type: "text" as const,
                  text: `Gemini didn't return an edited image (${finish}). Try a simpler instruction or fewer input images.`,
                }],
              };
            }
            const stored = await persist(img, args.instruction, "edit");
            return {
              content: [{
                type: "text" as const,
                text: formatResult({
                  artifactId: stored.artifactId,
                  sizeBytes: stored.fileSizeBytes,
                  modelText: extractTextPart(res),
                  action: "edited",
                }),
              }],
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { content: [{ type: "text" as const, text: `edit_image failed: ${msg}` }] };
          }
        },
      ),
    ],
  });
}

const geminiModule: IntegrationModule = {
  name: "gemini",
  description:
    "Google Gemini 2.5 Flash Image — generate and edit images. Best for text rendering, " +
    "character consistency, and conversational image editing. Output is auto-attached to the user's reply.",
  requiredEnv: ["GEMINI_API_KEY"],
  createServer: async (ctx: IntegrationContext) => {
    const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
    if (!key) throw new Error("[gemini] GEMINI_API_KEY not set");
    return buildGeminiServer(key, ctx.conversationId);
  },
};

export function registerGeminiIntegration(): void {
  if (!(process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY)) {
    console.log("[gemini] disabled — GEMINI_API_KEY not set");
    return;
  }
  registerIntegration(geminiModule);
  console.log(`[gemini] registered — model: ${MODEL}`);
}
