import { z } from "zod";
import { api } from "../convex/_generated/api.js";
import { convex } from "./convex-client.js";
import { spawnExecutionAgent } from "./execution-agent.js";
import { createClaudeMcpServer } from "./runtimes/claude.js";
import { defineRuntimeTool } from "./runtimes/tool.js";
import { runtimeText, type RuntimeTool } from "./runtimes/types.js";
import type { RuntimeConfig } from "./runtime-config.js";

function randomId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createDraftStagingTools(conversationId: string): RuntimeTool[] {
  return [
    defineRuntimeTool(
      "boop-drafts",
      "save_draft",
      `Save a draft of an external action (email, calendar event, message, etc.) for the user to review.
ALWAYS call this instead of sending or creating something directly. The user will say "send it" in the next turn to commit.

- summary: one-line description the user will see.
- payload: JSON string with everything needed to execute the draft (provider-specific fields).
- kind: short type tag like "gmail.reply", "gmail.new", "gcal.event", "slack.message".`,
      {
        kind: z.string(),
        summary: z.string(),
        payload: z.string().describe("JSON string with the data needed to execute."),
      },
      async (args) => {
        const draftId = randomId("draft");
        await convex.mutation(api.drafts.create, {
          draftId,
          conversationId,
          kind: args.kind,
          summary: args.summary,
          payload: args.payload,
        });
        return runtimeText(
          `Draft saved as ${draftId}. Surface the summary to the user and ask them to confirm "send" or "cancel".`,
        );
      },
    ),
  ];
}

/**
 * Drafts MCP for EXECUTION agents. They use this to stage an action instead of
 * performing it directly.
 */
export function createDraftStagingMcp(conversationId: string) {
  return createClaudeMcpServer("boop-drafts", createDraftStagingTools(conversationId));
}

export function createDraftDecisionTools(
  conversationId: string,
  runtimeConfig?: RuntimeConfig,
): RuntimeTool[] {
  return [
    defineRuntimeTool(
      "boop-draft-decisions",
      "list_drafts",
      "List pending drafts in this conversation. Call this when the user says 'send it', 'yes', 'go ahead', etc. without a specific id.",
      {},
      async () => {
        const drafts = await convex.query(api.drafts.pendingByConversation, {
          conversationId,
        });
        if (drafts.length === 0) {
          return runtimeText("No pending drafts.");
        }
        const body = drafts.map((d) => `• [${d.draftId}] (${d.kind}) ${d.summary}`).join("\n");
        return runtimeText(body);
      },
    ),

    defineRuntimeTool(
      "boop-draft-decisions",
      "send_draft",
      "Approve and execute a draft. Spawns an execution agent to actually perform the action based on the stored payload.",
      { draftId: z.string(), integrations: z.array(z.string()) },
      async (args) => {
        const draft = await convex.query(api.drafts.get, { draftId: args.draftId });
        if (!draft || draft.status !== "pending") {
          return runtimeText(`Draft ${args.draftId} not found or already decided.`, false);
        }
        await convex.mutation(api.drafts.setStatus, {
          draftId: args.draftId,
          status: "sent",
        });
        const task = `Execute this approved draft. Use the matching integration tool to actually send/create it.
kind: ${draft.kind}
summary: ${draft.summary}
payload JSON: ${draft.payload}`;
        const res = await spawnExecutionAgent({
          task,
          integrations: args.integrations,
          conversationId,
          name: `send:${draft.kind}`,
          runtimeConfig,
        });
        return runtimeText(`Draft ${args.draftId} executed.\n\n${res.result}`);
      },
    ),

    defineRuntimeTool(
      "boop-draft-decisions",
      "reject_draft",
      "Cancel a pending draft when the user says 'no', 'cancel', or revises the request.",
      { draftId: z.string() },
      async (args) => {
        await convex.mutation(api.drafts.setStatus, {
          draftId: args.draftId,
          status: "rejected",
        });
        return runtimeText(`Draft ${args.draftId} rejected.`);
      },
    ),
  ];
}

/**
 * Drafts MCP for the INTERACTION agent. Lets it review and approve drafts the user confirmed.
 */
export function createDraftDecisionMcp(
  conversationId: string,
  runtimeConfig?: RuntimeConfig,
) {
  return createClaudeMcpServer(
    "boop-draft-decisions",
    createDraftDecisionTools(conversationId, runtimeConfig),
  );
}
