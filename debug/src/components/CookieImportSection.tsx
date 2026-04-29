import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api.js";

interface DailyProfile {
  dir: string;
  name: string;
  userName: string | null;
}

interface ServiceScan {
  service: string;
  label: string;
  hostsCovered: string[];
  cookieCount: number;
  hasSignature: boolean;
}

interface ImportRecord {
  service: string;
  sourceProfile: string;
  identity?: string;
  cookieCount: number;
  lastImportedAt: number;
  lastVerifiedAt?: number;
  verifiedOk?: boolean;
}

interface ScanResponse {
  profile: string;
  services: ServiceScan[];
  imports: ImportRecord[];
}

const SERVICE_ICON: Record<string, string> = {
  google: "G",
  linkedin: "in",
  twitter: "X",
  reddit: "r",
  github: "gh",
};

function relTime(epoch: number): string {
  const sec = Math.max(1, Math.round((Date.now() - epoch) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

interface RowState {
  busy?: boolean;
  message?: { tone: "ok" | "err"; text: string };
}

export function CookieImportSection({ isDark }: { isDark: boolean }) {
  const [profiles, setProfiles] = useState<DailyProfile[]>([]);
  const [profileDir, setProfileDir] = useState<string | null>(null);
  const [scan, setScan] = useState<ServiceScan[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});

  // Imports come straight from Convex so they update live across refreshes.
  const imports = useQuery(api.cookieImports.list, {}) ?? [];
  const importsByService = useMemo(() => {
    const m = new Map<string, ImportRecord>();
    for (const r of imports) m.set(r.service, r as ImportRecord);
    return m;
  }, [imports]);

  const loadProfiles = useCallback(async () => {
    try {
      const r = await fetch("/api/browser/cookies/profiles");
      if (!r.ok) throw new Error(`status ${r.status}`);
      const data = (await r.json()) as { profiles: DailyProfile[] };
      setProfiles(data.profiles);
      // Default to a signed-in profile when available.
      const preferred =
        data.profiles.find((p) => p.userName) ?? data.profiles[0] ?? null;
      if (preferred && profileDir === null) setProfileDir(preferred.dir);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : String(err));
    }
  }, [profileDir]);

  const rescan = useCallback(
    async (dir: string) => {
      setScanning(true);
      setScanError(null);
      try {
        const r = await fetch(
          `/api/browser/cookies/scan?profile=${encodeURIComponent(dir)}`,
        );
        if (!r.ok) throw new Error(`status ${r.status}`);
        const data = (await r.json()) as ScanResponse;
        setScan(data.services);
      } catch (err) {
        setScanError(err instanceof Error ? err.message : String(err));
      } finally {
        setScanning(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  useEffect(() => {
    if (profileDir) void rescan(profileDir);
  }, [profileDir, rescan]);

  const runImport = useCallback(
    async (svc: ServiceScan) => {
      if (!profileDir) return;
      setRowState((s) => ({ ...s, [svc.service]: { busy: true } }));
      try {
        const r = await fetch("/api/browser/cookies/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ profile: profileDir, service: svc.service }),
        });
        const data = (await r.json()) as {
          ok?: boolean;
          imported?: number;
          identity?: string;
          verified?: {
            state: "logged_in" | "needs_challenge" | "not_logged_in";
            finalUrl?: string;
            title?: string;
          } | null;
          error?: string;
          runningAgents?: string[];
        };
        if (!r.ok || !data.ok) {
          const text =
            data.error ??
            (data.runningAgents?.length
              ? `Browser is busy with ${data.runningAgents.length} sub-agent(s). Try again in a moment.`
              : `Import failed (${r.status}).`);
          setRowState((s) => ({
            ...s,
            [svc.service]: { busy: false, message: { tone: "err", text } },
          }));
          return;
        }
        const v = data.verified;
        let verifyText = "";
        let tone: "ok" | "err" = "ok";
        if (v) {
          if (v.state === "logged_in") {
            verifyText = " · login verified";
          } else if (v.state === "needs_challenge") {
            verifyText =
              " · Google recognizes you but wants a one-time device confirmation. Finish it in the open Chrome window — once approved, future runs won't ask again.";
            tone = "err";
          } else {
            verifyText = " · cookies copied but login didn't carry over";
            tone = "err";
          }
        }
        setRowState((s) => ({
          ...s,
          [svc.service]: {
            busy: false,
            message: {
              tone,
              text: `Imported ${data.imported ?? 0} cookies${
                data.identity ? ` for ${data.identity}` : ""
              }${verifyText}.`,
            },
          },
        }));
      } catch (err) {
        setRowState((s) => ({
          ...s,
          [svc.service]: {
            busy: false,
            message: {
              tone: "err",
              text: err instanceof Error ? err.message : String(err),
            },
          },
        }));
      }
    },
    [profileDir],
  );

  const muted = isDark ? "text-slate-400" : "text-slate-500";
  const heading = isDark ? "text-slate-100" : "text-slate-900";
  const rowBg = isDark ? "bg-slate-950/30" : "bg-slate-50";
  const borderTone = isDark ? "border-slate-800" : "border-slate-100";

  if (profiles.length === 0 && scanError) {
    return (
      <div className={`mt-4 pt-3 border-t ${borderTone}`}>
        <div className={`text-xs font-medium ${heading}`}>Logged-in sessions</div>
        <p className={`text-[11px] mt-1 ${muted}`}>
          Couldn't read daily Chrome profile: {scanError}
        </p>
      </div>
    );
  }

  return (
    <div className={`mt-4 pt-3 border-t ${borderTone}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          <div className={`text-xs font-medium ${heading}`}>Logged-in sessions</div>
          <p className={`text-[11px] mt-1 ${muted}`}>
            Lift cookies from your daily Chrome so the boop browser is signed
            in to the same accounts. Avoids login walls (Google, X, …) entirely.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <select
            value={profileDir ?? ""}
            onChange={(e) => setProfileDir(e.target.value)}
            disabled={profiles.length === 0}
            className={`text-[11px] px-2 py-1 rounded-md border ${
              isDark
                ? "bg-slate-950/40 border-slate-700 text-slate-200"
                : "bg-white border-slate-300 text-slate-800"
            }`}
          >
            {profiles.map((p) => (
              <option key={p.dir} value={p.dir}>
                {p.userName ? `${p.userName} (${p.name})` : p.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => profileDir && rescan(profileDir)}
            disabled={!profileDir || scanning}
            className={`text-[11px] px-2 py-1 rounded-md border transition ${
              isDark
                ? "border-slate-700 hover:bg-slate-800 disabled:opacity-50"
                : "border-slate-300 hover:bg-slate-50 disabled:opacity-50"
            }`}
          >
            {scanning ? "Scanning…" : "Rescan"}
          </button>
        </div>
      </div>

      {scanError && (
        <div
          className={`mt-2 text-[11px] ${
            isDark ? "text-rose-400" : "text-rose-600"
          }`}
        >
          {scanError}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-1.5">
        {scan === null && !scanError && (
          <div className={`text-[11px] ${muted}`}>Scanning…</div>
        )}
        {scan?.map((svc) => {
          const imp = importsByService.get(svc.service);
          const state = rowState[svc.service] ?? {};
          const verifyFailed = imp && imp.verifiedOk === false;
          const status = svc.hasSignature
            ? imp
              ? verifyFailed
                ? { dot: "bg-amber-400", text: "Cookies expired", tone: muted }
                : { dot: "bg-emerald-400", text: "Active", tone: muted }
              : { dot: "bg-emerald-400", text: "Logged in", tone: muted }
            : svc.cookieCount > 0
              ? { dot: "bg-slate-500", text: "Not signed in", tone: muted }
              : { dot: "bg-slate-700", text: "—", tone: muted };
          const canImport = svc.hasSignature && !state.busy;
          return (
            <div
              key={svc.service}
              className={`flex items-center gap-3 px-3 py-2 rounded-md ${rowBg}`}
            >
              <div
                className={`w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-semibold shrink-0 ${
                  isDark
                    ? "bg-slate-900 text-slate-300 border border-slate-800"
                    : "bg-white text-slate-700 border border-slate-200"
                }`}
                aria-hidden
              >
                {SERVICE_ICON[svc.service] ?? "?"}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-xs font-medium ${heading}`}>{svc.label}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${status.dot}`} />
                  <span className={`text-[10px] ${status.tone}`}>{status.text}</span>
                  {imp?.identity && (
                    <span className={`text-[10px] mono ${muted}`}>· {imp.identity}</span>
                  )}
                  {imp && (
                    <span className={`text-[10px] ${muted}`}>
                      · {relTime(imp.lastImportedAt)}
                    </span>
                  )}
                </div>
                {state.message && (
                  <div
                    className={`text-[10px] mt-1 ${
                      state.message.tone === "ok"
                        ? isDark
                          ? "text-emerald-400"
                          : "text-emerald-600"
                        : isDark
                          ? "text-rose-400"
                          : "text-rose-600"
                    }`}
                  >
                    {state.message.text}
                  </div>
                )}
              </div>
              <button
                onClick={() => runImport(svc)}
                disabled={!canImport}
                className={`text-[11px] px-2 py-1 rounded-md border shrink-0 transition ${
                  isDark
                    ? "border-slate-700 hover:bg-slate-800 disabled:opacity-30"
                    : "border-slate-300 hover:bg-slate-50 disabled:opacity-30"
                }`}
              >
                {state.busy ? "Importing…" : imp ? "Refresh" : "Import"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
