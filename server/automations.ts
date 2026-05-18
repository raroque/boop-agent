import { Cron } from "croner";
import { api } from "../convex/_generated/api.js";
import { convex } from "./convex-client.js";
import { spawnExecutionAgent } from "./execution-agent.js";
import { sendImessage } from "./sendblue.js";
import { broadcast } from "./broadcast.js";
import { getUserTimezone } from "./timezone-config.js";

function randomId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Both helpers accept an optional IANA timezone — when present, croner
// evaluates the cron expression in that zone. Without it, croner falls back
// to the server's local zone, which is almost always wrong for users in a
// different timezone than the host machine.
export function nextRunFor(schedule: string, timezone?: string): number | null {
  try {
    const c = new Cron(schedule, { paused: true, ...(timezone ? { timezone } : {}) });
    const next = c.nextRun();
    return next ? next.getTime() : null;
  } catch {
    return null;
  }
}

export function validateSchedule(
  schedule: string,
  timezone?: string,
): { valid: boolean; error?: string } {
  try {
    new Cron(schedule, { paused: true, ...(timezone ? { timezone } : {}) }).nextRun();
    return { valid: true };
  } catch (err) {
    return { valid: false, error: String(err) };
  }
}

async function runAutomation(a: {
  automationId: string;
  name: string;
  task: string;
  integrations: string[];
  schedule: string;
  timezone?: string;
  conversationId?: string;
  notifyConversationId?: string;
}): Promise<void> {
  const runId = randomId("run");
  await convex.mutation(api.automations.createRun, {
    runId,
    automationId: a.automationId,
  });
  broadcast("automation_started", { automationId: a.automationId, runId, name: a.name });

  try {
    const res = await spawnExecutionAgent({
      task: `AUTOMATION "${a.name}": ${a.task}`,
      integrations: a.integrations,
      conversationId: a.conversationId,
      name: `auto:${a.name}`,
    });
    await convex.mutation(api.automations.updateRun, {
      runId,
      status: res.status === "completed" ? "completed" : "failed",
      result: res.result,
      agentId: res.agentId,
    });

    if (a.notifyConversationId && res.result) {
      if (a.notifyConversationId.startsWith("sms:")) {
        const number = a.notifyConversationId.slice(4);
        const preamble = `[${a.name}]\n\n`;
        await sendImessage(number, preamble + res.result);
      }
      await convex.mutation(api.messages.send, {
        conversationId: a.notifyConversationId,
        role: "assistant",
        content: `[${a.name}]\n\n${res.result}`,
      });
    }

    broadcast("automation_completed", { automationId: a.automationId, runId });
  } catch (err) {
    await convex.mutation(api.automations.updateRun, {
      runId,
      status: "failed",
      error: String(err),
    });
    broadcast("automation_failed", { automationId: a.automationId, runId, error: String(err) });
  }

  // Pre-TZ automations have no stored timezone — fall back to whatever the
  // user's current setting is so they don't keep firing in the host zone.
  const tz = a.timezone ?? (await getUserTimezone());
  const next = nextRunFor(a.schedule, tz);
  await convex.mutation(api.automations.markRan, {
    automationId: a.automationId,
    lastRunAt: Date.now(),
    nextRunAt: next ?? undefined,
  });
}

export async function tickAutomations(): Promise<void> {
  const all = await convex.query(api.automations.list, { enabledOnly: true });
  const now = Date.now();
  const due = all.filter((a) => a.nextRunAt !== undefined && a.nextRunAt <= now);
  for (const a of due) {
    // fire-and-forget so one slow automation doesn't block others
    runAutomation({
      automationId: a.automationId,
      name: a.name,
      task: a.task,
      integrations: a.integrations,
      schedule: a.schedule,
      timezone: a.timezone,
      conversationId: a.conversationId,
      notifyConversationId: a.notifyConversationId,
    }).catch((err) => console.error("[automations] run error", err));
  }
}

export function startAutomationLoop(intervalMs = 30_000): () => void {
  const timer = setInterval(() => {
    tickAutomations().catch((err) => console.error("[automations] tick error", err));
  }, intervalMs);
  return () => clearInterval(timer);
}
