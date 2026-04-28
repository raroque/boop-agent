import { internal } from "../convex/_generated/api.js";
import { convex } from "./convex-client.js";
import { cancelAgent, runningAgentIds } from "./execution-agent.js";
import { broadcast } from "./broadcast.js";

const STALE_MS = 15 * 60 * 1000;

export async function sweepStaleAgents(): Promise<void> {
  const runningInDb = await convex.query(internal.agents.listInternal, { status: "running", limit: 100 });
  const now = Date.now();
  const live = new Set(runningAgentIds());

  for (const a of runningInDb) {
    const age = now - a.startedAt;
    if (age < STALE_MS) continue;

    if (live.has(a.agentId)) {
      cancelAgent(a.agentId);
    }
    await convex.mutation(internal.agents.update, {
      agentId: a.agentId,
      status: "failed",
      error: `Marked failed after ${Math.round(age / 1000)}s (stale heartbeat).`,
    });
    broadcast("agent_stale", { agentId: a.agentId });
  }
}

export function startHeartbeatLoop(intervalMs = 60_000): () => void {
  const timer = setInterval(() => {
    sweepStaleAgents().catch((err) => console.error("[heartbeat] sweep error", err));
  }, intervalMs);
  return () => clearInterval(timer);
}
