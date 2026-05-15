import {
  tool,
  createSdkMcpServer,
  type McpSdkServerConfigWithInstance,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { api } from "../../convex/_generated/api.js";
import { convex } from "../convex-client.js";
import {
  registerIntegration,
  type IntegrationContext,
  type IntegrationModule,
} from "./registry.js";
import {
  startSession,
  navigate,
  act,
  extract,
  observe,
  screenshot,
  status,
  closeSession,
  fillCredential,
  submitTotp,
  parkSession,
  resumeSession,
  typeUserInput,
} from "../browser/session-manager.js";
import { listCredentials } from "../browser/credentials.js";
import { dispatch } from "../channels/index.js";
import type { ConversationId } from "../channels/types.js";

// Stagehand wraps Playwright with three high-level primitives (act / extract
// / observe) that take natural-language instructions instead of CSS
// selectors. Combined with Steel for the actual Chromium runtime, the agent
// gets DOM-grounded browser control without us writing any selector code.

const FIELD_KIND = z.enum(["string", "number", "boolean", "string[]", "number[]"]);

function jsonResult(value: unknown): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function errorResult(err: unknown): { content: [{ type: "text"; text: string }] } {
  const msg = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `ERROR: ${msg}` }] };
}

function buildBrowserServer(
  ctx: IntegrationContext,
): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: "browser",
    version: "0.1.0",
    tools: [
      tool(
        "browser_start_session",
        `Open a new browser session on Steel.dev. Returns a sessionId you must
pass to every subsequent browser_* call. Optionally navigates to startUrl.

The 'goal' is logged to Convex as the session's human-readable purpose ("sign
in to GitHub and star a repo"). Keep it short but specific — it's what shows
up in the audit trail.

The session has a wall-clock cap (default 20 min) and is auto-closed when it
expires. Always call browser_close when you're done to release the slot.`,
        {
          goal: z.string().min(1).describe("Short description of what this session is for."),
          startUrl: z.string().url().optional().describe("URL to navigate to immediately after opening."),
        },
        async (args) => {
          try {
            const res = await startSession({
              goal: args.goal,
              startUrl: args.startUrl,
              conversationId: ctx.conversationId,
            });
            return jsonResult(res);
          } catch (err) {
            return errorResult(err);
          }
        },
      ),
      tool(
        "browser_navigate",
        "Navigate the session to a URL. Waits for DOM content loaded. Returns final URL and page title.",
        {
          sessionId: z.string(),
          url: z.string().url(),
        },
        async (args) => {
          try {
            return jsonResult(await navigate(args.sessionId, args.url));
          } catch (err) {
            return errorResult(err);
          }
        },
      ),
      tool(
        "browser_act",
        `Perform a natural-language action on the current page. Stagehand
figures out the right element to interact with.

Good instructions are specific and reference what the user sees:
  ✓ "click the Sign in button at the top right"
  ✓ "fill the email field with foo@example.com"
  ✓ "press enter on the search box"
  ✗ "log in"  — too vague, span multiple steps
  ✗ "click the button"  — ambiguous

For multi-step flows, call browser_act multiple times.`,
        {
          sessionId: z.string(),
          instruction: z.string().min(1),
        },
        async (args) => {
          try {
            return jsonResult(await act(args.sessionId, args.instruction));
          } catch (err) {
            return errorResult(err);
          }
        },
      ),
      tool(
        "browser_extract",
        `Pull structured data from the current page. Specify what to extract
plus the fields you want. Field types: "string", "number", "boolean",
"string[]", "number[]".

Example:
  instruction: "the top 5 search results"
  fields: { titles: "string[]", urls: "string[]" }

Returns an object matching the field shape.`,
        {
          sessionId: z.string(),
          instruction: z.string().min(1),
          fields: z.record(z.string(), FIELD_KIND),
        },
        async (args) => {
          try {
            const data = await extract(args.sessionId, args.instruction, args.fields);
            return jsonResult(data);
          } catch (err) {
            return errorResult(err);
          }
        },
      ),
      tool(
        "browser_observe",
        `Ask "what can I do on this page?" — returns a list of candidate
actions with descriptions and the underlying selectors. Useful when you're
not sure how to phrase a browser_act instruction, or when the page is
unfamiliar.`,
        {
          sessionId: z.string(),
          instruction: z.string().min(1).describe('e.g. "what are the navigation options?"'),
        },
        async (args) => {
          try {
            return jsonResult(await observe(args.sessionId, args.instruction));
          } catch (err) {
            return errorResult(err);
          }
        },
      ),
      tool(
        "browser_screenshot",
        `Capture a PNG of the current page and store it as an image artifact.
Returns an artifactId and signed URL. The interaction agent will attach the
image to the user's reply — do NOT paste the URL yourself.

fullPage=true captures the entire scrollable page (default false, just the
viewport).`,
        {
          sessionId: z.string(),
          fullPage: z.boolean().optional().default(false),
        },
        async (args) => {
          try {
            const shot = await screenshot(args.sessionId, { fullPage: args.fullPage });
            const stored = await convex.action(api.imageArtifacts.generate, {
              imageBase64: shot.buffer.toString("base64"),
              mimeType: shot.mimeType,
              conversationId: ctx.conversationId,
              prompt: `Screenshot of ${shot.title || shot.url}`,
              source: "screenshot" as const,
              model: "steel-stagehand",
            });
            return jsonResult({
              artifactId: stored.artifactId,
              signedUrl: stored.signedUrl,
              fileSizeBytes: stored.fileSizeBytes,
              url: shot.url,
              title: shot.title,
            });
          } catch (err) {
            return errorResult(err);
          }
        },
      ),
      tool(
        "browser_status",
        "Get the current URL, title, and age of a session. Cheap check — does not increment step counter.",
        { sessionId: z.string() },
        async (args) => {
          try {
            return jsonResult(await status(args.sessionId));
          } catch (err) {
            return errorResult(err);
          }
        },
      ),
      tool(
        "browser_list_credentials",
        `List saved credentials in the vault. Returns labels, hosts, and
usernames — never passwords or TOTP secrets. Use this to discover which
login the user has saved before calling browser_use_credential.`,
        {},
        async () => {
          try {
            const rows = await listCredentials();
            return jsonResult(
              rows.map((r) => ({
                label: r.label,
                host: r.host,
                username: r.username,
                hasTotp: r.hasTotp,
              })),
            );
          } catch (err) {
            return errorResult(err);
          }
        },
      ),
      tool(
        "browser_use_credential",
        `Fill the username + password from a saved credential into the
current page's login form. The password is decrypted server-side and typed
directly via Stagehand — it NEVER enters this conversation or any LLM call.

You only pass the label (e.g. "github-personal"). Pre-conditions:
- Navigate to the login form first (browser_navigate or browser_act).
- The page must show username + password input fields.

After filling, you typically call browser_act("click the Sign in button"). If
the site then prompts for 2FA and the credential has a TOTP secret stored,
follow up with browser_submit_totp.

Optional usernameTarget/passwordTarget let you describe the fields if the
defaults don't match (e.g. an unusual login form). Use the user-visible
field labels, not selectors.`,
        {
          sessionId: z.string(),
          label: z.string().min(1).describe("The credential label from browser_list_credentials."),
          usernameTarget: z.string().optional()
            .describe('Override the default "the username, email, or login input field".'),
          passwordTarget: z.string().optional()
            .describe('Override the default "the password input field".'),
        },
        async (args) => {
          try {
            const res = await fillCredential(args.sessionId, args.label, {
              usernameTarget: args.usernameTarget,
              passwordTarget: args.passwordTarget,
            });
            return jsonResult(res);
          } catch (err) {
            return errorResult(err);
          }
        },
      ),
      tool(
        "browser_submit_totp",
        `Generate the current TOTP (2FA) code from the credential's stored
secret and type it into the verification-code field. Like
browser_use_credential, the actual code never enters the LLM context.

Pre-conditions:
- The session is on a page asking for a 2FA / verification code.
- The credential has a TOTP secret stored (browser_use_credential will tell
  you via "totpAvailable" in its response).

If totpAvailable was false, ask the user for the code directly via the
channel — don't call this tool.`,
        {
          sessionId: z.string(),
          label: z.string().min(1),
          target: z.string().optional()
            .describe('Override default "the verification code, 2FA, OTP, or one-time code input".'),
        },
        async (args) => {
          try {
            const res = await submitTotp(args.sessionId, args.label, { target: args.target });
            return jsonResult(res);
          } catch (err) {
            return errorResult(err);
          }
        },
      ),
      tool(
        "browser_request_user_input",
        `Suspend the browser session and ask the user a question via their
active channel (Telegram). Use this when you need information that you
DON'T have stored in the vault and can't infer from the page:

- A 2FA / verification code the user gets out-of-band (SMS, email)
- A CAPTCHA to solve in the live-view URL
- Approval before a destructive action ("about to delete the repo, proceed?")
- Disambiguation between similar choices ("two flights match — A or B?")

DO NOT use this for things you can solve yourself: if the credential has a
TOTP secret stored, call browser_submit_totp instead. If observe() finds
the answer on the page, extract() it.

Behavior:
  1. Closes the local Stagehand handle (frees CPU/memory) but keeps the
     Steel session alive on the provider side.
  2. Marks the session as "parked" in Convex with your question.
  3. Sends a message to the user via their active channel.
  4. Returns a finalization marker.

You MUST end your turn immediately after this returns. Do not call more
tools — your turn is over. When the user replies, a fresh agent run will
pick up the conversation, resume the session, and continue toward the
original goal.

The optional pendingFieldTarget tells the resume agent what to do with
the user's answer. If you set it, the resume agent will type the user's
reply directly into that field. If you leave it unset, the resume agent
will just continue with browser_act based on the user's reply.`,
        {
          sessionId: z.string(),
          question: z.string().min(1)
            .describe('What to ask the user. Will be sent verbatim via Telegram.'),
          reason: z.enum(["2fa", "captcha", "approval", "ambiguous", "other"]),
          pendingFieldTarget: z.string().optional()
            .describe('If the user\'s reply should be typed into a specific field, describe it. e.g. "the 2FA code input".'),
        },
        async (args) => {
          if (!ctx.conversationId) {
            return errorResult(
              new Error(
                "browser_request_user_input requires a conversationId on the integration context — internal bug, not a usage error.",
              ),
            );
          }
          try {
            const parked = await parkSession(args.sessionId, {
              reason: args.reason,
              question: args.question,
              pendingFieldTarget: args.pendingFieldTarget,
            });
            const livePart = parked.liveViewUrl
              ? `\n\nLive view: ${parked.liveViewUrl}`
              : "";
            const msg = `🔐 [browser] ${args.question}${livePart}\n\nReply with your answer when ready.`;
            await dispatch(ctx.conversationId as ConversationId, msg);
            return jsonResult({
              parked: true,
              message:
                "Session parked. The user has been sent the question via their active channel. " +
                "END YOUR TURN NOW — do not call any more tools. When the user replies, a fresh " +
                "agent will resume this session.",
            });
          } catch (err) {
            return errorResult(err);
          }
        },
      ),
      tool(
        "browser_resume",
        `Resume a parked browser session. Called by the resume agent (not the
parking agent) on the user's next reply. Reopens Stagehand against the
same underlying Steel session — cookies, current URL, open tabs are all
preserved.

If the parked session had a pendingFieldTarget set, also pass userInput
to type the user's reply into that field as part of the resume. After
this returns, call browser_act / browser_extract / browser_close to
continue toward the original goal.

Common failure: if too much time has passed since the park, Steel's
session timeout will have elapsed and CDP reconnect fails. In that case
this tool returns an error — apologize to the user and ask if they want
to start a fresh attempt.`,
        {
          sessionId: z.string(),
          userInput: z.string().optional()
            .describe("The user's reply. If the parked session had a pendingFieldTarget, this gets typed into that field."),
        },
        async (args) => {
          try {
            const res = await resumeSession(args.sessionId);
            if (res.pendingFieldTarget && args.userInput) {
              await typeUserInput(args.sessionId, res.pendingFieldTarget, args.userInput);
              return jsonResult({
                resumed: true,
                typedIntoPendingField: true,
                pendingFieldTarget: res.pendingFieldTarget,
              });
            }
            return jsonResult({
              resumed: true,
              typedIntoPendingField: false,
              note: res.pendingFieldTarget
                ? "Pending field was set but no userInput provided. Type the answer manually with browser_act if needed."
                : undefined,
            });
          } catch (err) {
            return errorResult(err);
          }
        },
      ),
      tool(
        "browser_close",
        "Close the session, release the Steel slot, and finalize the Convex row. Always call this when done.",
        { sessionId: z.string() },
        async (args) => {
          try {
            await closeSession(args.sessionId, "closed");
            return jsonResult({ ok: true });
          } catch (err) {
            return errorResult(err);
          }
        },
      ),
    ],
  });
}

const browserModule: IntegrationModule = {
  name: "browser",
  description:
    "Headless browser via Steel.dev + Stagehand. Open sessions, navigate, act on pages " +
    "(click/type/scroll) in natural language, extract structured data, observe candidate " +
    "actions, screenshot, and log in using saved credentials + TOTP from the encrypted vault. " +
    "Passwords and 2FA codes are filled server-side and never enter the LLM context. Use for: " +
    "filling forms, signing into sites, navigating pages that block plain HTTP scraping, and " +
    "any task that needs interactive web access.",
  requiredEnv: ["STEEL_API_KEY"],
  createServer: async (ctx: IntegrationContext) => buildBrowserServer(ctx),
};

export function registerBrowserIntegration(): void {
  if (!process.env.STEEL_API_KEY) {
    console.log("[browser] disabled — STEEL_API_KEY not set");
    return;
  }
  const hasLlmKey =
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GEMINI_API_KEY;
  if (!hasLlmKey) {
    console.log(
      "[browser] disabled — no LLM key set (need ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY for Stagehand's act/extract/observe)",
    );
    return;
  }
  registerIntegration(browserModule);
  console.log("[browser] registered — Steel.dev + Stagehand");
}
