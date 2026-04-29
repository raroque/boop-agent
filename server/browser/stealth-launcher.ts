// Stealth Chrome launcher for the browser integration.
//
// Why this exists: agent-browser, as of 0.26.x, launches Chrome with
// `--remote-debugging-port=0`. That flag flips `navigator.webdriver = true`
// on every page, which is the single signal Google's "this browser may not
// be secure" sign-in wall keys on. Just adding `--disable-blink-features=
// AutomationControlled` to the launch args was patched out in Chrome 122+
// — verified empirically: the flag lands but `navigator.webdriver` stays
// `true`. Stealth libraries (Patchright, puppeteer-extra-plugin-stealth)
// solve this by patching the JS runtime via CDP's
// `Page.addScriptToEvaluateOnNewDocument` BEFORE site scripts run. We do
// the same here, then have agent-browser attach via `connect 9222` instead
// of launching its own Chrome.
//
// The script we inject runs once per page, before any site code, and rewrites
// the navigator object so site scripts see a "normal" non-automated browser.
// Chrome's internal automation state is unchanged — only the JS-visible view.

import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import WebSocket from "ws";
import { CHROME_PATH, PROFILE_DIR, STEALTH_CDP_PORT } from "./config.js";

const STEALTH_PORT = STEALTH_CDP_PORT;

// Patches site-visible navigator/window properties. Most important is
// navigator.webdriver — Google's "browser may not be secure" wall keys on
// it. In Chrome 122+, the property lives on Navigator.prototype as a
// non-configurable getter; just doing `Object.defineProperty(navigator,
// 'webdriver', ...)` on the instance silently no-ops because the prototype
// getter wins. The technique that actually works (used by puppeteer-extra-
// plugin-stealth and Patchright) is to delete the property off the
// prototype OR redefine it on the prototype with configurable:true.
const STEALTH_SCRIPT = String.raw`
(() => {
  try { window.__boopStealth = (window.__boopStealth || 0) + 1; } catch (e) {}

  // Capture the original Function.prototype.toString FIRST so we can mask
  // our own patches. Sites use \`navigator.webdriver.toString()\` and
  // descriptor.get.toString() to detect tampering — real Chrome returns
  // 'function get webdriver() { [native code] }', a custom getter returns
  // its own source, which is the giveaway.
  const _origToString = Function.prototype.toString;
  const _origToStringText = _origToString.call(_origToString);
  const _fakedFns = new WeakMap();

  // 1. navigator.webdriver. Two layers:
  //    a) try to delete from prototype (works on older Chrome)
  //    b) define as a VALUE on the instance — no getter for sites to
  //       introspect, navigator.webdriver === false straight up.
  try { delete Object.getPrototypeOf(navigator).webdriver; } catch (e) {}
  try {
    Object.defineProperty(navigator, 'webdriver', {
      value: false,
      writable: false,
      configurable: true,
      enumerable: true,
    });
  } catch (e) { try { window.__boopStealthWebdriverErr = String(e); } catch {} }

  // Helper: build a getter via object-literal so .name === 'get <prop>'
  // and the function inherits the real "getter" form. We then proxy its
  // toString below.
  const makeGetter = (prop, returnValue) => {
    const desc = Object.getOwnPropertyDescriptor(
      { get [prop]() { return returnValue; } },
      prop,
    );
    return desc.get;
  };

  // 2. Languages on the prototype. We record the getter in _fakedFns so
  //    Function.prototype.toString returns '[native code]' for it.
  try {
    const langGetter = makeGetter('languages', ['en-US', 'en']);
    _fakedFns.set(langGetter, 'function get languages() { [native code] }');
    Object.defineProperty(Navigator.prototype, 'languages', {
      get: langGetter,
      configurable: true,
    });
  } catch (e) {}

  // 3. Plugins — empty list is a strong automation tell. Three PDF entries
  //    is what stock desktop Chrome ships with.
  try {
    const mkPlugin = (name) => Object.freeze({
      name,
      filename: 'internal-pdf-viewer',
      description: 'Portable Document Format',
      length: 1,
    });
    const plugins = Object.freeze([
      mkPlugin('PDF Viewer'),
      mkPlugin('Chrome PDF Viewer'),
      mkPlugin('Chromium PDF Viewer'),
    ]);
    const pluginsGetter = makeGetter('plugins', plugins);
    _fakedFns.set(pluginsGetter, 'function get plugins() { [native code] }');
    Object.defineProperty(Navigator.prototype, 'plugins', {
      get: pluginsGetter,
      configurable: true,
    });
  } catch (e) {}

  // 4. window.chrome — populated object, not bare. Real Chrome has runtime,
  //    loadTimes, csi, app properties.
  try {
    if (!window.chrome) window.chrome = {};
    if (!window.chrome.runtime) {
      window.chrome.runtime = {
        OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
        OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
        PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
        PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
        connect: function connect() {},
        sendMessage: function sendMessage() {},
      };
      _fakedFns.set(window.chrome.runtime.connect, 'function connect() { [native code] }');
      _fakedFns.set(window.chrome.runtime.sendMessage, 'function sendMessage() { [native code] }');
    }
  } catch (e) {}

  // 5. permissions.query for notifications — real Chrome returns 'prompt'
  //    on unconfigured origins; automation often returns 'denied'.
  try {
    const orig = window.navigator.permissions && window.navigator.permissions.query
      ? window.navigator.permissions.query.bind(window.navigator.permissions)
      : null;
    if (orig) {
      const fakeQuery = function query(parameters) {
        if (parameters && parameters.name === 'notifications') {
          return Promise.resolve({ state: Notification.permission, name: 'notifications', onchange: null });
        }
        return orig(parameters);
      };
      _fakedFns.set(fakeQuery, 'function query() { [native code] }');
      window.navigator.permissions.query = fakeQuery;
    }
  } catch (e) {}

  // 6. CRITICAL: patch Function.prototype.toString last. Sites detect
  //    stealth by calling fakeFn.toString() and checking for source code
  //    instead of '[native code]'. Our Proxy returns the recorded native
  //    string for any function we faked, and the real native string for
  //    everything else (including .toString itself).
  try {
    const proxiedToString = new Proxy(_origToString, {
      apply(target, thisArg, argsList) {
        if (thisArg === proxiedToString) return _origToStringText;
        if (_fakedFns.has(thisArg)) return _fakedFns.get(thisArg);
        return Reflect.apply(target, thisArg, argsList);
      },
    });
    Function.prototype.toString = proxiedToString;
  } catch (e) {}
})();
`;

let chromeProcess: ChildProcess | null = null;
let browserWs: WebSocket | null = null;
let bootPromise: Promise<void> | null = null;
let nextId = 1;
let exitWaiters: Array<() => void> = [];

interface CdpMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  sessionId?: string;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

function send(
  ws: WebSocket,
  method: string,
  params: Record<string, unknown> = {},
  sessionId?: string,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const message: CdpMessage = sessionId
      ? { id, method, params, sessionId }
      : { id, method, params };
    const handler = (raw: WebSocket.RawData) => {
      let parsed: CdpMessage;
      try {
        parsed = JSON.parse(raw.toString()) as CdpMessage;
      } catch {
        return;
      }
      if (parsed.id !== id) return;
      ws.off("message", handler);
      if (parsed.error) reject(new Error(`${method}: ${parsed.error.message}`));
      else resolve(parsed.result ?? {});
    };
    ws.on("message", handler);
    try {
      ws.send(JSON.stringify(message));
    } catch (err) {
      ws.off("message", handler);
      reject(err as Error);
    }
  });
}

async function spawnChrome(): Promise<void> {
  if (chromeProcess) return;
  const binary =
    CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const args = [
    `--remote-debugging-port=${STEALTH_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-blink-features=AutomationControlled",
    "--disable-features=AutomationControlled",
  ];
  console.log(`[stealth] launching ${binary} with port ${STEALTH_PORT}`);
  chromeProcess = spawn(binary, args, { stdio: "ignore", detached: false });
  chromeProcess.on("exit", (code) => {
    console.log(`[stealth] Chrome exited (code=${code})`);
    chromeProcess = null;
    if (browserWs) {
      try {
        browserWs.close();
      } catch {
        /* ignore */
      }
      browserWs = null;
    }
    bootPromise = null;
    const waiters = exitWaiters;
    exitWaiters = [];
    for (const w of waiters) w();
  });
}

async function waitForCdpEndpoint(): Promise<string> {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${STEALTH_PORT}/json/version`);
      if (res.ok) {
        const json = (await res.json()) as { webSocketDebuggerUrl?: string };
        if (json.webSocketDebuggerUrl) return json.webSocketDebuggerUrl;
      }
    } catch {
      /* retry */
    }
    await sleep(250);
  }
  throw new Error(
    `[stealth] Chrome didn't expose CDP on :${STEALTH_PORT} within 15s`,
  );
}

async function attachWebSocket(url: string): Promise<WebSocket> {
  const ws = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  return ws;
}

async function patchPageTarget(ws: WebSocket, sessionId: string): Promise<void> {
  await send(ws, "Page.enable", {}, sessionId);
  await send(
    ws,
    "Page.addScriptToEvaluateOnNewDocument",
    { source: STEALTH_SCRIPT },
    sessionId,
  );
  // Re-eval the patches in the CURRENT document too, in case the target was
  // already on a real page when we attached (about:blank counts but a re-nav
  // is on the way). addScriptToEvaluateOnNewDocument only fires on FUTURE
  // documents, so without this the very first page in the tab keeps the
  // pre-patch values.
  await send(
    ws,
    "Runtime.evaluate",
    { expression: STEALTH_SCRIPT, awaitPromise: false },
    sessionId,
  ).catch(() => {
    /* about:blank etc. may reject, ignore */
  });
}

async function setupAutoAttachAndPatch(ws: WebSocket): Promise<void> {
  // CRITICAL: attach the events listener BEFORE calling Target.setAutoAttach.
  // setAutoAttach immediately fires Target.attachedToTarget for every
  // existing target. If we register the listener after, those events were
  // already on the wire and the patch never lands on the about:blank tab —
  // which becomes the first page that gets navigated by agent-browser.
  ws.on("message", async (raw) => {
    let parsed: CdpMessage;
    try {
      parsed = JSON.parse(raw.toString()) as CdpMessage;
    } catch {
      return;
    }
    if (parsed.method !== "Target.attachedToTarget") return;
    const params = parsed.params as
      | { sessionId: string; targetInfo?: { type?: string } }
      | undefined;
    if (!params?.sessionId) return;
    const targetType = params.targetInfo?.type ?? "";
    const isPagey = targetType === "page" || targetType === "iframe";
    try {
      if (isPagey) await patchPageTarget(ws, params.sessionId);
    } catch (err) {
      console.warn(
        `[stealth] failed to patch target ${targetType}:`,
        err instanceof Error ? err.message : err,
      );
    } finally {
      try {
        await send(ws, "Runtime.runIfWaitingForDebugger", {}, params.sessionId);
      } catch {
        /* target may already be running */
      }
    }
  });

  // Now enable autoAttach. waitForDebuggerOnStart pauses NEW targets so the
  // patch lands before the first script runs. Existing targets attach
  // immediately and aren't paused — we handle those via the explicit
  // Runtime.evaluate fallback in patchPageTarget.
  await send(ws, "Target.setAutoAttach", {
    autoAttach: true,
    waitForDebuggerOnStart: true,
    flatten: true,
  });
}

export async function ensureStealthChrome(): Promise<void> {
  if (browserWs) return;
  if (bootPromise) return bootPromise;
  bootPromise = (async () => {
    await spawnChrome();
    const wsUrl = await waitForCdpEndpoint();
    browserWs = await attachWebSocket(wsUrl);
    await setupAutoAttachAndPatch(browserWs);
    console.log(
      `[stealth] ready — Chrome on :${STEALTH_PORT}, navigator.webdriver patched on every new document. Pass --cdp ${STEALTH_PORT} to agent-browser to drive it.`,
    );
  })();
  try {
    await bootPromise;
  } catch (err) {
    bootPromise = null;
    throw err;
  }
}

export function stopStealthChrome(): void {
  if (browserWs) {
    try {
      browserWs.close();
    } catch {
      /* ignore */
    }
    browserWs = null;
  }
  if (chromeProcess) {
    try {
      chromeProcess.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    chromeProcess = null;
  }
  bootPromise = null;
}

// Like stopStealthChrome, but resolves only after the Chrome process has
// fully exited. Use before any operation that needs exclusive write access
// to the profile dir (e.g. cookie SQLite writes) — otherwise Chrome's open
// file handle keeps the WAL locked.
export async function stopStealthChromeAndWait(timeoutMs = 8000): Promise<void> {
  const proc = chromeProcess;
  if (!proc) {
    stopStealthChrome();
    return;
  }
  const done = new Promise<void>((resolve) => {
    exitWaiters.push(resolve);
  });
  stopStealthChrome();
  await Promise.race([
    done,
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

export function stealthRunning(): boolean {
  return !!chromeProcess && !!browserWs;
}

// Open a new tab, navigate to `url`, wait for load, evaluate JS, close.
// Returns whatever `Runtime.evaluate` does on `expression`. Used for
// post-import login verification — we need a page session distinct from
// any tabs the user / sub-agents may have open.
export async function evalOnNewTab(
  url: string,
  expression: string,
  navTimeoutMs = 12_000,
): Promise<unknown> {
  if (!browserWs) throw new Error("stealth Chrome not running");
  const ws = browserWs;

  // Create a new target (tab) via the browser-level session.
  const created = (await send(ws, "Target.createTarget", { url: "about:blank" })) as {
    targetId?: string;
  };
  const targetId = created.targetId;
  if (!targetId) throw new Error("Target.createTarget returned no targetId");

  // Attach a flat page session so we can talk to it directly.
  const attached = (await send(ws, "Target.attachToTarget", {
    targetId,
    flatten: true,
  })) as { sessionId?: string };
  const sessionId = attached.sessionId;
  if (!sessionId) throw new Error("Target.attachToTarget returned no sessionId");

  try {
    await send(ws, "Page.enable", {}, sessionId);

    // Navigate and wait for load via Page.frameStoppedLoading.
    const nav = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.off("message", listener);
        reject(new Error("navigation timeout"));
      }, navTimeoutMs);
      const listener = (raw: WebSocket.RawData) => {
        let parsed: CdpMessage;
        try {
          parsed = JSON.parse(raw.toString()) as CdpMessage;
        } catch {
          return;
        }
        if (parsed.sessionId !== sessionId) return;
        if (parsed.method === "Page.frameStoppedLoading") {
          clearTimeout(timer);
          ws.off("message", listener);
          resolve();
        }
      };
      ws.on("message", listener);
    });

    await send(ws, "Page.navigate", { url }, sessionId);
    await nav.catch(() => {
      /* fall through — we still try to read the page */
    });

    const result = (await send(
      ws,
      "Runtime.evaluate",
      { expression, returnByValue: true },
      sessionId,
    )) as { result?: { value?: unknown } };
    return result.result?.value;
  } finally {
    try {
      await send(ws, "Target.closeTarget", { targetId });
    } catch {
      /* ignore */
    }
  }
}
