import { query } from "@anthropic-ai/claude-agent-sdk";
import { api } from "../convex/_generated/api.js";
import { convex } from "./convex-client.js";
import { broadcast } from "./broadcast.js";
import { aggregateUsageFromResult, EMPTY_USAGE, type UsageTotals } from "./usage.js";

function randomId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const PROPOSER_PROMPT = `You are a memory-consolidation proposer.

Given a list of the user's active memories, find cases where memories should be:
- merged: multiple entries say the same durable fact in different words
- superseded: a newer memory replaces an older one with a conflicting value
- pruned: an entry is redundant given stronger ones, or obviously wrong

Return STRICT JSON only:
{"proposals":[
  {"type":"merge","keep":"mem_...","absorb":["mem_...","mem_..."],"rewriteContent":"..."},
  {"type":"supersede","newer":"mem_...","older":["mem_..."]},
  {"type":"prune","memoryId":"mem_...","reason":"..."}
]}

Hard rules:
- NEVER propose a merge with an empty "absorb" list. If there's nothing to
  absorb, there's nothing to merge — skip it entirely.
- "absorb" MUST NOT contain the same id as "keep".
- "rewriteContent" must be a single clear sentence combining both sources.
- Be conservative. Similar but distinct facts stay separate.
- If no changes needed, return {"proposals":[]}.
- Respond with ONLY the JSON.`;

const JUDGE_PROMPT = `You are a memory-consolidation judge.

Given a proposer's suggested changes, approve or reject each one based on whether it actually improves memory quality without losing information.

Return STRICT JSON only:
{"decisions":[
  {"proposalIndex":0,"approve":true,"rationale":"..."},
  {"proposalIndex":1,"approve":false,"rationale":"..."}
]}

Rules:
- Reject merges that would blur distinct facts.
- Reject prunes that would remove unique information.
- Approve supersedes only if the newer memory covers the older entirely.
- Respond with ONLY the JSON.`;

interface Proposal {
  type: "merge" | "supersede" | "prune";
  keep?: string;
  absorb?: string[];
  rewriteContent?: string;
  newer?: string;
  older?: string[];
  memoryId?: string;
  reason?: string;
}

interface Decision {
  proposalIndex: number;
  approve: boolean;
  rationale: string;
}

interface Applied {
  proposalIndex: number;
  type: "merge" | "supersede" | "prune";
  summary: string;
}

async function runLlm(
  systemPrompt: string,
  userPrompt: string,
): Promise<{ buffer: string; usage: UsageTotals; durationMs: number }> {
  const started = Date.now();
  let buffer = "";
  let usage: UsageTotals = { ...EMPTY_USAGE };
  for await (const msg of query({
    prompt: userPrompt,
    options: {
      systemPrompt,
      model: process.env.BOOP_MODEL ?? "claude-sonnet-4-6",
      permissionMode: "bypassPermissions",
    },
  })) {
    if (msg.type === "assistant") {
      for (const block of msg.message.content) {
        if (block.type === "text") buffer += block.text;
      }
    } else if (msg.type === "result") {
      usage = aggregateUsageFromResult(msg);
    }
  }
  return { buffer, usage, durationMs: Date.now() - started };
}

async function recordConsolidationUsage(
  source: "consolidation-proposer" | "consolidation-judge",
  runId: string,
  usage: UsageTotals,
  durationMs: number,
): Promise<void> {
  if (usage.costUsd <= 0 && usage.inputTokens <= 0) return;
  await convex.mutation(api.usageRecords.record, {
    source,
    runId,
    model: usage.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheCreationTokens: usage.cacheCreationTokens,
    costUsd: usage.costUsd,
    durationMs,
  });
}

function parseJson<T>(raw: string): T | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

export async function runConsolidation(trigger = "scheduled"): Promise<{
  runId: string;
  proposals: number;
  merged: number;
  pruned: number;
}> {
  const runId = randomId("cons");
  await convex.mutation(api.consolidation.createRun, { runId, trigger });
  broadcast("consolidation_started", { runId, trigger });

  let merged = 0;
  let pruned = 0;

  try {
    const memories = await convex.query(api.memoryRecords.list, {
      lifecycle: "active",
      limit: 150,
    });
    broadcast("consolidation_phase", { runId, phase: "loaded", memoriesCount: memories.length });
    if (memories.length < 6) {
      await convex.mutation(api.consolidation.updateRun, {
        runId,
        status: "completed",
        notes: "not enough memories to consolidate",
      });
      return { runId, proposals: 0, merged: 0, pruned: 0 };
    }

    const payload = memories
      .map(
        (m) =>
          `- [${m.memoryId}] (${m.tier}/${m.segment} i=${m.importance.toFixed(2)} age=${Math.round(
            (Date.now() - m.createdAt) / 86400000,
          )}d) ${m.content}`,
      )
      .join("\n");

    broadcast("consolidation_phase", { runId, phase: "proposing" });
    const proposerCall = await runLlm(PROPOSER_PROMPT, payload);
    await recordConsolidationUsage(
      "consolidation-proposer",
      runId,
      proposerCall.usage,
      proposerCall.durationMs,
    );
    const proposerJson = parseJson<{ proposals: Proposal[] }>(proposerCall.buffer);
    const proposals = proposerJson?.proposals ?? [];
    broadcast("consolidation_phase", {
      runId,
      phase: "proposed",
      proposalsCount: proposals.length,
      proposals,
    });

    await convex.mutation(api.consolidation.updateRun, {
      runId,
      proposalsCount: proposals.length,
    });

    if (proposals.length === 0) {
      await convex.mutation(api.consolidation.updateRun, {
        runId,
        status: "completed",
        notes: "no proposals",
      });
      return { runId, proposals: 0, merged: 0, pruned: 0 };
    }

    const judgePayload = `Proposals:\n${proposals
      .map((p, i) => `#${i}: ${JSON.stringify(p)}`)
      .join("\n")}\n\nOriginal memories:\n${payload}`;

    broadcast("consolidation_phase", { runId, phase: "judging" });
    const judgeCall = await runLlm(JUDGE_PROMPT, judgePayload);
    await recordConsolidationUsage(
      "consolidation-judge",
      runId,
      judgeCall.usage,
      judgeCall.durationMs,
    );
    const judgeJson = parseJson<{
      decisions: { proposalIndex: number; approve: boolean; rationale: string }[];
    }>(judgeCall.buffer);
    const decisions = judgeJson?.decisions ?? [];
    const approved = new Set(
      decisions.filter((d) => d.approve).map((d) => d.proposalIndex),
    );
    broadcast("consolidation_phase", {
      runId,
      phase: "judged",
      approvedCount: approved.size,
      rejectedCount: decisions.length - approved.size,
      decisions,
    });

    const applied: Applied[] = [];
    broadcast("consolidation_phase", { runId, phase: "applying" });
    for (let i = 0; i < proposals.length; i++) {
      if (!approved.has(i)) continue;
      const p = proposals[i];
      try {
        if (p.type === "merge" && p.keep && p.absorb?.length && p.rewriteContent) {
          const keep = memories.find((m) => m.memoryId === p.keep);
          if (!keep) continue;
          await convex.mutation(api.memoryRecords.upsert, {
            memoryId: keep.memoryId,
            content: p.rewriteContent,
            tier: keep.tier,
            segment: keep.segment,
            importance: keep.importance,
            decayRate: keep.decayRate,
            supersedes: p.absorb,
          });
          merged++;
          applied.push({
            proposalIndex: i,
            type: "merge",
            summary: `merged ${p.absorb.length} into ${p.keep}`,
          });
        } else if (p.type === "supersede" && p.newer && p.older?.length) {
          const newer = memories.find((m) => m.memoryId === p.newer);
          if (!newer) continue;
          await convex.mutation(api.memoryRecords.upsert, {
            memoryId: newer.memoryId,
            content: newer.content,
            tier: newer.tier,
            segment: newer.segment,
            importance: newer.importance,
            decayRate: newer.decayRate,
            supersedes: p.older,
          });
          merged++;
          applied.push({
            proposalIndex: i,
            type: "supersede",
            summary: `${p.newer} supersedes ${p.older.length} older`,
          });
        } else if (p.type === "prune" && p.memoryId) {
          await convex.mutation(api.memoryRecords.setLifecycle, {
            memoryId: p.memoryId,
            lifecycle: "pruned",
          });
          pruned++;
          applied.push({
            proposalIndex: i,
            type: "prune",
            summary: `pruned ${p.memoryId}`,
          });
        }
      } catch (err) {
        console.warn("[consolidation] apply failed", err);
      }
    }

    await convex.mutation(api.consolidation.updateRun, {
      runId,
      status: "completed",
      mergedCount: merged,
      prunedCount: pruned,
      details: JSON.stringify({
        memoriesScanned: memories.length,
        proposals,
        decisions,
        applied,
      }),
    });
    await convex.mutation(api.memoryEvents.emit, {
      eventType: "memory.consolidated",
      data: JSON.stringify({ runId, proposals: proposals.length, merged, pruned }),
    });
    broadcast("consolidation_completed", { runId, merged, pruned });
    return { runId, proposals: proposals.length, merged, pruned };
  } catch (err) {
    await convex.mutation(api.consolidation.updateRun, {
      runId,
      status: "failed",
      notes: String(err),
    });
    broadcast("consolidation_failed", { runId, error: String(err) });
    throw err;
  }
}

export function startConsolidationLoop(intervalMs = 24 * 60 * 60 * 1000): () => void {
  const timer = setInterval(() => {
    runConsolidation("scheduled").catch((err) =>
      console.error("[consolidation] loop error", err),
    );
  }, intervalMs);
  return () => clearInterval(timer);
}
