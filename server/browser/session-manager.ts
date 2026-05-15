import { randomBytes } from "node:crypto";
import { Stagehand } from "@browserbasehq/stagehand";
import Steel from "steel-sdk";
import { z } from "zod";
import { api } from "../../convex/_generated/api.js";
import { convex } from "../convex-client.js";
import { retrieveCredential } from "./credentials.js";
import { generateTotp } from "./totp.js";

// In-process registry of live browser sessions. Sessions DO NOT survive a
// server restart — the Stagehand handle and Steel websocket are both
// process-local. Steel will auto-release on its side after its idle timeout
// (default 5 min) if we crash without calling release(). The browserSessions
// Convex row is the only durable artifact.

const SESSION_TIMEOUT_MS =
  Number(process.env.BROWSER_SESSION_TIMEOUT_MINUTES ?? 20) * 60 * 1000;

// Picks the LLM Stagehand calls for its act/extract/observe steps. Honors
// BROWSER_DEFAULT_MODEL + BROWSER_MODEL_PROVIDER if set, otherwise falls
// back to whichever provider has a key configured. Preference order
// (anthropic → openai → google) matches what tends to ground best on DOM
// tasks, but any of them work.
type Provider = "anthropic" | "openai" | "google";

const PROVIDER_DEFAULTS: Record<Provider, { model: string; keyEnv: string }> = {
  anthropic: { model: "anthropic/claude-sonnet-4-6", keyEnv: "ANTHROPIC_API_KEY" },
  openai: { model: "openai/gpt-4.1", keyEnv: "OPENAI_API_KEY" },
  google: { model: "google/gemini-2.0-flash", keyEnv: "GEMINI_API_KEY" },
};

const AUTO_PROVIDER_ORDER: Provider[] = ["anthropic", "openai", "google"];

function resolveModelConfig(): {
  modelName: string;
  apiKey: string;
  provider: Provider;
} {
  const explicitModel = process.env.BROWSER_DEFAULT_MODEL;
  const explicitProvider = process.env.BROWSER_MODEL_PROVIDER as Provider | undefined;

  const candidates: Provider[] = explicitProvider
    ? [explicitProvider]
    : AUTO_PROVIDER_ORDER;

  for (const provider of candidates) {
    const def = PROVIDER_DEFAULTS[provider];
    if (!def) {
      throw new Error(
        `Unknown BROWSER_MODEL_PROVIDER="${provider}". Use one of: anthropic, openai, google.`,
      );
    }
    const apiKey = process.env[def.keyEnv];
    if (apiKey) {
      return { modelName: explicitModel ?? def.model, apiKey, provider };
    }
    if (explicitProvider) {
      throw new Error(
        `BROWSER_MODEL_PROVIDER=${provider} but ${def.keyEnv} is not set.`,
      );
    }
  }
  throw new Error(
    "No LLM key set for Stagehand. Add one of ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY.",
  );
}

function randomSessionId(): string {
  return `bs_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

let cachedSteel: Steel | null = null;

function steelClient(): Steel {
  if (cachedSteel) return cachedSteel;
  const key = process.env.STEEL_API_KEY;
  if (!key) {
    throw new Error("STEEL_API_KEY is not set. Get one at https://app.steel.dev/settings/api-keys.");
  }
  cachedSteel = new Steel({ steelAPIKey: key });
  return cachedSteel;
}

// Steel docs are explicit: do NOT use session.websocketUrl directly — it
// fails 502 because the API key isn't included. The CDP-compatible URL is
// constructed manually with the key as a query parameter.
function steelCdpUrl(sessionId: string): string {
  const key = process.env.STEEL_API_KEY!;
  const base = process.env.STEEL_CONNECT_URL ?? "wss://connect.steel.dev";
  return `${base}?apiKey=${encodeURIComponent(key)}&sessionId=${encodeURIComponent(sessionId)}`;
}

// Builds a Zod object from a flat field map. Phase 2 only — covers the
// common cases. Extend if we ever need nested objects.
type FieldKind = "string" | "number" | "boolean" | "string[]" | "number[]";

export function buildExtractSchema(
  fields: Record<string, FieldKind>,
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [name, kind] of Object.entries(fields)) {
    switch (kind) {
      case "string":
        shape[name] = z.string();
        break;
      case "number":
        shape[name] = z.number();
        break;
      case "boolean":
        shape[name] = z.boolean();
        break;
      case "string[]":
        shape[name] = z.array(z.string());
        break;
      case "number[]":
        shape[name] = z.array(z.number());
        break;
      default: {
        const _exhaust: never = kind;
        throw new Error(`Unknown field kind: ${String(_exhaust)}`);
      }
    }
  }
  return z.object(shape);
}

export interface StartSessionOpts {
  goal: string;
  startUrl?: string;
  conversationId?: string;
  agentId?: string;
}

export interface BrowserSession {
  id: string;
  steelSessionId: string;
  stagehand: Stagehand;
  liveViewUrl?: string;
  startedAt: number;
  timeoutHandle: NodeJS.Timeout;
  released: boolean;
}

const sessions = new Map<string, BrowserSession>();

export function getSession(id: string): BrowserSession {
  const s = sessions.get(id);
  if (!s) {
    throw new Error(
      `No active browser session "${id}". It may have timed out (cap: ${SESSION_TIMEOUT_MS / 60_000}min) or been closed.`,
    );
  }
  return s;
}

// Stagehand v3 exposes act/extract/observe on the top-level instance, but
// navigation/screenshot/url/title live on the Page returned by the V3Context.
// We grab the first top-level page, which is what a single-tab session
// always has.
function currentPage(s: BrowserSession): {
  goto: (url: string, opts?: { waitUntil?: string }) => Promise<unknown>;
  url: () => string;
  title: () => Promise<string>;
  screenshot: (opts?: { type?: "png" | "jpeg"; fullPage?: boolean }) => Promise<Buffer>;
} {
  const pages = s.stagehand.context.pages();
  if (pages.length === 0) {
    throw new Error("Stagehand has no live pages — was init() called?");
  }
  return pages[0] as never;
}

export function listLiveSessions(): Array<{
  id: string;
  startedAt: number;
  ageMs: number;
}> {
  const now = Date.now();
  return [...sessions.values()].map((s) => ({
    id: s.id,
    startedAt: s.startedAt,
    ageMs: now - s.startedAt,
  }));
}

export async function startSession(opts: StartSessionOpts): Promise<{
  id: string;
  liveViewUrl?: string;
  startUrl?: string;
  title?: string;
}> {
  const steel = steelClient();
  const id = randomSessionId();
  const steelSession = await steel.sessions.create({});
  let stagehand: Stagehand | undefined;
  try {
    const model = resolveModelConfig();
    stagehand = new Stagehand({
      env: "LOCAL",
      localBrowserLaunchOptions: { cdpUrl: steelCdpUrl(steelSession.id) },
      model: {
        modelName: model.modelName,
        apiKey: model.apiKey,
        provider: model.provider,
      },
      verbose: 0,
      disablePino: true,
    });
    await stagehand.init();

    if (opts.startUrl) {
      const pages = stagehand.context.pages();
      if (pages.length === 0) throw new Error("Stagehand context has no pages after init");
      await (pages[0] as { goto: (u: string, o?: { waitUntil?: string }) => Promise<unknown> })
        .goto(opts.startUrl, { waitUntil: "domcontentloaded" });
    }

    const liveViewUrl = steelSession.sessionViewerUrl;

    // Write the audit row BEFORE registering the in-memory session, so
    // every live session has a corresponding row that incrementStep can
    // patch. If the Convex write fails (deployment down, network), we
    // log loudly and keep going — losing the audit trail is bad but
    // better than tearing down a working browser session over it.
    try {
      await convex.mutation(api.browserSessions.create, {
        sessionId: id,
        conversationId: opts.conversationId,
        agentId: opts.agentId,
        provider: "steel",
        providerSessionId: steelSession.id,
        goal: opts.goal,
        startUrl: opts.startUrl,
        liveViewUrl,
      });
    } catch (err) {
      console.error(
        `[browser] failed to write audit row for ${id} — session is live but untracked:`,
        err,
      );
    }

    const timeoutHandle = setTimeout(() => {
      closeSession(id, "timed_out").catch((err) =>
        console.error(`[browser] timeout cleanup failed for ${id}:`, err),
      );
    }, SESSION_TIMEOUT_MS);

    sessions.set(id, {
      id,
      steelSessionId: steelSession.id,
      stagehand,
      liveViewUrl,
      startedAt: Date.now(),
      timeoutHandle,
      released: false,
    });

    let title: string | undefined;
    if (opts.startUrl) {
      const pages = stagehand.context.pages();
      title = await (pages[0] as { title: () => Promise<string> }).title().catch(() => undefined);
    }
    return { id, liveViewUrl, startUrl: opts.startUrl, title };
  } catch (err) {
    // Construction failed AFTER Steel session was created — tear down both
    // sides so we don't leak.
    if (stagehand) {
      await stagehand.close().catch(() => {});
    }
    await steel.sessions.release(steelSession.id).catch(() => {});
    throw err;
  }
}

export async function navigate(
  id: string,
  url: string,
): Promise<{ url: string; title: string }> {
  const s = getSession(id);
  const page = currentPage(s);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const finalUrl = page.url();
  const title = await page.title().catch(() => "");
  await convex.mutation(api.browserSessions.incrementStep, { sessionId: id });
  return { url: finalUrl, title };
}

export async function act(
  id: string,
  instruction: string,
): Promise<{
  success: boolean;
  message: string;
  actionDescription?: string;
}> {
  const s = getSession(id);
  // Stagehand's act() throws on failure; treat exceptions as "did not
  // accomplish the action" rather than crashing the whole tool call.
  try {
    const result = await s.stagehand.act(instruction);
    await convex.mutation(api.browserSessions.incrementStep, { sessionId: id });
    return {
      success: result.success,
      message: result.message,
      actionDescription: result.actionDescription,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: msg };
  }
}

export async function extract(
  id: string,
  instruction: string,
  fields: Record<string, FieldKind>,
): Promise<Record<string, unknown>> {
  const s = getSession(id);
  const schema = buildExtractSchema(fields);
  const result = await s.stagehand.extract(instruction, schema);
  await convex.mutation(api.browserSessions.incrementStep, { sessionId: id });
  return result as unknown as Record<string, unknown>;
}

export async function observe(
  id: string,
  instruction: string,
): Promise<
  Array<{ description: string; method?: string; selector?: string; arguments?: string[] }>
> {
  const s = getSession(id);
  const candidates = await s.stagehand.observe(instruction);
  await convex.mutation(api.browserSessions.incrementStep, { sessionId: id });
  return (candidates ?? []).map((c) => ({
    description: c.description,
    method: c.method,
    selector: c.selector,
    arguments: c.arguments,
  }));
}

export async function screenshot(
  id: string,
  opts: { fullPage?: boolean } = {},
): Promise<{ buffer: Buffer; mimeType: "image/png"; url: string; title: string }> {
  const s = getSession(id);
  const page = currentPage(s);
  const buffer = await page.screenshot({
    type: "png",
    fullPage: opts.fullPage ?? false,
  });
  const url = page.url();
  const title = await page.title().catch(() => "");
  return { buffer, mimeType: "image/png", url, title };
}

export async function status(id: string): Promise<{
  url: string;
  title: string;
  ageSeconds: number;
  liveViewUrl?: string;
}> {
  const s = getSession(id);
  const page = currentPage(s);
  const url = page.url();
  const title = await page.title().catch(() => "");
  return {
    url,
    title,
    ageSeconds: Math.floor((Date.now() - s.startedAt) / 1000),
    liveViewUrl: s.liveViewUrl,
  };
}

export async function closeSession(
  id: string,
  reason: "closed" | "error" | "timed_out" = "closed",
  errorMessage?: string,
): Promise<void> {
  const s = sessions.get(id);
  if (!s || s.released) return;
  s.released = true;
  clearTimeout(s.timeoutHandle);
  sessions.delete(id);

  // Tear down Stagehand first (it owns the CDP connection), then release
  // the Steel session. Swallow either side's errors — by the time we're
  // here we just want the row marked done.
  await s.stagehand.close().catch((err) =>
    console.error(`[browser] stagehand.close ${id}:`, err),
  );
  try {
    const steel = steelClient();
    await steel.sessions.release(s.steelSessionId);
  } catch (err) {
    console.error(`[browser] steel.release ${id}:`, err);
  }

  await convex
    .mutation(api.browserSessions.finalize, {
      sessionId: id,
      status: reason,
      errorMessage,
    })
    .catch((err) => console.error(`[browser] finalize ${id}:`, err));
}

// Critical invariant for the next two helpers: the password and TOTP code
// must never enter the LLM context AND must not be JSON-stringified by
// Stagehand's internal debug logs. Two layers:
//
//   1. act(Action) overload — when passed a pre-resolved Action object,
//      Stagehand skips the LLM and just executes. So observe() resolves
//      the selector (page DOM only, no secret), then we splice the secret
//      in as the typed argument.
//
//   2. Stagehand's `variables` substitution — the Action object carries a
//      placeholder `%SECRET%`, and the real value is passed via
//      options.variables. The Action object Stagehand logs on failure
//      contains the placeholder, not the secret. The real value only
//      lives in the variables map, which Stagehand uses internally and
//      does NOT include in its action-failure log lines.

async function typeIntoField(
  s: BrowserSession,
  target: string,
  value: string,
  opts: {
    fieldDescription: string;
    // When true, refuse to type unless the observed candidate looks like a
    // password input. Defense against observe() returning a visible text
    // input as the top candidate, which would render the secret into the
    // page DOM.
    requirePasswordField?: boolean;
  },
): Promise<void> {
  const candidates = await s.stagehand.observe(target);
  if (!candidates || candidates.length === 0) {
    throw new Error(`Could not locate ${opts.fieldDescription} on the page (looked for: "${target}")`);
  }

  let chosen = candidates[0];
  if (opts.requirePasswordField) {
    // Prefer candidates whose description mentions password — Stagehand
    // tends to describe `<input type="password">` with that word. Fall
    // back to candidates[0] only if no description is more specific.
    const passwordLike = candidates.find((c) =>
      /\b(password|passcode|secret)\b/i.test(c.description ?? ""),
    );
    if (!passwordLike) {
      throw new Error(
        `Refusing to type into ${opts.fieldDescription}: none of ${candidates.length} candidate(s) look like a password field. ` +
        `Top candidate description: "${(chosen.description ?? "").slice(0, 120)}". ` +
        `If this page uses an unusual form, pass an explicit passwordTarget describing the field.`,
      );
    }
    chosen = passwordLike;
  }

  await s.stagehand.act(
    {
      selector: chosen.selector,
      description: `type into ${opts.fieldDescription}`,
      method: "type",
      arguments: ["%SECRET%"],
    },
    { variables: { SECRET: value } },
  );
}

export interface FillCredentialOpts {
  usernameTarget?: string;
  passwordTarget?: string;
}

export async function fillCredential(
  id: string,
  label: string,
  opts: FillCredentialOpts = {},
): Promise<{
  fieldsFilled: string[];
  totpAvailable: boolean;
  host: string;
  username: string;
}> {
  const s = getSession(id);
  const cred = await retrieveCredential(label);
  if (!cred) {
    throw new Error(`No credential found with label "${label}". Save one in the dashboard first.`);
  }

  const fieldsFilled: string[] = [];
  await typeIntoField(
    s,
    opts.usernameTarget ?? "the username, email, or login input field",
    cred.username,
    { fieldDescription: "username field" },
  );
  fieldsFilled.push("username");

  await typeIntoField(
    s,
    opts.passwordTarget ?? "the password input field",
    cred.password,
    { fieldDescription: "password field", requirePasswordField: true },
  );
  fieldsFilled.push("password");

  await convex.mutation(api.browserSessions.incrementStep, { sessionId: id });
  return {
    fieldsFilled,
    totpAvailable: cred.totpSecret !== null,
    host: cred.host,
    username: cred.username,
  };
}

export interface SubmitTotpOpts {
  target?: string;
}

export async function submitTotp(
  id: string,
  label: string,
  opts: SubmitTotpOpts = {},
): Promise<{ filled: boolean; codeLength: number }> {
  const s = getSession(id);
  const cred = await retrieveCredential(label);
  if (!cred) {
    throw new Error(`No credential found with label "${label}".`);
  }
  if (!cred.totpSecret) {
    throw new Error(
      `Credential "${label}" has no TOTP secret stored. Add it via the dashboard, or have the user paste the code manually.`,
    );
  }
  const code = generateTotp(cred.totpSecret);
  await typeIntoField(
    s,
    opts.target ?? "the verification code, 2FA, OTP, or one-time code input",
    code,
    { fieldDescription: "TOTP input" },
  );
  await convex.mutation(api.browserSessions.incrementStep, { sessionId: id });
  return { filled: true, codeLength: code.length };
}

// Phase 4: park-and-resume.
//
// Parking suspends an active session waiting for user input (2FA code,
// CAPTCHA approval, ambiguous decision). We close the in-process Stagehand
// handle to free local resources but DO NOT release the Steel session — it
// stays alive on Steel's side until the idle timeout. The Convex row is
// flipped to status="parked" and holds the question.
//
// On resume (driven from interaction-agent.ts on the user's next reply), we
// open a brand-new Stagehand against the same Steel session's CDP URL.
// State is preserved (cookies, current URL, open tabs) because we never
// closed the Chromium instance.

export type ParkReason = "2fa" | "captcha" | "approval" | "ambiguous" | "other";

export async function parkSession(
  id: string,
  args: {
    reason: ParkReason;
    question: string;
    pendingFieldTarget?: string;
  },
): Promise<{ liveViewUrl?: string }> {
  const s = getSession(id);

  // Drop Stagehand BEFORE marking Convex as parked. If close fails, log
  // and continue — the row update is what matters for the resume path.
  clearTimeout(s.timeoutHandle);
  s.released = true;
  sessions.delete(id);
  await s.stagehand.close().catch((err) =>
    console.error(`[browser] stagehand.close during park ${id}:`, err),
  );

  await convex.mutation(api.browserSessions.park, {
    sessionId: id,
    reason: args.reason,
    question: args.question,
    pendingFieldTarget: args.pendingFieldTarget,
  });

  return { liveViewUrl: s.liveViewUrl };
}

export async function resumeSession(
  id: string,
): Promise<{
  steelSessionId: string;
  pendingFieldTarget?: string;
}> {
  if (sessions.has(id)) {
    throw new Error(`Session ${id} is already live in this process — cannot resume`);
  }
  const row = await convex.query(api.browserSessions.get, { sessionId: id });
  if (!row) throw new Error(`No session ${id} in Convex to resume`);
  if (row.status !== "parked") {
    throw new Error(`Session ${id} is "${row.status}", can only resume a parked session`);
  }

  const model = resolveModelConfig();
  const stagehand = new Stagehand({
    env: "LOCAL",
    // Reconnect to the same Steel session by reusing its providerSessionId.
    // Steel sessions outlive Stagehand instances — cookies, URL, open tabs
    // all survive.
    localBrowserLaunchOptions: { cdpUrl: steelCdpUrl(row.providerSessionId) },
    model: {
      modelName: model.modelName,
      apiKey: model.apiKey,
      provider: model.provider,
    },
    verbose: 0,
    disablePino: true,
  });

  try {
    await stagehand.init();
  } catch (err) {
    // CDP reconnect failed — most likely Steel's idle timeout expired.
    // Mark the row as errored so a future findParked() doesn't keep
    // returning it, and surface a clean message to the caller.
    await convex
      .mutation(api.browserSessions.finalize, {
        sessionId: id,
        status: "error",
        errorMessage: `resume failed: ${err instanceof Error ? err.message : String(err)}`,
      })
      .catch(() => {});
    throw new Error(
      `Could not reconnect to browser session ${id}. Steel likely timed out the session. Start a fresh session and retry. (${err instanceof Error ? err.message : String(err)})`,
    );
  }

  const timeoutHandle = setTimeout(() => {
    closeSession(id, "timed_out").catch((err) =>
      console.error(`[browser] timeout cleanup failed for ${id}:`, err),
    );
  }, SESSION_TIMEOUT_MS);

  sessions.set(id, {
    id,
    steelSessionId: row.providerSessionId,
    stagehand,
    liveViewUrl: row.liveViewUrl,
    startedAt: row.startedAt,
    timeoutHandle,
    released: false,
  });

  await convex.mutation(api.browserSessions.markActive, { sessionId: id });

  return {
    steelSessionId: row.providerSessionId,
    pendingFieldTarget: row.pendingFieldTarget,
  };
}

// Helper for the resume flow: type the user's reply into whatever field
// was marked pending when the session parked. Uses the same hardened
// typing path as fillCredential (variable substitution, no LLM exposure).
// `requirePasswordField` is false here — TOTP and CAPTCHA answers are
// visible text, not secrets we're hiding from the page.
export async function typeUserInput(
  id: string,
  target: string,
  value: string,
): Promise<void> {
  const s = getSession(id);
  await typeIntoField(s, target, value, { fieldDescription: "pending input field" });
}

// Best-effort shutdown hook. Closes every live session so Steel sessions
// don't linger on the provider side if the server exits cleanly.
export async function closeAllSessions(): Promise<void> {
  const ids = [...sessions.keys()];
  await Promise.all(ids.map((id) => closeSession(id, "closed")));
}
