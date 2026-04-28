import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  CURATED_TOOLKITS,
  listConnectedToolkits,
  listToolkitMeta,
  listToolsForToolkit,
} from "./composio.js";
import { availableIntegrations } from "./execution-agent.js";
import {
  KNOWN_MODELS,
  MODEL_ALIASES,
  getRuntimeModel,
  resolveModelInput,
  setRuntimeModel,
} from "./runtime-config.js";

export function createSelfMcp() {
  return createSdkMcpServer({
    name: "boop-self",
    version: "0.1.0",
    tools: [
      tool(
        "get_config",
        "Return Boop's runtime configuration: which Claude model it's using, which integrations are loaded, and basic env info. Use when the user asks 'what model are you?', 'what version?', or anything about the agent itself.",
        {},
        async () => {
          const integrations = availableIntegrations();
          const config = {
            model: await getRuntimeModel(),
            envDefault: process.env.BOOP_MODEL ?? "claude-sonnet-4-6",
            availableModels: [...KNOWN_MODELS],
            integrationsLoaded: integrations,
            integrationCount: integrations.length,
            composioEnabled: Boolean(process.env.COMPOSIO_API_KEY),
            embeddingsEnabled: Boolean(process.env.VOYAGE_API_KEY),
            sendblueEnabled: Boolean(process.env.SENDBLUE_API_KEY),
          };
          return {
            content: [{ type: "text" as const, text: JSON.stringify(config, null, 2) }],
          };
        },
      ),
      tool(
        "set_model",
        `Switch the Claude model used for both this dispatcher and any sub-agents. The change applies to the *next* turn (this turn finishes on the current model). Accepts either a canonical ID or a friendly alias.

Aliases: ${Object.keys(MODEL_ALIASES).map((k) => `"${k}"`).join(", ")}
Canonical: ${[...KNOWN_MODELS].map((k) => `"${k}"`).join(", ")}

Use when the user says "use opus", "switch to sonnet", "make it faster (haiku)", etc.

Cost note (approximate, per 1M output tokens): Opus 4.7 ≈ $75, Sonnet 4.6 ≈ $15, Haiku 4.5 ≈ $4. Mention briefly when switching to Opus.`,
        {
          model: z
            .string()
            .describe('Model to use. Canonical ID like "claude-opus-4-7" or alias like "opus".'),
        },
        async ({ model }) => {
          const resolved = resolveModelInput(model);
          if (!resolved) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Unknown model "${model}". Try one of: ${[...KNOWN_MODELS].join(", ")} or aliases ${Object.keys(MODEL_ALIASES).join(", ")}.`,
                },
              ],
            };
          }
          await setRuntimeModel(resolved);
          return {
            content: [
              {
                type: "text" as const,
                text: `Model override set to ${resolved}. Next agent run (interaction or sub-agent) will use it. This current turn keeps the previous model.`,
              },
            ],
          };
        },
      ),
      tool(
        "list_integrations",
        "List the user's currently connected integrations (Gmail, Slack, etc.) with the actual account behind each connection. Use when the user asks 'what tools do I have connected?' or 'which Gmail account?' or 'what integrations are set up?'.",
        {},
        async () => {
          const connected = await listConnectedToolkits();
          const summary = connected.map((c) => ({
            slug: c.slug,
            status: c.status,
            account: c.accountLabel ?? c.accountEmail ?? c.alias ?? "(unknown)",
            connectionId: c.connectionId,
          }));
          return {
            content: [
              {
                type: "text" as const,
                text:
                  summary.length === 0
                    ? "No integrations are currently connected. The user can connect new ones from the Connections panel in the debug UI."
                    : JSON.stringify(summary, null, 2),
              },
            ],
          };
        },
      ),
      tool(
        "search_composio_catalog",
        "Search Composio's full toolkit catalog (1000+ services) by keyword. Returns matching toolkit slugs and descriptions. Use when the user asks 'is there a tool for X?', 'can you connect to Y?', or 'is Z available?' — e.g. 'is there a Notion integration?', 'can you talk to Zendesk?'.",
        {
          query: z
            .string()
            .describe("Keyword to match against toolkit slug, name, or description (case-insensitive)."),
          limit: z.number().int().min(1).max(50).optional().default(15),
        },
        async ({ query, limit }) => {
          const meta = await listToolkitMeta();
          const q = query.trim().toLowerCase();
          const matches: Array<{ slug: string; name: string; description?: string; toolsCount?: number }> = [];
          for (const t of meta.values()) {
            const haystack = `${t.slug} ${t.name} ${t.description ?? ""}`.toLowerCase();
            if (haystack.includes(q)) {
              matches.push({
                slug: t.slug,
                name: t.name,
                description: t.description,
                toolsCount: t.toolsCount,
              });
            }
            if (matches.length >= limit) break;
          }
          return {
            content: [
              {
                type: "text" as const,
                text:
                  matches.length === 0
                    ? `No toolkits in Composio's catalog match "${query}".`
                    : JSON.stringify(matches, null, 2),
              },
            ],
          };
        },
      ),
      tool(
        "inspect_toolkit",
        "Look up a specific Composio toolkit by exact slug. Returns whether it exists, whether it's currently connected, and (if requested) the list of tools it exposes. Use when the user asks 'what can the Slack tool do?' or 'is Notion connected?'.",
        {
          slug: z
            .string()
            .describe("Exact toolkit slug, e.g. 'gmail', 'slack', 'notion', 'linear'. Lowercase."),
          includeTools: z
            .boolean()
            .optional()
            .default(false)
            .describe("If true, also fetch the toolkit's tool list (slower)."),
        },
        async ({ slug, includeTools }) => {
          const lower = slug.trim().toLowerCase();
          const meta = await listToolkitMeta();
          const toolkit = meta.get(lower);
          if (!toolkit) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Toolkit "${lower}" is not in Composio's catalog. Try search_composio_catalog with a keyword to find similar ones.`,
                },
              ],
            };
          }
          const connected = (await listConnectedToolkits()).filter((c) => c.slug === lower);
          const curated = CURATED_TOOLKITS.find((t) => t.slug === lower);
          const result: {
            slug: string;
            name: string;
            description?: string;
            toolsCount?: number;
            inCuratedList: boolean;
            authMode?: string;
            connections: Array<{ status: string; account: string; id: string }>;
            availableForSpawn: boolean;
            tools?: Array<{ slug: string; name: string; description?: string }>;
          } = {
            slug: toolkit.slug,
            name: toolkit.name,
            description: toolkit.description,
            toolsCount: toolkit.toolsCount,
            inCuratedList: Boolean(curated),
            authMode: curated?.authMode,
            connections: connected.map((c) => ({
              status: c.status,
              account: c.accountLabel ?? c.accountEmail ?? c.alias ?? "(unknown)",
              id: c.connectionId,
            })),
            availableForSpawn: availableIntegrations().includes(lower),
          };
          if (includeTools) {
            result.tools = await listToolsForToolkit(lower);
          }
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          };
        },
      ),
    ],
  });
}
