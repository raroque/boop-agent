import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AiBrain02Icon,
  CancelCircleIcon,
  Clock02Icon,
  Delete02Icon,
  FileSearchIcon,
  GlobalSearchIcon,
  MailSend02Icon,
  NoteEditIcon,
  Robot02Icon,
} from "@hugeicons/core-free-icons";

// Integration brands map tool/server names to logo + display name.
// Uses Google's favicon service so we don't ship logo assets.
type ToolBrand = {
  key: string;
  displayName: string;
  domain: string;
  aliases: string[];
};

const TOOL_BRANDS: ToolBrand[] = [
  { key: "gmail", displayName: "Gmail", domain: "mail.google.com", aliases: ["gmail"] },
  {
    key: "googlecalendar",
    displayName: "Google Calendar",
    domain: "calendar.google.com",
    aliases: ["googlecalendar", "google-calendar"],
  },
  {
    key: "googledrive",
    displayName: "Google Drive",
    domain: "drive.google.com",
    aliases: ["googledrive", "google-drive"],
  },
  {
    key: "googlesheets",
    displayName: "Google Sheets",
    domain: "sheets.google.com",
    aliases: ["googlesheets", "google-sheets"],
  },
  {
    key: "googledocs",
    displayName: "Google Docs",
    domain: "docs.google.com",
    aliases: ["googledocs", "google-docs"],
  },
  { key: "slack", displayName: "Slack", domain: "slack.com", aliases: ["slack"] },
  { key: "notion", displayName: "Notion", domain: "notion.so", aliases: ["notion"] },
  { key: "github", displayName: "GitHub", domain: "github.com", aliases: ["github"] },
  { key: "linear", displayName: "Linear", domain: "linear.app", aliases: ["linear"] },
  { key: "hubspot", displayName: "HubSpot", domain: "hubspot.com", aliases: ["hubspot"] },
  {
    key: "salesforce",
    displayName: "Salesforce",
    domain: "salesforce.com",
    aliases: ["salesforce"],
  },
  { key: "discord", displayName: "Discord", domain: "discord.com", aliases: ["discord"] },
  { key: "twitter", displayName: "Twitter", domain: "twitter.com", aliases: ["twitter", "x"] },
  { key: "linkedin", displayName: "LinkedIn", domain: "linkedin.com", aliases: ["linkedin"] },
  { key: "instagram", displayName: "Instagram", domain: "instagram.com", aliases: ["instagram"] },
  { key: "youtube", displayName: "YouTube", domain: "youtube.com", aliases: ["youtube"] },
  { key: "trello", displayName: "Trello", domain: "trello.com", aliases: ["trello"] },
  { key: "asana", displayName: "Asana", domain: "asana.com", aliases: ["asana"] },
  { key: "jira", displayName: "Jira", domain: "atlassian.com", aliases: ["jira"] },
  { key: "airtable", displayName: "Airtable", domain: "airtable.com", aliases: ["airtable"] },
  { key: "figma", displayName: "Figma", domain: "figma.com", aliases: ["figma"] },
  { key: "dropbox", displayName: "Dropbox", domain: "dropbox.com", aliases: ["dropbox"] },
  { key: "stripe", displayName: "Stripe", domain: "stripe.com", aliases: ["stripe"] },
  { key: "supabase", displayName: "Supabase", domain: "supabase.com", aliases: ["supabase"] },
  { key: "granola", displayName: "Granola", domain: "granola.ai", aliases: ["granola", "granola_mcp"] },
  { key: "imessage", displayName: "iMessage", domain: "apple.com", aliases: ["imessage", "messages"] },
];

function normalize(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, "-");
}

function humanize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function findBrand(identifier?: string | null): ToolBrand | null {
  if (!identifier) return null;
  const n = normalize(identifier);
  return (
    TOOL_BRANDS.find((brand) => brand.aliases.some((alias) => n.includes(alias))) ??
    null
  );
}

function parseToolParts(raw?: string | null): {
  server: string | null;
  action: string | null;
} {
  if (!raw) return { server: null, action: null };
  const parts = raw.split("__");
  if (parts.length >= 3) {
    return { server: parts[1] ?? null, action: parts.slice(2).join("__") || null };
  }
  return { server: null, action: raw };
}

function faviconUrl(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

export function getIntegrationBrand(raw?: string | null): ToolBrand | null {
  const { server } = parseToolParts(raw);
  return findBrand(server) ?? findBrand(raw);
}

export function prettyToolName(raw?: string | null): string {
  if (!raw) return "";
  const { server, action } = parseToolParts(raw);
  if (server && action) {
    const prettyAction = humanize(action);
    if (normalize(server).startsWith("boop-")) return prettyAction;
    const brand = findBrand(server);
    if (brand) return `${brand.displayName} · ${prettyAction}`;
    return `${humanize(server)} · ${prettyAction}`;
  }
  return humanize(raw);
}

const BOOP_ICONS: Record<string, any> = {
  recall: AiBrain02Icon,
  write_memory: AiBrain02Icon,
  WebSearch: GlobalSearchIcon,
  WebFetch: FileSearchIcon,
  save_draft: NoteEditIcon,
  list_drafts: NoteEditIcon,
  send_draft: MailSend02Icon,
  spawn_agent: Robot02Icon,
  create_automation: Clock02Icon,
  list_automations: Clock02Icon,
  toggle_automation: Clock02Icon,
  delete_automation: Delete02Icon,
  reject_draft: CancelCircleIcon,
};

function getBoopToolIcon(raw?: string | null): any | null {
  if (!raw) return null;
  const action = raw.split("__").pop() ?? raw;
  return BOOP_ICONS[action] ?? null;
}

export function IntegrationLogo({
  raw,
  logoUrl,
  size = 18,
  className = "",
}: {
  raw?: string | null;
  logoUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const brand = getIntegrationBrand(raw);
  const boopIcon = getBoopToolIcon(raw);
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  const radius = Math.max(8, Math.round(size * 0.4));
  const iconSize = Math.max(12, Math.round(size * 0.72));

  // Prefer an explicit URL (e.g. Composio's branded toolkit logo) over favicon-by-domain.
  const imgSrc = !failed && logoUrl ? logoUrl : !failed && brand ? faviconUrl(brand.domain) : null;

  if (imgSrc) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden bg-white/95 ${className}`}
        style={{ ...style, borderRadius: radius, border: "0.5px solid rgba(148,163,184,0.2)" }}
      >
        <img
          src={imgSrc}
          alt={brand?.displayName ?? raw ?? "integration"}
          width={iconSize}
          height={iconSize}
          className="block object-contain"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  if (boopIcon) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden bg-violet-500/10 text-violet-400 ${className}`}
        style={{ ...style, borderRadius: radius, border: "0.5px solid rgba(139,92,246,0.25)" }}
      >
        <HugeiconsIcon icon={boopIcon} size={iconSize} />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden bg-zinc-500/10 text-zinc-400 ${className}`}
      style={{ ...style, borderRadius: radius, border: "0.5px solid rgba(148,163,184,0.25)" }}
    >
      <span className="text-[10px] font-semibold leading-none">
        {(raw ?? "?").trim().charAt(0).toUpperCase() || "?"}
      </span>
    </span>
  );
}

export function ClaudeLogo({ size = 12, className = "" }: { size?: number; className?: string }) {
  return <img src="/claude-logo.png" width={size} height={size} alt="Claude" className={`inline-block ${className}`} />;
}

export type RuntimeProvider = "claude" | "codex";

export function CodexLogo({ size = 12, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src="/codex-logo.png"
      width={size}
      height={size}
      alt="Codex"
      className={`inline-block rounded-[4px] ${className}`}
    />
  );
}

export function RuntimeProviderLogo({
  runtime,
  size = 16,
  className = "",
}: {
  runtime: RuntimeProvider;
  size?: number;
  className?: string;
}) {
  return runtime === "codex" ? (
    <CodexLogo size={size} className={className} />
  ) : (
    <ClaudeLogo size={size} className={className} />
  );
}

export function RuntimeProviderBadge({
  runtime,
  model,
  isDark,
  compact = false,
  className = "",
}: {
  runtime: RuntimeProvider;
  model?: string | null;
  isDark: boolean;
  compact?: boolean;
  className?: string;
}) {
  const label = runtime === "codex" ? "Codex" : "Claude";
  return (
    <div
      className={`inline-flex min-w-0 items-center gap-1.5 rounded-2xl border px-2.5 py-1.5 ${
        isDark
          ? "border-white/10 bg-white/5 text-zinc-300"
          : "border-zinc-200 bg-white text-zinc-700"
      } ${className}`}
      title={`Active provider: ${label}${model ? ` (${model})` : ""}`}
    >
      <RuntimeProviderLogo runtime={runtime} size={compact ? 14 : 16} />
      <span className="text-xs font-medium">{label}</span>
      {!compact && model && (
        <span className={`text-[10px] mono truncate ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
          {model}
        </span>
      )}
    </div>
  );
}

export function BrailleIndicator({ className = "" }: { className?: string }) {
  return (
    <div className={`braille-grid ${className}`}>
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} className="bg-sky-400" />
      ))}
    </div>
  );
}
