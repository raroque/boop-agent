import { query } from "@anthropic-ai/claude-agent-sdk";
import { api } from "../convex/_generated/api.js";
import { convex } from "./convex-client.js";
import { broadcast } from "./broadcast.js";
import { aggregateUsageFromResult, EMPTY_USAGE, type UsageTotals } from "./usage.js";

function randomId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const PROPOSER_PROMPT = `You are a memory-consolidation proposer.

Given a list of the user's active memories (each tagged with its segment — identity, correction, preference, relationship, project, knowledge, or context), find cases where memories should be:
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
- Be conservative on DISTINCT facts — similar but distinct facts stay separate.

Segment-aware rules:
- A memory tagged "correction" is the user FIXING something they previously said or something in your memory. When a correction contradicts an older fact about the same subject, propose a "supersede" with the correction as "newer" and the contradicted fact(s) as "older". Correction almost always wins.
- Never merge a correction into a non-correction. If you keep just one, keep the correction.
- Identity memories (name, role, location) are high-priority. Only supersede an identity with another identity or a correction that clearly updates it.
- Context memories are low-priority and short-lived — prefer prune over merge for context clutter.

If no changes needed, return {"proposals":[]}. Respond with ONLY the JSON.`;

const ADVERSARY_PROMPT = `You are a memory-consolidation adversary. A proposer has suggested changes to the user's memory (each tagged with segment: identity, correction, preference, relationship, project, knowledge, or context). Your job is to find reasons each proposal could be WRONG or harmful before a judge rules on them.

For each proposal, look for:
- merges that would blur genuinely distinct facts
- supersedes where the "newer" memory doesn't actually cover everything the "older" one said
- prunes that would remove a fact that's rare or harder to rediscover than it looks
- any loss of context, specificity, source info, or nuance

Segment-aware skepticism:
- If a correction is being superseded by a non-correction, flag it — that's almost always wrong. Corrections are durable.
- If an identity memory is being merged or pruned, verify it's clearly redundant — identity facts are expensive to recover.
- If a correction supersede looks aggressive (removing useful context along with the wrong part), flag the context loss.

Be sharp but fair. If a proposal looks clean, say so — don't manufacture objections. Your objections inform the judge; you don't decide.

Return STRICT JSON only. Each challenge MUST include an entry for every proposal index. Shape:
{"challenges":[
  {"proposalIndex":0,"objection":"merging these loses the distinction between X and Y","severity":"high"},
  {"proposalIndex":1,"objection":null,"severity":"low"}
]}

Rules for the fields:
- "severity" MUST be exactly one of the strings: "low", "medium", "high".
- "objection" is either a plain string describing the concern, or the JSON literal null (not the string "null") when you have no objection.
- Use "low" for nitpicks, "medium" for real concerns, "high" for real information loss.

Respond with ONLY the JSON object.`;

const JUDGE_PROMPT = `You are a memory-consolidation judge. You see a proposer's suggested changes AND an adversary's objections to each. Weigh both sides and rule.

Return STRICT JSON only:
{"decisions":[
  {"proposalIndex":0,"approve":true,"rationale":"..."},
  {"proposalIndex":1,"approve":false,"rationale":"..."}
]}

Rules:
- A "high" severity adversary objection should usually result in rejection unless the proposal's benefit clearly outweighs the loss.
- "medium" objections: weigh case-by-case; often approve with the note that the judge acknowledged the concern.
- "low" objections and clean proposals: approve.
- Your rationale should cite the adversary's objection when relevant ("approved despite adversary concern about X because...").
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

interface Challenge {
  proposalIndex: number;
  objection: string | null;
  severity: "low" | "medium" | "high";
}

const ADVERSARY_MODEL = process.env.BOOP_ADVERSARY_MODEL ?? "claude-haiku-4-5";
const DEFAULT_MODEL = process.env.BOOP_MODEL ?? "claude-sonnet-4-6";

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
  model: string = DEFAULT_MODEL,
): Promise<{ buffer: string; usage: UsageTotals; durationMs: number }> {
  const started = Date.now();
  let buffer = "";
  let usage: UsageTotals = { ...EMPTY_USAGE };
  for await (const msg of query({
    prompt: userPrompt,
    options: {
      systemPrompt,
      model,
      permissionMode: "bypassPermissions",
    },
  })) {
    if (msg.type === "assistant") {
      for (const block of msg.message.content) {
        if (block.type === "text") buffer += block.text;
      }
    } else if (msg.type === "result") {
      usage = aggregateUsageFromResult(msg, model);
    }
  }
  return { buffer, usage, durationMs: Date.now() - started };
}

async function recordConsolidationUsage(
  source: "consolidation-proposer" | "consolidation-adversary" | "consolidation-judge",
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
      // Fire the completion broadcast even on the early-return paths so the
      // debug UI's pipeline timeline closes cleanly. Without this the last
      // visible phase is "loaded" and the run looks stuck.
      broadcast("consolidation_completed", {
        runId,
        merged: 0,
        pruned: 0,
        notes: "not enough memories to consolidate",
      });
      return { runId, proposals: 0, merged: 0, pruned: 0 };
    }

    const payload = memories
      .map((m) => {
        const ageDays = Math.round((Date.now() - m.createdAt) / 86400000);
        const prefix = `- [${m.memoryId}] (${m.tier}/${m.segment} i=${m.importance.toFixed(2)} age=${ageDays}d)`;
        // Surface correction metadata inline so the LLM sees what was being
        // corrected without having to infer it from content alone.
        let suffix = "";
        if (m.segment === "correction" && m.metadata) {
          try {
            const meta = JSON.parse(m.metadata) as { corrects?: string };
            if (meta.corrects) {
              // Strip `]` and collapse whitespace so user-supplied text
              // can't break the `[corrects: ...]` annotation format that
              // proposer/adversary prompts rely on, and can't inject a
              // fake second memory entry via embedded newlines.
              const safe = meta.corrects
                .replace(/[\r\n]+/g, " ")
                .replace(/\]/g, "")
                .trim()
                .slice(0, 300);
              if (safe) suffix = ` [corrects: ${safe}]`;
            }
          } catch {
            /* metadata not JSON — ignore */
          }
        }
        return `${prefix} ${m.content}${suffix}`;
      })
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

    // Persist details progressively so navigating into a running run shows
    // partial reasoning (proposals now, challenges/decisions/applied as
    // those phases finish) instead of an empty section until the very end.
    // Snapshot the content of every memory referenced by a proposal so the
    // UI can render `keep: <content preview>` instead of an opaque mem_id.
    // We only include referenced rows to keep the details JSON small.
    const referencedIds = new Set<string>();
    for (const p of proposals) {
      if (p.keep) referencedIds.add(p.keep);
      for (const id of p.absorb ?? []) referencedIds.add(id);
      if (p.newer) referencedIds.add(p.newer);
      for (const id of p.older ?? []) referencedIds.add(id);
      if (p.memoryId) referencedIds.add(p.memoryId);
    }
    const memorySnapshots: Record<string, { content: string; segment: string; tier: string }> = {};
    for (const m of memories) {
      if (referencedIds.has(m.memoryId)) {
        memorySnapshots[m.memoryId] = {
          content: m.content,
          segment: m.segment,
          tier: m.tier,
        };
      }
    }

    await convex.mutation(api.consolidation.updateRun, {
      runId,
      proposalsCount: proposals.length,
      details: JSON.stringify({
        memoriesScanned: memories.length,
        proposals,
        memorySnapshots,
      }),
    });

    if (proposals.length === 0) {
      await convex.mutation(api.consolidation.updateRun, {
        runId,
        status: "completed",
        notes: "no proposals",
      });
      broadcast("consolidation_completed", {
        runId,
        merged: 0,
        pruned: 0,
        notes: "no proposals",
      });
      return { runId, proposals: 0, merged: 0, pruned: 0 };
    }

    const proposalsList = proposals
      .map((p, i) => `#${i}: ${JSON.stringify(p)}`)
      .join("\n");

    broadcast("consolidation_phase", { runId, phase: "challenging" });
    const adversaryPayload = `Proposals:\n${proposalsList}\n\nOriginal memories:\n${payload}`;
    const adversaryCall = await runLlm(ADVERSARY_PROMPT, adversaryPayload, ADVERSARY_MODEL);
    await recordConsolidationUsage(
      "consolidation-adversary",
      runId,
      adversaryCall.usage,
      adversaryCall.durationMs,
    );
    const adversaryJson = parseJson<{ challenges: Challenge[] }>(adversaryCall.buffer);
    const challenges = adversaryJson?.challenges ?? [];
    broadcast("consolidation_phase", {
      runId,
      phase: "challenged",
      challengesCount: challenges.length,
      challenges,
    });
    await convex.mutation(api.consolidation.updateRun, {
      runId,
      details: JSON.stringify({
        memoriesScanned: memories.length,
        proposals,
        challenges,
        memorySnapshots,
      }),
    });

    const challengesByIndex = new Map(challenges.map((c) => [c.proposalIndex, c]));
    const challengesBlock = proposals
      .map((_p, i) => {
        const c = challengesByIndex.get(i);
        if (!c || !c.objection) return `#${i}: adversary raised no objection`;
        return `#${i}: [${c.severity}] ${c.objection}`;
      })
      .join("\n");

    const judgePayload = `Proposals:\n${proposalsList}\n\nAdversary challenges:\n${challengesBlock}\n\nOriginal memories:\n${payload}`;

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
    await convex.mutation(api.consolidation.updateRun, {
      runId,
      details: JSON.stringify({
        memoriesScanned: memories.length,
        proposals,
        challenges,
        decisions,
        memorySnapshots,
      }),
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
        challenges,
        decisions,
        applied,
        memorySnapshots,
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
