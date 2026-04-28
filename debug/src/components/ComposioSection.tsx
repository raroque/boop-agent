import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { IntegrationLogo } from "../lib/branding.js";

type AuthMode = "managed" | "byo";

interface Connection {
  id: string;
  status: string;
  alias: string | null;
  accountLabel: string | null;
  accountEmail: string | null;
  accountName: string | null;
  accountAvatarUrl: string | null;
  createdAt: string | null;
}

interface Toolkit {
  slug: string;
  displayName: string;
  authMode: AuthMode;
  hasAuthConfig: boolean;
  logoUrl: string | null;
  description: string | null;
  toolCount: number | null;
  connections: Connection[];
}

interface ToolkitsResponse {
  enabled: boolean;
  toolkits: Toolkit[];
}

interface ToolSummary {
  slug: string;
  name: string;
  description?: string;
}

function hasActive(t: Toolkit): boolean {
  return t.connections.some((c) => c.status === "ACTIVE");
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

interface NeedsAuthConfigInfo {
  slug: string;
  message: string;
  setupUrl: string;
}

// Per-toolkit guidance for BYO OAuth setup. Composio doesn't host a shared OAuth
// app for these — the user has to register one on the toolkit's developer portal,
// then paste the credentials into Composio's auth-configs page. Adding entries
// here makes the setup flow self-explanatory; missing entries fall back to a
// generic message and the Composio link.
const BYO_PORTALS: Record<string, { label: string; url: string; note?: string }> = {
  twitter: {
    label: "X (Twitter) Developer Portal",
    url: "https://developer.x.com/en/portal/dashboard",
    note: "Create a Project → App, then grab the OAuth 2.0 Client ID + Secret.",
  },
  linkedin: {
    label: "LinkedIn Developer Portal",
    url: "https://www.linkedin.com/developers/apps",
    note: "Create an App, request the scopes you need, copy the Client ID + Secret.",
  },
  salesforce: {
    label: "Salesforce — Connected Apps",
    url: "https://help.salesforce.com/s/articleView?id=connected_app_create.htm",
    note: "Create a Connected App in your org's Setup, copy the Consumer Key + Secret.",
  },
};

const COMPOSIO_DASHBOARD_URL = "https://dashboard.composio.dev";

const INTRO_DISMISSED_KEY = "boop:connections:intro-dismissed";
const TOAST_TIMEOUT_MS = 6000;

interface ToastState {
  id: number;
  message: string;
  tone: "error" | "info";
}

function Toast({
  toast,
  onDismiss,
  isDark,
}: {
  toast: ToastState;
  onDismiss: () => void;
  isDark: boolean;
}) {
  const tone = toast.tone === "error"
    ? isDark
      ? "bg-rose-500/10 border-rose-500/30 text-rose-200"
      : "bg-rose-50 border-rose-200 text-rose-900"
    : isDark
      ? "bg-slate-800/80 border-slate-700 text-slate-200"
      : "bg-white border-slate-200 text-slate-700";
  return (
    <div
      role="status"
      className={`fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border px-3 py-2 text-xs shadow-lg fade-in ${tone}`}
    >
      <div className="flex items-start gap-3">
        <span className="flex-1 leading-snug">{toast.message}</span>
        <button
          onClick={onDismiss}
          className="text-[11px] underline opacity-70 hover:opacity-100 shrink-0"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

function IntroCard({ isDark, onDismiss }: { isDark: boolean; onDismiss: () => void }) {
  return (
    <div
      className={`rounded-xl border px-4 py-4 mb-4 ${
        isDark
          ? "bg-sky-500/5 border-sky-500/20 text-slate-300"
          : "bg-sky-50/60 border-sky-200 text-slate-700"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 text-xs leading-relaxed">
          <div className={`font-semibold mb-1 ${isDark ? "text-slate-100" : "text-slate-900"}`}>
            Connect your accounts
          </div>
          <p className="mb-2">
            Each connected toolkit becomes a tool the agent can use when you ask it for things —
            "what's on my calendar?" needs Google Calendar, "summarize my last 5 emails" needs
            Gmail. The agent only loads the toolkits a given task needs, so connecting more here
            doesn't slow down anything.
          </p>
          <ul className="space-y-1">
            <li>
              <span
                className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded mr-2 ${
                  isDark ? "bg-emerald-400/10 text-emerald-400" : "bg-emerald-50 text-emerald-700"
                }`}
              >
                Ready to connect
              </span>
              Click Connect, log into your account in the popup, you're done.
            </li>
            <li>
              <span
                className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded mr-2 ${
                  isDark ? "bg-amber-400/10 text-amber-400" : "bg-amber-50 text-amber-700"
                }`}
              >
                Needs auth config
              </span>
              Toolkit's terms don't allow a shared OAuth app, so you have to register your own
              once. The card shows the steps.
            </li>
          </ul>
        </div>
        <button
          onClick={onDismiss}
          className={`text-[11px] underline shrink-0 ${
            isDark ? "text-slate-500 hover:text-slate-300" : "text-slate-400 hover:text-slate-600"
          }`}
        >
          Hide
        </button>
      </div>
    </div>
  );
}

export function ComposioSection({ isDark }: { isDark: boolean }) {
  const [data, setData] = useState<ToolkitsResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [needsAuthConfig, setNeedsAuthConfig] = useState<NeedsAuthConfigInfo | null>(null);
  const [showIntro, setShowIntro] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(INTRO_DISMISSED_KEY) !== "1";
  });
  const dismissIntro = useCallback(() => {
    setShowIntro(false);
    try {
      window.localStorage.setItem(INTRO_DISMISSED_KEY, "1");
    } catch {
      /* ignore — private mode etc. */
    }
  }, []);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [toolsBySlug, setToolsBySlug] = useState<
    Record<string, ToolSummary[] | "loading" | "error">
  >({});
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast(null);
  }, []);
  const showToast = useCallback((message: string, tone: ToastState["tone"] = "error") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), message, tone });
    toastTimerRef.current = setTimeout(() => {
      toastTimerRef.current = null;
      setToast(null);
    }, TOAST_TIMEOUT_MS);
  }, []);
  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    [],
  );
  // OAuth popup polling interval — kept in a ref so we can clear it on unmount
  // (prevents an orphan interval firing fetches after the panel closes).
  const authPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(
    () => () => {
      if (authPollRef.current) clearInterval(authPollRef.current);
    },
    [],
  );

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
      setNeedsAuthConfig(null);
      try {
        const r = await fetch(`/api/composio/toolkits/${slug}/authorize`, { method: "POST" });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          if (err?.needsAuthConfig) {
            setNeedsAuthConfig({
              slug,
              message: err.error,
              setupUrl: err.setupUrl ?? COMPOSIO_DASHBOARD_URL,
            });
            setBusy(null);
            return;
          }
          showToast(`Authorize failed: ${err?.error ?? r.statusText}`);
          setBusy(null);
          return;
        }
        const { redirectUrl } = await r.json();
        if (!redirectUrl) {
          showToast("Composio did not return a redirect URL.");
          setBusy(null);
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
        // Replace any prior poll (defensive — you'd have to spam Connect for this to matter).
        if (authPollRef.current) clearInterval(authPollRef.current);
        authPollRef.current = setInterval(async () => {
          if (!popup || popup.closed) {
            if (authPollRef.current) {
              clearInterval(authPollRef.current);
              authPollRef.current = null;
            }
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
        showToast(`Authorize failed: ${String(err)}`);
        setBusy(null);
      }
    },
    [fetchToolkits, showToast],
  );

  const disconnect = useCallback(
    async (slug: string, connectionId: string) => {
      setBusy(`${slug}:${connectionId}`);
      try {
        const r = await fetch(`/api/composio/toolkits/${slug}/disconnect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connectionId }),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          showToast(`Disconnect failed: ${err?.error ?? r.statusText}`);
          return;
        }
        await fetchToolkits();
      } catch (err) {
        showToast(`Disconnect failed: ${String(err)}`);
      } finally {
        setBusy(null);
      }
    },
    [fetchToolkits, showToast],
  );

  const rename = useCallback(
    async (connectionId: string, alias: string): Promise<boolean> => {
      try {
        const r = await fetch(`/api/composio/connections/${connectionId}/rename`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alias }),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          showToast(`Rename failed: ${err?.error ?? r.statusText}`);
          return false;
        }
        await fetchToolkits();
        return true;
      } catch (err) {
        showToast(`Rename failed: ${String(err)}`);
        return false;
      }
    },
    [fetchToolkits, showToast],
  );

  const toggleTools = useCallback(
    async (slug: string) => {
      const willExpand = !expanded[slug];
      setExpanded((prev) => ({ ...prev, [slug]: willExpand }));
      if (!willExpand) return;
      if (toolsBySlug[slug] && toolsBySlug[slug] !== "error") return;
      setToolsBySlug((prev) => ({ ...prev, [slug]: "loading" }));
      try {
        const r = await fetch(`/api/composio/toolkits/${slug}/tools`);
        if (!r.ok) throw new Error(r.statusText);
        const json = (await r.json()) as { tools: ToolSummary[] };
        setToolsBySlug((prev) => ({ ...prev, [slug]: json.tools }));
      } catch {
        setToolsBySlug((prev) => ({ ...prev, [slug]: "error" }));
      }
    },
    [expanded, toolsBySlug],
  );

  const cardBg = isDark ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200";
  const muted = isDark ? "text-slate-500" : "text-slate-400";

  const activeCount =
    data?.toolkits.reduce((n, t) => n + t.connections.filter((c) => c.status === "ACTIVE").length, 0) ?? 0;

  return (
    <section>
      <SectionHeader
        title="Composio toolkits"
        count={activeCount}
        isDark={isDark}
        hint={data?.enabled === false ? "Disabled — set COMPOSIO_API_KEY in .env.local" : undefined}
      />

      {showIntro && data?.enabled !== false && <IntroCard isDark={isDark} onDismiss={dismissIntro} />}

      {needsAuthConfig && (
        <div
          className={`rounded-xl border px-4 py-4 mb-4 text-sm ${
            isDark
              ? "bg-amber-500/5 border-amber-500/30 text-amber-200"
              : "bg-amber-50 border-amber-200 text-amber-900"
          }`}
        >
          <div className="font-medium mb-1">
            <span className="mono">{needsAuthConfig.slug}</span> needs a one-time auth config
          </div>
          <div className="text-xs opacity-90 mb-2">
            Composio doesn't host a managed OAuth app for this toolkit, so you have to bring your
            own. One-time setup (takes a few minutes): create an OAuth app on the toolkit's
            developer portal, then register it as an Auth Config in Composio's dashboard. After
            that, come back here and click Connect.
          </div>
          <div className="flex items-center gap-3">
            <a
              href={needsAuthConfig.setupUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs underline text-amber-700 dark:text-amber-300"
            >
              Open Composio Auth Configs →
            </a>
            <button
              onClick={() => setNeedsAuthConfig(null)}
              className={`text-xs underline ${isDark ? "text-slate-400" : "text-slate-500"}`}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {data?.enabled === false ? (
        <div className={`rounded-xl border px-4 py-6 text-sm ${cardBg} ${muted}`}>
          Add <code>COMPOSIO_API_KEY</code> to <code>.env.local</code> and restart the server to
          connect integrations like Gmail, Slack, GitHub, Linear, Notion, and more. Get a key at{" "}
          <a
            href="https://app.composio.dev/developers?utm_source=chris&utm_medium=youtube&utm_campaign=collab"
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
        (() => {
          const toolkits = data?.toolkits ?? [];
          const needsSetup = toolkits.filter(
            (t) => !hasActive(t) && t.authMode === "byo" && !t.hasAuthConfig,
          );
          const ready = toolkits.filter((t) => !needsSetup.includes(t));
          return (
            <div className="space-y-6">
              {ready.length > 0 && (
                <SubsectionGrid
                  label="Ready to connect"
                  hint="Composio-managed OAuth — click Connect"
                  isDark={isDark}
                >
                  {ready.map((t) => (
                    <ToolkitCard
                      key={t.slug}
                      t={t}
                      busy={busy}
                      cardBg={cardBg}
                      muted={muted}
                      isDark={isDark}
                      expanded={!!expanded[t.slug]}
                      tools={toolsBySlug[t.slug]}
                      onConnect={connect}
                      onDisconnect={disconnect}
                      onRename={rename}
                      onToggleTools={toggleTools}
                    />
                  ))}
                </SubsectionGrid>
              )}
              {needsSetup.length > 0 && (
                <SubsectionGrid
                  label="Needs one-time auth config"
                  hint="Toolkit doesn't allow a shared OAuth app — bring your own"
                  isDark={isDark}
                >
                  {needsSetup.map((t) => (
                    <ToolkitCard
                      key={t.slug}
                      t={t}
                      busy={busy}
                      cardBg={cardBg}
                      muted={muted}
                      isDark={isDark}
                      expanded={!!expanded[t.slug]}
                      tools={toolsBySlug[t.slug]}
                      onConnect={connect}
                      onDisconnect={disconnect}
                      onRename={rename}
                      onToggleTools={toggleTools}
                    />
                  ))}
                </SubsectionGrid>
              )}
            </div>
          );
        })()
      )}
      {toast && <Toast toast={toast} onDismiss={dismissToast} isDark={isDark} />}
    </section>
  );
}

function ToolkitCard({
  t,
  busy,
  cardBg,
  muted,
  isDark,
  expanded,
  tools,
  onConnect,
  onDisconnect,
  onRename,
  onToggleTools,
}: {
  t: Toolkit;
  busy: string | null;
  cardBg: string;
  muted: string;
  isDark: boolean;
  expanded: boolean;
  tools: ToolSummary[] | "loading" | "error" | undefined;
  onConnect: (slug: string) => void;
  onDisconnect: (slug: string, connectionId: string) => void;
  onRename: (connectionId: string, alias: string) => Promise<boolean>;
  onToggleTools: (slug: string) => void;
}) {
  const hasConnections = t.connections.length > 0;
  const needsSetup = t.authMode === "byo" && !t.hasAuthConfig && !hasConnections;
  const connectBusy = busy === t.slug;

  return (
    <div className={`border rounded-xl px-4 py-3 fade-in ${cardBg}`}>
      <div className="flex items-center gap-4">
        <IntegrationLogo raw={t.slug} logoUrl={t.logoUrl ?? undefined} size={32} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-sm font-medium ${
                isDark ? "text-slate-200" : "text-slate-800"
              }`}
            >
              {t.displayName}
            </span>
            <span className={`text-xs mono ${muted}`}>{t.slug}</span>
            {t.authMode === "byo" && t.hasAuthConfig && !hasConnections && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                  isDark ? "bg-sky-400/10 text-sky-400" : "bg-sky-50 text-sky-700"
                }`}
              >
                BYO — configured
              </span>
            )}
            {t.toolCount != null && t.toolCount > 0 && (
              <button
                onClick={() => onToggleTools(t.slug)}
                className={`text-[10px] mono underline ${muted} hover:text-sky-500`}
              >
                {expanded ? "Hide" : "Show"} {t.toolCount} tools
              </button>
            )}
          </div>
          {t.description && (
            <p className={`text-xs ${muted} leading-snug mt-0.5 line-clamp-2`}>
              {t.description}
            </p>
          )}
          {!hasConnections && (
            <span className={`text-xs ${muted}`}>
              {needsSetup ? "Auth config required" : "Not connected"}
            </span>
          )}
        </div>
        {!hasConnections && !needsSetup && (
          <button
            onClick={() => onConnect(t.slug)}
            disabled={connectBusy}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors shrink-0 ${
              connectBusy ? "bg-slate-600 text-slate-300" : "bg-sky-600 hover:bg-sky-500 text-white"
            }`}
          >
            {connectBusy ? "Connecting…" : "Connect"}
          </button>
        )}
        {needsSetup && (
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
              isDark ? "bg-amber-400/10 text-amber-400" : "bg-amber-50 text-amber-700"
            }`}
          >
            Setup needed
          </span>
        )}
      </div>

      {needsSetup && <ByoSetupSteps slug={t.slug} isDark={isDark} muted={muted} onConnect={onConnect} />}

      {hasConnections && (
        <div className="mt-3 space-y-1.5">
          {t.connections.map((c, i) => (
            <ConnectionRow
              key={c.id}
              slug={t.slug}
              conn={c}
              index={i}
              busy={busy === `${t.slug}:${c.id}`}
              isDark={isDark}
              muted={muted}
              onDisconnect={onDisconnect}
              onRename={onRename}
            />
          ))}
          <button
            onClick={() => onConnect(t.slug)}
            disabled={connectBusy}
            className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
              isDark
                ? "border border-slate-700 text-slate-300 hover:bg-slate-800"
                : "border border-slate-300 text-slate-600 hover:bg-slate-100"
            } ${connectBusy ? "opacity-50" : ""}`}
          >
            {connectBusy ? "Connecting…" : "+ Add another account"}
          </button>
        </div>
      )}

      {expanded && <ToolList tools={tools} isDark={isDark} muted={muted} />}
    </div>
  );
}

function ConnectionRow({
  slug,
  conn,
  index,
  busy,
  isDark,
  muted,
  onDisconnect,
  onRename,
}: {
  slug: string;
  conn: Connection;
  index: number;
  busy: boolean;
  isDark: boolean;
  muted: string;
  onDisconnect: (slug: string, connectionId: string) => void;
  onRename: (connectionId: string, alias: string) => Promise<boolean>;
}) {
  const status = STATUS_COLORS[(conn.status ?? "").toUpperCase()] ?? STATUS_COLORS.INACTIVE;
  const primary = conn.alias || conn.accountLabel || conn.accountEmail || conn.accountName || `Account ${index + 1}`;
  const secondary =
    conn.alias && conn.accountEmail
      ? conn.accountEmail
      : conn.accountName && conn.accountEmail && primary !== conn.accountEmail
        ? conn.accountEmail
        : null;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conn.alias ?? "");
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const startEdit = () => {
    setDraft(conn.alias ?? "");
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setDraft(conn.alias ?? "");
  };
  const submit = async () => {
    if (submittingRef.current) return;
    const alias = draft.trim();
    if (!alias || alias === (conn.alias ?? "")) {
      cancelEdit();
      return;
    }
    submittingRef.current = true;
    setSaving(true);
    const ok = await onRename(conn.id, alias);
    setSaving(false);
    submittingRef.current = false;
    if (ok) setEditing(false);
  };
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  return (
    <div
      className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 ${
        isDark
          ? "bg-slate-900/40 border border-slate-800/80"
          : "bg-slate-50 border border-slate-200"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
      {conn.accountAvatarUrl && (
        <img
          src={conn.accountAvatarUrl}
          alt=""
          width={16}
          height={16}
          className="rounded-full"
          loading="lazy"
        />
      )}
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            if (e.key === "Escape") cancelEdit();
          }}
          onBlur={() => void submit()}
          placeholder="work, personal, …"
          maxLength={50}
          disabled={saving}
          aria-label="Account label"
          className={`text-xs font-medium px-1.5 py-0.5 rounded border outline-none w-40 ${
            isDark
              ? "bg-slate-950 border-sky-500/40 text-slate-100 focus:border-sky-400"
              : "bg-white border-sky-300 text-slate-800 focus:border-sky-500"
          }`}
        />
      ) : (
        <span className={`text-xs font-medium ${isDark ? "text-slate-200" : "text-slate-700"} truncate max-w-[18rem]`}>
          {primary}
        </span>
      )}
      {secondary && !editing && (
        <span className={`text-[11px] ${muted} truncate max-w-[14rem]`}>{secondary}</span>
      )}
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${status.badge}`}>
        {status.label}
      </span>
      <span className={`text-[10px] mono ${muted} truncate`}>{conn.id}</span>
      <div className="flex-1" />
      {editing ? (
        <>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void submit()}
            disabled={saving}
            className={`text-[11px] underline ${
              isDark ? "text-sky-400 hover:text-sky-300" : "text-sky-600 hover:text-sky-700"
            } disabled:opacity-50`}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={cancelEdit}
            disabled={saving}
            className={`text-[11px] underline ${muted} hover:text-rose-500 disabled:opacity-50`}
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          onClick={startEdit}
          className={`text-[11px] underline ${muted} hover:text-sky-500`}
        >
          Rename
        </button>
      )}
      <button
        onClick={() => onDisconnect(slug, conn.id)}
        disabled={busy || editing}
        className={`text-[11px] px-2 py-0.5 rounded transition-colors ${
          isDark
            ? "bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50"
            : "bg-slate-200 hover:bg-slate-300 text-slate-700 disabled:opacity-50"
        }`}
      >
        {busy ? "…" : "Disconnect"}
      </button>
    </div>
  );
}

function ByoSetupSteps({
  slug,
  isDark,
  muted,
  onConnect,
}: {
  slug: string;
  isDark: boolean;
  muted: string;
  onConnect: (slug: string) => void;
}) {
  const portal = BYO_PORTALS[slug];
  const wrapClass = `mt-3 pt-3 border-t ${isDark ? "border-slate-800" : "border-slate-200"}`;
  const linkClass = isDark
    ? "text-sky-400 hover:text-sky-300 underline"
    : "text-sky-600 hover:text-sky-700 underline";
  const stepNumberClass = `inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-semibold mr-2 shrink-0 ${
    isDark ? "bg-amber-400/15 text-amber-300" : "bg-amber-100 text-amber-800"
  }`;
  return (
    <div className={wrapClass}>
      <div className={`text-[11px] font-medium mb-2 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
        One-time setup (~5 min):
      </div>
      <ol className="space-y-1.5">
        <li className={`text-xs flex items-start ${isDark ? "text-slate-300" : "text-slate-700"}`}>
          <span className={stepNumberClass}>1</span>
          <span className="leading-snug">
            {portal ? (
              <>
                Register an OAuth app at{" "}
                <a href={portal.url} target="_blank" rel="noreferrer" className={linkClass}>
                  {portal.label} ↗
                </a>
                {portal.note && <span className={`block text-[11px] mt-0.5 ${muted}`}>{portal.note}</span>}
              </>
            ) : (
              <>Register an OAuth app on this toolkit's developer portal — copy the Client ID + Secret.</>
            )}
          </span>
        </li>
        <li className={`text-xs flex items-start ${isDark ? "text-slate-300" : "text-slate-700"}`}>
          <span className={stepNumberClass}>2</span>
          <span className="leading-snug">
            In{" "}
            <a href={COMPOSIO_DASHBOARD_URL} target="_blank" rel="noreferrer" className={linkClass}>
              Composio Dashboard ↗
            </a>
            : Toolkits → search <span className="mono">{slug}</span> → Add to project → paste those credentials.
          </span>
        </li>
        <li className={`text-xs flex items-start ${isDark ? "text-slate-300" : "text-slate-700"}`}>
          <span className={stepNumberClass}>3</span>
          <span className="leading-snug">
            Come back here and{" "}
            <button
              onClick={() => onConnect(slug)}
              className={`${linkClass} bg-transparent p-0 border-0 cursor-pointer`}
            >
              click Connect
            </button>{" "}
            to run OAuth.
          </span>
        </li>
      </ol>
    </div>
  );
}

function ToolList({
  tools,
  isDark,
  muted,
}: {
  tools: ToolSummary[] | "loading" | "error" | undefined;
  isDark: boolean;
  muted: string;
}) {
  const wrapClass = `mt-3 pt-3 border-t ${isDark ? "border-slate-800" : "border-slate-200"}`;
  if (!tools || tools === "loading") {
    return <div className={`${wrapClass} text-xs ${muted}`}>Loading tools…</div>;
  }
  if (tools === "error") {
    return <div className={`${wrapClass} text-xs text-rose-500`}>Failed to load tools.</div>;
  }
  if (tools.length === 0) {
    return <div className={`${wrapClass} text-xs ${muted}`}>No tools available.</div>;
  }
  return (
    <div className={wrapClass}>
      <div className="grid gap-1.5 max-h-64 overflow-y-auto pr-2">
        {tools.map((tool) => (
          <div
            key={tool.slug}
            className={`text-xs ${isDark ? "text-slate-300" : "text-slate-600"}`}
          >
            <span className="mono">{tool.slug}</span>
            {tool.description && (
              <span className={`ml-2 ${muted}`}>{truncate(tool.description, 120)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1).trimEnd() + "…";
}

function SubsectionGrid({
  label,
  hint,
  children,
  isDark,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  isDark: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <h3
          className={`text-[11px] font-semibold uppercase tracking-wider ${
            isDark ? "text-slate-400" : "text-slate-500"
          }`}
        >
          {label}
        </h3>
        {hint && (
          <span className={`text-[10px] ${isDark ? "text-slate-600" : "text-slate-400"}`}>
            {hint}
          </span>
        )}
      </div>
      <div className="grid gap-3">{children}</div>
    </div>
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
