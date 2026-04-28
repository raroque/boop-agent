// Webhook-driven Gmail watcher. Runs after Composio fires
// `composio.trigger.message` for a `GMAIL_NEW_GMAIL_MESSAGE` trigger.
// Pipeline: ignore non-Gmail → warmup-skip the first event per connection
// → recall user preferences → cheap Haiku classifier → on important, route
// the summary into the interaction agent as a synthetic system message so it
// gets the same tone/spawn pipeline as a real user turn.
import { query } from "@anthropic-ai/claude-agent-sdk";
import { api } from "../convex/_generated/api.js";
import { convex } from "./convex-client.js";
import { aggregateUsageFromResult, EMPTY_USAGE, type UsageTotals } from "./usage.js";
import { handleUserMessage } from "./interaction-agent.js";
import { sendImessage } from "./sendblue.js";
import { ensureTrigger, getComposio, listConnectedToolkits } from "./composio.js";
import { ensureWebhookSubscription } from "./composio-webhook.js";
import { describeUserNow } from "./timezone-config.js";

const TRIGGER_SLUG = "GMAIL_NEW_GMAIL_MESSAGE";
const CLASSIFIER_MODEL = "claude-haiku-4-5-20251001";

// First event per connection since process boot is treated as warmup —
// classification is skipped to avoid noise from any backfill behavior on
// trigger creation. Lost on restart, which is fine: missing one notice is
// preferable to spamming the user with old emails on every server reboot.
const warmupSeen = new Set<string>();

export interface NormalizedEmail {
  messageId?: string;
  threadId?: string;
  subject: string;
  sender: string;
  recipient?: string;
  snippet: string;
  body: string;
  timestamp?: string;
}

// Pull the bare address out of a "Name <addr@example.com>" header. Falls
// back to the trimmed input when no angle-brackets are present.
function extractEmail(raw: string): string {
  if (!raw) return "";
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1]! : raw).trim();
}

// Composio's Gmail trigger payloads vary slightly across SDK versions; pull
// each field with a fallback chain rather than asserting one shape.
function normalizeEmail(payload: Record<string, unknown>): NormalizedEmail {
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const preview =
    payload.preview && typeof payload.preview === "object"
      ? (payload.preview as Record<string, unknown>)
      : {};
  return {
    messageId: str(payload.messageId) || str(payload.message_id) || undefined,
    threadId: str(payload.threadId) || str(payload.thread_id) || undefined,
    subject: str(payload.subject) || str(preview.subject),
    sender: str(payload.sender) || str(payload.from),
    recipient: str(payload.to) || str(payload.recipient) || undefined,
    snippet: str(preview.body) || str(payload.snippet),
    body: str(payload.messageText) || str(payload.body) || str(preview.body),
    timestamp: str(payload.messageTimestamp) || str(payload.timestamp) || undefined,
  };
}

export const RUBRIC_PROMPT = `You are deciding whether an email warrants interrupting the user with a proactive iMessage.

Surface (return important=true) when the email is one of:
- A security-sensitive code or login alert (OTPs, "new sign-in from", password reset, vulnerability disclosure for the user's own infra).
- A time-bound action with a deadline the user has already committed to (rent/bill due with amount + date, contract or document signature, RSVP for an event the user accepted).
- A meeting/scheduling change for a calendar event already on the user's radar.
- A real personal/work message from someone in the user's orbit, where the sender is asking the user a question or expecting a reply AND there's CONCRETE shared context — a specific project, file, calendar event, or thread the user has actively engaged with. Examples: a colleague asking about a file they need, a friend confirming weekend plans, a customer replying on an ongoing support thread.
- A reply on a thread the user is already participating in, where the sender's message ends with a question or pending decision.
- Anything explicitly listed in the user's preferences as "always surface" (preferences override the default rubric).

Drop (return important=false) when the email is:
- Marketing, newsletters, promotional offers, drip campaigns, "early access" / "limited time" pitches.
- Social-platform digests, notification roll-ups, "you have N new things" emails.
- Order confirmations, shipping updates, receipts, invoices, payment notifications that don't require a response.
- Automated alerts from no-reply addresses unless they fall under the security-alert case above.
- Calendar invites the user has already accepted; meeting reminders for events already on their calendar.
- Sender = the user themselves — drop. Match the sender's email against the User identities listed at the bottom of this prompt; if it matches any of them, the email is a self-send / forward from another of the user's own accounts and should drop unless preferences say otherwise.
- Anything the user's preferences explicitly mark as "ignore" or "don't surface".
- **Cold outreach disguised as personal — DROP** even when the email looks conversational:
  - The body offers a service to the user's company (loans, partnerships, ads, guest posts, "would you be interested in...", "we've helped companies like yours", "happy to set up a call", "quick question for you", "saw your work and...").
  - Sender domain looks like a prospecting / lead-gen / agency outreach setup (made-up agency-style domains, *.q@-style suffix patterns, "*partner*", "*marketing*", random newly-registered domains that don't match the sender's claimed company).
  - The body has no concrete shared context — generic ask, no specific project / file / calendar event / prior thread the user actually engaged with.
  - "Re: Fwd: {company-name}" or single-word "Re:" subjects with a fresh sales pitch in the body — reps fake-thread to dodge filters.
  - First-name greeting + a question mark + an offer = template, not a real request.
- **Submissions to the user's own products / SaaS — DROP**. Form submissions, feedback, feature requests, and bug reports landing in the user's product inboxes (UserJot, Canny, Webflow Forms, Formspark, Tally, Typeform, custom contact forms) are routine product feedback. The user reviews them on their own schedule; they don't need an iMessage interrupt for each one. Surface only if the body explicitly indicates an outage, security issue, or named urgent escalation.
- **User-initiated auth flows — DROP**. Magic-link sign-in emails, "click here to verify your sign-in", "your one-time login link", and similar confirmations that the user obviously just triggered themselves by clicking "Sign in" on a service. The OTP / new-sign-in-from-unknown-device case is different — surface those.
- **Expired deadlines — DROP**. Invitations, RSVPs, or time-bound asks where the deadline date has already passed at the moment the email is being classified. Acting on them is no longer possible; surfacing wastes the user's attention.
- **Low-severity automated alerts — DROP** even when they mention "security" or "anomaly". Routine scanner noise — Vercel "1 error anomaly detected, low severity", F5Bot keyword mentions, generic "we noticed unusual activity" emails without a confirmed compromise or required action — should drop. Surface only when the alert names a specific compromise the user must respond to (account takeover, key leak, payee added, OAuth grant, vulnerability requiring patch).

How to tell "real personal/work request" from "cold outreach in a friendly costume":
- Real signals (surface): references something only someone in the user's orbit would know (specific project name, file ID, calendar event, prior thread the user replied to); sender's domain has plausibly appeared in the user's outbox; sender is named in user preferences/memory; the ask is for something the user is already involved in.
- Cold signals (drop): generic offer, no shared context, unfamiliar prospecting domain, "Hi {firstname}" with a sales/partnership ask attached, sender is a name+title combo that reads like an outbound SDR.
- Automated signals (drop unless security/time-bound): from "no-reply"/"notifications"/"alerts"/"team@..." mass addresses, generic salutation, body is templated/HTML-heavy, sender domain matches a known marketing/notification service.
- When in doubt → drop. False positives erode trust faster than missing one notice.

When important=true, write a summary in 1-2 short sentences for an iMessage:
- Lead with what matters (who is asking what, the deadline, the action).
- Address the user in second person ("you"). Never refer to the user in third person, even if their name appears in the email — the user IS the recipient and one of the User identities at the bottom.
- Plain text, no markdown, no signoff.
- Under ~200 chars when possible.

Respond with ONLY a JSON object: {"important": boolean, "summary": "..."} (omit summary when important=false).`;

// Cached read of the proactive-enabled flag from the settings table.
// Short TTL so toggling it from the debug UI takes effect quickly without
// hammering Convex on every webhook event.
let proactiveEnabledCache: { at: number; enabled: boolean } | null = null;
const PROACTIVE_FLAG_TTL_MS = 30 * 1000;

export async function isProactiveEnabled(): Promise<boolean> {
  if (
    proactiveEnabledCache &&
    Date.now() - proactiveEnabledCache.at < PROACTIVE_FLAG_TTL_MS
  ) {
    return proactiveEnabledCache.enabled;
  }
  try {
    const value = await convex.query(api.settings.get, {
      key: "proactive_enabled",
    });
    // Default to enabled when the row is absent — feature is on out of the box.
    const enabled = value === null ? true : value !== "false";
    proactiveEnabledCache = { at: Date.now(), enabled };
    return enabled;
  } catch (err) {
    console.warn("[proactive] failed to read enabled flag, defaulting to on", err);
    return proactiveEnabledCache?.enabled ?? true;
  }
}

// Cache the user's connected Gmail addresses so the classifier can recognize
// self-forwards across all of the user's accounts. Refreshed on a slow TTL —
// adding/removing a Gmail connection is rare and the cache miss is harmless.
let userIdentitiesCache: { at: number; ids: string[] } | null = null;
const USER_IDENTITIES_TTL_MS = 30 * 60 * 1000;

export async function getUserGmailIdentities(): Promise<string[]> {
  if (
    userIdentitiesCache &&
    Date.now() - userIdentitiesCache.at < USER_IDENTITIES_TTL_MS
  ) {
    return userIdentitiesCache.ids;
  }
  try {
    const conns = await listConnectedToolkits();
    const ids = conns
      .filter((c) => c.slug === "gmail" && c.status === "ACTIVE")
      .map((c) => c.accountEmail)
      .filter((e): e is string => Boolean(e));
    userIdentitiesCache = { at: Date.now(), ids };
    return ids;
  } catch (err) {
    console.warn("[proactive] identity recall failed", err);
    return userIdentitiesCache?.ids ?? [];
  }
}

export async function classifyEmailImportance(
  email: NormalizedEmail,
  preferenceLines: string[],
  options: { model?: string; recordUsage?: boolean } = {},
): Promise<{ important: boolean; summary?: string; usage: UsageTotals }> {
  const started = Date.now();
  const model = options.model ?? CLASSIFIER_MODEL;
  const recordUsage = options.recordUsage ?? true;
  const userIdentities = await getUserGmailIdentities();
  const tzInfo = await describeUserNow();

  const prefBlock =
    preferenceLines.length > 0
      ? `User preferences (highest priority — these override the default rubric):\n${preferenceLines.map((p) => `- ${p}`).join("\n")}`
      : `User preferences: (none recorded — fall back to the default rubric only)`;
  const idBlock =
    userIdentities.length > 0
      ? `User identities (the user's own email addresses — sender matching any of these = "self-sent"):\n${userIdentities.map((e) => `- ${e}`).join("\n")}`
      : `User identities: (none recorded)`;
  // Anchor "now" in the user's timezone so the rubric's "expired deadlines"
  // rule fires correctly. Without this the model uses its own training-time
  // notion of "today" which can be way off.
  const timeBlock = `Current local time: ${tzInfo.now} (timezone: ${tzInfo.timezone}${tzInfo.isExplicit ? "" : ", server fallback — user has not set theirs"}). Today's date in their timezone is ${tzInfo.isoDate}. Use this when judging whether a deadline has already passed.`;

  const userPrompt = [
    `Sender: ${email.sender || "(unknown)"}`,
    `Recipient: ${email.recipient || "(unknown)"}`,
    `Subject: ${email.subject || "(no subject)"}`,
    `Snippet: ${email.snippet || "(empty)"}`,
    `Body (truncated):\n${(email.body || "(empty)").slice(0, 1500)}`,
  ].join("\n");

  let buffer = "";
  let usage: UsageTotals = { ...EMPTY_USAGE };
  for await (const msg of query({
    prompt: userPrompt,
    options: {
      systemPrompt: `${RUBRIC_PROMPT}\n\n${prefBlock}\n\n${idBlock}\n\n${timeBlock}`,
      model,
      permissionMode: "bypassPermissions",
    },
  })) {
    if (msg.type === "assistant") {
      for (const block of msg.message.content) {
        if (block.type === "text") buffer += block.text;
      }
    } else if (msg.type === "result") {
      usage = aggregateUsageFromResult(msg, model);
    }
  }

  let important = false;
  let summary: string | undefined;
  const match = buffer.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as { important?: boolean; summary?: string };
      important = parsed.important === true;
      summary = typeof parsed.summary === "string" ? parsed.summary.trim() : undefined;
    } catch {
      // Malformed JSON from the classifier means we drop the email — better
      // to miss a notice than spam the user with an unparsed prompt.
    }
  }

  if (recordUsage && (usage.costUsd > 0 || usage.inputTokens > 0)) {
    await convex.mutation(api.usageRecords.record, {
      source: "proactive",
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheCreationTokens: usage.cacheCreationTokens,
      costUsd: usage.costUsd,
      durationMs: Date.now() - started,
    });
  }

  return { important, summary, usage };
}

async function recallPreferenceLines(): Promise<string[]> {
  try {
    const rows = await convex.query(api.memoryRecords.list, {
      segment: "preference",
      lifecycle: "active",
      limit: 20,
    });
    return rows.map((r: { content: string }) => r.content);
  } catch (err) {
    console.warn("[proactive] preference recall failed", err);
    return [];
  }
}

// Bring whatever the user put in BOOP_USER_PHONE to E.164 (+1XXXXXXXXXX).
// Without this, a bare 10-digit number in env produces an `sms:NNNNNNNNNN`
// conversation that doesn't match the `sms:+1NNNNNNNNNN` ID Sendblue uses
// for inbound messages from the same person — proactive notices end up in
// a parallel Convex conversation invisible to the user-driven thread.
function normalizeProactivePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("+")) return trimmed;
  if (/^\d{10}$/.test(trimmed)) return `+1${trimmed}`;
  if (/^\d{11,15}$/.test(trimmed)) return `+${trimmed}`;
  return null;
}

async function dispatchProactiveNotice(summary: string): Promise<void> {
  const raw = process.env.BOOP_USER_PHONE;
  if (!raw) {
    console.warn("[proactive] BOOP_USER_PHONE not set; skipping dispatch");
    return;
  }
  const phone = normalizeProactivePhone(raw);
  if (!phone) {
    console.warn(
      `[proactive] BOOP_USER_PHONE=${JSON.stringify(raw)} doesn't look like a valid phone number; skipping dispatch`,
    );
    return;
  }
  const conversationId = `sms:${phone}`;
  const reply = await handleUserMessage({
    conversationId,
    content: `[proactive notice] ${summary}`,
    kind: "proactive",
  });
  // handleUserMessage only sends iMessage from inside send_ack; the final
  // reply is the caller's responsibility.
  if (reply && reply !== "(no reply)") {
    await sendImessage(phone, reply);
    await convex.mutation(api.messages.send, {
      conversationId,
      role: "assistant",
      content: reply,
    });
  } else {
    // IA stayed silent — fall back to the raw classifier summary so the
    // user still gets the notice; otherwise classification was a no-op.
    await sendImessage(phone, summary);
    await convex.mutation(api.messages.send, {
      conversationId,
      role: "assistant",
      content: summary,
    });
    console.log(`[proactive] IA produced no reply; sent raw summary`);
  }
}

interface NormalizedTriggerEvent {
  triggerSlug?: string;
  payload?: Record<string, unknown>;
  metadata?: {
    connectedAccount?: { id?: string };
  };
}

// Bootstrap: register the project webhook subscription (idempotent — patches
// the URL if a previous one is stale, creates one if none exists) then make
// sure every active Gmail connection has a `GMAIL_NEW_GMAIL_MESSAGE` trigger
// instance attached to it. Called from `server/index.ts` at boot when a
// stable PUBLIC_URL is set, and from `scripts/dev.mjs` once the ngrok URL is
// known. Safe to call multiple times — ensureTrigger upserts.
export async function ensureProactiveWatcher(publicUrl: string): Promise<void> {
  if (!getComposio()) {
    console.warn("[proactive] COMPOSIO_API_KEY not set; skipping watcher setup");
    return;
  }
  if (!process.env.BOOP_USER_PHONE) {
    console.warn(
      "[proactive] BOOP_USER_PHONE not set; webhook will register but notices won't dispatch",
    );
  }
  try {
    await ensureWebhookSubscription(publicUrl);
  } catch (err) {
    console.error("[proactive] webhook subscription setup failed", err);
    return;
  }
  const gmailConnections = (await listConnectedToolkits()).filter(
    (c) => c.slug === "gmail" && c.status === "ACTIVE",
  );
  if (gmailConnections.length === 0) {
    console.log("[proactive] no active Gmail connections; nothing to watch yet");
    return;
  }
  for (const conn of gmailConnections) {
    const triggerId = await ensureTrigger(TRIGGER_SLUG, conn.connectionId);
    console.log(
      `[proactive] gmail trigger ensured for ${conn.accountEmail ?? conn.connectionId}: ${triggerId ?? "(no id)"}`,
    );
  }
  console.log(`[proactive] watching ${gmailConnections.length} Gmail account(s)`);
}

export async function handleEmailEvent(event: NormalizedTriggerEvent): Promise<void> {
  if (event.triggerSlug !== TRIGGER_SLUG) {
    return;
  }
  const data = event.payload ?? {};
  const connectionId = event.metadata?.connectedAccount?.id ?? "(unknown)";
  const email = normalizeEmail(data);
  console.log(
    `[proactive] event from ${connectionId}: subject=${JSON.stringify(email.subject || "(none)")} sender=${JSON.stringify(email.sender || "(none)")}`,
  );

  if (!(await isProactiveEnabled())) {
    console.log(`[proactive] disabled via settings; ignoring event`);
    return;
  }

  if (!warmupSeen.has(connectionId)) {
    warmupSeen.add(connectionId);
    console.log(`[proactive] warmup, skipping classification for connection ${connectionId}`);
    return;
  }

  // Pre-filter self-sends deterministically. The LLM rubric also lists this
  // as a drop case, but the model occasionally surfaces them anyway when the
  // body has a real-question shape ("can you send me X?"). A code-level
  // check is cheaper and can't be argued out of.
  const senderAddr = extractEmail(email.sender).toLowerCase();
  if (senderAddr) {
    const identities = (await getUserGmailIdentities()).map((e) => e.toLowerCase());
    if (identities.includes(senderAddr)) {
      console.log(`[proactive] dropped (self-send from ${senderAddr}): ${email.subject}`);
      return;
    }
  }

  const preferences = await recallPreferenceLines();
  const { important, summary } = await classifyEmailImportance(email, preferences);
  if (!important || !summary) {
    console.log(`[proactive] dropped (not important): ${email.subject}`);
    return;
  }
  console.log(`[proactive] surfacing: ${summary}`);
  await dispatchProactiveNotice(summary);
}
