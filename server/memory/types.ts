export type MemoryTier = "short" | "long" | "permanent";

export type MemorySegment =
  | "identity"
  | "preference"
  | "correction"
  | "relationship"
  | "project"
  | "knowledge"
  | "context";

export interface MemoryRecord {
  memoryId: string;
  content: string;
  tier: MemoryTier;
  segment: MemorySegment;
  importance: number;
  decayRate: number;
  accessCount: number;
  lastAccessedAt: number;
  sourceTurn?: string;
  supersedes?: string[];
  metadata?: string;
}

// Per-segment defaults ported from Ping's `category_defaults` config.
// extract.ts uses `tier` and `decayRate` from here when storing a new memory,
// and clamps/falls back to `importance` when the LLM returns a value that's
// missing or outside [0, 1]. clean.ts uses decayRate when computing adaptive
// half-life. Identity / correction decay the slowest, context decays fastest.
export interface SegmentDefault {
  tier: MemoryTier;
  importance: number;
  decayRate: number;
}

export const SEGMENT_DEFAULTS: Record<MemorySegment, SegmentDefault> = {
  identity: { tier: "permanent", importance: 0.85, decayRate: 0.01 },
  correction: { tier: "long", importance: 0.80, decayRate: 0.015 },
  relationship: { tier: "long", importance: 0.75, decayRate: 0.02 },
  preference: { tier: "long", importance: 0.70, decayRate: 0.02 },
  project: { tier: "long", importance: 0.65, decayRate: 0.025 },
  knowledge: { tier: "long", importance: 0.60, decayRate: 0.03 },
  context: { tier: "short", importance: 0.40, decayRate: 0.08 },
};

// Kept for backward compat. New code should prefer SEGMENT_DEFAULTS[segment].decayRate.
export const DEFAULT_DECAY: Record<MemoryTier, number> = {
  short: 0.05,
  long: 0.02,
  permanent: 0,
};

export const SEGMENT_PREFERRED_TIER: Record<MemorySegment, MemoryTier> = {
  identity: SEGMENT_DEFAULTS.identity.tier,
  preference: SEGMENT_DEFAULTS.preference.tier,
  correction: SEGMENT_DEFAULTS.correction.tier,
  relationship: SEGMENT_DEFAULTS.relationship.tier,
  project: SEGMENT_DEFAULTS.project.tier,
  knowledge: SEGMENT_DEFAULTS.knowledge.tier,
  context: SEGMENT_DEFAULTS.context.tier,
};

export function makeMemoryId(): string {
  return `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
