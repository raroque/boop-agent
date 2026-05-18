import express from "express";
import { api } from "../convex/_generated/api.js";
import { convex } from "./convex-client.js";
import { handleUserMessage } from "./interaction-agent.js";
import { broadcast } from "./broadcast.js";

const MAX_CHUNK = 3900;

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?|```/g, ""))
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1 ($2)")
    .trim();
}

function chunk(text: string, size = MAX_CHUNK): string[] {
  if (text.length <= size) return [text];

  const out: string[] = [];
  let buf = "";

  for (const line of text.split(/\n/)) {
    if ((buf + "\n" + line).length > size) {
      if (buf) out.push(buf);
      buf = line;
    } else {
      buf = buf ? buf + "\n" + line : line;
    }
  }

  if (buf) out.push(buf);
  return out;
}

async function sendTelegramMessage(chatId: number | string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn("[telegram] missing TELEGRAM_BOT_TOKEN — not sending");
    return;
  }

  for (const part of chunk(stripMarkdown(text))) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: part,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[telegram] send failed ${res.status}: ${body}`);
    }
  }
}

async function sendTelegramTyping(chatId: number | string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        action: "typing",
      }),
    });
  } catch {
    // non-fatal
  }
}

function startTypingLoop(chatId: number | string): () => void {
  sendTelegramTyping(chatId);
  const timer = setInterval(() => sendTelegramTyping(chatId), 5000);
  return () => clearInterval(timer);
}

export function createTelegramRouter(): express.Router {
  const router = express.Router();

  router.post("/webhook", async (req, res) => {
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const incomingSecret = req.header("x-telegram-bot-api-secret-token");

    if (expectedSecret && incomingSecret !== expectedSecret) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }

    const update = req.body ?? {};
    const message = update.message ?? update.edited_message;

    const chatId = message?.chat?.id;
    const userId = message?.from?.id;
    const text = message?.text;

    if (!chatId || !userId || typeof text !== "string" || !text.trim()) {
      res.json({ ok: true, skipped: true });
      return;
    }

    const conversationId = `telegram:${chatId}`;
    const turnTag = Math.random().toString(36).slice(2, 8);
    const preview = text.length > 100 ? text.slice(0, 100) + "…" : text;

    console.log(`[turn ${turnTag}] ← telegram:${chatId}: ${JSON.stringify(preview)}`);

    broadcast("message_in", {
      conversationId,
      content: text,
      from_number: `telegram:${userId}`,
      handle: String(message.message_id ?? update.update_id ?? ""),
    });

    res.json({ ok: true });

    const start = Date.now();
    const stopTyping = startTypingLoop(chatId);

    try {
      const reply = await handleUserMessage({
        conversationId,
        content: text,
        turnTag,
        onThinking: (t) => broadcast("thinking", { conversationId, t }),
      });

      if (reply) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`[turn ${turnTag}] → telegram reply (${elapsed}s, ${reply.length} chars)`);

        await sendTelegramMessage(chatId, reply);

        await convex.mutation(api.messages.send, {
          conversationId,
          role: "assistant",
          content: reply,
        });
      }
    } catch (err) {
      console.error(`[turn ${turnTag}] telegram handler error`, err);
      await sendTelegramMessage(chatId, "BÓNG gặp lỗi khi xử lý tin nhắn này.");
    } finally {
      stopTyping();
    }
  });

  return router;
}