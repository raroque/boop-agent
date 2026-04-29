import {
  copyFileSync,
  existsSync,
  readFileSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { PROFILE_DIR } from "./config.js";
import { evalOnNewTab } from "./stealth-launcher.js";

// Daily Chrome on macOS keeps profiles under here. Each subdir is one profile;
// 'Default' is the first profile, 'Profile 1', 'Profile 2', ... are the rest.
const DAILY_CHROME_DIR = join(
  homedir(),
  "Library",
  "Application Support",
  "Google",
  "Chrome",
);

// Each service describes (a) which cookie host_keys belong to it,
// (b) cookie names that signal an active login, (c) a URL we can visit
// post-import to confirm the cookie actually authenticates us.
export interface ServiceDef {
  id: string;
  label: string;
  hostPatterns: string[]; // matched as `host_key LIKE '%' + p`
  signatures: string[]; // any one of these cookie names ⇒ logged in
  verifyUrl: string;
  // Verification: after navigating to verifyUrl, we must end up on this
  // host. If the final URL's host doesn't match, we got bounced (almost
  // always to the service's sign-in / device-confirm flow).
  expectHost: string;
  // Hosts that, when present in the final URL, indicate a device-
  // confirmation / 2FA challenge — cookies authenticated us but the site
  // wants additional verification before letting us in. UI surfaces this
  // distinctly from "not signed in at all."
  challengePathContains?: string[];
}

export const SERVICES: ServiceDef[] = [
  {
    id: "google",
    label: "Google",
    hostPatterns: [
      ".google.com",
      ".youtube.com",
      ".googleapis.com",
      ".gstatic.com",
      ".googleusercontent.com",
    ],
    signatures: ["SID", "HSID", "SSID", "SAPISID", "__Secure-1PSID"],
    verifyUrl: "https://myaccount.google.com/",
    expectHost: "myaccount.google.com",
    challengePathContains: [
      "/signin/v2/challenge",
      "/v3/signin/confirmidentifier",
      "/v3/signin/challenge",
    ],
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    hostPatterns: [".linkedin.com"],
    signatures: ["li_at"],
    verifyUrl: "https://www.linkedin.com/feed/",
    expectHost: "www.linkedin.com",
    challengePathContains: ["/checkpoint/", "/uas/"],
  },
  {
    id: "twitter",
    label: "X (Twitter)",
    hostPatterns: [".x.com", ".twitter.com"],
    signatures: ["auth_token"],
    verifyUrl: "https://x.com/home",
    expectHost: "x.com",
    challengePathContains: ["/i/flow/login", "/account/access"],
  },
  {
    id: "reddit",
    label: "Reddit",
    hostPatterns: [".reddit.com"],
    signatures: ["reddit_session", "token_v2"],
    verifyUrl: "https://www.reddit.com/",
    expectHost: "www.reddit.com",
    challengePathContains: ["/login"],
  },
  {
    id: "github",
    label: "GitHub",
    hostPatterns: [".github.com"],
    signatures: ["user_session"],
    verifyUrl: "https://github.com/notifications",
    expectHost: "github.com",
    challengePathContains: ["/login", "/sessions/two-factor"],
  },
];

export interface DailyProfile {
  dir: string; // 'Default', 'Profile 1', etc.
  name: string;
  userName: string | null;
  cookiesPath: string;
}

interface ChromeProfileInfo {
  name?: string;
  user_name?: string;
}

function cookiesPathFor(profileDir: string): string | null {
  // Chrome 96+ stores cookies under Network/, older under the profile root.
  const network = join(profileDir, "Network", "Cookies");
  if (existsSync(network)) return network;
  const legacy = join(profileDir, "Cookies");
  if (existsSync(legacy)) return legacy;
  return null;
}

export function listDailyProfiles(): DailyProfile[] {
  if (!existsSync(DAILY_CHROME_DIR)) return [];
  let infoCache: Record<string, ChromeProfileInfo> = {};
  try {
    const localState = JSON.parse(
      readFileSync(join(DAILY_CHROME_DIR, "Local State"), "utf-8"),
    ) as { profile?: { info_cache?: Record<string, ChromeProfileInfo> } };
    infoCache = localState.profile?.info_cache ?? {};
  } catch {
    /* fall through to filesystem scan */
  }
  const out: DailyProfile[] = [];
  for (const dir of Object.keys(infoCache)) {
    const profileDir = join(DAILY_CHROME_DIR, dir);
    const cp = cookiesPathFor(profileDir);
    if (!cp) continue;
    out.push({
      dir,
      name: infoCache[dir]?.name ?? dir,
      userName: infoCache[dir]?.user_name?.trim() || null,
      cookiesPath: cp,
    });
  }
  return out;
}

// Open a Cookies SQLite file safely while Chrome may still hold it. Strategy:
// snapshot the .db plus its WAL/SHM sidecars to a temp location, then open
// the temp copy read-only. This avoids any lock contention with running
// Chrome and guarantees a consistent view.
function snapshotCookieDb(srcPath: string): string {
  const tmp = join("/tmp", `boop-cookies-${process.pid}-${Date.now()}.db`);
  copyFileSync(srcPath, tmp);
  if (existsSync(srcPath + "-wal")) copyFileSync(srcPath + "-wal", tmp + "-wal");
  if (existsSync(srcPath + "-shm")) copyFileSync(srcPath + "-shm", tmp + "-shm");
  return tmp;
}

function cleanupSnapshot(tmp: string): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      unlinkSync(tmp + suffix);
    } catch {
      /* ignore */
    }
  }
}

export interface ServiceScan {
  service: string;
  label: string;
  hostsCovered: string[];
  cookieCount: number;
  hasSignature: boolean;
}

export function scanProfile(profileDir: string): ServiceScan[] {
  const cp = cookiesPathFor(join(DAILY_CHROME_DIR, profileDir));
  if (!cp) return [];
  const tmp = snapshotCookieDb(cp);
  try {
    const db = new Database(tmp, { readonly: true, fileMustExist: true });
    try {
      const out: ServiceScan[] = [];
      for (const svc of SERVICES) {
        const where = svc.hostPatterns.map(() => "host_key LIKE ?").join(" OR ");
        const args = svc.hostPatterns.map((p) => "%" + p);
        const rows = db
          .prepare(`SELECT host_key, name FROM cookies WHERE ${where}`)
          .all(...args) as Array<{ host_key: string; name: string }>;
        const hasSignature = svc.signatures.some((sig) =>
          rows.some((r) => r.name === sig),
        );
        out.push({
          service: svc.id,
          label: svc.label,
          hostsCovered: [...new Set(rows.map((r) => r.host_key))].sort(),
          cookieCount: rows.length,
          hasSignature,
        });
      }
      return out;
    } finally {
      db.close();
    }
  } finally {
    cleanupSnapshot(tmp);
  }
}

interface PragmaRow {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

function tableColumns(db: Database.Database, table: string): string[] {
  const rows = db.pragma(`table_info(${table})`) as PragmaRow[];
  return rows.map((r) => r.name);
}

export interface ImportResult {
  imported: number;
  skipped: number;
}

// Copy cookies from `sourceProfile` (Default, Profile 1, ...) into the boop
// profile's Cookies DB for a single service. Caller MUST have stopped boop's
// stealth Chrome first — otherwise the dest DB is held with a write lock and
// we'll error out (or worse, silently fail).
export function importCookiesForService(
  sourceProfile: string,
  serviceId: string,
): ImportResult {
  const svc = SERVICES.find((s) => s.id === serviceId);
  if (!svc) throw new Error(`unknown service: ${serviceId}`);

  const srcCookies = cookiesPathFor(join(DAILY_CHROME_DIR, sourceProfile));
  if (!srcCookies) {
    throw new Error(`No Cookies DB found for source profile "${sourceProfile}"`);
  }
  const destDir = join(PROFILE_DIR, "Default");
  // The boop profile's Default/Network/ dir may not exist if Chrome has never
  // been launched with this profile. Caller is expected to have done at
  // least one ensureStealthChrome cycle to bootstrap the dir + schema.
  const destCookies = cookiesPathFor(destDir);
  if (!destCookies) {
    throw new Error(
      `Boop Cookies DB not found at ${destDir}. Open the browser at least once to initialize it.`,
    );
  }

  const tmpSrc = snapshotCookieDb(srcCookies);
  let srcDb: Database.Database | null = null;
  let dstDb: Database.Database | null = null;
  try {
    srcDb = new Database(tmpSrc, { readonly: true, fileMustExist: true });
    dstDb = new Database(destCookies, { fileMustExist: true });

    const srcCols = tableColumns(srcDb, "cookies");
    const dstCols = tableColumns(dstDb, "cookies");
    const cols = srcCols.filter((c) => dstCols.includes(c));
    if (!cols.includes("host_key") || !cols.includes("name")) {
      throw new Error("Cookies table missing host_key/name columns; schema mismatch.");
    }

    const where = svc.hostPatterns.map(() => "host_key LIKE ?").join(" OR ");
    const args = svc.hostPatterns.map((p) => "%" + p);
    const select = srcDb.prepare(
      `SELECT ${cols.join(", ")} FROM cookies WHERE ${where}`,
    );
    const rows = select.all(...args) as Array<Record<string, unknown>>;

    const placeholders = cols.map(() => "?").join(", ");
    const insert = dstDb.prepare(
      `INSERT OR REPLACE INTO cookies (${cols.join(", ")}) VALUES (${placeholders})`,
    );
    const tx = dstDb.transaction((records: Array<Record<string, unknown>>) => {
      let n = 0;
      for (const r of records) {
        insert.run(...cols.map((c) => r[c] ?? null));
        n++;
      }
      return n;
    });
    const imported = tx(rows);
    return { imported, skipped: 0 };
  } finally {
    try {
      srcDb?.close();
    } catch {
      /* ignore */
    }
    try {
      dstDb?.close();
    } catch {
      /* ignore */
    }
    cleanupSnapshot(tmpSrc);
  }
}

export type VerifyState = "logged_in" | "needs_challenge" | "not_logged_in";

export interface VerifyResult {
  state: VerifyState;
  finalUrl: string;
  title: string;
}

// Open verifyUrl in a fresh tab and decide what kind of state we're in.
// We staying on `expectHost` ⇒ logged_in. Bounced to a known challenge
// path (Google's /v3/signin/confirmidentifier, X's flow/login, etc.) ⇒
// needs_challenge — cookies authenticated us but the site wants a one-
// time human action. Bounced anywhere else ⇒ not_logged_in (cookies
// didn't carry over).
export async function verifyService(serviceId: string): Promise<VerifyResult> {
  const svc = SERVICES.find((s) => s.id === serviceId);
  if (!svc) throw new Error(`unknown service: ${serviceId}`);
  const probe = (await evalOnNewTab(
    svc.verifyUrl,
    "JSON.stringify({ url: location.href, title: document.title })",
  )) as string | undefined;
  let finalUrl = "";
  let title = "";
  try {
    const parsed = JSON.parse(probe ?? "{}") as { url?: string; title?: string };
    finalUrl = parsed.url ?? "";
    title = parsed.title ?? "";
  } catch {
    /* leave empty */
  }
  let host = "";
  try {
    host = new URL(finalUrl).host;
  } catch {
    /* malformed url */
  }
  let state: VerifyState = "logged_in";
  if (host && host !== svc.expectHost) {
    const challenged = (svc.challengePathContains ?? []).some((p) =>
      finalUrl.includes(p),
    );
    state = challenged ? "needs_challenge" : "not_logged_in";
  }
  return { state, finalUrl, title };
}
