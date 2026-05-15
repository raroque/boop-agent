import type { Express } from "express";
import { api } from "../../convex/_generated/api.js";
import { convex } from "../convex-client.js";
import { broadcast } from "../broadcast.js";
import { handleUserMessage } from "../interaction-agent.js";
import { recordChannelPrimary } from "../runtime-config.js";
import type { Channel, ChannelId, ConversationId, ParsedInbound, SendOpts } from "./types.js";
import { channelIdOf } from "./types.js";
import { sendblueChannel } from "./sendblue.js";
import { telegramChannel } from "./telegram.js";
import { publicizeStorageUrl } from "../file-proxy.js";

const registry: Partial<Record<ChannelId, Channel>> = {
  sms: sendblueChannel,
  tg: telegramChannel,
};

export function getChannel(conversationId: string): Channel | null {
  const id = channelIdOf(conversationId);
  if (!id) return null;
  return registry[id] ?? null;
}

/** Look up a channel by its id, no conversationId needed. */
export function getChannelById(id: ChannelId): Channel | null {
  return registry[id] ?? null;
}

export async function dispatch(
  conversationId: ConversationId,
  text: string,
  opts?: SendOpts,
): Promise<void> {
  const ch = getChannel(conversationId);
  if (!ch) {
    console.warn(`[channels] no channel for ${conversationId}`);
    return;
  }
  if (!ch.isConfigured()) {
    console.warn(`[channels] ${ch.label} not configured — dropping send`);
    return;
  }
  await ch.send(conversationId, text, opts);
}

export function startTyping(conversationId: ConversationId): () => void {
  const ch = getChannel(conversationId);
  if (!ch || !ch.isConfigured()) return () => {};
  return ch.startTypingLoop(conversationId);
}

export function listChannels(): Channel[] {
  return Object.values(registry).filter((ch): ch is Channel => Boolean(ch?.isConfigured()));
}

export function mountChannelRouters(app: Express): void {
  for (const ch of Object.values(registry)) {
    if (ch && ch.isConfigured()) {
      app.use(ch.webhookPath, ch.webhookRouter());
      console.log(`[channels] mounted ${ch.label} at ${ch.webhookPath}`);
    }
  }
}

/** Internal export used by the registry tests in Phase 4 to register the Telegram channel. */
export function _registerChannel(ch: Channel): void {
  registry[ch.id] = ch;
}

/**
 * Shared turn runner extracted from server/sendblue.ts:createSendblueRouter.
 * Each channel's webhook does parse + dedup + allowlist, then calls this.
 */
export async function runTurn(inbound: ParsedInbound): Promise<void> {
  const { conversationId, content, from, attachments } = inbound;
  const turnTag = Math.random().toString(36).slice(2, 8);
  const preview = content.length > 100 ? content.slice(0, 100) + "…" : content;
  console.log(`[turn ${turnTag}] ← ${from}: ${JSON.stringify(preview)}`);
  const start = Date.now();

  broadcast("message_in", { conversationId, content, from });

  await recordChannelPrimary(conversationId).catch((err) =>
    console.warn(`[channels] recordChannelPrimary failed`, err),
  );

  const stopTyping = startTyping(conversationId);
  try {
    const reply = await handleUserMessage({
      conversationId,
      content,
      attachments,
      turnTag,
      onThinking: (t) => broadcast("thinking", { conversationId, t }),
    });
    if (reply) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const replyPreview = reply.length > 100 ? reply.slice(0, 100) + "…" : reply;
      console.log(
        `[turn ${turnTag}] → reply (${elapsed}s, ${reply.length} chars): ${JSON.stringify(replyPreview)}`,
      );
      const [pdfArtifact, imageArtifact] = await Promise.all([
        convex.query(api.pdfArtifacts.latestForConversation, {
          conversationId,
          since: start,
        }),
        convex.query(api.imageArtifacts.latestForConversation, {
          conversationId,
          since: start,
        }),
      ]);
      // If both produced (rare), attach the most recent.
      const pickImage =
        imageArtifact &&
        (!pdfArtifact || imageArtifact._creationTime >= pdfArtifact._creationTime);
      const sendOpts: SendOpts = pickImage
        ? {
            mediaUrl: publicizeStorageUrl(imageArtifact!.signedUrl),
            mediaKind: "image",
          }
        : pdfArtifact
          ? {
              mediaUrl: publicizeStorageUrl(pdfArtifact.signedUrl),
              mediaKind: "document",
            }
          : {};
      await dispatch(conversationId, reply, sendOpts);
      // F5 retry: the SSE/dashboard already streamed the reply via
      // broadcast("assistant_message"), so a silent messages.send
      // failure leaves an orphan — visible in the live UI, absent on
      // cold reload. Retry with backoff; surface terminal failures as
      // an error broadcast so iOS clients can flag the lost write.
      let sendErr: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await convex.mutation(api.messages.send, {
            conversationId,
            role: "assistant",
            content: reply,
          });
          sendErr = undefined;
          break;
        } catch (err) {
          sendErr = err;
          console.warn(
            `[turn ${turnTag}] messages.send attempt ${attempt + 1} failed`,
            err,
          );
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 100 * Math.pow(3, attempt)));
          }
        }
      }
      if (sendErr) {
        console.error(`[turn ${turnTag}] messages.send terminal failure`, sendErr);
        broadcast("error", {
          conversationId,
          source: "messages.send",
          message: "reply was not saved to history",
        });
      }
    } else {
      console.log(`[turn ${turnTag}] → (no reply)`);
    }
  } catch (err) {
    console.error(`[turn ${turnTag}] handler error`, err);
  } finally {
    stopTyping();
  }
}
