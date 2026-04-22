import { api } from "../../convex/_generated/api.js";
import { convex } from "../convex-client.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const PRUNE_THRESHOLD = 0.05;
const ARCHIVE_THRESHOLD = 0.15;

// Ping's adaptive-decay constants. beta pulls the curve; half_life is the
// nominal half-life (days) that gets stretched by importance.
// Effective half-life ≈ BASE_HALF_LIFE_DAYS × (1 + importance) / DECAY_BETA.
// With beta=0.8 and half_life=11.25, importance=0.5 → ~21 days,
// importance=0.9 → ~27 days. (Ignoring per-segment decayRate trim.)
const DECAY_BETA = 0.8;
const BASE_HALF_LIFE_DAYS = 11.25;
const LN2 = Math.log(2);

/**
 * Adaptive exponential decay ported from Ping's `applyMemoryDecay`
 * (ping/server/memory/background/decay.ts). The half-life scales with
 * importance so identity / correction memories persist much longer than
 * context.
 *
 * Access-count reinforcement multiplies the post-decay score — recent,
 * frequently-recalled memories resist decay. This replaces the old
 * `min(1, 1 + log1p(accessCount) × 0.1)` formula, which was a no-op because
 * the floor of the inner expression is ≥ 1 and the cap was also 1.
 */
function effectiveScore(mem: {
  importance: number;
  decayRate: number;
  lastAccessedAt: number;
  accessCount: number;
}): number {
  const daysSinceAccess = Math.max(0, (Date.now() - mem.lastAccessedAt) / DAY_MS);
  const adaptiveHalfLife = BASE_HALF_LIFE_DAYS * (1 + mem.importance);
  const lambda = (LN2 / Math.max(adaptiveHalfLife, 0.001)) * DECAY_BETA;
  // decayRate is the per-segment multiplier — higher rate shortens half-life.
  // Keeps backward-compat for callers that still set decayRate per-tier.
  const effectiveLambda = lambda * (1 + mem.decayRate);
  const decayed = mem.importance * Math.exp(-effectiveLambda * daysSinceAccess);
  const reinforcement = 1 + Math.log1p(mem.accessCount) * 0.1;
  return clamp(decayed * reinforcement, 0, 1);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export async function cleanMemories(): Promise<{
  scanned: number;
  archived: number;
  pruned: number;
}> {
  const active = await convex.query(api.memoryRecords.list, { lifecycle: "active", limit: 500 });
  let archived = 0;
  let pruned = 0;

  for (const mem of active) {
    if (mem.tier === "permanent") continue;
    const score = effectiveScore(mem);
    if (score < PRUNE_THRESHOLD) {
      await convex.mutation(api.memoryRecords.setLifecycle, {
        memoryId: mem.memoryId,
        lifecycle: "pruned",
      });
      pruned++;
    } else if (score < ARCHIVE_THRESHOLD && mem.tier !== "long") {
      await convex.mutation(api.memoryRecords.setLifecycle, {
        memoryId: mem.memoryId,
        lifecycle: "archived",
      });
      archived++;
    }
  }

  await convex.mutation(api.memoryEvents.emit, {
    eventType: "memory.cleaned",
    data: JSON.stringify({ scanned: active.length, archived, pruned }),
  });

  return { scanned: active.length, archived, pruned };
}

export function startCleanupLoop(intervalMs = 6 * 60 * 60 * 1000): () => void {
  const timer = setInterval(() => {
    cleanMemories().catch((err) => console.error("[memory.clean] loop error", err));
  }, intervalMs);
  return () => clearInterval(timer);
}
