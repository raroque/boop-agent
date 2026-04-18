import { useCallback, useEffect, useState } from "react";
import { IntegrationLogo } from "../lib/branding.js";

interface Toolkit {
  slug: string;
  displayName: string;
  connected: boolean;
  status: string | null;
  accountLabel: string | null;
  connectionId: string | null;
}

interface ToolkitsResponse {
  enabled: boolean;
  toolkits: Toolkit[];
}

const STATUS_COLORS: Record<string, { dot: string; label: string; badge: string }> = {
  ACTIVE: {
    dot: "bg-emerald-400",
    label: "Connected",
    badge: "bg-emerald-400/10 text-emerald-500",
  },
  INITIATED: {
    dot: "bg-amber-400",
    label: "Pending",
    badge: "bg-amber-400/10 text-amber-500",
  },
  INITIALIZING: {
    dot: "bg-amber-400",
    label: "Initializing",
    badge: "bg-amber-400/10 text-amber-500",
  },
  EXPIRED: {
    dot: "bg-rose-400",
    label: "Expired",
    badge: "bg-rose-400/10 text-rose-500",
  },
  FAILED: {
    dot: "bg-rose-400",
    label: "Failed",
    badge: "bg-rose-400/10 text-rose-500",
  },
  INACTIVE: {
    dot: "bg-slate-500",
    label: "Inactive",
    badge: "bg-slate-400/10 text-slate-500",
  },
};

export function ComposioSection({ isDark }: { isDark: boolean }) {
  const [data, setData] = useState<ToolkitsResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchToolkits = useCallback(async () => {
    try {
      const r = await fetch("/api/composio/toolkits");
      const json = (await r.json()) as ToolkitsResponse;
      setData(json);
    } catch {
      setData({ enabled: false, toolkits: [] });
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchToolkits();
  }, [fetchToolkits]);

  const connect = useCallback(
    async (slug: string) => {
      setBusy(slug);
      try {
        const r = await fetch(`/api/composio/toolkits/${slug}/authorize`, { method: "POST" });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          alert(`Authorize failed: ${err?.error ?? r.statusText}`);
          return;
        }
        const { redirectUrl } = await r.json();
        if (!redirectUrl) {
          alert("Composio did not return a redirect URL.");
          return;
        }
        const w = 600;
        const h = 700;
        const left = window.screenX + (window.outerWidth - w) / 2;
        const top = window.screenY + (window.outerHeight - h) / 2;
        const popup = window.open(
          redirectUrl,
          "composio-auth",
          `width=${w},height=${h},left=${left},top=${top}`,
        );
        // Poll until the popup closes, then refresh.
        const interval = setInterval(async () => {
          if (!popup || popup.closed) {
            clearInterval(interval);
            try {
              await fetch("/api/composio/refresh", { method: "POST" });
            } catch {
              /* ignore */
            }
            await fetchToolkits();
            setBusy(null);
          }
        }, 800);
      } catch (err) {
        alert(`Authorize failed: ${String(err)}`);
        setBusy(null);
      }
    },
    [fetchToolkits],
  );

  const disconnect = useCallback(
    async (slug: string, connectionId: string) => {
      setBusy(slug);
      try {
        const r = await fetch(`/api/composio/toolkits/${slug}/disconnect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connectionId }),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          alert(`Disconnect failed: ${err?.error ?? r.statusText}`);
          return;
        }
        await fetchToolkits();
      } catch (err) {
        alert(`Disconnect failed: ${String(err)}`);
      } finally {
        setBusy(null);
      }
    },
    [fetchToolkits],
  );

  const cardBg = isDark ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200";
  const muted = isDark ? "text-slate-500" : "text-slate-400";

  return (
    <section>
      <SectionHeader
        title="Composio toolkits"
        count={data?.toolkits.filter((t) => t.connected).length ?? 0}
        isDark={isDark}
        hint={data?.enabled === false ? "Disabled — set COMPOSIO_API_KEY in .env.local" : undefined}
      />

      {data?.enabled === false ? (
        <div
          className={`rounded-xl border px-4 py-6 text-sm ${cardBg} ${muted}`}
        >
          Add <code>COMPOSIO_API_KEY</code> to <code>.env.local</code> and restart the server to
          connect integrations like Gmail, Slack, GitHub, Linear, Notion, and more.
          Get a key at{" "}
          <a
            href="https://app.composio.dev/developers"
            target="_blank"
            rel="noreferrer"
            className="text-sky-500 underline"
          >
            app.composio.dev/developers
          </a>
          .
        </div>
      ) : !loaded ? (
        <div className="grid gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={`h-20 rounded-xl border ${cardBg} shimmer`} />
          ))}
        </div>
      ) : (
        <div className="grid gap-3">
          {data?.toolkits.map((t) => {
            const statusKey = (t.status ?? "").toUpperCase();
            const status = STATUS_COLORS[statusKey] ?? STATUS_COLORS.INACTIVE;
            const isBusy = busy === t.slug;
            return (
              <div
                key={t.slug}
                className={`border rounded-xl px-4 py-3 fade-in ${cardBg}`}
              >
                <div className="flex items-center gap-4">
                  <IntegrationLogo raw={t.slug} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-medium ${
                          isDark ? "text-slate-200" : "text-slate-800"
                        }`}
                      >
                        {t.displayName}
                      </span>
                      <span className={`text-xs mono ${muted}`}>{t.slug}</span>
                    </div>
                    {t.connected ? (
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${status.badge}`}
                        >
                          {status.label}
                        </span>
                        {t.accountLabel && (
                          <span className={`text-xs ${muted}`}>{t.accountLabel}</span>
                        )}
                      </div>
                    ) : (
                      <span className={`text-xs ${muted}`}>Not connected</span>
                    )}
                  </div>
                  {t.connected ? (
                    <button
                      onClick={() => t.connectionId && disconnect(t.slug, t.connectionId)}
                      disabled={isBusy || !t.connectionId}
                      className={`px-3 py-1.5 text-xs rounded-md transition-colors shrink-0 ${
                        isDark
                          ? "bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50"
                          : "bg-slate-200 hover:bg-slate-300 text-slate-700 disabled:opacity-50"
                      }`}
                    >
                      {isBusy ? "…" : "Disconnect"}
                    </button>
                  ) : (
                    <button
                      onClick={() => connect(t.slug)}
                      disabled={isBusy}
                      className={`px-3 py-1.5 text-xs rounded-md transition-colors shrink-0 ${
                        isBusy
                          ? "bg-slate-600 text-slate-300"
                          : "bg-sky-600 hover:bg-sky-500 text-white"
                      }`}
                    >
                      {isBusy ? "Connecting…" : "Connect"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SectionHeader({
  title,
  count,
  hint,
  isDark,
}: {
  title: string;
  count: number;
  hint?: string;
  isDark: boolean;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <h2
        className={`text-xs font-semibold uppercase tracking-wider ${
          isDark ? "text-slate-500" : "text-slate-400"
        }`}
      >
        {title}
      </h2>
      {count > 0 && (
        <span
          className={`text-xs mono font-medium ${
            isDark ? "text-slate-600" : "text-slate-300"
          }`}
        >
          {count}
        </span>
      )}
      {hint && (
        <span className={`text-[10px] ${isDark ? "text-slate-600" : "text-slate-400"}`}>
          {hint}
        </span>
      )}
    </div>
  );
}
