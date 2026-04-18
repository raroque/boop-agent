import { useState, type ReactNode } from "react";

// Integration brands — maps tool/server names to logo + display name.
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

// Boop-tool SVG icons (stroke-based, tint via currentColor)
const BOOP_ICONS: Record<string, (s: number) => ReactNode> = {
  recall: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a7 7 0 0 1 7 7c0 2.4-1.2 4.5-3 5.7V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.3C6.2 13.5 5 11.4 5 9a7 7 0 0 1 7-7z" />
      <path d="M10 21h4" />
    </svg>
  ),
  WebSearch: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  ),
  WebFetch: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 10h10" />
      <path d="M5 6h14" />
      <path d="M9 14h6" />
      <path d="M12 4v16" />
    </svg>
  ),
  write_memory: (s) => BOOP_ICONS.recall(s),
  save_draft: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  ),
  send_draft: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 2-7 20-4-9-9-4 20-7z" />
    </svg>
  ),
  spawn_agent: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8V4H8" />
      <path d="m12 4 4 4" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
    </svg>
  ),
  create_automation: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  list_automations: (s) => BOOP_ICONS.create_automation(s),
  toggle_automation: (s) => BOOP_ICONS.create_automation(s),
  delete_automation: (s) => BOOP_ICONS.create_automation(s),
  list_drafts: (s) => BOOP_ICONS.save_draft(s),
  reject_draft: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  ),
};

function getBoopToolIcon(raw?: string | null): ((s: number) => ReactNode) | null {
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
  const radius = Math.max(4, Math.round(size * 0.28));
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
        {boopIcon(iconSize)}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden bg-slate-500/10 text-slate-400 ${className}`}
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

export function BrailleIndicator({ className = "" }: { className?: string }) {
  return (
    <div className={`braille-grid ${className}`}>
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} className="bg-sky-400" />
      ))}
    </div>
  );
}
