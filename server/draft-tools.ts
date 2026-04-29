import { z } from "zod";
import { api } from "../convex/_generated/api.js";
import { convex } from "./convex-client.js";
import { spawnExecutionAgent } from "./execution-agent.js";
import { createClaudeMcpServer } from "./runtimes/claude.js";
import { objectSchema, stringArraySchema, stringSchema } from "./runtimes/json-schema.js";
import type { RuntimeTool } from "./runtimes/types.js";
import { runtimeText } from "./runtimes/types.js";

function randomId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createDraftStagingTools(conversationId: string): RuntimeTool[] {
  const saveDraftSchema = {
    kind: z.string(),
    summary: z.string(),
    payload: z.string().describe("JSON string with the data needed to execute."),
  };

  return [
    {
      namespace: "boop-drafts",
      name: "save_draft",
      description: `Save a draft of an external action (email, calendar event, message, etc.) for the user to review.
ALWAYS call this instead of sending or creating something directly. The user will say "send it" in the next turn to commit.

- summary: one-line description the user will see.
- payload: JSON string with everything needed to execute the draft (provider-specific fields).
- kind: short type tag like "gmail.reply", "gmail.new", "gcal.event", "slack.message".`,
      zodSchema: saveDraftSchema,
      jsonSchema: objectSchema({
        kind: stringSchema(),
        summary: stringSchema(),
        payload: stringSchema("JSON string with the data needed to execute."),
      }),
      handle: async (rawArgs) => {
        const args = z.object(saveDraftSchema).parse(rawArgs);
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
    },
  ];
}

export function createDraftDecisionTools(conversationId: string): RuntimeTool[] {
  const sendDraftSchema = {
    draftId: z.string(),
    integrations: z.array(z.string()),
  };
  const rejectDraftSchema = { draftId: z.string() };

  return [
    {
      namespace: "boop-draft-decisions",
      name: "list_drafts",
      description:
        "List pending drafts in this conversation. Call this when the user says 'send it', 'yes', 'go ahead', etc. without a specific id.",
      zodSchema: {},
      jsonSchema: objectSchema({}, []),
      handle: async () => {
        const drafts = await convex.query(api.drafts.pendingByConversation, {
          conversationId,
        });
        if (drafts.length === 0) return runtimeText("No pending drafts.");
        const body = (drafts as any[])
          .map((d: any) => `- [${d.draftId}] (${d.kind}) ${d.summary}`)
          .join("\n");
        return runtimeText(body);
      },
    },
    {
      namespace: "boop-draft-decisions",
      name: "send_draft",
      description:
        "Approve and execute a draft. Spawns an execution agent to actually perform the action based on the stored payload.",
      zodSchema: sendDraftSchema,
      jsonSchema: objectSchema({
        draftId: stringSchema(),
        integrations: stringArraySchema(),
      }),
      handle: async (rawArgs) => {
        const args = z.object(sendDraftSchema).parse(rawArgs);
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
        });
        return runtimeText(`Draft ${args.draftId} executed.\n\n${res.result}`);
      },
    },
    {
      namespace: "boop-draft-decisions",
      name: "reject_draft",
      description: "Cancel a pending draft when the user says 'no', 'cancel', or revises the request.",
      zodSchema: rejectDraftSchema,
      jsonSchema: objectSchema({ draftId: stringSchema() }),
      handle: async (rawArgs) => {
        const args = z.object(rejectDraftSchema).parse(rawArgs);
        await convex.mutation(api.drafts.setStatus, {
          draftId: args.draftId,
          status: "rejected",
        });
        return runtimeText(`Draft ${args.draftId} rejected.`);
      },
    },
  ];
}

export function createDraftStagingMcp(conversationId: string) {
  return createClaudeMcpServer("boop-drafts", createDraftStagingTools(conversationId));
}

export function createDraftDecisionMcp(conversationId: string) {
  return createClaudeMcpServer("boop-draft-decisions", createDraftDecisionTools(conversationId));
}
