import { z } from "zod";
import {
  CURATED_TOOLKITS,
  listConnectedToolkits,
  listToolkitMeta,
  listToolsForToolkit,
} from "./composio.js";
import { availableIntegrations } from "./execution-agent.js";
import { listCodexModelNames, resolveCodexModelInput } from "./codex-models.js";
import {
  CLAUDE_KNOWN_MODELS,
  CLAUDE_MODEL_ALIASES,
  CODEX_KNOWN_MODELS,
  CODEX_MODEL_ALIASES,
  OPENAI_KNOWN_MODELS,
  OPENAI_MODEL_ALIASES,
  REASONING_EFFORTS,
  getRuntimeConfig,
  resolveModelInput,
  resolveReasoningEffortInput,
  resolveRuntimeInput,
  setRuntimeReasoningEffort,
  setRuntimeModel,
  setRuntimeName,
} from "./runtime-config.js";
import {
  describeUserNow,
  resolveTimezoneInput,
  setUserTimezone,
} from "./timezone-config.js";
import { createClaudeMcpServer } from "./runtimes/claude.js";
import {
  booleanSchema,
  enumSchema,
  numberSchema,
  objectSchema,
  stringSchema,
} from "./runtimes/json-schema.js";
import type { RuntimeTool } from "./runtimes/types.js";
import { runtimeText } from "./runtimes/types.js";

export function createSelfTools(): RuntimeTool[] {
  const setModelSchema = {
    model: z.string().describe('Model to use. Examples: "claude-sonnet-4-6", "opus", "gpt-5.5".'),
  };
  const setRuntimeSchema = {
    runtime: z.string().describe('Runtime to use: "claude", "codex", or "openai".'),
  };
  const setReasoningEffortSchema = {
    effort: z.string().describe('Reasoning effort to use: "minimal", "low", "medium", "high", or "xhigh".'),
  };
  const setTimezoneSchema = {
    timezone: z
      .string()
      .describe('Timezone the user just told you. IANA format like "America/New_York" or alias like "eastern" / "Dallas".'),
  };
  const searchSchema = {
    query: z
      .string()
      .describe("Keyword to match against toolkit slug, name, or description (case-insensitive)."),
    limit: z.number().int().min(1).max(50).optional().default(15),
  };
  const inspectSchema = {
    slug: z.string().describe("Exact toolkit slug, e.g. 'gmail', 'slack', 'notion', 'linear'. Lowercase."),
    includeTools: z
      .boolean()
      .optional()
      .default(false)
      .describe("If true, also fetch the toolkit's tool list (slower)."),
  };

  return [
    {
      namespace: "boop-self",
      name: "get_config",
      description:
        "Return Boop's runtime configuration, user timezone/current local time, loaded integrations, and basic env info. Use when the user asks what model/runtime Boop uses, what time it is, what timezone is saved, or anything about the agent itself.",
      zodSchema: {},
      jsonSchema: objectSchema({}, []),
      handle: async () => {
        const integrations = availableIntegrations();
        const tzInfo = await describeUserNow();
        let codexModels = [...CODEX_KNOWN_MODELS];
        try {
          codexModels = await listCodexModelNames();
        } catch {
          // Keep the static fallback available if Codex is not installed or signed in.
        }
        const config = {
          ...(await getRuntimeConfig()),
          claudeEnvDefault: process.env.BOOP_MODEL ?? "claude-sonnet-4-6",
          codexEnvDefault: process.env.BOOP_CODEX_MODEL ?? "gpt-5.5",
          openaiEnvDefault: process.env.BOOP_OPENAI_MODEL ?? "gpt-5.5",
          codexReasoningEffortEnvDefault: process.env.BOOP_CODEX_REASONING_EFFORT ?? "medium",
          openaiReasoningEffortEnvDefault: process.env.BOOP_OPENAI_REASONING_EFFORT ?? "medium",
          availableRuntimes: ["claude", "codex", "openai"],
          availableModels: {
            claude: [...CLAUDE_KNOWN_MODELS],
            codex: codexModels,
            openai: [...OPENAI_KNOWN_MODELS],
          },
          availableReasoningEfforts: {
            claude: [],
            codex: [...REASONING_EFFORTS],
            openai: [...REASONING_EFFORTS],
          },
          userTimezone: tzInfo.isExplicit ? tzInfo.timezone : null,
          timezoneFallback: tzInfo.isExplicit ? null : tzInfo.timezone,
          currentLocalTime: tzInfo.now,
          openaiApiEnabled: Boolean(process.env.OPENAI_API_KEY),
          integrationsLoaded: integrations,
          integrationCount: integrations.length,
          composioEnabled: Boolean(process.env.COMPOSIO_API_KEY),
          embeddingsEnabled: Boolean(process.env.VOYAGE_API_KEY),
          sendblueEnabled: Boolean(process.env.SENDBLUE_API_KEY),
        };
        return runtimeText(JSON.stringify(config, null, 2));
      },
    },
    {
      namespace: "boop-self",
      name: "set_runtime",
      description:
        'Switch the agent runtime for future turns. "claude" remains the default. "codex" uses the local Codex app-server / user Codex subscription path. "openai" uses the OpenAI Responses API with OPENAI_API_KEY.',
      zodSchema: setRuntimeSchema,
      jsonSchema: objectSchema({
        runtime: enumSchema(["claude", "codex", "openai"], 'Runtime to use: "claude", "codex", or "openai".'),
      }),
      handle: async (rawArgs) => {
        const args = z.object(setRuntimeSchema).parse(rawArgs);
        const runtime = resolveRuntimeInput(args.runtime);
        if (!runtime) return runtimeText(`Unknown runtime "${args.runtime}". Try claude, codex, or openai.`, false);
        await setRuntimeName(runtime);
        return runtimeText(
          `Runtime override set to ${runtime}. Next agent run will use ${runtime}. This current turn keeps the previous runtime.`,
        );
      },
    },
    {
      namespace: "boop-self",
      name: "set_model",
      description: `Switch the model used by the active runtime for both this dispatcher and any sub-agents. The change applies to the next turn.

Claude aliases: ${Object.keys(CLAUDE_MODEL_ALIASES).map((k) => `"${k}"`).join(", ")}
Codex aliases: ${Object.keys(CODEX_MODEL_ALIASES).map((k) => `"${k}"`).join(", ")}
OpenAI API aliases: ${Object.keys(OPENAI_MODEL_ALIASES).map((k) => `"${k}"`).join(", ")}

Use when the user says "use opus", "switch to sonnet", "use gpt-5.5", "make it faster", etc.`,
      zodSchema: setModelSchema,
      jsonSchema: objectSchema({
        model: stringSchema('Model to use. Examples: "claude-sonnet-4-6", "opus", "gpt-5.5".'),
      }),
      handle: async (rawArgs) => {
        const args = z.object(setModelSchema).parse(rawArgs);
        const config = await getRuntimeConfig();
        const resolved =
          resolveModelInput(args.model, config.runtime) ??
          (config.runtime === "codex" ? await resolveCodexModelInput(args.model).catch(() => null) : null);
        if (!resolved) {
          const known =
            config.runtime === "openai"
              ? OPENAI_KNOWN_MODELS
              : config.runtime === "codex"
                ? CODEX_KNOWN_MODELS
                : CLAUDE_KNOWN_MODELS;
          return runtimeText(
            `Unknown ${config.runtime} model "${args.model}". Try one of: ${[...known].join(", ")}.`,
            false,
          );
        }
        await setRuntimeModel(resolved, config.runtime);
        return runtimeText(
          `Model override set to ${resolved} for ${config.runtime}. Next agent run will use it. This current turn keeps the previous model.`,
        );
      },
    },
    {
      namespace: "boop-self",
      name: "set_reasoning_effort",
      description:
        'Switch the reasoning/thinking effort for the active Codex or OpenAI runtime. Use when the user says "think harder", "make it faster", "use low effort", or "use high reasoning". Claude runtime ignores this setting.',
      zodSchema: setReasoningEffortSchema,
      jsonSchema: objectSchema({
        effort: enumSchema(
          [...REASONING_EFFORTS],
          'Reasoning effort to use: "minimal", "low", "medium", "high", or "xhigh".',
        ),
      }),
      handle: async (rawArgs) => {
        const args = z.object(setReasoningEffortSchema).parse(rawArgs);
        const config = await getRuntimeConfig();
        if (config.runtime === "claude") {
          return runtimeText("Reasoning effort is only configurable for Codex and OpenAI runtimes.", false);
        }
        const effort = resolveReasoningEffortInput(args.effort);
        if (!effort) {
          return runtimeText(
            `Unknown reasoning effort "${args.effort}". Try one of: ${[...REASONING_EFFORTS].join(", ")}.`,
            false,
          );
        }
        await setRuntimeReasoningEffort(effort, config.runtime);
        return runtimeText(
          `Reasoning effort set to ${effort} for ${config.runtime}. Next agent run will use it.`,
        );
      },
    },
    {
      namespace: "boop-self",
      name: "set_timezone",
      description:
        'Save the user timezone so Boop can reason about deadlines, today, 9am tomorrow, and other local-time references correctly. Accepts an IANA timezone ID like "America/Chicago" or a friendly alias like "central", "PT", "Dallas", "Tokyo", or "UTC".',
      zodSchema: setTimezoneSchema,
      jsonSchema: objectSchema({
        timezone: stringSchema('IANA timezone or alias, e.g. "America/New_York", "eastern", or "Dallas".'),
      }),
      handle: async (rawArgs) => {
        const args = z.object(setTimezoneSchema).parse(rawArgs);
        const resolved = resolveTimezoneInput(args.timezone);
        if (!resolved) {
          return runtimeText(
            `"${args.timezone}" is not a recognized timezone or alias. Ask the user for a canonical IANA ID like America/Chicago, Europe/London, or Asia/Tokyo.`,
            false,
          );
        }
        await setUserTimezone(resolved);
        const tzInfo = await describeUserNow();
        return runtimeText(`User timezone set to ${resolved}. Local time there is now ${tzInfo.now}.`);
      },
    },
    {
      namespace: "boop-self",
      name: "list_integrations",
      description:
        "List the user's currently connected integrations (Gmail, Slack, etc.) with the actual account behind each connection. Use when the user asks 'what tools do I have connected?' or 'which Gmail account?' or 'what integrations are set up?'.",
      zodSchema: {},
      jsonSchema: objectSchema({}, []),
      handle: async () => {
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
    },
    {
      namespace: "boop-self",
      name: "search_composio_catalog",
      description:
        "Search Composio's full toolkit catalog (1000+ services) by keyword. Returns matching toolkit slugs and descriptions. Use when the user asks 'is there a tool for X?', 'can you connect to Y?', or 'is Z available?' - e.g. 'is there a Notion integration?', 'can you talk to Zendesk?'.",
      zodSchema: searchSchema,
      jsonSchema: objectSchema(
        {
          query: stringSchema("Keyword to match against toolkit slug, name, or description."),
          limit: numberSchema(),
        },
        ["query"],
      ),
      handle: async (rawArgs) => {
        const args = z.object(searchSchema).parse(rawArgs);
        const meta = await listToolkitMeta();
        const q = args.query.trim().toLowerCase();
        const matches: Array<{ slug: string; name: string; description?: string; toolsCount?: number }> = [];
        for (const toolkit of meta.values()) {
          const haystack = `${toolkit.slug} ${toolkit.name} ${toolkit.description ?? ""}`.toLowerCase();
          if (haystack.includes(q)) {
            matches.push({
              slug: toolkit.slug,
              name: toolkit.name,
              description: toolkit.description,
              toolsCount: toolkit.toolsCount,
            });
          }
          if (matches.length >= args.limit) break;
        }
        return runtimeText(
          matches.length === 0
            ? `No toolkits in Composio's catalog match "${args.query}".`
            : JSON.stringify(matches, null, 2),
        );
      },
    },
    {
      namespace: "boop-self",
      name: "inspect_toolkit",
      description:
        "Look up a specific Composio toolkit by exact slug. Returns whether it exists, whether it's currently connected, and (if requested) the list of tools it exposes. Use when the user asks 'what can the Slack tool do?' or 'is Notion connected?'.",
      zodSchema: inspectSchema,
      jsonSchema: objectSchema(
        {
          slug: stringSchema("Exact toolkit slug, e.g. 'gmail', 'slack', 'notion', 'linear'. Lowercase."),
          includeTools: booleanSchema("If true, also fetch the toolkit's tool list (slower)."),
        },
        ["slug"],
      ),
      handle: async (rawArgs) => {
        const args = z.object(inspectSchema).parse(rawArgs);
        const lower = args.slug.trim().toLowerCase();
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
        if (args.includeTools) result.tools = await listToolsForToolkit(lower);
        return runtimeText(JSON.stringify(result, null, 2));
      },
    },
  ];
}

export function createSelfMcp() {
  return createClaudeMcpServer("boop-self", createSelfTools());
}
