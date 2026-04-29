import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { api } from "../convex/_generated/api.js";
import { convex } from "./convex-client.js";
import { broadcast } from "./broadcast.js";
import { sendImessage } from "./sendblue.js";

interface PauseContext {
  conversationId: string;
  agentId: string;
  integrations: string[];
  turnId?: string;
  // Set to true by the tool handler when the agent calls pause_for_user. The
  // execution-agent loop checks this flag after `query()` finishes so it can
  // mark the run as "paused" rather than "completed" and skip relaying a
  // duplicate reply to the user (the tool already messaged them directly).
  pausedFlag: { paused: boolean };
}

export function createPauseMcp(ctx: PauseContext) {
  return createSdkMcpServer({
    name: "boop-pause",
    version: "0.1.0",
    tools: [
      tool(
        "pause_for_user",
        "Use ONLY when the task can't proceed without a hand-action by the user (login wall, OAuth/2FA, captcha, manual file pick, security challenge). Sends a friendly message to the user, persists a continuation, and ends your turn cleanly. Boop will re-spawn you with the same task plus the user's reply once they confirm. Do NOT use for normal task completion or when you can finish on your own.",
        {
          message: z
            .string()
            .describe(
              "Short message the user will see. Reference the open Chrome window and tell them what to do (e.g. 'Opened Chase login — sign in via the Chrome window I just popped, then reply when ready.'). 1-2 sentences.",
            ),
          resume_task: z
            .string()
            .describe(
              "What you'll do AFTER the user confirms. Write it as a complete task description (a fresh sub-agent will receive this verbatim). Include the original goal AND the assumption that the user has now completed the action. Example: 'The user has now logged into chase.com. Look up their current checking balance and report it.'",
            ),
        },
        async (args) => {
          const trimmed = args.message.trim();
          if (!trimmed) {
            return {
              content: [
                { type: "text" as const, text: "Empty message — provide a real prompt for the user." },
              ],
            };
          }

          if (ctx.conversationId.startsWith("sms:")) {
            const number = ctx.conversationId.slice(4);
            try {
              await sendImessage(number, trimmed);
            } catch (err) {
              console.error("[pause_for_user] sendImessage failed", err);
            }
          }
          await convex.mutation(api.messages.send, {
            conversationId: ctx.conversationId,
            role: "assistant",
            content: trimmed,
            turnId: ctx.turnId,
          });
          broadcast("assistant_message", {
            conversationId: ctx.conversationId,
            content: trimmed,
          });

          await convex.mutation(api.pendingContinuations.set, {
            conversationId: ctx.conversationId,
            resumeTask: args.resume_task,
            integrations: ctx.integrations,
            pausedByAgentId: ctx.agentId,
          });

          ctx.pausedFlag.paused = true;

          return {
            content: [
              {
                type: "text" as const,
                text: "Paused. Your message was sent to the user and a continuation was saved. END your turn now — return an empty reply. Boop will re-spawn you with the resume task when the user confirms.",
              },
            ],
          };
        },
      ),
    ],
  });
}
