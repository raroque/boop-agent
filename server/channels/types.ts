import type { Router } from "express";
import type { Doc } from "../../convex/_generated/dataModel.js";

/** Identifier for each channel; used as the conversationId prefix and registry key. */
export type ChannelId = "sms" | "tg" | "ios";

/** Conversation IDs are channel-prefixed: "sms:+15551234567" or "tg:123456789". */
export type ConversationId = `${ChannelId}:${string}`;

export interface SendOpts {
  /** Optional URL of media to attach (PDFs or images from artifact pipeline). */
  mediaUrl?: string;
  /**
   * How to render the attached media. "document" sends as a file
   * (PDF behavior); "image" sends as an inline photo (Telegram sendPhoto,
   * iMessage native image preview). Defaults to "document" so existing
   * PDF callsites keep working unchanged.
   */
  mediaKind?: "document" | "image";
}

/** What every channel hands to runTurn after parsing its webhook payload. */
export interface ParsedInbound {
  conversationId: ConversationId;
  /** Human-readable identifier of sender for logs only. */
  from: string;
  content: string;
  /** Inbound attachment metadata (photos, PDFs, docs) — optional. */
  attachments?: Doc<"messages">["attachments"];
  /** iOS thread id — scopes message persistence and SSE filtering. */
  threadId?: string;
  /**
   * If the calling channel already persisted the inbound user message
   * (e.g. iOS /inbound does this so it can return the id to the client),
   * pass the id here. handleUserMessage will skip its own persist +
   * `user_message` broadcast so we don't double-write the row.
   */
  precomputedUserMessageId?: string;
  /**
   * Tagged with `precomputedUserMessageId` — when iOS pre-persists
   * the user message it generates the turnId itself so the
   * subsequent agent turn writes assistant rows under the same
   * grouping key. Required whenever `precomputedUserMessageId` is set.
   */
  precomputedTurnId?: string;
}

export interface Channel {
  readonly id: ChannelId;
  readonly label: string;
  /** Path the webhook router mounts at, e.g. "/sendblue", "/telegram". */
  readonly webhookPath: string;

  /** True iff env vars are set and the channel can actually send. */
  isConfigured(): boolean;

  /** Send a final reply or unsolicited message. Handles chunking, markdown, attachments. */
  send(conversationId: ConversationId, text: string, opts?: SendOpts): Promise<void>;

  /** Start a typing indicator that auto-renews. Returns a stop fn. No-op if unsupported. */
  startTypingLoop(conversationId: ConversationId): () => void;

  /** Express router for the channel's webhook. */
  webhookRouter(): Router;
}

/** Strip the channel prefix from a ConversationId. "tg:123" -> "123" */
export function stripChannelPrefix(conversationId: ConversationId): string {
  const idx = conversationId.indexOf(":");
  return idx === -1 ? conversationId : conversationId.slice(idx + 1);
}

/** Extract the channel id from a ConversationId. "tg:123" -> "tg" */
export function channelIdOf(conversationId: string): ChannelId | null {
  const prefix = conversationId.split(":", 1)[0];
  return prefix === "sms" || prefix === "tg" || prefix === "ios" ? prefix : null;
}

/** Parse an iOS conversationId.
 *
 * Returns `{ deviceId, threadId }`:
 *   - "ios:abc-uuid"             → { deviceId: "abc-uuid", threadId: null }   (legacy M1)
 *   - "ios:abc-uuid:thread-id"   → { deviceId: "abc-uuid", threadId: "thread-id" }
 *
 * Returns `null` if the id doesn't have the `ios:` prefix.
 */
export function parseIosConversationId(
  cid: string,
): { deviceId: string; threadId: string | null } | null {
  if (!cid.startsWith("ios:")) return null;
  const rest = cid.slice("ios:".length);
  const sep = rest.indexOf(":");
  if (sep === -1) return { deviceId: rest, threadId: null };
  return { deviceId: rest.slice(0, sep), threadId: rest.slice(sep + 1) };
}

/** Construct an iOS conversationId from a deviceId + threadId. */
export function iosConversationId(deviceId: string, threadId: string): ConversationId {
  return `ios:${deviceId}:${threadId}` as ConversationId;
}
