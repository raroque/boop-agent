import { tool, createSdkMcpServer } from "./llm/index.js";
import { z } from "zod";
import { api } from "../convex/_generated/api.js";
import { convex } from "./convex-client.js";
import { availableIntegrations } from "./execution-agent.js";
import { nextRunFor, validateSchedule } from "./automations.js";

function randomId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createAutomationMcp(conversationId: string) {
  const integrationHint = availableIntegrations().join(", ") || "(none configured)";

  return createSdkMcpServer({
    name: "boop-automations",
    version: "0.1.0",
    tools: [
      tool(
        "create_automation",
        `Schedule a recurring task. The agent will run the task on the schedule and reply with the result.

Cron expressions (5 fields: min hour day-of-month month day-of-week). Examples:
  "0 8 * * *"      — every day at 8am
  "*/15 * * * *"   — every 15 minutes
  "0 9 * * 1-5"    — weekdays at 9am
  "0 18 * * 0"     — Sundays at 6pm

Use this for anything the user says "every [time]" or "remind me" about.
Integrations available: ${integrationHint}`,
        {
          name: z.string().describe("Short label, e.g. 'morning email digest'."),
          schedule: z.string().describe("Cron expression (5 fields)."),
          task: z
            .string()
            .describe("Specific task for the sub-agent — what to look up, draft, or summarize."),
          integrations: z
            .array(z.string())
            .optional()
            .default([])
            .describe(
              "Integration names the sub-agent needs for this task. Pass [] for reminder-only automations that don't need external tools.",
            ),
          notify: z
            .boolean()
            .optional()
            .default(true)
            .describe("If true, send the result to this conversation when it runs."),
        },
        async (args) => {
          const validation = validateSchedule(args.schedule);
          if (!validation.valid) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Invalid cron expression: ${validation.error}`,
                },
              ],
            };
          }
          const automationId = randomId("auto");
          const nextRunAt = nextRunFor(args.schedule) ?? undefined;
          await convex.mutation(api.automations.create, {
            automationId,
            name: args.name,
            task: args.task,
            integrations: args.integrations,
            schedule: args.schedule,
            conversationId,
            notifyConversationId: args.notify ? conversationId : undefined,
            nextRunAt,
          });
          const nextStr = nextRunAt ? new Date(nextRunAt).toLocaleString() : "unknown";
          return {
            content: [
              {
                type: "text" as const,
                text: `Created automation ${automationId} "${args.name}" — next run: ${nextStr}.`,
              },
            ],
          };
        },
      ),

      tool(
        "list_automations",
        "List all automations for this conversation.",
        { enabledOnly: z.boolean().optional().default(false) },
        async (args) => {
          const all = await convex.query(api.automations.list, {
            enabledOnly: args.enabledOnly,
          });
          const mine = all.filter((a: any) => a.conversationId === conversationId);
          if (mine.length === 0) {
            return { content: [{ type: "text" as const, text: "No automations." }] };
          }
          const lines = mine.map(
            (a: any) =>
              `• [${a.automationId}] ${a.enabled ? "●" : "○"} "${a.name}" — ${a.schedule} — ${a.task}`,
          );
          return { content: [{ type: "text" as const, text: lines.join("\n") }] };
        },
      ),

      tool(
        "toggle_automation",
        "Enable or disable an automation by id.",
        { automationId: z.string(), enabled: z.boolean() },
        async (args) => {
          const id = await convex.mutation(api.automations.setEnabled, args);
          return {
            content: [
              {
                type: "text" as const,
                text: id ? `Set ${args.automationId} enabled=${args.enabled}.` : `Not found.`,
              },
            ],
          };
        },
      ),

      tool(
        "delete_automation",
        "Permanently remove an automation.",
        { automationId: z.string() },
        async (args) => {
          const id = await convex.mutation(api.automations.remove, args);
          return {
            content: [
              {
                type: "text" as const,
                text: id ? `Deleted ${args.automationId}.` : `Not found.`,
              },
            ],
          };
        },
      ),
    ],
  });
}
