import type { Channel, ChannelId } from "./types.js";
import { createIosRouter } from "../ios/router.js";

// iOS doesn't push via an external service like Sendblue or Telegram.
// Delivery happens through the SSE stream (GET /channels/ios/stream)
// the paired iPhone holds open. Every event that needs to reach the
// client — assistant_delta, assistant_message, assistant_ack,
// thinking, error — is already broadcast by interaction-agent.ts
// during reply generation, so this channel's send() is intentionally
// a no-op: re-broadcasting here would cause duplicate deliveries.
//
// If you later add a proactive path that bypasses handleUserMessage,
// add an explicit broadcast there — not here.
export const iosChannel: Channel = {
  id: "ios" as ChannelId,
  label: "iOS",
  webhookPath: "/channels/ios",

  isConfigured(): boolean {
    return true;
  },

  async send(): Promise<void> {
    // intentionally empty — see file-level comment
  },

  startTypingLoop(): () => void {
    return () => {};
  },

  webhookRouter() {
    return createIosRouter();
  },
};
