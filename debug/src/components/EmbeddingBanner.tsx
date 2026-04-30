import { useCallback, useEffect, useState } from "react";
import { useSocket } from "../lib/useSocket.js";

interface Status {
  provider: "voyage" | "openai" | "local";
  total: number;
  withEmbedding: number;
  withoutEmbedding: number;
  truncated: boolean;
  running: boolean;
}

const PROVIDER_LABEL: Record<Status["provider"], string> = {
  voyage: "Voyage (paid)",
  openai: "OpenAI (paid)",
  local: "local (free, BGE-large)",
};

export function EmbeddingBanner({ isDark }: { isDark: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ embedded: number; failed: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/memory/embedding-status");
      if (!r.ok) throw new Error(`status ${r.status}`);
      const data = (await r.json()) as Status;
      setStatus(data);
      // Trust the server: if it says nothing's running, clear busy. This is
      // the recovery path when a WebSocket drop swallowed the "done" event
      // and busy would otherwise stick at true forever, hiding the button.
      setBusy(data.running);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Belt-and-suspenders poll while busy so a dropped WebSocket eventually
  // surfaces the server's "not running" state and clears busy. Stops as
  // soon as busy flips false.
  useEffect(() => {
    if (!busy) return;
    const interval = setInterval(() => {
      void refresh();
    }, 3000);
    return () => clearInterval(interval);
  }, [busy, refresh]);

  // Live progress + auto-refresh on completion. We intentionally do not
  // refresh on every "progress" event — the banner shows the running
  // counter, and the final refresh on "done" picks up the new totals.
  useSocket((e) => {
    if (e.event === "memory.reembed.progress") {
      const d = e.data as { embedded: number; failed: number };
      setProgress({ embedded: d.embedded, failed: d.failed });
    } else if (e.event === "memory.reembed.done") {
      const d = e.data as { embedded: number; failed: number };
      setProgress({ embedded: d.embedded, failed: d.failed });
      setBusy(false);
      void refresh();
    }
  });

  const reembed = useCallback(async () => {
    setBusy(true);
    setErrorMsg(null);
    setProgress({ embedded: 0, failed: 0 });
    try {
      const r = await fetch("/api/memory/reembed", { method: "POST" });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setErrorMsg(data.error ?? `Re-embed failed (${r.status})`);
        setBusy(false);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }, []);

  if (!status) return null;

  const isStale = status.withoutEmbedding > 0;
  const showBanner = isStale || busy || errorMsg;
  if (!showBanner) return null;

  const tone = isStale && !busy ? "warn" : "info";
  const bg =
    tone === "warn"
      ? isDark
        ? "bg-amber-500/10 border-amber-500/30"
        : "bg-amber-50 border-amber-200"
      : isDark
        ? "bg-slate-800/40 border-slate-700"
        : "bg-slate-100 border-slate-200";
  const heading = isDark ? "text-slate-100" : "text-slate-900";
  const body = isDark ? "text-slate-400" : "text-slate-600";

  let title = "";
  let detail = "";
  if (busy) {
    title = "Re-embedding memories…";
    detail = progress
      ? `Embedded ${progress.embedded}${progress.failed ? ` · ${progress.failed} failed` : ""}.`
      : "Starting…";
  } else if (isStale) {
    title = `${status.withoutEmbedding} of ${status.total} memories have no embedding`;
    detail = `Semantic recall can't find them — falls back to literal substring matching. Re-embed via ${PROVIDER_LABEL[status.provider]} to fix.`;
  } else if (errorMsg) {
    title = "Re-embed error";
    detail = errorMsg;
  }

  return (
    <div className={`mx-5 my-3 rounded-lg border px-4 py-3 ${bg}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium ${heading}`}>{title}</div>
          <div className={`text-xs mt-1 ${body}`}>{detail}</div>
        </div>
        {!busy && isStale && (
          <button
            onClick={reembed}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-md border transition ${
              isDark
                ? "border-amber-500/40 hover:bg-amber-500/20 text-amber-200"
                : "border-amber-300 hover:bg-amber-100 text-amber-800"
            }`}
          >
            Re-embed now
          </button>
        )}
        {busy && (
          <div
            className={`shrink-0 text-xs px-3 py-1.5 rounded-md mono ${
              isDark ? "text-amber-300" : "text-amber-700"
            }`}
          >
            {progress?.embedded ?? 0} /{" "}
            {Math.max(
              status.withoutEmbedding,
              (progress?.embedded ?? 0) + (progress?.failed ?? 0),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
