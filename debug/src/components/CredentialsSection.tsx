import { useEffect, useState } from "react";

interface CredentialRow {
  _id: string;
  label: string;
  host: string;
  username: string;
  hasTotp: boolean;
  notes?: string;
  createdAt: number;
  lastUsedAt?: number;
}

interface ListResponse {
  configured: boolean;
  credentials: CredentialRow[];
}

export function CredentialsSection({ isDark }: { isDark: boolean }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [rows, setRows] = useState<CredentialRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);

  const refresh = async () => {
    try {
      const r = await fetch("/api/credentials");
      const j = (await r.json()) as ListResponse;
      setConfigured(j.configured);
      setRows(j.credentials ?? []);
    } catch {
      setConfigured(false);
      setRows([]);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  if (!loaded) return null;

  const cardBg = isDark ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200";
  const muted = isDark ? "text-slate-500" : "text-slate-400";

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <h2
          className={`text-xs font-semibold uppercase tracking-wider ${
            isDark ? "text-slate-500" : "text-slate-400"
          }`}
        >
          Browser credentials
        </h2>
        {rows.length > 0 && (
          <span
            className={`text-xs mono font-medium ${
              isDark ? "text-slate-600" : "text-slate-300"
            }`}
          >
            {rows.length}
          </span>
        )}
        <span className={`text-[10px] ${muted}`}>
          AES-256-GCM encrypted vault for browser-action login + 2FA
        </span>
        {configured && (
          <button
            onClick={() => setAdding((v) => !v)}
            className={`ml-auto text-[11px] px-2 py-1 rounded-md transition-colors ${
              isDark
                ? "bg-sky-500/10 text-sky-300 hover:bg-sky-500/20"
                : "bg-sky-50 text-sky-700 hover:bg-sky-100"
            }`}
          >
            {adding ? "Cancel" : "Add credential"}
          </button>
        )}
      </div>

      {!configured && (
        <div
          className={`border rounded-xl px-4 py-3 ${cardBg} ${
            isDark ? "text-amber-300" : "text-amber-700"
          }`}
        >
          <div className="text-sm font-medium mb-1">Encryption key not configured</div>
          <div className={`text-xs ${muted} leading-snug`}>
            Generate one with{" "}
            <code className={isDark ? "text-slate-300" : "text-slate-700"}>
              openssl rand -base64 32
            </code>{" "}
            and add it as <span className="mono">BROWSER_CREDENTIAL_KEY</span> in
            .env.local, then restart the server.
          </div>
        </div>
      )}

      {configured && adding && (
        <AddCredentialForm
          isDark={isDark}
          onSaved={() => {
            setAdding(false);
            refresh();
          }}
        />
      )}

      {configured && rows.length === 0 && !adding && (
        <div className={`border rounded-xl px-4 py-6 text-center ${cardBg}`}>
          <div className={`text-sm ${muted}`}>
            No credentials saved yet. Add one to let boop log in on your behalf.
          </div>
        </div>
      )}

      {configured && rows.length > 0 && (
        <div className="grid gap-2">
          {rows.map((row) => (
            <CredentialCard
              key={row._id}
              row={row}
              isDark={isDark}
              onDeleted={refresh}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function CredentialCard({
  row,
  isDark,
  onDeleted,
}: {
  row: CredentialRow;
  isDark: boolean;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const muted = isDark ? "text-slate-500" : "text-slate-400";
  const cardBg = isDark ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200";

  const handleDelete = async () => {
    if (!confirm(`Delete credential "${row.label}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/credentials/${row._id}`, { method: "DELETE" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        alert(`Delete failed: ${body.error ?? r.statusText}`);
        setDeleting(false);
        return;
      }
      onDeleted();
    } catch (err) {
      alert(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
      setDeleting(false);
    }
  };

  return (
    <div className={`border rounded-xl px-4 py-3 fade-in ${cardBg}`}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-sm font-medium ${isDark ? "text-slate-200" : "text-slate-800"}`}
            >
              {row.label}
            </span>
            <span className={`text-xs mono ${muted}`}>{row.host}</span>
            {row.hasTotp && (
              <span
                className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                  isDark ? "bg-emerald-400/10 text-emerald-400" : "bg-emerald-50 text-emerald-700"
                }`}
              >
                TOTP
              </span>
            )}
          </div>
          <div className={`text-xs ${muted} leading-snug mt-0.5`}>
            <span className="mono">{row.username}</span>
            {row.notes && <> · {row.notes}</>}
          </div>
          <div className={`text-[10px] ${muted} mt-1`}>
            Added {new Date(row.createdAt).toLocaleDateString()}
            {row.lastUsedAt && (
              <> · last used {new Date(row.lastUsedAt).toLocaleDateString()}</>
            )}
          </div>
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className={`text-[11px] px-2 py-1 rounded-md transition-colors shrink-0 ${
            isDark
              ? "bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
              : "bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-50"
          }`}
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
}

function AddCredentialForm({
  isDark,
  onSaved,
}: {
  isDark: boolean;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState("");
  const [host, setHost] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cardBg = isDark ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200";
  const inputCls = `w-full px-2.5 py-1.5 rounded-md text-sm border ${
    isDark
      ? "bg-slate-950/60 border-slate-700 text-slate-200 placeholder-slate-600"
      : "bg-white border-slate-300 text-slate-800 placeholder-slate-400"
  } focus:outline-none focus:ring-2 ${isDark ? "focus:ring-sky-500/30" : "focus:ring-sky-300"}`;
  const labelCls = `block text-[11px] font-medium mb-1 ${
    isDark ? "text-slate-400" : "text-slate-600"
  }`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const r = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim(),
          host: host.trim(),
          username,
          password,
          totpSecret: totpSecret.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setError(body.error ?? r.statusText);
        setSubmitting(false);
        return;
      }
      setLabel("");
      setHost("");
      setUsername("");
      setPassword("");
      setTotpSecret("");
      setNotes("");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`border rounded-xl px-4 py-3 mb-3 ${cardBg}`}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Label</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="github-personal"
            required
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Host</label>
          <input
            type="text"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="github.com"
            required
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Username / email</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
            required
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            className={inputCls}
          />
        </div>
        <div className="col-span-2">
          <label className={labelCls}>
            TOTP secret <span className="font-normal opacity-60">(optional, base32)</span>
          </label>
          <input
            type="password"
            value={totpSecret}
            onChange={(e) => setTotpSecret(e.target.value)}
            placeholder="JBSWY3DPEHPK3PXP"
            autoComplete="off"
            className={inputCls}
          />
        </div>
        <div className="col-span-2">
          <label className={labelCls}>Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="alt account, recovery email is …"
            className={inputCls}
          />
        </div>
      </div>
      {error && (
        <div
          className={`mt-3 text-xs ${isDark ? "text-rose-300" : "text-rose-700"}`}
        >
          {error}
        </div>
      )}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="submit"
          disabled={submitting}
          className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
            isDark
              ? "bg-sky-500 text-white hover:bg-sky-400 disabled:opacity-50"
              : "bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-50"
          }`}
        >
          {submitting ? "Saving…" : "Save credential"}
        </button>
      </div>
    </form>
  );
}
