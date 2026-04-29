import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api.js";
import { CookieImportSection } from "./CookieImportSection.js";

interface BrowserStatus {
  installed: boolean;
  cliVersion: string | null;
  chromeVersion: string | null;
  raw?: string;
}

type InstallState = "idle" | "installing" | "done" | "error";

const HEADED_KEY = "browser_headed";

export function BrowserSection({ isDark }: { isDark: boolean }) {
  const [status, setStatus] = useState<BrowserStatus | null>(null);
  const [installState, setInstallState] = useState<InstallState>("idle");
  const [installLog, setInstallLog] = useState<string>("");
  const [loginUrl, setLoginUrl] = useState<string>("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginMsg, setLoginMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const headedRaw = useQuery(api.settings.get, { key: HEADED_KEY });
  const setSetting = useMutation(api.settings.set);
  const headedLoading = headedRaw === undefined;
  const headedEnabled = headedLoading
    ? true
    : headedRaw === null
      ? true
      : headedRaw !== "false";
  const toggleHeaded = useCallback(async () => {
    if (headedLoading) return;
    await setSetting({ key: HEADED_KEY, value: headedEnabled ? "false" : "true" });
  }, [headedLoading, headedEnabled, setSetting]);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/browser/status");
      if (!r.ok) throw new Error(`status ${r.status}`);
      const data = (await r.json()) as BrowserStatus;
      setStatus(data);
    } catch {
      setStatus({ installed: false, cliVersion: null, chromeVersion: null });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const install = useCallback(async () => {
    setInstallState("installing");
    setInstallLog("Downloading Chrome for Testing… this can take 30–90 seconds.");
    try {
      const r = await fetch("/api/browser/install", { method: "POST" });
      const data = await r.json();
      if (data.ok) {
        setInstallState("done");
        setInstallLog((data.output ?? "").slice(-1500) || "Installed.");
      } else {
        setInstallState("error");
        setInstallLog((data.output ?? data.error ?? "Install failed.").slice(-1500));
      }
      await refresh();
    } catch (err) {
      setInstallState("error");
      setInstallLog(err instanceof Error ? err.message : String(err));
    }
  }, [refresh]);

  const startLogin = useCallback(async () => {
    const trimmed = loginUrl.trim();
    if (!trimmed) {
      setLoginMsg({ tone: "err", text: "Enter a URL first." });
      return;
    }
    setLoginBusy(true);
    setLoginMsg(null);
    try {
      const r = await fetch("/api/browser/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await r.json();
      if (r.ok && data.ok) {
        setLoginMsg({
          tone: "ok",
          text: "Chrome opened — sign in there. Cookies persist in the boop profile so future agent runs reuse the login.",
        });
        setLoginUrl("");
      } else {
        setLoginMsg({ tone: "err", text: data.error ?? "Failed to open Chrome." });
      }
    } catch (err) {
      setLoginMsg({
        tone: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoginBusy(false);
    }
  }, [loginUrl]);

  const cardBg = isDark ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200";
  const muted = isDark ? "text-slate-400" : "text-slate-500";
  const heading = isDark ? "text-slate-100" : "text-slate-900";

  const dot = status?.installed
    ? "bg-emerald-400"
    : installState === "installing"
      ? "bg-amber-400"
      : "bg-slate-500";
  const statusLabel = status?.installed
    ? `Installed${status.chromeVersion ? ` — Chrome ${status.chromeVersion}` : ""}`
    : installState === "installing"
      ? "Installing…"
      : status === null
        ? "Checking…"
        : "Not installed";

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <h2
          className={`text-xs font-semibold uppercase tracking-wider ${
            isDark ? "text-slate-500" : "text-slate-400"
          }`}
        >
          Full browser use
        </h2>
      </div>

      <div className={`rounded-xl border px-4 py-4 ${cardBg}`}>
        <div className="flex items-start gap-3">
          <div className="text-2xl leading-none mt-0.5" aria-hidden>
            🌐
          </div>
          <div className="flex-1">
            <div className={`text-sm font-semibold ${heading}`}>Browser (full web access)</div>
            <p className={`text-xs mt-1 ${muted}`}>
              Lets sub-agents drive a real Chrome with your saved logins. Use for sites without a
              native toolkit (portals, niche SaaS, anything you've signed into via the boop
              profile). Native toolkits like Gmail or Slack are still preferred when they cover the
              task.
            </p>

            <div className="flex items-center gap-2 mt-3 text-xs">
              <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
              <span className={muted}>{statusLabel}</span>
              {status?.cliVersion && (
                <span className={`mono text-[10px] ${muted}`}>(CLI {status.cliVersion})</span>
              )}
            </div>

            <div
              className={`mt-3 flex items-start justify-between gap-4 rounded-md px-3 py-2 ${
                isDark ? "bg-slate-950/40" : "bg-slate-50"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className={`text-xs font-medium ${heading}`}>
                  Show Chrome window when agents browse
                </div>
                <p className={`text-[11px] mt-0.5 leading-relaxed ${muted}`}>
                  ON: a real Chrome window pops up while sub-agents browse — visible, but slips
                  past most bot walls (Cloudflare, Reddit) since it's not headless. OFF: Chrome
                  runs invisibly. Faster, but easily fingerprinted as a bot. Takes effect within
                  ~30s.
                </p>
              </div>
              <button
                onClick={toggleHeaded}
                disabled={headedLoading}
                role="switch"
                aria-checked={headedEnabled}
                aria-label="Toggle Show Chrome window"
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none shrink-0 mt-0.5 ${
                  headedLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                } ${
                  headedEnabled
                    ? "bg-emerald-500"
                    : isDark
                      ? "bg-slate-700"
                      : "bg-slate-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    headedEnabled ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={install}
                disabled={installState === "installing"}
                className={`text-xs px-3 py-1.5 rounded-md border transition ${
                  isDark
                    ? "border-slate-700 hover:bg-slate-800 disabled:opacity-50"
                    : "border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                }`}
              >
                {installState === "installing"
                  ? "Installing…"
                  : status?.installed
                    ? "Re-install Chrome for Testing"
                    : "Install Chrome for Testing"}
              </button>
              <button
                onClick={refresh}
                className={`text-xs px-3 py-1.5 rounded-md border transition ${
                  isDark
                    ? "border-slate-700 hover:bg-slate-800"
                    : "border-slate-300 hover:bg-slate-50"
                }`}
              >
                Refresh
              </button>
            </div>

            {installLog && (
              <pre
                className={`mt-3 text-[10px] mono whitespace-pre-wrap rounded-md p-2 max-h-40 overflow-auto ${
                  isDark ? "bg-slate-950/60 text-slate-400" : "bg-slate-50 text-slate-600"
                }`}
              >
                {installLog}
              </pre>
            )}

            <div
              className={`mt-4 pt-3 border-t ${
                isDark ? "border-slate-800" : "border-slate-100"
              }`}
            >
              <div className={`text-xs font-medium ${heading}`}>Log in to a site</div>
              <p className={`text-[11px] mt-1 ${muted}`}>
                Opens Chrome (boop profile). Sign in by hand once — cookies persist for future
                agent runs.
              </p>
              <div className="flex gap-2 mt-2">
                <input
                  type="url"
                  value={loginUrl}
                  onChange={(e) => setLoginUrl(e.target.value)}
                  placeholder="https://mail.google.com"
                  className={`flex-1 text-xs px-3 py-1.5 rounded-md border ${
                    isDark
                      ? "bg-slate-950/40 border-slate-700 text-slate-200 placeholder-slate-600"
                      : "bg-white border-slate-300 text-slate-800 placeholder-slate-400"
                  }`}
                  disabled={loginBusy || !status?.installed}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !loginBusy && status?.installed) startLogin();
                  }}
                />
                <button
                  onClick={startLogin}
                  disabled={loginBusy || !status?.installed}
                  className={`text-xs px-3 py-1.5 rounded-md border transition ${
                    isDark
                      ? "border-slate-700 hover:bg-slate-800 disabled:opacity-40"
                      : "border-slate-300 hover:bg-slate-50 disabled:opacity-40"
                  }`}
                >
                  {loginBusy ? "Opening…" : "Open & sign in"}
                </button>
              </div>
              {!status?.installed && (
                <div className={`text-[10px] mt-1 ${muted}`}>
                  Install Chrome for Testing first.
                </div>
              )}
              {loginMsg && (
                <div
                  className={`text-[11px] mt-2 ${
                    loginMsg.tone === "ok"
                      ? isDark
                        ? "text-emerald-400"
                        : "text-emerald-600"
                      : isDark
                        ? "text-rose-400"
                        : "text-rose-600"
                  }`}
                >
                  {loginMsg.text}
                </div>
              )}
            </div>

            <CookieImportSection isDark={isDark} />
          </div>
        </div>
      </div>
    </section>
  );
}
