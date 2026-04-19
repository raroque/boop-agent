import { query } from "@anthropic-ai/claude-agent-sdk";
import { api } from "../../convex/_generated/api.js";
import { convex } from "../convex-client.js";
import { embed } from "../embeddings.js";
import { aggregateUsageFromResult, EMPTY_USAGE, type UsageTotals } from "../usage.js";
import { DEFAULT_DECAY, SEGMENT_PREFERRED_TIER, makeMemoryId } from "./types.js";

const EXTRACTION_PROMPT = `You are a memory-extraction subagent.

Given a user message + assistant reply, extract any DURABLE facts worth remembering.
Return STRICT JSON: {"facts":[{"content":"...","segment":"identity|preference|relationship|project|knowledge|context","importance":0.0-1.0}]}

Rules:
- Prefer fewer, higher-quality facts over many trivial ones.
- Skip anything transient ("I'm tired right now"). Context facts should describe ongoing state, not momentary feelings.
- Segment meanings:
  - identity: name, role, location, core traits
  - preference: how they like things done
  - relationship: people they know + how
  - project: ongoing work or goals
  - knowledge: facts about their world
  - context: current ongoing situation
- Importance: 0.9+ for identity, 0.5-0.8 for preferences/projects, 0.3-0.5 for context.
- Return empty facts array if nothing durable.

Respond with ONLY the JSON object.`;

interface ExtractedFact {
  content: string;
  segment: "identity" | "preference" | "relationship" | "project" | "knowledge" | "context";
  importance: number;
}

export async function extractAndStore(opts: {
  conversationId: string;
  userMessage: string;
  assistantReply: string;
  turnId: string;
}): Promise<void> {
  const started = Date.now();
  try {
    const payload = `USER: ${opts.userMessage}\n\nASSISTANT: ${opts.assistantReply}`;
    let buffer = "";
    let usage: UsageTotals = { ...EMPTY_USAGE };
    for await (const msg of query({
      prompt: payload,
      options: {
        systemPrompt: EXTRACTION_PROMPT,
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

    if (usage.costUsd > 0 || usage.inputTokens > 0) {
      await convex.mutation(api.usageRecords.record, {
        source: "extract",
        conversationId: opts.conversationId,
        turnId: opts.turnId,
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        cacheCreationTokens: usage.cacheCreationTokens,
        costUsd: usage.costUsd,
        durationMs: Date.now() - started,
      });
    }

    const match = buffer.match(/\{[\s\S]*\}/);
    if (!match) return;
    const parsed = JSON.parse(match[0]) as { facts?: ExtractedFact[] };
    const facts = parsed.facts ?? [];

    for (const f of facts) {
      const tier = SEGMENT_PREFERRED_TIER[f.segment];
      const memoryId = makeMemoryId();
      const embedding = (await embed(f.content)) ?? undefined;
      await convex.mutation(api.memoryRecords.upsert, {
        memoryId,
        content: f.content,
        tier,
        segment: f.segment,
        importance: f.importance,
        decayRate: DEFAULT_DECAY[tier],
        sourceTurn: opts.turnId,
        embedding,
      });
    }

    await convex.mutation(api.memoryEvents.emit, {
      eventType: "memory.extracted",
      conversationId: opts.conversationId,
      data: JSON.stringify({ turnId: opts.turnId, count: facts.length }),
    });
  } catch (err) {
    console.error("[memory.extract] failed", err);
  }
}
