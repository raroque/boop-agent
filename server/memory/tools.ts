import { z } from "zod";
import { api } from "../../convex/_generated/api.js";
import { convex } from "../convex-client.js";
import { embed, embeddingsAvailable } from "../embeddings.js";
import { createClaudeMcpServer } from "../runtimes/claude.js";
import { defineRuntimeTool } from "../runtimes/tool.js";
import { runtimeText, type RuntimeTool } from "../runtimes/types.js";
import { DEFAULT_DECAY, SEGMENT_PREFERRED_TIER, makeMemoryId } from "./types.js";

const NAMESPACE = "boop-memory";

const tierEnum = z.enum(["short", "long", "permanent"]);
const segmentEnum = z.enum([
  "identity",
  "preference",
  "relationship",
  "project",
  "knowledge",
  "context",
]);

export function createMemoryTools(conversationId: string): RuntimeTool[] {
  return [
    defineRuntimeTool(
      NAMESPACE,
      "write_memory",
      "Persist a fact about the user or conversation that you want available in future turns. Prefer aggressive writing — memory is cheap, forgetting is expensive. Only use for durable facts (preferences, identity, projects, relationships), NOT for transient conversational state.",
      {
        content: z.string().describe("The fact to remember, in one clear sentence."),
        segment: segmentEnum.describe(
          "identity: core facts about who they are. preference: how they like things done. relationship: people they know. project: ongoing work. knowledge: facts about their world. context: current situation.",
        ),
        importance: z.number().min(0).max(1).describe("0-1; how critical to retain."),
        tier: tierEnum.optional().describe("Override; defaults by segment."),
        supersedes: z
          .array(z.string())
          .optional()
          .describe("memoryId(s) this replaces (will be archived)."),
      },
      async (args) => {
        const tier = args.tier ?? SEGMENT_PREFERRED_TIER[args.segment];
        const memoryId = makeMemoryId();
        const embedding = (await embed(args.content)) ?? undefined;
        await convex.mutation(api.memoryRecords.upsert, {
          memoryId,
          content: args.content,
          tier,
          segment: args.segment,
          importance: args.importance,
          decayRate: DEFAULT_DECAY[tier],
          supersedes: args.supersedes,
          embedding,
        });
        await convex.mutation(api.memoryEvents.emit, {
          eventType: "memory.written",
          conversationId,
          memoryId,
          data: JSON.stringify({ tier, segment: args.segment, importance: args.importance }),
        });
        return runtimeText(`Stored ${memoryId} (tier=${tier}, segment=${args.segment}).`);
      },
    ),

    defineRuntimeTool(
      NAMESPACE,
      "recall",
      "Search your memories for anything relevant to the current turn. Call this early in any conversation that touches the user's preferences, projects, or past decisions.",
      {
        query: z.string().describe("Keywords or topic to search for."),
        limit: z.number().optional().default(10),
      },
      async (args) => {
        let results: any[] = [];
        let mode: "vector" | "substring" = "substring";

        if (embeddingsAvailable()) {
          const queryVec = await embed(args.query);
          if (queryVec) {
            const hits = await convex.action(api.memoryRecords.vectorSearch, {
              embedding: queryVec,
              limit: args.limit,
            });
            results = hits.map((h) => h.record);
            mode = "vector";
          }
        }
        if (results.length === 0) {
          results = await convex.query(api.memoryRecords.search, {
            query: args.query,
            limit: args.limit,
          });
        }

        for (const r of results) {
          await convex.mutation(api.memoryRecords.markAccessed, { memoryId: r.memoryId });
        }
        await convex.mutation(api.memoryEvents.emit, {
          eventType: "memory.recalled",
          conversationId,
          data: JSON.stringify({ query: args.query, hits: results.length, mode }),
        });
        if (results.length === 0) {
          return runtimeText("No memories matched.");
        }
        const body = results
          .map(
            (r) =>
              `• [${r.tier}/${r.segment} importance=${r.importance.toFixed(2)}] ${r.memoryId}: ${r.content}`,
          )
          .join("\n");
        return runtimeText(body);
      },
    ),
  ];
}

export function createMemoryMcp(conversationId: string) {
  return createClaudeMcpServer(NAMESPACE, createMemoryTools(conversationId));
}
