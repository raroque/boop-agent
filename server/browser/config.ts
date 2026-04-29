import { existsSync, mkdirSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { getBrowserHeaded } from "../runtime-config.js";

// agent-browser's --profile flag accepts either an existing Chrome profile NAME
// or a directory path for a persistent custom profile. We always pass a path so
// we own the dir (real Chrome's profiles are not reusable while Chrome is open).
export const PROFILE_DIR =
  process.env.AGENT_BROWSER_PROFILE ?? join(homedir(), ".boop", "agent-browser-profile");
mkdirSync(PROFILE_DIR, { recursive: true });

// Single shared agent-browser session for the whole Boop server. agent-browser
// launches one Chrome per (--session, --profile-dir); since Chrome enforces
// one-process-per-profile-dir via SingletonLock, we can't have multiple
// sessions on the same profile. Pinning to a fixed name means every browser
// tool call across all sub-agents attaches to the same Chrome via the daemon,
// which serializes commands. Parallel spawns that both reach for the browser
// will share tabs — that's a v0 tradeoff, fine for single-user Boop.
export const SESSION = "boop";

// Prefer the user's real Chrome over agent-browser's bundled Chrome for Testing —
// many sites (Reddit, Cloudflare-protected) fingerprint CfT and serve a bot wall.
// Real Chrome at our --user-data-dir has no SingletonLock conflict with the
// user's daily Chrome since Chrome locks per profile dir, not per binary.
function detectRealChrome(): string | null {
  if (process.env.BOOP_BROWSER_EXECUTABLE) return process.env.BOOP_BROWSER_EXECUTABLE;
  const candidates =
    platform() === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        ]
      : platform() === "linux"
        ? ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium"]
        : [];
  return candidates.find((p) => existsSync(p)) ?? null;
}

export const CHROME_PATH = detectRealChrome();

// We launch Chrome ourselves (see server/browser/stealth-launcher.ts) and
// patch navigator.webdriver via CDP before any page loads — that's the
// signal Google checks. `--disable-blink-features=AutomationControlled`
// alone was patched out in Chrome 122+; doing nothing about webdriver
// means Google's "browser may not be secure" wall fires on every sign-in.
//
// `--cdp <port>` is the per-command flag that points agent-browser at our
// already-running Chrome. Without it, the daemon launches its own bundled
// Chrome for Testing in a temp profile and ignores ours entirely (which
// silently breaks the patch — your patches go to the wrong browser).
export const STEALTH_CDP_PORT = 9222;

export function browserBaseArgs(): string[] {
  return ["--session", SESSION, "--cdp", String(STEALTH_CDP_PORT)];
}

// agent-browser defaults to --headless=new, which puts "HeadlessChrome" in the
// user-agent and is trivially flagged by Cloudflare/Reddit/etc. — even when
// pointed at the user's real Chrome binary. The CLI flag --headed is silently
// ignored in 0.26.x; the env var AGENT_BROWSER_HEADED=1/0 is what actually
// drives --headless=new on Chrome spawn. The user toggles this from the debug
// UI (settings.browser_headed); we read the live value per call via
// runtime-config and pass it through to every execa call.
export async function getBrowserEnv(): Promise<Record<string, string>> {
  const headed = await getBrowserHeaded();
  return {
    ...process.env,
    AGENT_BROWSER_HEADED: headed ? "1" : "0",
  } as Record<string, string>;
}
