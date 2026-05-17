import { api } from "../../convex/_generated/api.js";
import { convex } from "../convex-client.js";

interface MemoryContextRow {
  content: string;
  importance?: number;
  createdAt?: number;
}

const IDENTITY_QUERY_LIMIT = 50;
const CORRECTION_QUERY_LIMIT = 25;
const CONTEXT_LINE_LIMIT = 10;

function shouldIncludeUserMemoryContext(row: MemoryContextRow): boolean {
  const lower = row.content.trim().toLowerCase();
  if (!lower) return false;
  return !(
    lower.startsWith("assistant ") ||
    lower.startsWith("the assistant ") ||
    lower.includes("assistant in this workspace") ||
    lower.includes("assistant identified")
  );
}

export function formatUserMemoryContextBlock(rows: MemoryContextRow[]): string {
  const lines = [
    ...new Set(
      rows
        .filter(shouldIncludeUserMemoryContext)
        .sort(
          (a, b) =>
            (b.importance ?? 0) - (a.importance ?? 0) ||
            (b.createdAt ?? 0) - (a.createdAt ?? 0),
        )
        .map((r) => r.content.trim())
        .filter(Boolean),
    ),
  ].slice(0, CONTEXT_LINE_LIMIT);
  if (lines.length === 0) return "";
  return [
    "Known user identity/correction memories:",
    ...lines.map((line) => `- ${line}`),
    "Use these as authoritative context for recognizing the user. If a name or email belongs to the user, do not describe that person as a third party.",
  ].join("\n");
}

export async function getUserMemoryContextBlock(): Promise<string> {
  try {
    const [identityRows, correctionRows] = await Promise.all([
      convex.query(api.memoryRecords.list, {
        segment: "identity",
        lifecycle: "active",
        limit: IDENTITY_QUERY_LIMIT,
      }),
      convex.query(api.memoryRecords.list, {
        segment: "correction",
        lifecycle: "active",
        limit: CORRECTION_QUERY_LIMIT,
      }),
    ]);
    return formatUserMemoryContextBlock([...identityRows, ...correctionRows]);
  } catch (err) {
    console.warn("[memory] user identity context recall failed", err);
    return "";
  }
}
