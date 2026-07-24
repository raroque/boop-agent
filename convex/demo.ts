import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { DEMO_PREFIX, DEMO_SCAN_LIMIT, DEMO_SETTING_KEY, isDemoId } from "./demoMode";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const DEMO_EMBEDDING_DIMENSIONS = 1024;
const DEMO_STATUS_SETTING_KEY = "debug_demo_status";

type Runtime = "claude" | "codex";
type BillingMode = "api" | "codex-subscription";
type AgentStatus = "spawned" | "running" | "completed" | "failed" | "cancelled";
type AutomationRunStatus = "running" | "completed" | "failed";
type ConsolidationStatus = "running" | "completed" | "failed";
type MemoryTier = "short" | "long" | "permanent";
type MemorySegment =
  | "identity"
  | "preference"
  | "correction"
  | "relationship"
  | "project"
  | "knowledge"
  | "context";
type UsageSource =
  | "dispatcher"
  | "execution"
  | "extract"
  | "consolidation-proposer"
  | "consolidation-adversary"
  | "consolidation-judge"
  | "proactive";

interface DemoCounts {
  conversations: number;
  messages: number;
  agents: number;
  agentLogs: number;
  memories: number;
  memoryEvents: number;
  automations: number;
  automationRuns: number;
  consolidationRuns: number;
  usageRecords: number;
}

const DEMO_COUNT_KEYS = [
  "conversations",
  "messages",
  "agents",
  "agentLogs",
  "memories",
  "memoryEvents",
  "automations",
  "automationRuns",
  "consolidationRuns",
  "usageRecords",
] as const satisfies readonly (keyof DemoCounts)[];

function emptyDemoCounts(): DemoCounts {
  return {
    conversations: 0,
    messages: 0,
    agents: 0,
    agentLogs: 0,
    memories: 0,
    memoryEvents: 0,
    automations: 0,
    automationRuns: 0,
    consolidationRuns: 0,
    usageRecords: 0,
  };
}

function parseDemoCounts(value: string | null): DemoCounts | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const counts = emptyDemoCounts();
    for (const key of DEMO_COUNT_KEYS) {
      const count = record[key];
      if (!Number.isSafeInteger(count) || (count as number) < 0) return null;
      counts[key] = count as number;
    }
    return counts;
  } catch {
    return null;
  }
}

function totalDemoRows(counts: DemoCounts): number {
  return DEMO_COUNT_KEYS.reduce((total, key) => total + counts[key], 0);
}

interface AgentTemplate {
  name: string;
  task: string;
  result: string;
  error?: string;
  status?: AgentStatus;
  integrations: string[];
  tool: string;
  query: string;
  conversationId: string;
}

interface MemoryTemplate {
  content: string;
  segment: MemorySegment;
  tier: MemoryTier;
  importance: number;
  graphLabel?: string;
}

function ago(now: number, days: number, offset = 0): number {
  return now - days * DAY - offset;
}

function compactNumber(value: number, precision = 4): number {
  return Number(value.toFixed(precision));
}

function demoEmbedding(content: string): number[] {
  let seed = 2166136261;
  for (let index = 0; index < content.length; index += 1) {
    seed = Math.imul(seed ^ content.charCodeAt(index), 16777619) >>> 0;
  }

  const vector: number[] = [];
  let sumSquares = 0;
  for (let index = 0; index < DEMO_EMBEDDING_DIMENSIONS; index += 1) {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0;
    seed = Math.imul(seed ^ (seed >>> 13), 3266489909) >>> 0;
    seed = Math.imul(seed ^ index, 16777619) >>> 0;
    const value = (seed / 0xffffffff) * 2 - 1;
    vector.push(value);
    sumSquares += value * value;
  }

  const magnitude = Math.sqrt(sumSquares) || 1;
  return vector.map((value) => compactNumber(value / magnitude, 6));
}

function pick<T>(items: readonly T[], index: number): T {
  return items[index % items.length]!;
}

async function readDemoSetting(ctx: QueryCtx | MutationCtx) {
  const row = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", DEMO_SETTING_KEY))
    .unique();
  return row?.value ?? null;
}

async function setDemoSetting(ctx: MutationCtx, enabled: boolean) {
  const existing = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", DEMO_SETTING_KEY))
    .unique();
  const value = enabled ? "true" : "false";
  if (existing) {
    await ctx.db.patch(existing._id, { value, updatedAt: Date.now() });
    return;
  }
  await ctx.db.insert("settings", {
    key: DEMO_SETTING_KEY,
    value,
    updatedAt: Date.now(),
  });
}

async function readDemoCountsSetting(ctx: QueryCtx | MutationCtx): Promise<DemoCounts | null> {
  const row = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", DEMO_STATUS_SETTING_KEY))
    .unique();
  return parseDemoCounts(row?.value ?? null);
}

async function setDemoCountsSetting(ctx: MutationCtx, counts: DemoCounts) {
  const existing = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", DEMO_STATUS_SETTING_KEY))
    .unique();
  const value = JSON.stringify(counts);
  if (existing) {
    await ctx.db.patch(existing._id, { value, updatedAt: Date.now() });
    return;
  }
  await ctx.db.insert("settings", {
    key: DEMO_STATUS_SETTING_KEY,
    value,
    updatedAt: Date.now(),
  });
}

async function deleteDemoRows(ctx: MutationCtx): Promise<DemoCounts> {
  const counts: DemoCounts = {
    conversations: 0,
    messages: 0,
    agents: 0,
    agentLogs: 0,
    memories: 0,
    memoryEvents: 0,
    automations: 0,
    automationRuns: 0,
    consolidationRuns: 0,
    usageRecords: 0,
  };

  const agentLogs = await ctx.db.query("agentLogs").order("desc").take(DEMO_SCAN_LIMIT);
  for (const row of agentLogs) {
    if (!isDemoId(row.agentId)) continue;
    await ctx.db.delete(row._id);
    counts.agentLogs += 1;
  }

  const automationRuns = await ctx.db.query("automationRuns").order("desc").take(DEMO_SCAN_LIMIT);
  for (const row of automationRuns) {
    if (!isDemoId(row.runId) && !isDemoId(row.automationId) && !isDemoId(row.agentId)) {
      continue;
    }
    await ctx.db.delete(row._id);
    counts.automationRuns += 1;
  }

  const usageRecords = await ctx.db.query("usageRecords").order("desc").take(DEMO_SCAN_LIMIT);
  for (const row of usageRecords) {
    if (!isDemoId(row.conversationId) && !isDemoId(row.agentId) && !isDemoId(row.runId)) {
      continue;
    }
    await ctx.db.delete(row._id);
    counts.usageRecords += 1;
  }

  const memoryEvents = await ctx.db.query("memoryEvents").order("desc").take(DEMO_SCAN_LIMIT);
  for (const row of memoryEvents) {
    if (!isDemoId(row.conversationId) && !isDemoId(row.memoryId) && !isDemoId(row.agentId)) {
      continue;
    }
    await ctx.db.delete(row._id);
    counts.memoryEvents += 1;
  }

  const consolidationRuns = await ctx.db
    .query("consolidationRuns")
    .order("desc")
    .take(DEMO_SCAN_LIMIT);
  for (const row of consolidationRuns) {
    if (!isDemoId(row.runId)) continue;
    await ctx.db.delete(row._id);
    counts.consolidationRuns += 1;
  }

  const agents = await ctx.db.query("executionAgents").order("desc").take(DEMO_SCAN_LIMIT);
  for (const row of agents) {
    if (!isDemoId(row.agentId)) continue;
    await ctx.db.delete(row._id);
    counts.agents += 1;
  }

  const memories = await ctx.db.query("memoryRecords").order("desc").take(DEMO_SCAN_LIMIT);
  for (const row of memories) {
    if (!isDemoId(row.memoryId)) continue;
    await ctx.db.delete(row._id);
    counts.memories += 1;
  }

  const automations = await ctx.db.query("automations").order("desc").take(DEMO_SCAN_LIMIT);
  for (const row of automations) {
    if (!isDemoId(row.automationId)) continue;
    await ctx.db.delete(row._id);
    counts.automations += 1;
  }

  const messages = await ctx.db.query("messages").order("desc").take(DEMO_SCAN_LIMIT);
  for (const row of messages) {
    if (!isDemoId(row.conversationId) && !isDemoId(row.agentId)) continue;
    await ctx.db.delete(row._id);
    counts.messages += 1;
  }

  const conversations = await ctx.db.query("conversations").order("desc").take(DEMO_SCAN_LIMIT);
  for (const row of conversations) {
    if (!isDemoId(row.conversationId)) continue;
    await ctx.db.delete(row._id);
    counts.conversations += 1;
  }

  return counts;
}

const conversationSeeds = [
  {
    id: "demo:conversation:morning-brief",
    title: "Morning brief",
    summary: "Calendar, Gmail, and Linear triage before the first meeting.",
  },
  {
    id: "demo:conversation:dashboard-redesign",
    title: "Dashboard redesign",
    summary: "Iterating on the debug dashboard visual system and data density.",
  },
  {
    id: "demo:conversation:launch-week",
    title: "Launch week ops",
    summary: "Tracking blockers, beta feedback, and follow-up drafts.",
  },
  {
    id: "demo:conversation:personal-admin",
    title: "Personal admin",
    summary: "Travel, receipts, reminders, and weekend planning.",
  },
] as const;

const messageSnippets = [
  [
    "Can you brief me before standup?",
    "You have two schedule conflicts, one urgent customer email, and three Linear issues that changed overnight.",
    "Pull the launch risks into a short list.",
    "Top risks: webhook retry backoff, stale Gmail auth for one account, and the memory consolidation queue running behind.",
    "Draft replies for the urgent ones.",
    "Drafted two short replies and linked the source messages in the thread.",
    "Remind me after the product review.",
    "Set a follow-up for 2:30 PM Central and attached the relevant dashboard context.",
  ],
  [
    "This debug dashboard needs to feel calmer and more like a desktop app.",
    "I tightened the left navigation, moved status into compact pills, and gave the main content a flush rounded container.",
    "Make sure settings and connections match the same visual direction.",
    "Settings now uses the same cards, typography, provider badges, and compact controls as the rest of the dashboard.",
    "Can we use realistic data so the panels don't look empty?",
    "Added a demo dataset with memories, agents, tool traces, automations, and consolidation runs.",
    "Keep the left side as the app background.",
    "The right pane stays flush to the top, right, and bottom edges while the left side remains the ambient app surface.",
  ],
  [
    "Summarize beta feedback from last night.",
    "Themes: calendar sync confidence, desire for more visible tool traces, and better memory explainability.",
    "Open issues for the two actionable bugs.",
    "Created Linear issues for OAuth reconnect copy and automation run detail overflow.",
    "Check if the release notes mention demo mode.",
    "They do not yet. I added a note to the launch checklist and drafted the changelog paragraph.",
    "Who owns the webhook retry fix?",
    "The backend owner owns the retry policy. I added a reminder to check the branch before end of day.",
  ],
  [
    "Find receipts from this week and group them by project.",
    "Found six receipts and grouped them under Boop, Home, and Travel.",
    "Add the flight hold to my calendar if it still looks reasonable.",
    "The flight still lands before the dinner window. I created a tentative calendar event with the fare link.",
    "Remember that I prefer no meetings before 9:30 on Fridays.",
    "Saved that preference as long-term memory and used it to avoid the Friday morning slot.",
    "What still needs my attention?",
    "One approval email, one expiring hotel hold, and the Friday design review invite conflict need action.",
  ],
] as const;

const agentTemplates: AgentTemplate[] = [
  {
    name: "Morning inbox triage",
    task: "Scan Gmail, identify urgent inbound messages, and prepare a short standup brief.",
    result:
      "Found 4 important messages. Drafted replies for the Stripe invoice question and the customer escalation, then linked both to the morning brief.",
    integrations: ["gmail", "googlecalendar"],
    tool: "mcp__gmail__search_email",
    query: "newer_than:24h (urgent OR escalation OR invoice)",
    conversationId: "demo:conversation:morning-brief",
  },
  {
    name: "Calendar conflict resolver",
    task: "Review today's calendar and suggest moves for overlapping meetings.",
    result:
      "Detected 2 overlaps. Suggested moving the recruiting sync to 3:30 PM and declining the duplicate product office-hours hold.",
    integrations: ["googlecalendar", "gmail"],
    tool: "mcp__googlecalendar__list_events",
    query: "today busy windows",
    conversationId: "demo:conversation:morning-brief",
  },
  {
    name: "Dashboard UI audit",
    task: "Inspect the debug dashboard and identify stale screens that do not match the refreshed direction.",
    result:
      "Settings, Connections, Events, Memory, Automations, and Consolidation now share the rounded panel system, Geist typography, and compact status treatment.",
    integrations: ["github", "figma"],
    tool: "mcp__github__search_code",
    query: "debug dashboard panels settings connections",
    conversationId: "demo:conversation:dashboard-redesign",
  },
  {
    name: "Tool trace sampler",
    task: "Generate realistic agent tool traces for the local debug dashboard demo.",
    result:
      "Seeded the demo namespace with varied tool calls across Gmail, Calendar, Linear, GitHub, Notion, Slack, and Google Drive.",
    integrations: ["github", "notion", "linear"],
    tool: "mcp__notion__search",
    query: "agent trace examples tool results",
    conversationId: "demo:conversation:dashboard-redesign",
  },
  {
    name: "Beta feedback clustering",
    task: "Cluster the last 48 hours of beta feedback into themes and follow-up actions.",
    result:
      "Clustered 37 feedback notes into 5 themes. The largest clusters are calendar trust, memory explainability, and connection recovery.",
    integrations: ["slack", "notion", "linear"],
    tool: "mcp__slack__search_messages",
    query: "boop beta feedback since:yesterday",
    conversationId: "demo:conversation:launch-week",
  },
  {
    name: "Linear blocker sweep",
    task: "Find launch-blocking issues in Linear and summarize owner, status, and next step.",
    result:
      "Found 7 launch blockers. Three are waiting on review, two need reproduction notes, and two are owned by the platform team.",
    integrations: ["linear", "github"],
    tool: "mcp__linear__search_issues",
    query: "label:launch-blocker status:open",
    conversationId: "demo:conversation:launch-week",
  },
  {
    name: "Receipt organizer",
    task: "Find receipts from the last week and group them by project.",
    result:
      "Grouped 6 receipts into Boop, Home, and Travel. Added notes for the two reimbursable items.",
    integrations: ["gmail", "googledrive"],
    tool: "mcp__gmail__search_email",
    query: "newer_than:7d receipt OR invoice",
    conversationId: "demo:conversation:personal-admin",
  },
  {
    name: "Travel hold checker",
    task: "Validate the flight hold and create a tentative calendar event if the itinerary still works.",
    result:
      "The hold still fits the dinner window. Added a tentative event with the fare link and confirmation deadline.",
    integrations: ["gmail", "googlecalendar"],
    tool: "mcp__googlecalendar__create_event",
    query: "tentative flight hold",
    conversationId: "demo:conversation:personal-admin",
  },
  {
    name: "OAuth reconnect diagnosis",
    task: "Investigate why one Gmail account is stale in the connections screen.",
    result:
      "Identified an expired Composio account session. The UI now shows the affected account and a reconnect path.",
    integrations: ["gmail", "github"],
    tool: "mcp__gmail__get_profile",
    query: "stale account health",
    conversationId: "demo:conversation:launch-week",
  },
  {
    name: "Memory consolidation review",
    task: "Review recent memories and propose merges, archives, or permanent promotions.",
    result:
      "Merged 8 duplicate project memories, promoted 4 durable preferences, and pruned 11 transient scheduling facts.",
    integrations: ["boop_memory"],
    tool: "mcp__boop-memory__write_memory",
    query: "consolidation proposal",
    conversationId: "demo:conversation:dashboard-redesign",
  },
  {
    name: "Changelog drafter",
    task: "Draft a short launch note for the debug dashboard redesign and demo mode.",
    result:
      "Drafted a release note focused on realistic dashboard previews, namespaced demo data, and refreshed settings screens.",
    integrations: ["notion", "github"],
    tool: "mcp__notion__create_page",
    query: "debug dashboard release note",
    conversationId: "demo:conversation:launch-week",
  },
  {
    name: "Slack source linker",
    task: "Find source Slack messages for the beta feedback summary and attach links to the brief.",
    result:
      "Attached 12 source links across #beta-feedback and #support-triage.",
    integrations: ["slack", "notion"],
    tool: "mcp__slack__search_messages",
    query: "memory explainability calendar trust dashboard traces",
    conversationId: "demo:conversation:launch-week",
  },
  {
    name: "GitHub regression sweep",
    task: "Look for recent debug UI regressions and summarize suspicious commits.",
    result:
      "Reviewed 9 recent commits. The bottom scroll cutoff came from an extra wrapper height and has been fixed.",
    integrations: ["github"],
    tool: "mcp__github__search_commits",
    query: "debug dashboard scroll cutoff",
    conversationId: "demo:conversation:dashboard-redesign",
  },
  {
    name: "Automation dry run",
    task: "Run the daily command center automation in dry-run mode and collect trace output.",
    result:
      "Dry run completed with Gmail, Calendar, Linear, and Memory calls. No notifications were sent.",
    integrations: ["gmail", "googlecalendar", "linear", "boop_memory"],
    tool: "mcp__googlecalendar__list_events",
    query: "tomorrow command center",
    conversationId: "demo:conversation:morning-brief",
  },
  {
    name: "Provider cost comparison",
    task: "Compare recent model token usage for agent runs.",
    result:
      "Hosted runs represent 54% of tokens and 39% of estimated cost. Claude runs are concentrated in extraction and consolidation.",
    integrations: ["boop_usage"],
    tool: "mcp__boop-usage__summary",
    query: "provider cost last 14 days",
    conversationId: "demo:conversation:dashboard-redesign",
  },
  {
    name: "Connection copy refresh",
    task: "Rewrite connection screen labels so the account state is clearer.",
    result:
      "Rewrote stale, connected, and action-required copy with account-specific status labels.",
    integrations: ["github", "figma"],
    tool: "mcp__github__search_code",
    query: "ConnectionsPanel copy connected stale",
    conversationId: "demo:conversation:dashboard-redesign",
  },
  {
    name: "Friday preference capture",
    task: "Persist the user's Friday morning meeting preference.",
    result:
      "Saved a long-term preference: avoid scheduling meetings before 9:30 AM on Fridays unless explicitly approved.",
    integrations: ["boop_memory"],
    tool: "mcp__boop-memory__write_memory",
    query: "Friday morning meeting preference",
    conversationId: "demo:conversation:personal-admin",
  },
  {
    name: "Drive artifact index",
    task: "Find launch planning docs and index the latest relevant artifacts.",
    result:
      "Indexed the launch checklist, beta feedback table, dashboard QA sheet, and release note draft.",
    integrations: ["googledrive", "googledocs", "googlesheets"],
    tool: "mcp__googledrive__search",
    query: "Boop launch dashboard QA beta feedback",
    conversationId: "demo:conversation:launch-week",
  },
  {
    name: "Draft approval monitor",
    task: "Check pending message drafts and flag anything waiting for approval.",
    result:
      "Found 3 pending drafts. One customer reply should be sent before noon.",
    integrations: ["gmail", "imessage"],
    tool: "mcp__gmail__list_drafts",
    query: "pending customer replies",
    conversationId: "demo:conversation:morning-brief",
  },
  {
    name: "Memory recall trace",
    task: "Trace which memories were recalled for the calendar scheduling turn.",
    result:
      "Recalled 6 memories: no early Friday meetings, compact calendar-first dashboards, concise briefs, and launch-week stakeholders.",
    integrations: ["boop_memory"],
    tool: "mcp__boop-memory__recall",
    query: "calendar scheduling constraints launch week",
    conversationId: "demo:conversation:personal-admin",
  },
  {
    name: "Webhook retry investigation",
    task: "Inspect webhook retry logs and find the failure window.",
    result:
      "Failures were concentrated between 01:10 and 01:18. Retry jitter recovered after the queue worker restarted.",
    integrations: ["github", "linear"],
    tool: "mcp__github__search_code",
    query: "webhook retry backoff queue worker",
    conversationId: "demo:conversation:launch-week",
  },
  {
    name: "Settings visual QA",
    task: "Compare Settings against the refreshed dashboard aesthetic and log remaining polish issues.",
    result:
      "Settings now matches the card rhythm and typography. Remaining polish: demo mode status should include seeded row counts.",
    integrations: ["github"],
    tool: "mcp__github__search_code",
    query: "SettingsPanel controls",
    conversationId: "demo:conversation:dashboard-redesign",
  },
  {
    name: "Notion action cleanup",
    task: "Move loose launch notes into the right Notion sections.",
    result:
      "Moved 14 loose notes into Launch, Design QA, Customer Follow-up, and Automation Reliability sections.",
    integrations: ["notion"],
    tool: "mcp__notion__search",
    query: "loose launch notes dashboard",
    conversationId: "demo:conversation:launch-week",
  },
  {
    name: "Gmail account audit",
    task: "Check connected Gmail accounts for stale tokens and permission gaps.",
    result:
      "Two accounts are healthy. One needs reconnect because the mail.readonly scope expired.",
    integrations: ["gmail"],
    tool: "mcp__gmail__get_profile",
    query: "connected account scope audit",
    conversationId: "demo:conversation:morning-brief",
  },
  {
    name: "Automation failure explainer",
    task: "Explain the failed automation run in plain language with source links.",
    result:
      "The run failed because Linear rate-limited one issue search after Gmail and Calendar succeeded. A retry should complete cleanly.",
    integrations: ["linear", "gmail", "googlecalendar"],
    tool: "mcp__linear__search_issues",
    query: "rate limited automation run",
    conversationId: "demo:conversation:launch-week",
  },
  {
    name: "Customer reply drafter",
    task: "Draft a concise reply to the customer escalation using the latest project state.",
    result:
      "Prepared a reply with the corrected incident window, mitigation status, and next update time.",
    integrations: ["gmail", "notion", "linear"],
    tool: "mcp__gmail__create_draft",
    query: "customer escalation retry mitigation",
    conversationId: "demo:conversation:morning-brief",
  },
  {
    name: "Memory graph sample",
    task: "Generate a realistic spread of memory segments for graph and table views.",
    result:
      "Generated identity, preference, relationship, project, knowledge, and context memories with varied access counts.",
    integrations: ["boop_memory"],
    tool: "mcp__boop-memory__write_memory",
    query: "memory graph sample dataset",
    conversationId: "demo:conversation:dashboard-redesign",
  },
  {
    name: "End-of-day digest",
    task: "Assemble an end-of-day digest from open issues, calendar changes, and unread priority email.",
    result:
      "Digest includes 5 shipped items, 3 open blockers, 2 draft replies, and tomorrow's calendar pressure points.",
    integrations: ["gmail", "googlecalendar", "linear", "slack"],
    tool: "mcp__slack__search_messages",
    query: "shipped blockers tomorrow",
    conversationId: "demo:conversation:launch-week",
  },
  {
    name: "Sub-agent · Inbox evidence pack",
    task: "Collect the three email threads that matter for the product review and summarize the decision needed in each one.",
    result:
      "Found the renewal thread, the escalation thread, and the invoice question. Marked the renewal as the only one that needs a reply before the review.",
    status: "completed",
    integrations: ["gmail", "boop_memory"],
    tool: "mcp__gmail__search_email",
    query: "newer_than:48h renewal OR escalation OR invoice",
    conversationId: "demo:conversation:morning-brief",
  },
  {
    name: "Sub-agent · Calendar pressure map",
    task: "Check the calendar for conflicts, prep gaps, and movable meetings before the afternoon product review.",
    result:
      "Mapped two tight windows, found one movable recruiting sync, and preserved a 90-minute writing block before the product review.",
    status: "running",
    integrations: ["googlecalendar", "boop_memory"],
    tool: "mcp__googlecalendar__list_events",
    query: "today conflicts prep gaps product review",
    conversationId: "demo:conversation:morning-brief",
  },
  {
    name: "Sub-agent · Launch blocker sweep",
    task: "Search Linear and GitHub for launch blockers that changed since yesterday and group them by owner.",
    result:
      "Grouped six blockers by owner. Two need reproduction notes, one is waiting on review, and three are already in progress.",
    status: "completed",
    integrations: ["linear", "github"],
    tool: "mcp__linear__search_issues",
    query: "label:launch-blocker updated_since:yesterday",
    conversationId: "demo:conversation:launch-week",
  },
  {
    name: "Sub-agent · Customer reply polish",
    task: "Draft the customer reply from the latest incident window and leave it pending for approval.",
    result:
      "Prepared a pending draft that acknowledges the missed deadline, explains the retry fix, and promises the next check-in time.",
    status: "completed",
    integrations: ["gmail", "notion", "linear"],
    tool: "mcp__gmail__create_draft",
    query: "customer incident retry fix next check-in",
    conversationId: "demo:conversation:launch-week",
  },
  {
    name: "Sub-agent · Notes and receipt sweep",
    task: "Search local notes and Drive for open personal-admin items that should not be lost during launch week.",
    result:
      "Found the package pickup cutoff, the reimbursement packet, and the hotel cancellation deadline. Added them to the afternoon brief.",
    status: "completed",
    integrations: ["apple-notes", "googledrive", "apple-reminders"],
    tool: "mcp__apple-notes__search_notes",
    query: "package pickup reimbursement hotel cancellation",
    conversationId: "demo:conversation:personal-admin",
  },
  {
    name: "Product review command center",
    task: "Respond to the user's text: 'What needs my attention before the product review?' Delegate inbox, calendar, blocker, draft, and personal-admin checks, then return a concise action plan.",
    result:
      "Prepared the product review brief: send the renewal reply, move the recruiting sync, review two launch blockers, and handle the package pickup before the evening cutoff.",
    status: "completed",
    integrations: ["imessage", "gmail", "googlecalendar", "linear", "slack", "boop_memory"],
    tool: "mcp__imessage__read_messages",
    query: "latest product review attention request",
    conversationId: "demo:conversation:morning-brief",
  },
];

const memoryTemplates: MemoryTemplate[] = [
  {
    content:
      "Prefers the recommended next action first, followed by the short reason and any tradeoffs.",
    segment: "preference",
    tier: "permanent",
    importance: 0.95,
    graphLabel: "Lead with the action",
  },
  {
    content:
      "Default to the home timezone for scheduling, but confirm travel plans in the destination's local time.",
    segment: "preference",
    tier: "permanent",
    importance: 0.9,
    graphLabel: "Timezone-aware scheduling",
  },
  {
    content:
      "Avoid meetings before 9:30 AM on Fridays unless the exception is explicitly approved.",
    segment: "preference",
    tier: "long",
    importance: 0.88,
    graphLabel: "No early Fridays",
  },
  {
    content:
      "Keep evenings after 6 PM open unless the request is urgent or the evening is explicitly available.",
    segment: "preference",
    tier: "long",
    importance: 0.86,
    graphLabel: "Protect evenings",
  },
  {
    content:
      "Customer reply drafts should be warm, specific, and left pending for review unless sending was pre-approved.",
    segment: "preference",
    tier: "permanent",
    importance: 0.91,
    graphLabel: "Review drafts first",
  },
  {
    content:
      "Calendar holds should include location, dial-in link, prep doc, and the decision expected in the meeting.",
    segment: "preference",
    tier: "long",
    importance: 0.84,
    graphLabel: "Decision-ready meetings",
  },
  {
    content:
      "When comparing options, rank by practical tradeoffs first instead of abstract pros and cons.",
    segment: "preference",
    tier: "long",
    importance: 0.87,
    graphLabel: "Practical tradeoffs",
  },
  {
    content:
      "Current launch checklist: pricing FAQ, support macros, webhook recovery notes, billing edge cases, and rollback plan.",
    segment: "project",
    tier: "long",
    importance: 0.83,
    graphLabel: "Launch checklist",
  },
  {
    content:
      "Weekend errands should be grouped by neighborhood so the user does not make extra trips across town.",
    segment: "preference",
    tier: "long",
    importance: 0.78,
    graphLabel: "Batch errands by area",
  },
  {
    content:
      "For dinner plans with the partner, aim for around 7 PM and somewhere quiet enough to talk.",
    segment: "relationship",
    tier: "long",
    importance: 0.75,
    graphLabel: "Quiet dinners at seven",
  },
  {
    content:
      "Workout suggestions should protect knees and shoulders and include warmup cues before heavier sets.",
    segment: "preference",
    tier: "permanent",
    importance: 0.82,
    graphLabel: "Joint-friendly training",
  },
  {
    content:
      "For travel, prefer nonstop flights, aisle seats, and hotels within walking distance of meetings.",
    segment: "preference",
    tier: "long",
    importance: 0.8,
    graphLabel: "Nonstop, aisle, walkable",
  },
];

const memoryFillers = [
  ["identity", "permanent", "Runs a small software team and splits time between product decisions, customer support, and engineering reviews."],
  ["identity", "permanent", "Comfortable reading implementation details, but wants the conclusion before the code path."],
  ["preference", "permanent", "Status updates should say what changed, what is blocked, who owns it, and the next concrete step."],
  ["preference", "long", "Customer-facing copy should sound plainspoken and specific, not polished into generic launch language."],
  ["preference", "long", "Code review summaries should lead with risks and file references before nice-to-have cleanup."],
  ["preference", "long", "Shopping research should separate the cheapest good option from the best premium option."],
  ["preference", "long", "Restaurant picks should take reservations, be quiet enough for conversation, and avoid very late seatings."],
  ["preference", "short", "Today's task list should be sorted by urgency, not by project area."],
  ["relationship", "long", "The design lead cares most about spacing consistency, mobile screenshots, and whether empty states feel intentional."],
  ["relationship", "long", "The support lead wants the customer's exact wording quoted before a reply draft is written."],
  ["relationship", "long", "The operations contact wants receipts grouped by month and project before reimbursement is submitted."],
  ["relationship", "long", "Send the family group chat travel ETAs only after flight times are confirmed."],
  ["relationship", "short", "The launch FAQ owner is waiting on the final pricing answer before publishing the help-center draft."],
  ["project", "long", "Launch FAQ still needs answers for pricing, refunds, account deletion, data export, and webhook setup."],
  ["project", "long", "Beta feedback digest should group notes into onboarding confusion, notification trust, and missing integrations."],
  ["project", "long", "Billing cleanup has three open items: duplicate receipts, seat count mismatch, and tax settings."],
  ["project", "short", "Customer escalation reply needs the corrected incident window, mitigation status, and next update time."],
  ["project", "short", "Next team update should mention the shipped webhook fix, remaining setup friction, and current support queue volume."],
  ["project", "short", "Demo script should show a real before-and-after workflow instead of walking through every feature."],
  ["project", "long", "Hiring scorecard should emphasize writing clarity, product judgment, and comfort debugging ambiguous systems."],
  ["knowledge", "permanent", "Do not treat absence of a remembered fact as proof it is false; search memory first, then answer carefully."],
  ["knowledge", "long", "A draft is not sent until the user explicitly approves it, even when the content looks complete."],
  ["knowledge", "long", "For billing or legal commitments, summarize uncertainty and ask for confirmation before acting."],
  ["knowledge", "long", "Webhook-dependent workflows need both the active tunnel URL and the provider's registered URL checked."],
  ["knowledge", "long", "Travel plans should include date, local timezone, airport transfer, and cancellation deadline."],
  ["knowledge", "long", "Recurring automations should report when they skipped work because no new source material appeared."],
  ["knowledge", "short", "Focus block ends at 3 PM; do not interrupt it for non-urgent pings."],
  ["context", "short", "Morning brief should include urgent email, calendar pressure, open blockers, and pending drafts."],
  ["context", "short", "Tomorrow afternoon's calendar hold still needs an agenda and attendee list."],
  ["context", "short", "Reimbursement summary is due this week and should include travel, software, and meal receipts."],
  ["context", "short", "Latest customer reply draft needs a tone check for defensiveness before it is sent."],
  ["context", "short", "Grocery list should avoid ingredients already at home and keep weeknight meals under 30 minutes."],
  ["context", "short", "Next workout should be lower impact because the user's knee felt irritated after the last run."],
  ["context", "short", "Hotel comparison should prioritize sleep quality, walking distance, and cancellation policy over lobby amenities."],
  ["preference", "long", "When presenting calendar conflicts, explain the tradeoff and recommend which meeting to move."],
  ["preference", "long", "Financial summaries should include totals, what changed since last time, and anything needing approval."],
  ["preference", "long", "Use Markdown tables for compact comparisons, but use prose for final recommendations."],
  ["preference", "long", "For long documents, start with the short answer and then include a skim-friendly outline."],
  ["preference", "permanent", "Prefer a thoughtful caveat over a confident answer based on stale information."],
  ["preference", "long", "Leave a buffer after back-to-back calls before scheduling deep work."],
  ["relationship", "long", "Partner likes itinerary summaries with times, neighborhoods, and confirmation numbers hidden unless needed."],
  ["relationship", "short", "Contractor is waiting for feedback on the revised statement of work."],
  ["relationship", "short", "Finance contact prefers reimbursement packets as one organized PDF."],
  ["relationship", "long", "Customer success lead wants escalation summaries to include owner, severity, and promised follow-up time."],
  ["relationship", "long", "Editor prefers punchy first lines and fewer abstract claims in public posts."],
  ["project", "long", "Next public update should focus on workflow outcomes rather than listing every new setting."],
  ["project", "long", "Onboarding checklist should distinguish required setup from optional integrations."],
  ["project", "long", "Support macro refresh should remove apologetic filler and add clearer troubleshooting steps."],
  ["project", "short", "Bug bash is focused on login recovery, webhook setup, notification copy, and empty states."],
  ["project", "short", "Screenshots need to be checked on desktop and mobile before sharing the update."],
  ["project", "short", "Launch note should avoid saying 'AI-powered' unless the sentence explains the actual user benefit."],
  ["knowledge", "permanent", "Never include private customer details in public release notes or demo screenshots."],
  ["knowledge", "long", "If an automation finds sensitive content, summarize categories and ask before quoting details."],
  ["knowledge", "long", "Weekly digest should separate shipped work, decisions needed, blocked work, and follow-ups."],
  ["context", "short", "Package pickup reminder should fire before the building's evening cutoff."],
  ["context", "short", "Next status update should mention what was verified locally and what still needs review."],
  ["relationship", "long", "Partner prefers dinner around 7 PM, quiet seating, and no tasting menus on weeknights."],
  ["project", "long", "Investor update still needs MRR, churn, hiring, and runway sections checked against source numbers."],
  ["preference", "long", "For flights under four hours, prefer nonstop economy aisle over a cheaper connection."],
  ["preference", "permanent", "For customer escalations, acknowledge the specific failure first, then explain the fix and next check-in time."],
  ["context", "short", "Protect a 90-minute writing block before the afternoon call today."],
  ["project", "short", "Renewal reply should acknowledge the missed deadline first, then propose the make-good and next check-in."],
] satisfies Array<[MemorySegment, MemoryTier, string]>;

type DemoMemoryTopic =
  | "launch"
  | "customer-care"
  | "daily-rhythm"
  | "people"
  | "travel"
  | "home-life"
  | "wellbeing"
  | "principles";

const demoMemoryTopicRules: Array<[DemoMemoryTopic, RegExp]> = [
  ["wellbeing", /workout|knee|shoulder|warmup|run|lower impact|health/i],
  ["travel", /travel|flight|hotel|airport|itinerary|aisle|nonstop|cancellation/i],
  ["home-life", /grocery|errand|package|dinner|restaurant|weekend|meal|neighborhood/i],
  [
    "people",
    /partner|family|design lead|support lead|operations contact|contractor|finance contact|customer success lead|stakeholder/i,
  ],
  ["customer-care", /customer|support|escalation|reply|draft|public post|copy|editor/i],
  [
    "launch",
    /launch|beta|dashboard|onboarding|release|pricing|webhook|bug bash|screenshots?|product|billing|implementation|software team|code review/i,
  ],
  [
    "daily-rhythm",
    /calendar|meeting|schedule|timezone|friday|focus block|deep work|morning brief|status update|weekly digest|automation|evenings? after/i,
  ],
];

function demoMemoryTopic(row: MemoryTemplate): DemoMemoryTopic {
  return demoMemoryTopicRules.find(([, pattern]) => pattern.test(row.content))?.[0] ?? "principles";
}

function demoMemoryGraphLabel(row: MemoryTemplate): string {
  if (row.graphLabel) return row.graphLabel;
  const labelRules: Array<[RegExp, string]> = [
    [/billing cleanup/i, "Billing cleanup"],
    [/customer success lead/i, "Escalation handoffs"],
    [/grocery list/i, "Fast weeknight meals"],
    [/hotel comparison/i, "Walkable, flexible hotels"],
    [/weekly digest/i, "Structured weekly digest"],
    [/package pickup/i, "Package cutoff"],
    [/latest customer reply/i, "Tone-check the draft"],
    [/status updates should/i, "Actionable status updates"],
    [/beta feedback digest/i, "Beta feedback themes"],
    [/launch faq/i, "Launch FAQ"],
  ];
  const matchedLabel = labelRules.find(([pattern]) => pattern.test(row.content))?.[1];
  if (matchedLabel) return matchedLabel;
  const cleaned = row.content
    .replace(/^(the user|user|current|latest|next)\s+/i, "")
    .replace(/^(for|when|if)\s+/i, "")
    .replace(/[.:;,]+$/g, "")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  const label = words.slice(0, 5).join(" ");
  return words.length > 5 ? `${label}...` : label;
}

const automationSeeds = [
  {
    id: "demo:auto:morning-command-center",
    name: "Morning command center",
    task: "Summarize calendar, priority email, launch blockers, and memories before the first meeting.",
    integrations: ["gmail", "googlecalendar", "linear", "boop_memory"],
    schedule: "RRULE:FREQ=DAILY;BYHOUR=8;BYMINUTE=15",
  },
  {
    id: "demo:auto:customer-escalation-watch",
    name: "Customer escalation watch",
    task: "Watch Gmail and Slack for escalation language and prepare a draft reply with source links.",
    integrations: ["gmail", "slack", "notion"],
    schedule: "RRULE:FREQ=HOURLY;INTERVAL=2",
  },
  {
    id: "demo:auto:launch-blocker-sweep",
    name: "Launch blocker sweep",
    task: "Check Linear and GitHub for launch blockers and summarize owner, severity, and next action.",
    integrations: ["linear", "github"],
    schedule: "RRULE:FREQ=DAILY;BYHOUR=16;BYMINUTE=30",
  },
  {
    id: "demo:auto:memory-consolidation",
    name: "Memory consolidation",
    task: "Review recent memories, merge duplicates, prune stale short-term facts, and promote durable preferences.",
    integrations: ["boop_memory"],
    schedule: "RRULE:FREQ=DAILY;BYHOUR=23;BYMINUTE=10",
  },
  {
    id: "demo:auto:weekly-design-qa",
    name: "Weekly design QA",
    task: "Audit dashboard screenshots for layout regressions, stale copy, and empty-state quality.",
    integrations: ["github", "figma"],
    schedule: "RRULE:FREQ=WEEKLY;BYDAY=FR;BYHOUR=14;BYMINUTE=0",
  },
  {
    id: "demo:auto:receipt-roundup",
    name: "Receipt roundup",
    task: "Find recent receipts, group by project, and prepare a reimbursement summary.",
    integrations: ["gmail", "googledrive"],
    schedule: "RRULE:FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=45",
  },
  {
    id: "demo:auto:beta-feedback-digest",
    name: "Beta feedback digest",
    task: "Cluster Slack and Notion feedback into themes and create Linear follow-up issues.",
    integrations: ["slack", "notion", "linear"],
    schedule: "RRULE:FREQ=DAILY;BYHOUR=17;BYMINUTE=20",
  },
  {
    id: "demo:auto:end-of-day-digest",
    name: "End-of-day digest",
    task: "Summarize shipped work, open blockers, pending drafts, and tomorrow's calendar pressure.",
    integrations: ["gmail", "googlecalendar", "linear", "slack"],
    schedule: "RRULE:FREQ=DAILY;BYHOUR=18;BYMINUTE=0",
  },
];

async function seedConversations(ctx: MutationCtx, now: number) {
  let messageCount = 0;
  for (const [conversationIndex, conversation] of conversationSeeds.entries()) {
    const snippets = messageSnippets[conversationIndex]!;
    await ctx.db.insert("conversations", {
      conversationId: conversation.id,
      title: conversation.title,
      summary: conversation.summary,
      messageCount: snippets.length,
      lastActivityAt: ago(now, conversationIndex, 8 * MINUTE),
    });

    for (const [messageIndex, content] of snippets.entries()) {
      await ctx.db.insert("messages", {
        conversationId: conversation.id,
        role: messageIndex % 2 === 0 ? "user" : "assistant",
        content,
        agentId:
          messageIndex % 2 === 1
            ? `demo:agent:${String(conversationIndex * 7 + messageIndex).padStart(2, "0")}`
            : undefined,
        turnId: `demo:turn:${conversationIndex}-${messageIndex}`,
        createdAt: ago(now, conversationIndex, (snippets.length - messageIndex) * 11 * MINUTE),
      });
      messageCount += 1;
    }
  }
  return { conversations: conversationSeeds.length, messages: messageCount };
}

type DemoLogRow = {
  logType: "thinking" | "tool_use" | "tool_result" | "text" | "error";
  toolName?: string;
  accounts?: string[];
  content: string;
};

function demoToolForIntegration(integration: string): string {
  const normalized = integration.toLowerCase();
  const map: Record<string, string> = {
    gmail: "mcp__gmail__search_email",
    googlecalendar: "mcp__googlecalendar__list_events",
    linear: "mcp__linear__search_issues",
    slack: "mcp__slack__search_messages",
    notion: "mcp__notion__search",
    github: "mcp__github__search_code",
    googledrive: "mcp__googledrive__search",
    googledocs: "mcp__googledocs__fetch",
    googlesheets: "mcp__googlesheets__read",
    imessage: "mcp__imessage__read_messages",
    "apple-notes": "mcp__apple-notes__search_notes",
    "apple-reminders": "mcp__apple-reminders__list_reminders",
    boop_memory: "mcp__boop-memory__recall",
    boop_usage: "mcp__boop-usage__summary",
  };
  return map[normalized] ?? `mcp__${normalized.replace(/[^a-z0-9]+/g, "_")}__search`;
}

function demoAccountForIntegration(integration: string): string {
  const normalized = integration.toLowerCase();
  const map: Record<string, string> = {
    gmail: "primary_inbox_demo",
    googlecalendar: "work_calendar_demo",
    linear: "product_workspace_demo",
    slack: "team_workspace_demo",
    notion: "launch_workspace_demo",
    github: "engineering_org_demo",
    googledrive: "shared_drive_demo",
    googledocs: "shared_drive_demo",
    googlesheets: "shared_drive_demo",
    imessage: "local_messages_demo",
    "apple-notes": "local_notes_demo",
    "apple-reminders": "local_reminders_demo",
    boop_memory: "boop_memory_demo",
    boop_usage: "boop_usage_demo",
  };
  return map[normalized] ?? `${normalized.replace(/[^a-z0-9]+/g, "_")}_demo`;
}

function demoToolResultText(template: AgentTemplate, integration: string, status: AgentStatus) {
  if (status === "failed") {
    return `Partial ${integration} result returned before the retryable failure. Kept successful evidence attached to the run.`;
  }
  const displayNames: Record<string, string> = {
    gmail: "Gmail",
    googlecalendar: "Google Calendar",
    linear: "Linear",
    slack: "Slack",
    notion: "Notion",
    github: "GitHub",
    googledrive: "Google Drive",
    googledocs: "Google Docs",
    googlesheets: "Google Sheets",
    imessage: "iMessage",
    "apple-notes": "Apple Notes",
    "apple-reminders": "Apple Reminders",
    boop_memory: "Boop memory",
    boop_usage: "Boop usage",
  };
  const subject = displayNames[integration] ?? integration.replace(/[_-]+/g, " ");
  return `${subject} returned relevant context for "${template.name}". ${template.result}`;
}

function shouldShowDelegation(template: AgentTemplate, index: number): boolean {
  return (
    template.name === "Product review command center" ||
    template.name.includes("command center") ||
    (template.integrations.length >= 3 && index % 4 === 0)
  );
}

async function seedAgentsAndLogs(ctx: MutationCtx, now: number) {
  const statuses: AgentStatus[] = [
    "completed",
    "completed",
    "running",
    "completed",
    "completed",
    "completed",
    "completed",
    "completed",
    "spawned",
    "completed",
    "completed",
    "failed",
  ];
  let logs = 0;

  for (const [index, template] of agentTemplates.entries()) {
    const agentId = `demo:agent:${String(index + 1).padStart(2, "0")}`;
    const runtime: Runtime = index % 3 === 0 || index % 3 === 1 ? "codex" : "claude";
    const billingMode: BillingMode = runtime === "codex" ? "codex-subscription" : "api";
    const status = template.status ?? pick(statuses, index);
    const isActive = status === "running" || status === "spawned";
    const startedAt = isActive
      ? now - (45 + (index % 6) * 34) * 1000
      : ago(now, Math.floor(index / 3), (index % 3) * 2 * HOUR + 12 * MINUTE);
    const duration = (35 + (index % 8) * 19) * 1000;
    const completedAt =
      status === "completed" || status === "failed" || status === "cancelled"
        ? startedAt + duration
        : undefined;
    const inputTokens = 1800 + index * 413 + template.integrations.length * 240;
    const outputTokens = 520 + index * 97;
    const cacheReadTokens = index % 2 === 0 ? 800 + index * 33 : 0;
    const cacheCreationTokens = index % 5 === 0 ? 120 + index * 9 : 0;
    const costUsd = compactNumber(
      runtime === "codex"
        ? (inputTokens + outputTokens) / 1_000_000 * 6.5
        : (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15,
    );

    await ctx.db.insert("executionAgents", {
      agentId,
      conversationId: template.conversationId,
      name: template.name,
      task: template.task,
      runtime,
      model:
        runtime === "codex"
          ? pick(["gpt-5.5", "gpt-5.4", "gpt-5.3-codex"], index)
          : pick(["claude-sonnet-4-6", "claude-opus-4-7", "claude-haiku-4-5-20251001"], index),
      reasoningEffort: runtime === "codex" ? pick(["medium", "high", "xhigh"], index) : undefined,
      billingMode,
      status,
      result: status === "completed" ? template.result : undefined,
      error:
        status === "failed"
          ? (template.error ??
            `The ${template.integrations[0] ?? "primary"} call returned a retryable demo error after partial progress.`)
          : undefined,
      mcpServers: template.integrations,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
      costUsd,
      startedAt,
      completedAt,
    });

    const baseLogTime = startedAt + 250;
    const primaryIntegration = template.integrations[0] ?? "boop_memory";
    const secondaryIntegration = template.integrations[1] ?? primaryIntegration;
    const primaryAccount = demoAccountForIntegration(primaryIntegration);
    const secondaryAccount = demoAccountForIntegration(secondaryIntegration);
    const contextTool = "mcp__boop-memory__recall";
    const secondaryTool = demoToolForIntegration(secondaryIntegration);
    const delegationRows: DemoLogRow[] = shouldShowDelegation(template, index)
      ? [
          {
            logType: "tool_use",
            toolName: "spawn_agent",
            accounts: ["boop_runtime_demo"],
            content: JSON.stringify({
              name: "Delegated evidence sweep",
              task:
                "Spawn focused sub-agents for inbox evidence, calendar pressure, launch blockers, and customer reply drafting.",
              integrations: template.integrations.slice(0, 5),
            }),
          },
          {
            logType: "tool_result",
            toolName: "spawn_agent",
            accounts: ["boop_runtime_demo"],
            content: JSON.stringify({
              successful: true,
              data: {
                results:
                  "Spawned sub-agents: Inbox evidence pack, Calendar pressure map, Launch blocker sweep, and Customer reply polish. All returned source-backed summaries.",
              },
              spawnedAgents: [
                "demo:agent:29",
                "demo:agent:30",
                "demo:agent:31",
                "demo:agent:32",
              ],
            }),
          },
        ]
      : [];

    const logRows: DemoLogRow[] = [
      {
        logType: "thinking" as const,
        content: `Planning ${template.integrations.join(", ")} calls, checking durable memories, and deciding whether a focused sub-agent should own any part of the work.\n`,
      },
      {
        logType: "tool_use",
        toolName: contextTool,
        accounts: ["boop_memory_demo"],
        content: JSON.stringify({
          query: template.task,
          limit: 6,
          includeSegments: ["preference", "project", "context"],
        }),
      },
      {
        logType: "tool_result",
        toolName: contextTool,
        accounts: ["boop_memory_demo"],
        content: JSON.stringify({
          successful: true,
          data: {
            results:
              "Recalled: keep drafts pending for approval; lead with the recommended action; protect the 90-minute writing block; group launch blockers by owner.",
          },
        }),
      },
      ...delegationRows,
      {
        logType: "tool_use" as const,
        toolName: template.tool,
        accounts: [primaryAccount],
        content: JSON.stringify({
          query: template.query,
          limit: 10,
          account: primaryAccount,
        }),
      },
      {
        logType: "tool_result" as const,
        toolName: template.tool,
        accounts: [primaryAccount],
        content: JSON.stringify({
          successful: status !== "failed",
          data: {
            results: demoToolResultText(template, primaryIntegration, status),
          },
          source: primaryIntegration,
        }),
      },
      {
        logType: "tool_use" as const,
        toolName: secondaryTool,
        accounts: [secondaryAccount],
        content: JSON.stringify({
          query: template.task,
          limit: 5,
          account: secondaryAccount,
        }),
      },
      {
        logType: "tool_result" as const,
        toolName: secondaryTool,
        accounts: [secondaryAccount],
        content: JSON.stringify({
          successful: true,
          data: {
            results: demoToolResultText(template, secondaryIntegration, "completed"),
          },
          source: secondaryIntegration,
        }),
      },
      {
        logType: status === "failed" ? ("error" as const) : ("text" as const),
        content:
          status === "failed"
            ? `Stopped after partial progress: ${template.error ?? "demo retryable provider error"}`
            : template.result,
      },
    ];

    if (status === "running") {
      logRows.push({
        logType: "thinking",
        content: "Still streaming tool output and waiting on the final provider response.\n",
      });
    }

    for (const [logIndex, row] of logRows.entries()) {
      await ctx.db.insert("agentLogs", {
        agentId,
        logType: row.logType,
        toolName: row.toolName,
        accounts: row.accounts,
        content: row.content,
        createdAt: baseLogTime + logIndex * 1350,
      });
      logs += 1;
    }
  }

  return { agents: agentTemplates.length, agentLogs: logs };
}

async function seedMemories(ctx: MutationCtx, now: number) {
  const rows: MemoryTemplate[] = [
    ...memoryTemplates,
    ...memoryFillers.map(([segment, tier, content], index) => ({
      content,
      segment,
      tier,
      importance: compactNumber(0.54 + (index % 8) * 0.045, 2),
    })),
  ];
  const seededRows = Array.from({ length: 72 }, (_, index) => pick(rows, index));
  const topics = seededRows.map((row) => demoMemoryTopic(row));
  const memoryIdsByTopic = new Map<DemoMemoryTopic, string[]>();
  topics.forEach((topic, index) => {
    const memoryIds = memoryIdsByTopic.get(topic) ?? [];
    memoryIds.push(`demo:mem:${String(index + 1).padStart(3, "0")}`);
    memoryIdsByTopic.set(topic, memoryIds);
  });

  let memories = 0;
  for (let index = 0; index < seededRows.length; index += 1) {
    const row = seededRows[index]!;
    const topic = topics[index]!;
    const topicMemoryIds = memoryIdsByTopic.get(topic) ?? [];
    const topicIndex = topicMemoryIds.indexOf(`demo:mem:${String(index + 1).padStart(3, "0")}`);
    const relatedMemoryIds = [
      topicMemoryIds[topicIndex - 1],
      topicMemoryIds[topicIndex + 1],
    ].filter((memoryId): memoryId is string => Boolean(memoryId));
    const lifecycle = index % 23 === 0 ? "archived" : index % 31 === 0 ? "pruned" : "active";
    await ctx.db.insert("memoryRecords", {
      memoryId: `demo:mem:${String(index + 1).padStart(3, "0")}`,
      content: row.content,
      tier: row.tier,
      segment: row.segment,
      importance: row.importance,
      decayRate: compactNumber(0.01 + (index % 7) * 0.006, 3),
      accessCount: (index * 7) % 29,
      lastAccessedAt: ago(now, index % 10, (index % 6) * 33 * MINUTE),
      sourceTurn: `demo:turn:${topic}:${index % 4}`,
      lifecycle,
      embedding: demoEmbedding(row.content),
      supersedes:
        index % 17 === 0 && index > 0
          ? [`demo:mem:${String(index).padStart(3, "0")}`]
          : undefined,
      metadata: JSON.stringify({
        demo: true,
        confidence: compactNumber(0.72 + (index % 9) * 0.025, 2),
        source: pick(["iMessage", "Gmail", "Calendar", "Linear", "Consolidation"], index),
        graph: {
          topic,
          label: demoMemoryGraphLabel(row),
          relatedMemoryIds,
        },
      }),
      createdAt: ago(now, Math.floor(index / 6), (index % 6) * 41 * MINUTE),
    });
    memories += 1;
  }
  return { memories };
}

async function seedMemoryEvents(ctx: MutationCtx, now: number) {
  const eventTypes = [
    "memory.extracted",
    "memory.recalled",
    "memory.written",
    "memory.promoted",
    "memory.merged",
    "memory.pruned",
    "consolidation.proposed",
    "consolidation.applied",
  ];
  const eventCopy = [
    "Extracted a scheduling preference from the product-review thread.",
    "Recalled launch-week blockers for the command-center agent.",
    "Wrote a short-term reminder for the package pickup cutoff.",
    "Promoted the draft-approval rule after repeated confirmations.",
    "Merged duplicate memories about customer escalation reply tone.",
    "Pruned an expired calendar hold after the meeting window passed.",
    "Proposed consolidation of overlapping launch checklist memories.",
    "Applied memory cleanup and preserved source-linked evidence.",
  ];
  let memoryEvents = 0;
  for (let index = 0; index < 128; index += 1) {
    const memoryId = `demo:mem:${String((index % 72) + 1).padStart(3, "0")}`;
    const eventType = pick(eventTypes, index);
    await ctx.db.insert("memoryEvents", {
      eventType,
      conversationId: pick(conversationSeeds, index).id,
      memoryId,
      agentId: `demo:agent:${String((index % agentTemplates.length) + 1).padStart(2, "0")}`,
      data: `${pick(eventCopy, index)} Score ${compactNumber(0.61 + (index % 20) * 0.017, 3)}.`,
      createdAt: ago(now, Math.floor(index / 10), (index % 10) * 17 * MINUTE),
    });
    memoryEvents += 1;
  }
  return { memoryEvents };
}

async function seedAutomations(ctx: MutationCtx, now: number) {
  let automationRuns = 0;
  for (const [index, automation] of automationSeeds.entries()) {
    await ctx.db.insert("automations", {
      automationId: automation.id,
      name: automation.name,
      task: automation.task,
      integrations: automation.integrations,
      schedule: automation.schedule,
      timezone: "America/Chicago",
      enabled: index !== 5,
      conversationId: pick(conversationSeeds, index).id,
      notifyConversationId: pick(conversationSeeds, index + 1).id,
      lastRunAt: ago(now, index % 5, (index + 1) * 49 * MINUTE),
      nextRunAt: now + (index + 1) * 2 * HOUR,
      createdAt: ago(now, 16 + index, index * HOUR),
    });

    for (let runIndex = 0; runIndex < 6; runIndex += 1) {
      const status: AutomationRunStatus =
        runIndex === 0 && index % 4 === 0 ? "running" : runIndex === 3 && index % 3 === 0 ? "failed" : "completed";
      const startedAt = ago(now, runIndex + index, (index % 4) * 37 * MINUTE);
      await ctx.db.insert("automationRuns", {
        runId: `demo:auto-run:${index + 1}:${runIndex + 1}`,
        automationId: automation.id,
        status,
        result:
          status === "completed"
            ? `${automation.name} completed. Checked ${automation.integrations.join(", ")} and produced a concise summary.`
            : undefined,
        error:
          status === "failed"
            ? `${pick(automation.integrations, runIndex)} rate limit in demo data after partial progress.`
            : undefined,
        agentId: `demo:agent:${String(((index + runIndex) % agentTemplates.length) + 1).padStart(2, "0")}`,
        startedAt,
        completedAt: status === "running" ? undefined : startedAt + (45 + runIndex * 11) * 1000,
      });
      automationRuns += 1;
    }
  }
  return { automations: automationSeeds.length, automationRuns };
}

async function seedConsolidationRuns(ctx: MutationCtx, now: number) {
  const triggers = [
    "daily-schedule",
    "after-72-memory-writes",
    "manual-demo-seed",
    "nightly-cleanup",
    "high-duplication-score",
    "post-launch-feedback",
    "short-term-prune",
  ];
  let consolidationRuns = 0;

  for (let index = 0; index < triggers.length; index += 1) {
    const status: ConsolidationStatus = index === 0 ? "running" : index === 4 ? "failed" : "completed";
    const startedAt = ago(now, index, 58 * MINUTE + index * 12 * MINUTE);
    const proposalsCount = 12 + index * 3;
    await ctx.db.insert("consolidationRuns", {
      runId: `demo:consolidation:${String(index + 1).padStart(2, "0")}`,
      trigger: triggers[index]!,
      status,
      proposalsCount,
      mergedCount: status === "completed" ? 4 + (index % 4) : 0,
      prunedCount: status === "completed" ? 6 + index : 0,
      notes:
        status === "failed"
          ? "Demo adversary pass rejected the proposal set because source evidence was incomplete."
          : "Reviewed duplicate project memories, durable preferences, and stale short-term context.",
      details: JSON.stringify({
        demo: true,
        proposals: [
          {
            action: "merge",
            memoryIds: ["demo:mem:001", "demo:mem:008", "demo:mem:012"],
            reason: "Duplicate dashboard visual preference across recent turns.",
          },
          {
            action: "promote",
            memoryIds: ["demo:mem:002", "demo:mem:003"],
            reason: "Stable user preference with repeated supporting evidence.",
          },
          {
            action: "prune",
            memoryIds: ["demo:mem:031", "demo:mem:044"],
            reason: "Expired calendar context after the meeting window passed.",
          },
        ],
        decisions: [
          { proposal: 1, decision: status === "failed" ? "defer" : "apply" },
          { proposal: 2, decision: "apply" },
          { proposal: 3, decision: status === "running" ? "pending" : "apply" },
        ],
        applied: status === "completed" ? ["merge", "promote", "prune"] : [],
      }),
      startedAt,
      completedAt: status === "running" ? undefined : startedAt + (74 + index * 13) * 1000,
    });
    consolidationRuns += 1;
  }
  return { consolidationRuns };
}

async function seedUsageRecords(ctx: MutationCtx, now: number) {
  const sources: UsageSource[] = [
    "dispatcher",
    "execution",
    "extract",
    "consolidation-proposer",
    "consolidation-adversary",
    "consolidation-judge",
    "proactive",
  ];
  let usageRecords = 0;
  for (let index = 0; index < 140; index += 1) {
    const runtime: Runtime = index % 4 === 0 ? "claude" : "codex";
    const inputTokens = 420 + ((index * 317) % 9400);
    const outputTokens = 180 + ((index * 151) % 2800);
    const cacheReadTokens = index % 3 === 0 ? 300 + ((index * 41) % 2100) : 0;
    const cacheCreationTokens = index % 9 === 0 ? 120 + ((index * 19) % 800) : 0;
    const costUsd = compactNumber(
      runtime === "codex"
        ? (inputTokens + outputTokens + cacheCreationTokens) / 1_000_000 * 6.5
        : (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15,
    );

    await ctx.db.insert("usageRecords", {
      source: pick(sources, index),
      conversationId: pick(conversationSeeds, index).id,
      turnId: `demo:turn:${index % conversationSeeds.length}-${index % 8}`,
      agentId: `demo:agent:${String((index % agentTemplates.length) + 1).padStart(2, "0")}`,
      runId:
        index % 5 === 0
          ? `demo:auto-run:${(index % automationSeeds.length) + 1}:${(index % 6) + 1}`
          : undefined,
      runtime,
      billingMode: runtime === "codex" ? "codex-subscription" : "api",
      model:
        runtime === "codex"
          ? pick(["gpt-5.5", "gpt-5.4", "gpt-5.3-codex"], index)
          : pick(["claude-sonnet-4-6", "claude-opus-4-7"], index),
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
      costUsd,
      durationMs: 650 + ((index * 197) % 12_000),
      createdAt: ago(now, Math.floor(index / 10), (index % 10) * 22 * MINUTE),
    });
    usageRecords += 1;
  }
  return { usageRecords };
}

async function seedDemoData(ctx: MutationCtx) {
  const now = Date.now();
  const counts: DemoCounts = {
    conversations: 0,
    messages: 0,
    agents: 0,
    agentLogs: 0,
    memories: 0,
    memoryEvents: 0,
    automations: 0,
    automationRuns: 0,
    consolidationRuns: 0,
    usageRecords: 0,
  };

  Object.assign(counts, await seedConversations(ctx, now));
  Object.assign(counts, await seedAgentsAndLogs(ctx, now));
  Object.assign(counts, await seedMemories(ctx, now));
  Object.assign(counts, await seedMemoryEvents(ctx, now));
  Object.assign(counts, await seedAutomations(ctx, now));
  Object.assign(counts, await seedConsolidationRuns(ctx, now));
  Object.assign(counts, await seedUsageRecords(ctx, now));
  return counts;
}

export const status = query({
  args: {},
  handler: async (ctx) => {
    // Status is mounted as a live subscription at the app root. Keep its read
    // set restricted to these two tiny settings documents so writes to
    // messages, agent logs, memories, and other operational tables cannot
    // invalidate a ten-table scan.
    const [setting, counts] = await Promise.all([
      readDemoSetting(ctx),
      readDemoCountsSetting(ctx),
    ]);
    const enabled = setting === "true";
    const total = counts ? totalDemoRows(counts) : null;
    return {
      enabled,
      // Deployments created before the persisted summary was introduced have
      // no counts row. setMode seeds atomically with the enabled setting, so
      // the enabled flag is the safe legacy indication that data was seeded.
      seeded: total === null ? enabled : total > 0,
      counts,
      total,
      scanLimit: null,
    };
  },
});

export const setMode = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, args) => {
    const removed = await deleteDemoRows(ctx);
    const seeded = args.enabled ? await seedDemoData(ctx) : null;
    const counts = seeded ?? emptyDemoCounts();
    await setDemoCountsSetting(ctx, counts);
    await setDemoSetting(ctx, args.enabled);
    return {
      enabled: args.enabled,
      removed,
      seeded,
      counts,
      total: totalDemoRows(counts),
    };
  },
});
