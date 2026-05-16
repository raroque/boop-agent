import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";

const DEMO_PREFIX = "demo:";
const DEMO_SETTING_KEY = "debug_demo_mode";
const SCAN_LIMIT = 5000;
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

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

interface AgentTemplate {
  name: string;
  task: string;
  result: string;
  error?: string;
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
}

function isDemoId(value?: string | null): boolean {
  return typeof value === "string" && value.startsWith(DEMO_PREFIX);
}

function ago(now: number, days: number, offset = 0): number {
  return now - days * DAY - offset;
}

function compactNumber(value: number, precision = 4): number {
  return Number(value.toFixed(precision));
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

async function demoCounts(ctx: QueryCtx | MutationCtx): Promise<DemoCounts> {
  const [
    conversations,
    messages,
    agents,
    agentLogs,
    memories,
    memoryEvents,
    automations,
    automationRuns,
    consolidationRuns,
    usageRecords,
  ] = await Promise.all([
    ctx.db.query("conversations").order("desc").take(SCAN_LIMIT),
    ctx.db.query("messages").order("desc").take(SCAN_LIMIT),
    ctx.db.query("executionAgents").order("desc").take(SCAN_LIMIT),
    ctx.db.query("agentLogs").order("desc").take(SCAN_LIMIT),
    ctx.db.query("memoryRecords").order("desc").take(SCAN_LIMIT),
    ctx.db.query("memoryEvents").order("desc").take(SCAN_LIMIT),
    ctx.db.query("automations").order("desc").take(SCAN_LIMIT),
    ctx.db.query("automationRuns").order("desc").take(SCAN_LIMIT),
    ctx.db.query("consolidationRuns").order("desc").take(SCAN_LIMIT),
    ctx.db.query("usageRecords").order("desc").take(SCAN_LIMIT),
  ]);

  return {
    conversations: conversations.filter((r) => isDemoId(r.conversationId)).length,
    messages: messages.filter((r) => isDemoId(r.conversationId) || isDemoId(r.agentId)).length,
    agents: agents.filter((r) => isDemoId(r.agentId)).length,
    agentLogs: agentLogs.filter((r) => isDemoId(r.agentId)).length,
    memories: memories.filter((r) => isDemoId(r.memoryId)).length,
    memoryEvents: memoryEvents.filter(
      (r) => isDemoId(r.conversationId) || isDemoId(r.memoryId) || isDemoId(r.agentId),
    ).length,
    automations: automations.filter((r) => isDemoId(r.automationId)).length,
    automationRuns: automationRuns.filter(
      (r) => isDemoId(r.runId) || isDemoId(r.automationId) || isDemoId(r.agentId),
    ).length,
    consolidationRuns: consolidationRuns.filter((r) => isDemoId(r.runId)).length,
    usageRecords: usageRecords.filter(
      (r) => isDemoId(r.conversationId) || isDemoId(r.agentId) || isDemoId(r.runId),
    ).length,
  };
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

  const agentLogs = await ctx.db.query("agentLogs").order("desc").take(SCAN_LIMIT);
  for (const row of agentLogs) {
    if (!isDemoId(row.agentId)) continue;
    await ctx.db.delete(row._id);
    counts.agentLogs += 1;
  }

  const automationRuns = await ctx.db.query("automationRuns").order("desc").take(SCAN_LIMIT);
  for (const row of automationRuns) {
    if (!isDemoId(row.runId) && !isDemoId(row.automationId) && !isDemoId(row.agentId)) {
      continue;
    }
    await ctx.db.delete(row._id);
    counts.automationRuns += 1;
  }

  const usageRecords = await ctx.db.query("usageRecords").order("desc").take(SCAN_LIMIT);
  for (const row of usageRecords) {
    if (!isDemoId(row.conversationId) && !isDemoId(row.agentId) && !isDemoId(row.runId)) {
      continue;
    }
    await ctx.db.delete(row._id);
    counts.usageRecords += 1;
  }

  const memoryEvents = await ctx.db.query("memoryEvents").order("desc").take(SCAN_LIMIT);
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
    .take(SCAN_LIMIT);
  for (const row of consolidationRuns) {
    if (!isDemoId(row.runId)) continue;
    await ctx.db.delete(row._id);
    counts.consolidationRuns += 1;
  }

  const agents = await ctx.db.query("executionAgents").order("desc").take(SCAN_LIMIT);
  for (const row of agents) {
    if (!isDemoId(row.agentId)) continue;
    await ctx.db.delete(row._id);
    counts.agents += 1;
  }

  const memories = await ctx.db.query("memoryRecords").order("desc").take(SCAN_LIMIT);
  for (const row of memories) {
    if (!isDemoId(row.memoryId)) continue;
    await ctx.db.delete(row._id);
    counts.memories += 1;
  }

  const automations = await ctx.db.query("automations").order("desc").take(SCAN_LIMIT);
  for (const row of automations) {
    if (!isDemoId(row.automationId)) continue;
    await ctx.db.delete(row._id);
    counts.automations += 1;
  }

  const messages = await ctx.db.query("messages").order("desc").take(SCAN_LIMIT);
  for (const row of messages) {
    if (!isDemoId(row.conversationId) && !isDemoId(row.agentId)) continue;
    await ctx.db.delete(row._id);
    counts.messages += 1;
  }

  const conversations = await ctx.db.query("conversations").order("desc").take(SCAN_LIMIT);
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
      "Recalled 6 memories: no early Friday meetings, Amie-like dashboard style, concise briefs, and launch-week stakeholders.",
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
];

const memoryTemplates: MemoryTemplate[] = [
  {
    content:
      "The debug dashboard redesign should feel like a calm productivity desktop app, with the left side as the app background and the right side as the main container.",
    segment: "project",
    tier: "permanent",
    importance: 0.96,
  },
  {
    content:
      "Use Geist Sans for interface text and Geist Mono for debug values, IDs, costs, and token counts.",
    segment: "preference",
    tier: "permanent",
    importance: 0.91,
  },
  {
    content:
      "The user prefers compact, direct engineering communication without cheerleading or generic filler.",
    segment: "preference",
    tier: "permanent",
    importance: 0.93,
  },
  {
    content:
      "Avoid meetings before 9:30 AM on Fridays unless the user explicitly approves the exception.",
    segment: "preference",
    tier: "long",
    importance: 0.88,
  },
  {
    content:
      "Launch week owners: backend owns webhook retry policy, design owns dashboard QA, and support owns customer follow-up drafts.",
    segment: "relationship",
    tier: "long",
    importance: 0.79,
  },
  {
    content:
      "The beta feedback summary should cite source Slack messages and group themes by calendar trust, memory explainability, and connection recovery.",
    segment: "project",
    tier: "long",
    importance: 0.82,
  },
  {
    content:
      "If an automation writes a customer draft, it should leave the draft pending unless the user has pre-approved that exact workflow.",
    segment: "knowledge",
    tier: "permanent",
    importance: 0.87,
  },
  {
    content:
      "The user likes very rounded controls for segmented switches and toggles, but dashboard cards should be slightly less rounded.",
    segment: "preference",
    tier: "long",
    importance: 0.83,
  },
  {
    content:
      "The top-right model badge should show both provider logo and model name, while connection health can live under the logo on the left.",
    segment: "project",
    tier: "long",
    importance: 0.81,
  },
  {
    content:
      "When demo mode is enabled, fake data must stay namespaced so it can be removed without touching real user data.",
    segment: "knowledge",
    tier: "permanent",
    importance: 0.9,
  },
  {
    content:
      "For dashboard previews, agents should include detailed tool_use and tool_result logs so the detail screen does not look empty.",
    segment: "project",
    tier: "long",
    importance: 0.84,
  },
  {
    content:
      "The user wants Settings, Connections, Memories, Events, Automations, and Consolidation to all share the same visual language.",
    segment: "project",
    tier: "long",
    importance: 0.86,
  },
];

const memoryFillers = [
  ["context", "short", "The last dashboard preview was on localhost:5174 and the user was reviewing it in the in-app browser."],
  ["project", "short", "The right-side panel should be flush to the top, right, and bottom edges without a visible right gutter."],
  ["knowledge", "long", "Tool traces are stored in agentLogs and rendered as a timeline on the agent detail screen."],
  ["context", "short", "The connection screen should distinguish connected, stale, and action-required account states."],
  ["preference", "long", "Use icons for recognisable actions instead of text-only controls when a familiar symbol is available."],
  ["project", "short", "Agent Health should avoid placeholder metrics that do not map to real product concepts."],
  ["knowledge", "long", "Memory records can be filtered by tier and segment, and active records power the dashboard memory counts."],
  ["relationship", "long", "The product review attendees usually include the requester, the backend owner, the design owner, the support owner, and a rotating support lead."],
  ["context", "short", "The latest customer escalation is about delayed webhook retry recovery and needs a short factual reply."],
  ["identity", "permanent", "The user is building a personal agent workflow around iMessage, memory, automations, and integrations."],
  ["project", "long", "Demo data should include enough automation runs to test completed, failed, and running states."],
  ["knowledge", "long", "Consolidation runs store a JSON details blob with proposals, decisions, and applied changes."],
  ["preference", "permanent", "The user prefers dense but organized operational dashboards over decorative marketing layouts."],
  ["context", "short", "The morning brief should call out urgent email, calendar pressure, open blockers, and pending drafts."],
  ["project", "long", "The dashboard uses Google favicon service for integration logos so the app does not need bundled brand assets."],
  ["knowledge", "long", "Usage records are append-only rows and drive cost and token summaries in the dashboard charts."],
  ["relationship", "long", "The backend owner should be pinged only after the retry reproduction notes are complete."],
  ["context", "short", "The hotel hold expires tomorrow evening and should be checked before the end-of-day digest."],
] satisfies Array<[MemorySegment, MemoryTier, string]>;

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

async function seedAgentsAndLogs(ctx: MutationCtx, now: number) {
  const statuses: AgentStatus[] = [
    "completed",
    "completed",
    "running",
    "completed",
    "failed",
    "completed",
    "completed",
    "cancelled",
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
    const status = pick(statuses, index);
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
    const account = `${template.integrations[0] ?? "boop"}_demo`;
    const toolResult = {
      successful: status !== "failed",
      source: template.integrations[0] ?? "boop",
      results: [
        {
          title: template.name,
          summary: status === "failed" ? "Partial result before retryable failure" : template.result,
          url: `https://example.com/demo/${encodeURIComponent(agentId)}`,
        },
      ],
    };

    const logRows = [
      {
        logType: "thinking" as const,
        content: `Planning ${template.integrations.join(", ")} calls and checking relevant memories for this turn.\n`,
      },
      {
        logType: "tool_use" as const,
        toolName: template.tool,
        accounts: [account],
        content: JSON.stringify({
          tool: template.tool,
          args: { query: template.query, limit: 10, demo: true },
        }),
      },
      {
        logType: "tool_result" as const,
        toolName: template.tool,
        accounts: [account],
        content: JSON.stringify(toolResult),
      },
      {
        logType: "tool_use" as const,
        toolName: pick(
          [
            "mcp__boop-memory__recall",
            "mcp__notion__search",
            "mcp__linear__search_issues",
            "mcp__github__search_code",
          ],
          index,
        ),
        accounts: ["boop_demo"],
        content: JSON.stringify({
          tool: "context_lookup",
          args: { query: template.task, limit: 6, demo: true },
        }),
      },
      {
        logType: "tool_result" as const,
        toolName: pick(
          [
            "mcp__boop-memory__recall",
            "mcp__notion__search",
            "mcp__linear__search_issues",
            "mcp__github__search_code",
          ],
          index,
        ),
        accounts: ["boop_demo"],
        content: JSON.stringify({
          successful: true,
          memories: [
            "User prefers concise summaries grouped by owner.",
            "Dashboard should use compact rounded panels and realistic operational data.",
          ],
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

  let memories = 0;
  for (let index = 0; index < 72; index += 1) {
    const row = pick(rows, index);
    const lifecycle = index % 23 === 0 ? "archived" : index % 31 === 0 ? "pruned" : "active";
    await ctx.db.insert("memoryRecords", {
      memoryId: `demo:mem:${String(index + 1).padStart(3, "0")}`,
      content:
        index < rows.length
          ? row.content
          : `${row.content} Demo variation ${index - rows.length + 1} with a different source turn and access pattern.`,
      tier: row.tier,
      segment: row.segment,
      importance: row.importance,
      decayRate: compactNumber(0.01 + (index % 7) * 0.006, 3),
      accessCount: (index * 7) % 29,
      lastAccessedAt: ago(now, index % 10, (index % 6) * 33 * MINUTE),
      sourceTurn: `demo:turn:${index % conversationSeeds.length}-${index % 8}`,
      lifecycle,
      supersedes:
        index % 17 === 0 && index > 0
          ? [`demo:mem:${String(index).padStart(3, "0")}`]
          : undefined,
      metadata: JSON.stringify({
        demo: true,
        confidence: compactNumber(0.72 + (index % 9) * 0.025, 2),
        source: pick(["iMessage", "Gmail", "Calendar", "Linear", "Consolidation"], index),
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
  let memoryEvents = 0;
  for (let index = 0; index < 128; index += 1) {
    const memoryId = `demo:mem:${String((index % 72) + 1).padStart(3, "0")}`;
    await ctx.db.insert("memoryEvents", {
      eventType: pick(eventTypes, index),
      conversationId: pick(conversationSeeds, index).id,
      memoryId,
      agentId: `demo:agent:${String((index % agentTemplates.length) + 1).padStart(2, "0")}`,
      data: JSON.stringify({
        demo: true,
        memoryId,
        reason: pick(
          [
            "Matched scheduling preference",
            "Deduplicated similar project facts",
            "Promoted durable product preference",
            "Recalled for launch-week context",
            "Pruned short-lived calendar detail",
          ],
          index,
        ),
        score: compactNumber(0.61 + (index % 20) * 0.017, 3),
      }),
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
    const [setting, counts] = await Promise.all([readDemoSetting(ctx), demoCounts(ctx)]);
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    return {
      enabled: setting === "true",
      seeded: total > 0,
      counts,
      total,
      scanLimit: SCAN_LIMIT,
    };
  },
});

export const setMode = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, args) => {
    const removed = await deleteDemoRows(ctx);
    const seeded = args.enabled ? await seedDemoData(ctx) : null;
    await setDemoSetting(ctx, args.enabled);
    const counts = await demoCounts(ctx);
    return {
      enabled: args.enabled,
      removed,
      seeded,
      counts,
      total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    };
  },
});
