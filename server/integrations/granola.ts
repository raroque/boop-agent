import { tool, createSdkMcpServer, type McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { registerIntegration, type IntegrationModule } from "./registry.js";

const BASE_URL = "https://public-api.granola.ai/v1";

interface GranolaNoteListItem {
  id: string;
  title?: string | null;
  created_at?: string;
  updated_at?: string;
  owner?: { name?: string; email?: string };
  web_url?: string;
}

interface GranolaTranscriptSegment {
  speaker?: { source?: string; diarization_label?: string };
  text?: string;
  start_time?: string;
  end_time?: string;
}

interface GranolaCalendarEvent {
  event_title?: string;
  organiser?: { name?: string; email?: string };
  invitees?: Array<{ name?: string; email?: string }>;
  scheduled_start_time?: string;
  scheduled_end_time?: string;
}

interface GranolaNote extends GranolaNoteListItem {
  // The public docs call this "summary" but the API actually returns
  // `summary_text` (plain) and `summary_markdown` (formatted). Prefer markdown.
  summary_text?: string;
  summary_markdown?: string;
  calendar_event?: GranolaCalendarEvent | null;
  attendees?: Array<{ name?: string; email?: string }>;
  transcript?: GranolaTranscriptSegment[] | null;
}

interface GranolaListResponse {
  notes: GranolaNoteListItem[];
  hasMore?: boolean;
  cursor?: string;
}

async function granolaFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (res.status === 401) throw new Error("Granola API rejected the token (401). Check GRANOLA_API_TOKEN.");
  if (res.status === 404) throw new Error("Granola returned 404 — the note may not have a generated AI summary yet.");
  if (res.status === 429) throw new Error("Granola rate limit hit (429). Try again in a few seconds.");
  if (!res.ok) throw new Error(`Granola API ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  return (await res.json()) as T;
}

function formatNoteListItem(n: GranolaNoteListItem): string {
  const when = n.created_at ? ` — ${n.created_at}` : "";
  const owner = n.owner?.name ?? n.owner?.email;
  const ownerStr = owner ? ` (${owner})` : "";
  return `• [${n.id}] ${n.title ?? "(untitled)"}${when}${ownerStr}`;
}

function formatCalendarEvent(ev: GranolaCalendarEvent): string {
  const lines: string[] = [];
  if (ev.event_title) lines.push(`Event: ${ev.event_title}`);
  if (ev.scheduled_start_time) {
    const range = ev.scheduled_end_time
      ? `${ev.scheduled_start_time} → ${ev.scheduled_end_time}`
      : ev.scheduled_start_time;
    lines.push(`When: ${range}`);
  }
  if (ev.organiser) {
    const o = ev.organiser.name ?? ev.organiser.email;
    if (o) lines.push(`Organiser: ${o}`);
  }
  if (ev.invitees?.length) {
    const names = ev.invitees.map((i) => i.name ?? i.email).filter(Boolean);
    if (names.length) lines.push(`Invitees: ${names.join(", ")}`);
  }
  return lines.join("\n");
}

function formatTranscript(segments: GranolaTranscriptSegment[]): string {
  return segments
    .map((s) => {
      const label = s.speaker?.diarization_label ?? s.speaker?.source ?? "speaker";
      return `${label}: ${s.text ?? ""}`;
    })
    .join("\n");
}

function buildGranolaServer(token: string): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: "granola",
    version: "0.1.0",
    tools: [
      tool(
        "list_meetings",
        `List the user's recent Granola meeting notes. Returns id, title, and timestamp — call get_meeting with the id to fetch the AI summary.
Only notes with a generated AI summary are returned.`,
        {
          created_after: z
            .string()
            .optional()
            .describe("ISO 8601 timestamp. Only return notes created after this instant."),
          cursor: z.string().optional().describe("Pagination cursor from a previous response's `cursor` field."),
        },
        async (args) => {
          const params = new URLSearchParams();
          if (args.created_after) params.set("created_after", args.created_after);
          if (args.cursor) params.set("cursor", args.cursor);
          const qs = params.toString();
          const data = await granolaFetch<GranolaListResponse>(`/notes${qs ? `?${qs}` : ""}`, token);
          if (!data.notes?.length) {
            return { content: [{ type: "text" as const, text: "No Granola notes found." }] };
          }
          const lines = data.notes.map(formatNoteListItem);
          if (data.hasMore && data.cursor) {
            lines.push(`\n(more available — pass cursor=${data.cursor} to get the next page)`);
          }
          return { content: [{ type: "text" as const, text: lines.join("\n") }] };
        },
      ),
      tool(
        "get_meeting",
        `Fetch a single Granola note by id, including the AI-generated summary. Pass include_transcript=true to also return the full transcript.`,
        {
          id: z.string().describe("Granola note id (from list_meetings)."),
          include_transcript: z.boolean().optional().describe("If true, include the full transcript."),
        },
        async (args) => {
          const path = args.include_transcript
            ? `/notes/${encodeURIComponent(args.id)}?include=transcript`
            : `/notes/${encodeURIComponent(args.id)}`;
          const note = await granolaFetch<GranolaNote>(path, token);
          const parts: string[] = [];
          parts.push(`# ${note.title ?? "(untitled)"}`);
          if (note.created_at) parts.push(`Created: ${note.created_at}`);
          const owner = note.owner?.name ?? note.owner?.email;
          if (owner) parts.push(`Owner: ${owner}`);
          if (note.web_url) parts.push(`URL: ${note.web_url}`);
          if (note.calendar_event) {
            parts.push("");
            parts.push("## Meeting");
            parts.push(formatCalendarEvent(note.calendar_event));
          }
          parts.push("");
          parts.push("## Summary");
          parts.push(note.summary_markdown ?? note.summary_text ?? "(no summary)");
          if (args.include_transcript && note.transcript?.length) {
            parts.push("");
            parts.push("## Transcript");
            parts.push(formatTranscript(note.transcript));
          }
          return { content: [{ type: "text" as const, text: parts.join("\n") }] };
        },
      ),
    ],
  });
}

const granolaModule: IntegrationModule = {
  name: "granola",
  description: "Granola meeting notes (AI summaries + transcripts)",
  requiredEnv: ["GRANOLA_API_TOKEN"],
  createServer: async () => {
    const token = process.env.GRANOLA_API_TOKEN;
    if (!token) throw new Error("[granola] GRANOLA_API_TOKEN not set");
    return buildGranolaServer(token);
  },
};

export function registerGranolaIntegration(): void {
  if (!process.env.GRANOLA_API_TOKEN) {
    console.log("[granola] disabled — GRANOLA_API_TOKEN not set");
    return;
  }
  registerIntegration(granolaModule);
  console.log("[granola] registered");
}
