import { api } from "../convex/_generated/api.js";
import { convex } from "./convex-client.js";

const TZ_KEY = "user_timezone";
const TZ_TTL_MS = 30 * 1000;
let cached: { at: number; value: string | null } | null = null;

// Lazily computed set of valid IANA timezone IDs the runtime knows about.
// Node 18+ ships Intl.supportedValuesOf("timeZone").
let validZones: Set<string> | null = null;
function isValidTimezone(tz: string): boolean {
  if (!validZones) {
    try {
      validZones = new Set(
        (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.(
          "timeZone",
        ) ?? [],
      );
    } catch {
      validZones = new Set();
    }
  }
  if (validZones.has(tz)) return true;
  // Fallback for older runtimes: try to construct a formatter and see if it
  // throws RangeError.
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Friendly names users actually say. Resolved before validation so a user
// texting "central" or "PT" gets the canonical IANA ID.
const TIMEZONE_ALIASES: Record<string, string> = {
  // US
  eastern: "America/New_York",
  "eastern time": "America/New_York",
  et: "America/New_York",
  est: "America/New_York",
  edt: "America/New_York",
  central: "America/Chicago",
  "central time": "America/Chicago",
  ct: "America/Chicago",
  cst: "America/Chicago",
  cdt: "America/Chicago",
  mountain: "America/Denver",
  "mountain time": "America/Denver",
  mt: "America/Denver",
  mst: "America/Denver",
  mdt: "America/Denver",
  pacific: "America/Los_Angeles",
  "pacific time": "America/Los_Angeles",
  pt: "America/Los_Angeles",
  pst: "America/Los_Angeles",
  pdt: "America/Los_Angeles",
  alaska: "America/Anchorage",
  hawaii: "Pacific/Honolulu",
  // Common cities
  dallas: "America/Chicago",
  chicago: "America/Chicago",
  houston: "America/Chicago",
  austin: "America/Chicago",
  "new york": "America/New_York",
  nyc: "America/New_York",
  boston: "America/New_York",
  miami: "America/New_York",
  denver: "America/Denver",
  phoenix: "America/Phoenix",
  "los angeles": "America/Los_Angeles",
  la: "America/Los_Angeles",
  "san francisco": "America/Los_Angeles",
  sf: "America/Los_Angeles",
  seattle: "America/Los_Angeles",
  // International
  london: "Europe/London",
  uk: "Europe/London",
  // GMT means year-round UTC+0; mapping it to Europe/London would silently
  // shift to BST (UTC+1) from late March through late October.
  gmt: "UTC",
  bst: "Europe/London",
  paris: "Europe/Paris",
  berlin: "Europe/Berlin",
  cet: "Europe/Berlin",
  amsterdam: "Europe/Amsterdam",
  tokyo: "Asia/Tokyo",
  jst: "Asia/Tokyo",
  india: "Asia/Kolkata",
  ist: "Asia/Kolkata",
  delhi: "Asia/Kolkata",
  mumbai: "Asia/Kolkata",
  sydney: "Australia/Sydney",
  melbourne: "Australia/Melbourne",
  utc: "UTC",
};

export function resolveTimezoneInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (isValidTimezone(trimmed)) return trimmed;
  const alias = TIMEZONE_ALIASES[trimmed.toLowerCase()];
  if (alias && isValidTimezone(alias)) return alias;
  return null;
}

// Server's local timezone — the fallback when the user hasn't set one yet.
function envFallback(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

// Returns whatever's stored, or null if unset. Use this when you need to
// know "did the user explicitly tell us their timezone?" — e.g. before
// asking them.
export async function getStoredUserTimezone(): Promise<string | null> {
  if (cached && Date.now() - cached.at < TZ_TTL_MS) return cached.value;
  let stored: string | null = null;
  try {
    stored = await convex.query(api.settings.get, { key: TZ_KEY });
  } catch (err) {
    console.warn("[timezone-config] settings:get failed", err);
  }
  const final = stored && isValidTimezone(stored) ? stored : null;
  cached = { at: Date.now(), value: final };
  return final;
}

// Returns the user's timezone, falling back to the server's local zone if
// nothing's set. Most callers want this — code that needs to render or
// reason about local time shouldn't have to handle null.
export async function getUserTimezone(): Promise<string> {
  return (await getStoredUserTimezone()) ?? envFallback();
}

export async function setUserTimezone(tz: string): Promise<void> {
  await convex.mutation(api.settings.set, { key: TZ_KEY, value: tz });
  cached = { at: Date.now(), value: tz };
}

export async function clearUserTimezone(): Promise<void> {
  await convex.mutation(api.settings.clear, { key: TZ_KEY });
  cached = null;
}

// Render the current moment in the user's timezone, plus a few useful
// formats for prompts that need to anchor "today" or "now".
export async function describeUserNow(): Promise<{
  timezone: string;
  isExplicit: boolean;
  now: string;
  isoDate: string;
  weekday: string;
  hourMinute: string;
}> {
  const stored = await getStoredUserTimezone();
  const timezone = stored ?? envFallback();
  const d = new Date();
  const fmt = (opts: Intl.DateTimeFormatOptions): string =>
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, ...opts }).format(d);
  const isoDate = (() => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    // en-CA uses YYYY-MM-DD natively.
    return parts;
  })();
  return {
    timezone,
    isExplicit: stored !== null,
    now: fmt({
      year: "numeric",
      month: "short",
      day: "numeric",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }),
    isoDate,
    weekday: fmt({ weekday: "long" }),
    hourMinute: fmt({ hour: "numeric", minute: "2-digit" }),
  };
}
