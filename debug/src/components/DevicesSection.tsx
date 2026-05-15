import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api.js";

function relativeTime(ms: number): string {
  const delta = Math.max(0, Date.now() - ms);
  const s = Math.floor(delta / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function DevicesSection({ isDark }: { isDark: boolean }) {
  const devices = useQuery(api.devices.list, {});
  const revoke = useMutation(api.devices.revoke);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  const [pairSuccess, setPairSuccess] = useState<string | null>(null);

  const cardBg = isDark ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200";
  const muted = isDark ? "text-slate-500" : "text-slate-400";
  const inputBg = isDark
    ? "bg-slate-900 border-slate-800 text-slate-100"
    : "bg-white border-slate-300 text-slate-900";

  const onPair = async (e: React.FormEvent) => {
    e.preventDefault();
    setPairError(null);
    setPairSuccess(null);
    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setPairError("Enter the 6-digit code shown on the phone.");
      return;
    }
    setPairing(true);
    try {
      const r = await fetch("/api/channels/ios/pair/consume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed, label: label.trim() || undefined }),
      });
      const j = (await r.json()) as { deviceId?: string; label?: string; error?: string };
      if (!r.ok) {
        setPairError(j.error ?? "Pairing failed.");
        return;
      }
      setPairSuccess(
        `Paired${j.label ? ` "${j.label}"` : ""}. Your phone should pick up the bearer token shortly.`,
      );
      setCode("");
      setLabel("");
    } catch (err) {
      setPairError(err instanceof Error ? err.message : String(err));
    } finally {
      setPairing(false);
    }
  };

  const onRevoke = async (deviceId: string, displayLabel: string) => {
    if (!confirm(`Revoke "${displayLabel}"? This immediately invalidates its bearer token.`)) {
      return;
    }
    await revoke({ deviceId });
  };

  const list = devices ?? [];

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <h2
          className={`text-xs font-semibold uppercase tracking-wider ${
            isDark ? "text-slate-500" : "text-slate-400"
          }`}
        >
          iOS devices
        </h2>
        {list.length > 0 && (
          <span
            className={`text-xs mono font-medium ${
              isDark ? "text-slate-600" : "text-slate-300"
            }`}
          >
            {list.length}
          </span>
        )}
        <span className={`text-[10px] ${isDark ? "text-slate-600" : "text-slate-400"}`}>
          Phones paired to this boop
        </span>
      </div>

      <div className={`border rounded-lg p-4 mb-3 ${cardBg}`}>
        <form onSubmit={onPair} className="flex flex-wrap items-center gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="6-digit code"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            className={`mono text-sm tracking-widest border rounded px-3 py-1.5 w-32 ${inputBg}`}
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional)"
            maxLength={40}
            className={`text-sm border rounded px-3 py-1.5 ${inputBg}`}
          />
          <button
            type="submit"
            disabled={pairing || code.length !== 6}
            className={`text-sm font-medium px-3 py-1.5 rounded ${
              pairing || code.length !== 6
                ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                : "bg-indigo-600 text-white hover:bg-indigo-700"
            }`}
          >
            {pairing ? "Pairing…" : "Pair device"}
          </button>
          {pairError && (
            <span className="text-xs text-red-500">{pairError}</span>
          )}
          {pairSuccess && (
            <span className="text-xs text-emerald-500">{pairSuccess}</span>
          )}
        </form>
        <div className={`text-[11px] mt-2 ${muted}`}>
          On the phone: tap "Pair this device" — it shows a 6-digit code. Enter
          it above. The phone picks up its bearer token within ~2 seconds.
        </div>
      </div>

      {devices === undefined ? (
        <div className={`text-xs ${muted}`}>Loading…</div>
      ) : list.length === 0 ? (
        <div className={`text-xs ${muted}`}>No paired devices yet.</div>
      ) : (
        <div className="grid gap-2">
          {list.map((d) => {
            const display = d.label || d.deviceId.slice(0, 12);
            return (
              <div
                key={d._id}
                className={`border rounded-lg px-3 py-2 flex items-center justify-between ${cardBg}`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{display}</div>
                  <div className={`text-[11px] mono ${muted}`}>
                    {d.deviceId.slice(0, 8)}… · last seen {relativeTime(d.lastSeenAt)}
                  </div>
                </div>
                <button
                  onClick={() => onRevoke(d.deviceId, display)}
                  className={`text-xs px-2 py-1 rounded border ${
                    isDark
                      ? "border-slate-700 text-slate-400 hover:bg-red-900/20 hover:text-red-400 hover:border-red-900/50"
                      : "border-slate-300 text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-300"
                  }`}
                >
                  Revoke
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
