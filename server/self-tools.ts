import { z } from "zod";
import {
  CURATED_TOOLKITS,
  listConnectedToolkits,
  listToolkitMeta,
  listToolsForToolkit,
} from "./composio.js";
import { availableIntegrations } from "./execution-agent.js";
import { activeProvider as activeEmbeddingProvider } from "./embeddings.js";
import { createClaudeMcpServer } from "./runtimes/claude.js";
import { defineRuntimeTool } from "./runtimes/tool.js";
import { runtimeText, type RuntimeReasoningEffort, type RuntimeTool } from "./runtimes/types.js";
import {
  CODEX_MODEL_ALIASES,
  KNOWN_CODEX_MODELS,
  KNOWN_MODELS,
  MODEL_ALIASES,
  RUNTIME_ALIASES,
  getRuntimeConfig,
  resolveModelInput,
  resolveRuntimeInput,
  setCodexReasoningEffort,
  setRuntimeModel,
  setRuntimeProvider,
} from "./runtime-config.js";
import {
  describeUserNow,
  resolveTimezoneInput,
  setUserTimezone,
} from "./timezone-config.js";

const NAMESPACE = "boop-self";

const reasoningEffortSchema = z.enum(["minimal", "low", "medium", "high", "xhigh"]);

export function createSelfTools(): RuntimeTool[] {
  return [
    defineRuntimeTool(
      NAMESPACE,
      "get_config",
      "Return Boop's runtime configuration: active provider, model, billing mode, user's timezone, current local time, loaded integrations, and basic env info. Use when the user asks what model/provider/runtime Boop is using, what time it is, what timezone is active, or anything about the agent itself.",
      {},
      async () => {
        const integrations = availableIntegrations();
        const tzInfo = await describeUserNow();
        const runtime = await getRuntimeConfig();
        const config = {
          runtime: runtime.runtime,
          model: runtime.model,
          reasoningEffort: runtime.reasoningEffort ?? null,
          billingMode: runtime.billingMode,
          claudeEnvDefault: process.env.BOOP_MODEL ?? "claude-sonnet-4-6",
          codexEnvDefault: process.env.BOOP_CODEX_MODEL ?? "gpt-5.5",
          availableClaudeModels: [...KNOWN_MODELS],
          availableCodexModels: [...KNOWN_CODEX_MODELS],
          userTimezone: tzInfo.isExplicit ? tzInfo.timezone : null,
          timezoneFallback: tzInfo.isExplicit ? null : tzInfo.timezone,
          currentLocalTime: tzInfo.now,
          integrationsLoaded: integrations,
          integrationCount: integrations.length,
          composioEnabled: Boolean(process.env.COMPOSIO_API_KEY),
          embeddingsEnabled: true,
          embeddingsProvider: activeEmbeddingProvider(),
          sendblueEnabled: Boolean(process.env.SENDBLUE_API_KEY),
        };
        return runtimeText(JSON.stringify(config, null, 2));
      },
    ),
    defineRuntimeTool(
      NAMESPACE,
      "set_timezone",
      `Save the user's timezone so Boop can reason about deadlines, "today", "9am tomorrow", and other local-time references correctly. Accepts an IANA timezone ID (e.g. "America/Chicago", "Europe/London") or a friendly alias ("central", "PT", "Dallas", "Tokyo", "UTC", etc.).

Use when the user tells you their timezone or location ("I'm in Dallas", "use central time", "I'm in London"), or proactively after asking when get_config returns a null userTimezone and you need local-time context for the user's request. Don't guess from prior messages — if you're unsure, just ask once.`,
      {
        timezone: z
          .string()
          .describe(
            'Timezone the user just told you. IANA format like "America/New_York" or alias like "eastern" / "Dallas".',
          ),
      },
      async ({ timezone }) => {
        const resolved = resolveTimezoneInput(timezone);
        if (!resolved) {
          return runtimeText(
            `"${timezone}" isn't a recognized timezone or alias. Pass a canonical IANA ID like "America/Chicago" / "Europe/London" / "Asia/Tokyo", or a friendly name like "central" / "pacific" / "London" / "Tokyo". Ask the user to clarify if needed.`,
            false,
          );
        }
        await setUserTimezone(resolved);
        const tzInfo = await describeUserNow();
        return runtimeText(
          `User timezone set to ${resolved}. Local time there is now ${tzInfo.now}. This will be used for all future date/time reasoning.`,
        );
      },
    ),
    defineRuntimeTool(
      NAMESPACE,
      "set_runtime",
      `Switch Boop's provider/runtime for future turns. The change applies to the next top-level turn. Accepts aliases: ${Object.keys(RUNTIME_ALIASES)
        .map((k) => `"${k}"`)
        .join(", ")}. Use "claude" for the Anthropic Claude Agent SDK provider and "codex" for the local Codex app-server provider backed by the user's ChatGPT/Codex subscription.`,
      { runtime: z.string().describe('Runtime/provider to use, e.g. "claude" or "codex".') },
      async ({ runtime }) => {
        const resolved = resolveRuntimeInput(runtime);
        if (!resolved) {
          return runtimeText(
            `Unknown runtime "${runtime}". Try one of: ${Object.keys(RUNTIME_ALIASES).join(", ")}.`,
            false,
          );
        }
        await setRuntimeProvider(resolved);
        return runtimeText(
          `Runtime set to ${resolved}. Next top-level turn will use ${resolved}; this current turn keeps the provider it started with.`,
        );
      },
    ),
    defineRuntimeTool(
      NAMESPACE,
      "set_model",
      `Switch the model for the currently active runtime. The change applies to the next top-level turn; this turn keeps the model it started with.

Claude aliases: ${Object.keys(MODEL_ALIASES).map((k) => `"${k}"`).join(", ")}
Claude canonical: ${[...KNOWN_MODELS].map((k) => `"${k}"`).join(", ")}
Codex aliases: ${Object.keys(CODEX_MODEL_ALIASES).map((k) => `"${k}"`).join(", ")}
Codex canonical: ${[...KNOWN_CODEX_MODELS].map((k) => `"${k}"`).join(", ")}

Use when the user says "use opus", "switch to sonnet", "use Codex mini", "make it faster", etc.`,
      {
        model: z
          .string()
          .describe('Model to use. Canonical ID like "claude-opus-4-7" or "gpt-5.4-mini", or an alias.'),
      },
      async ({ model }) => {
        const runtime = (await getRuntimeConfig()).runtime;
        const resolved = resolveModelInput(model, runtime);
        if (!resolved) {
          const known = runtime === "codex" ? [...KNOWN_CODEX_MODELS] : [...KNOWN_MODELS];
          const aliases = runtime === "codex" ? CODEX_MODEL_ALIASES : MODEL_ALIASES;
          return runtimeText(
            `Unknown ${runtime} model "${model}". Try one of: ${known.join(", ")} or aliases ${Object.keys(aliases).join(", ")}.`,
            false,
          );
        }
        await setRuntimeModel(resolved, runtime);
        return runtimeText(
          `${runtime} model override set to ${resolved}. Next top-level turn will use it; this current turn keeps the previous model.`,
        );
      },
    ),
    defineRuntimeTool(
      NAMESPACE,
      "set_codex_reasoning_effort",
      "Set Codex reasoning effort for future Codex turns. Use low for speed, medium for default work, high/xhigh for deeper work.",
      { effort: reasoningEffortSchema },
      async ({ effort }) => {
        await setCodexReasoningEffort(effort as RuntimeReasoningEffort);
        return runtimeText(`Codex reasoning effort set to ${effort}. Next Codex turn will use it.`);
      },
    ),
    defineRuntimeTool(
      NAMESPACE,
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
        return runtimeText(
          summary.length === 0
            ? "No integrations are currently connected. The user can connect new ones from the Connections panel in the debug UI."
            : JSON.stringify(summary, null, 2),
        );
      },
    ),
    defineRuntimeTool(
      NAMESPACE,
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
        return runtimeText(
          matches.length === 0
            ? `No toolkits in Composio's catalog match "${query}".`
            : JSON.stringify(matches, null, 2),
        );
      },
    ),
    defineRuntimeTool(
      NAMESPACE,
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
          return runtimeText(
            `Toolkit "${lower}" is not in Composio's catalog. Try search_composio_catalog with a keyword to find similar ones.`,
            false,
          );
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
        return runtimeText(JSON.stringify(result, null, 2));
      },
    ),
  ];
}

export function createSelfMcp() {
  return createClaudeMcpServer(NAMESPACE, createSelfTools());
}
