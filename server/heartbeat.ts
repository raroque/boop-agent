import { api } from "../convex/_generated/api.js";
import { convex } from "./convex-client.js";
import { cancelAgent, runningAgentIds } from "./execution-agent.js";
import { broadcast } from "./broadcast.js";

const STALE_MS = 15 * 60 * 1000;
const ORPHANED_MS = 90 * 1000;

export async function sweepStaleAgents(): Promise<void> {
  const runningInDb = await convex.query(api.agents.list, { status: "running", limit: 100 });
  const now = Date.now();
  const live = new Set(runningAgentIds());

  for (const a of runningInDb) {
    const age = now - a.startedAt;
    const isLive = live.has(a.agentId);
    if (isLive && age < STALE_MS) continue;
    if (!isLive && age < ORPHANED_MS) continue;

    if (isLive) {
      cancelAgent(a.agentId);
    }
    await convex.mutation(api.agents.update, {
      agentId: a.agentId,
      status: "failed",
      error: isLive
        ? `Marked failed after ${Math.round(age / 1000)}s (stale heartbeat).`
        : `Marked failed after ${Math.round(age / 1000)}s (orphaned after backend restart).`,
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
