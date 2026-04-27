import { Chat, type Adapter, type Thread, type Message as ChatMessage } from "chat";
import { createMemoryState } from "@chat-adapter/state-memory";
import { createSendblueAdapter } from "chat-adapter-sendblue";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { handleUserMessage } from "./interaction-agent.js";
import { convex } from "./convex-client.js";
import { api } from "../convex/_generated/api.js";
import { broadcast } from "./broadcast.js";

// ---------------------------------------------------------------------------
// Adapter registry — add new platforms here (or via env-driven registration).
// Each entry: { envCheck, factory, webhookPath }
// ---------------------------------------------------------------------------

const adapters: Record<string, Adapter> = {};
const webhookPaths: Record<string, string> = {};

function registerIfConfigured(
  name: string,
  webhookPath: string,
  envKeys: string[],
  factory: () => Adapter,
): void {
  if (envKeys.every((k) => !!process.env[k])) {
    adapters[name] = factory();
    webhookPaths[name] = webhookPath;
    console.log(`[bot] registered adapter: ${name} → POST ${webhookPath}`);
  } else {
    console.log(`[bot] skipping adapter: ${name} (missing env: ${envKeys.filter((k) => !process.env[k]).join(", ")})`);
  }
}

// SendBlue / iMessage + Android RCS/SMS
// Key MUST match SendblueAdapter.name ("sendblue") so bot.webhooks.sendblue resolves.
registerIfConfigured("sendblue", "/sendblue/webhook", ["SENDBLUE_API_KEY", "SENDBLUE_API_SECRET", "SENDBLUE_FROM_NUMBER"], () =>
  createSendblueAdapter({
    apiKey: process.env.SENDBLUE_API_KEY!,
    apiSecret: process.env.SENDBLUE_API_SECRET!,
    defaultFromNumber: process.env.SENDBLUE_FROM_NUMBER!,
    allowedServices: ["iMessage", "SMS", "RCS", "sms"],
  }),
);

// Telegram
registerIfConfigured("telegram", "/telegram/webhook", ["TELEGRAM_BOT_TOKEN"], () =>
  createTelegramAdapter({ mode: "webhook" }),
);

// Add more platforms by appending registerIfConfigured() calls, e.g.:
// registerIfConfigured("slack", "/slack/webhook", ["SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET"], () =>
//   createSlackAdapter());

// ---------------------------------------------------------------------------

export const bot = new Chat({
  userName: "boop",
  adapters,
  state: createMemoryState(),
  dedupeTtlMs: 600_000,
});

/** Map of adapter name → Express webhook path, for mounting in index.ts */
export { webhookPaths };

// ---------------------------------------------------------------------------
// Shared turn handler
// ---------------------------------------------------------------------------

async function handleTurn(thread: Thread, message: ChatMessage): Promise<void> {
  if (message.author.isMe) return;
  await thread.subscribe();

  const conversationId = thread.id;
  const content = message.text;
  const turnTag = Math.random().toString(36).slice(2, 8);
  const preview = content.length > 100 ? content.slice(0, 100) + "…" : content;

  console.log(`[turn ${turnTag}] ← ${conversationId}: ${JSON.stringify(preview)}`);
  broadcast("message_in", { conversationId, content, from: message.author.userId });

  const start = Date.now();
  thread.startTyping().catch(() => {});
  const typingLoop = setInterval(() => thread.startTyping().catch(() => {}), 5000);

  try {
    const reply = await handleUserMessage({
      conversationId,
      content,
      turnTag,
      onThinking: (t) => broadcast("thinking", { conversationId, t }),
      onSendAck: async (ack) => {
        await thread.post(ack);
        await convex.mutation(api.messages.send, {
          conversationId,
          role: "assistant",
          content: ack,
        });
        broadcast("assistant_ack", { conversationId, content: ack });
      },
    });

    if (reply) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const replyPreview = reply.length > 100 ? reply.slice(0, 100) + "…" : reply;
      console.log(
        `[turn ${turnTag}] → reply (${elapsed}s, ${reply.length} chars): ${JSON.stringify(replyPreview)}`,
      );
      await thread.post(reply);
      await convex.mutation(api.messages.send, {
        conversationId,
        role: "assistant",
        content: reply,
      });
    } else {
      console.log(`[turn ${turnTag}] → (no reply)`);
    }
  } catch (err) {
    console.error(`[turn ${turnTag}] handler error`, err);
  } finally {
    clearInterval(typingLoop);
  }
}

// ---------------------------------------------------------------------------
// Event routing
// ---------------------------------------------------------------------------

// Catch-all for unsubscribed threads — covers SMS/RCS/iMessage (Sendblue
// adapter doesn't implement isDM so onDirectMessage never fires for it),
// and also Telegram/Slack DMs that don't use @-mentions.
bot.onNewMessage(/[\s\S]*/, handleTurn);

// @-mentions in channels (Slack, Discord, Teams, Google Chat)
bot.onNewMention(async (thread, message) => handleTurn(thread, message));

// Subscribed threads (follow-up messages after first interaction)
bot.onSubscribedMessage(async (thread, message) => handleTurn(thread, message));
