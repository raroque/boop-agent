import type { Channel, ChannelId, ConversationId, SendOpts } from "./types.js";
import { broadcast } from "../broadcast.js";
import { createIosRouter } from "../ios/router.js";

// iOS doesn't push via an external service like Sendblue or Telegram —
// the connected client consumes assistant_delta / assistant_message
// events over its SSE stream (GET /channels/ios/stream). runTurn's call
// path already streams those during reply generation, so this send() is
// a defensive belt-and-suspenders: it re-emits assistant_message for
// the unsolicited case (automations, proactive nudges) where no turn is
// in flight and the SSE listener is the only path to the client.
export const iosChannel: Channel = {
  id: "ios" as ChannelId,
  label: "iOS",
  webhookPath: "/channels/ios",

  isConfigured(): boolean {
    return true;
  },

  async send(conversationId: ConversationId, text: string, opts: SendOpts = {}): Promise<void> {
    broadcast("assistant_message", { conversationId, content: text, opts });
  },

  startTypingLoop(): () => void {
    return () => {};
  },

  webhookRouter() {
    return createIosRouter();
  },
};
