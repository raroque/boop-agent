// Phase 0 stub. Real dispatching, dedup against Convex `telegramDedup`, and
// outbound `sendMessage` arrive in Phase 5.
//
// For now: verify the secret header (or path), gate on
// TELEGRAM_ALLOWED_CHAT_ID, and reply 200 with a no-op envelope so the bot
// API stops retrying. Body is logged to stdout — enough to validate the
// webhook wiring end-to-end.

import { Router, type Request, type Response } from "express";

const SECRET_HEADER = "x-telegram-bot-api-secret-token";

interface TelegramUpdate {
  update_id?: number;
  message?: {
    chat?: { id?: number | string };
    text?: string;
  };
}

export function createTelegramRouter(): Router {
  const router = Router();
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  const allowedChatId = process.env.TELEGRAM_ALLOWED_CHAT_ID ?? "";

  router.post("/webhook/:secret", (req: Request, res: Response) => {
    if (!secret) {
      console.warn("[telegram] TELEGRAM_WEBHOOK_SECRET unset — refusing webhook");
      res.status(503).json({ ok: false, error: "secret_unset" });
      return;
    }
    const pathOk = req.params.secret === secret;
    const headerOk = req.get(SECRET_HEADER) === secret;
    if (!pathOk && !headerOk) {
      res.status(403).json({ ok: false, error: "bad_secret" });
      return;
    }

    const update = (req.body ?? {}) as TelegramUpdate;
    const chatId = update.message?.chat?.id;
    const allowed =
      !allowedChatId || (chatId !== undefined && String(chatId) === allowedChatId);

    console.log(
      `[telegram] update_id=${update.update_id ?? "?"} chat_id=${chatId ?? "?"} allowed=${allowed} text=${JSON.stringify(update.message?.text ?? "")}`,
    );

    res.json({
      ok: true,
      deduped: false,
      noop: true,
      dryRun: (process.env.DRY_RUN ?? "on") !== "off",
    });
  });

  return router;
}
