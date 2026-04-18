import { Composio } from "@composio/core";
import { ClaudeAgentSDKProvider } from "@composio/claude-agent-sdk";
import { createSdkMcpServer, type McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type { IntegrationModule } from "./integrations/registry.js";

export interface CuratedToolkit {
  slug: string;
  displayName: string;
}

// Hand-picked toolkits surfaced in the debug UI. Composio exposes 1000+ total,
// but rendering them all is noisy; users can still connect anything outside
// this list by editing this array.
export const CURATED_TOOLKITS: CuratedToolkit[] = [
  { slug: "gmail", displayName: "Gmail" },
  { slug: "googlecalendar", displayName: "Google Calendar" },
  { slug: "googledrive", displayName: "Google Drive" },
  { slug: "googlesheets", displayName: "Google Sheets" },
  { slug: "googledocs", displayName: "Google Docs" },
  { slug: "slack", displayName: "Slack" },
  { slug: "github", displayName: "GitHub" },
  { slug: "linear", displayName: "Linear" },
  { slug: "notion", displayName: "Notion" },
  { slug: "hubspot", displayName: "HubSpot" },
  { slug: "salesforce", displayName: "Salesforce" },
  { slug: "discord", displayName: "Discord" },
  { slug: "twitter", displayName: "Twitter" },
  { slug: "linkedin", displayName: "LinkedIn" },
  { slug: "trello", displayName: "Trello" },
  { slug: "asana", displayName: "Asana" },
  { slug: "jira", displayName: "Jira" },
  { slug: "airtable", displayName: "Airtable" },
  { slug: "figma", displayName: "Figma" },
  { slug: "dropbox", displayName: "Dropbox" },
];

const DISPLAY_NAME_BY_SLUG = new Map(CURATED_TOOLKITS.map((t) => [t.slug, t.displayName]));

let singleton: Composio<ClaudeAgentSDKProvider> | null = null;

export function getComposio(): Composio<ClaudeAgentSDKProvider> | null {
  if (singleton) return singleton;
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return null;
  singleton = new Composio<ClaudeAgentSDKProvider>({
    apiKey,
    provider: new ClaudeAgentSDKProvider(),
  });
  return singleton;
}

export function boopUserId(): string {
  return process.env.COMPOSIO_USER_ID ?? "boop-default";
}

export function displayNameFor(slug: string): string {
  return DISPLAY_NAME_BY_SLUG.get(slug) ?? humanize(slug);
}

function humanize(slug: string): string {
  return slug
    .split(/[-_]/g)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

export interface ConnectedToolkit {
  slug: string;
  connectionId: string;
  status: string;
  accountLabel?: string;
}

export async function listConnectedToolkits(): Promise<ConnectedToolkit[]> {
  const composio = getComposio();
  if (!composio) return [];
  try {
    const resp = await composio.connectedAccounts.list({ userIds: [boopUserId()] });
    return resp.items.map((it) => ({
      slug: it.toolkit.slug,
      connectionId: it.id,
      status: it.status,
      accountLabel: it.alias ?? undefined,
    }));
  } catch (err) {
    console.error("[composio] listConnectedToolkits failed", err);
    return [];
  }
}

export async function authorizeToolkit(
  slug: string,
  opts?: { callbackUrl?: string },
): Promise<{ redirectUrl: string | null; connectionId: string }> {
  const composio = getComposio();
  if (!composio) throw new Error("COMPOSIO_API_KEY not set");
  const session = await composio.create(boopUserId(), {
    toolkits: [slug],
    manageConnections: false,
  });
  const conn = await session.authorize(slug, opts?.callbackUrl ? { callbackUrl: opts.callbackUrl } : undefined);
  return { redirectUrl: conn.redirectUrl ?? null, connectionId: conn.id };
}

export async function disconnectToolkit(connectionId: string): Promise<void> {
  const composio = getComposio();
  if (!composio) throw new Error("COMPOSIO_API_KEY not set");
  await composio.connectedAccounts.delete(connectionId);
}

export function buildComposioIntegrationModule(slug: string): IntegrationModule {
  return {
    name: slug,
    description: `${displayNameFor(slug)} (via Composio)`,
    requiredEnv: ["COMPOSIO_API_KEY"],
    createServer: async (): Promise<McpSdkServerConfigWithInstance> => {
      const composio = getComposio();
      if (!composio) {
        throw new Error(`[composio] cannot build ${slug} — COMPOSIO_API_KEY not set`);
      }
      const session = await composio.create(boopUserId(), {
        toolkits: [slug],
        manageConnections: false,
      });
      const tools = await session.tools();
      return createSdkMcpServer({
        name: slug,
        version: "0.1.0",
        tools,
      });
    },
  };
}
