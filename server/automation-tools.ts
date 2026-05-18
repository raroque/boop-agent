import { z } from "zod";
import { api } from "../convex/_generated/api.js";
import { convex } from "./convex-client.js";
import { availableIntegrations } from "./execution-agent.js";
import { nextRunFor, validateSchedule } from "./automations.js";
import { describeUserNow } from "./timezone-config.js";
import { createClaudeMcpServer } from "./runtimes/claude.js";
import { defineRuntimeTool } from "./runtimes/tool.js";
import { runtimeText, type RuntimeTool } from "./runtimes/types.js";

const NAMESPACE = "boop-automations";

function randomId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createAutomationTools(conversationId: string): RuntimeTool[] {
  const integrationHint = availableIntegrations().join(", ") || "(none configured)";

  return [
    defineRuntimeTool(
      NAMESPACE,
      "create_automation",
      `Schedule a recurring task. The agent will run the task on the schedule and reply with the result.

Cron expressions (5 fields: min hour day-of-month month day-of-week). Write times in the user's LOCAL clock — the runner attaches the user's stored timezone (from settings.user_timezone) automatically when evaluating the cron, so do NOT convert to UTC. If the user says "every morning at 10am" and they're on Central, pass "0 10 * * *" — it'll fire at 10am Central.

Examples:
  "0 8 * * *"      — every day at 8am (user-local)
  "*/15 * * * *"   — every 15 minutes
  "0 9 * * 1-5"    — weekdays at 9am (user-local)
  "0 18 * * 0"     — Sundays at 6pm (user-local)

If you don't yet know the user's timezone (get_config returns userTimezone=null), ASK before creating any time-of-day automation — otherwise it'll fire in the server's zone, which is almost always wrong.

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
        const tzInfo = await describeUserNow();
        const timezone = tzInfo.timezone;
        const validation = validateSchedule(args.schedule, timezone);
        if (!validation.valid) {
          return runtimeText(`Invalid cron expression: ${validation.error}`, false);
        }
        const automationId = randomId("auto");
        const nextRunAt = nextRunFor(args.schedule, timezone) ?? undefined;
        await convex.mutation(api.automations.create, {
          automationId,
          name: args.name,
          task: args.task,
          integrations: args.integrations,
          schedule: args.schedule,
          timezone,
          conversationId,
          notifyConversationId: args.notify ? conversationId : undefined,
          nextRunAt,
        });
        const nextStr = nextRunAt
          ? new Intl.DateTimeFormat("en-US", {
              timeZone: timezone,
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZoneName: "short",
            }).format(new Date(nextRunAt))
          : "unknown";
        const tzNote = tzInfo.isExplicit
          ? `timezone: ${timezone}`
          : `timezone: ${timezone} (server fallback — user has not set theirs; ask them and call set_timezone)`;
        return runtimeText(
          `Created automation ${automationId} "${args.name}" — next run: ${nextStr} (${tzNote}).`,
        );
      },
    ),

    defineRuntimeTool(
      NAMESPACE,
      "list_automations",
      "List all automations for this conversation.",
      { enabledOnly: z.boolean().optional().default(false) },
      async (args) => {
        const all = await convex.query(api.automations.list, {
          enabledOnly: args.enabledOnly,
        });
        const mine = all.filter((a) => a.conversationId === conversationId);
        if (mine.length === 0) {
          return runtimeText("No automations.");
        }
        const lines = mine.map(
          (a) =>
            `• [${a.automationId}] ${a.enabled ? "●" : "○"} "${a.name}" — ${a.schedule} — ${a.task}`,
        );
        return runtimeText(lines.join("\n"));
      },
    ),

    defineRuntimeTool(
      NAMESPACE,
      "toggle_automation",
      "Enable or disable an automation by id.",
      { automationId: z.string(), enabled: z.boolean() },
      async (args) => {
        const id = await convex.mutation(api.automations.setEnabled, args);
        return runtimeText(id ? `Set ${args.automationId} enabled=${args.enabled}.` : "Not found.");
      },
    ),

    defineRuntimeTool(
      NAMESPACE,
      "delete_automation",
      "Permanently remove an automation.",
      { automationId: z.string() },
      async (args) => {
        const id = await convex.mutation(api.automations.remove, args);
        return runtimeText(id ? `Deleted ${args.automationId}.` : "Not found.");
      },
    ),
  ];
}

export function createAutomationMcp(conversationId: string) {
  return createClaudeMcpServer(NAMESPACE, createAutomationTools(conversationId));
}
