import { query } from "./_generated/server";

// Cap per-table scans so a long-lived install doesn't hit Convex's 16,384
// .collect() ceiling and break the dashboard. Metrics reflect the most
// recent N rows per table; `truncated` surfaces when we've hit the cap.
const METRICS_SCAN_LIMIT = 5000;

export const metrics = query({
  args: {},
  handler: async (ctx) => {
    const [messages, memories, agents, automationRuns] = await Promise.all([
      ctx.db.query("messages").order("desc").take(METRICS_SCAN_LIMIT),
      ctx.db.query("memoryRecords").order("desc").take(METRICS_SCAN_LIMIT),
      ctx.db.query("executionAgents").order("desc").take(METRICS_SCAN_LIMIT),
      ctx.db.query("automationRuns").order("desc").take(METRICS_SCAN_LIMIT),
    ]);
    const truncated =
      messages.length === METRICS_SCAN_LIMIT ||
      memories.length === METRICS_SCAN_LIMIT ||
      agents.length === METRICS_SCAN_LIMIT ||
      automationRuns.length === METRICS_SCAN_LIMIT;

    const activeMem = memories.filter((m) => m.lifecycle === "active");

    // Build daily buckets across all time so the chart has something to draw.
    const buckets = new Map<
      string,
      {
        day: string;
        agentCost: number;
        inputTokens: number;
        outputTokens: number;
        agentsSpawned: number;
        agentsCompleted: number;
        agentsFailed: number;
        agentsCancelled: number;
        automationRuns: number;
      }
    >();

    function keyFor(ts: number) {
      return new Date(ts).toISOString().slice(0, 10);
    }
    function bucketFor(day: string) {
      let b = buckets.get(day);
      if (!b) {
        b = {
          day,
          agentCost: 0,
          inputTokens: 0,
          outputTokens: 0,
          agentsSpawned: 0,
          agentsCompleted: 0,
          agentsFailed: 0,
          agentsCancelled: 0,
          automationRuns: 0,
        };
        buckets.set(day, b);
      }
      return b;
    }

    for (const a of agents) {
      const b = bucketFor(keyFor(a.startedAt));
      b.agentsSpawned += 1;
      b.agentCost += a.costUsd ?? 0;
      b.inputTokens += a.inputTokens ?? 0;
      b.outputTokens += a.outputTokens ?? 0;
      if (a.status === "completed") b.agentsCompleted += 1;
      else if (a.status === "failed") b.agentsFailed += 1;
      else if (a.status === "cancelled") b.agentsCancelled += 1;
    }
    for (const r of automationRuns) {
      const b = bucketFor(keyFor(r.startedAt));
      b.automationRuns += 1;
    }

    const dailyBuckets = [...buckets.values()].sort((a, b) => a.day.localeCompare(b.day));

    return {
      messages: messages.length,
      memories: {
        total: activeMem.length,
        shortTerm: activeMem.filter((m) => m.tier === "short").length,
        longTerm: activeMem.filter((m) => m.tier === "long").length,
        permanent: activeMem.filter((m) => m.tier === "permanent").length,
      },
      agents: {
        total: agents.length,
        completed: agents.filter((a) => a.status === "completed").length,
        failed: agents.filter((a) => a.status === "failed").length,
        cancelled: agents.filter((a) => a.status === "cancelled").length,
        running: agents.filter(
          (a) => a.status === "running" || a.status === "spawned",
        ).length,
      },
      cost: {
        total: agents.reduce((s, a) => s + (a.costUsd ?? 0), 0),
      },
      tokens: {
        input: agents.reduce((s, a) => s + (a.inputTokens ?? 0), 0),
        output: agents.reduce((s, a) => s + (a.outputTokens ?? 0), 0),
      },
      dailyBuckets,
      truncated,
      scanLimit: METRICS_SCAN_LIMIT,
    };
  },
});
