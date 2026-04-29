import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api.js";
import { BrowserSection } from "./BrowserSection.js";

interface ToggleSetting {
  kind: "toggle";
  key: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
}

interface TimezoneSetting {
  kind: "timezone";
  key: string;
  label: string;
  description: string;
}

type Setting = ToggleSetting | TimezoneSetting;

const SETTINGS: Setting[] = [
  {
    kind: "toggle",
    key: "proactive_enabled",
    label: "Proactive email surfacing",
    description:
      "Watch new Gmail messages. When something important arrives, you'll get an iMessage. Turn off to silence the watcher entirely without disconnecting Gmail.",
    defaultEnabled: true,
  },
  {
    kind: "timezone",
    key: "user_timezone",
    label: "Your timezone",
    description:
      "Used for deadline checks, 'today', and any time-of-day reasoning. The agent can also update this via iMessage when you tell it your timezone.",
  },
];

// A short curated list for the dropdown — covers most US users plus a few
// common international zones. The text input next to the dropdown lets the
// user paste any IANA ID for the long tail.
const COMMON_TIMEZONES: Array<{ value: string; label: string }> = [
  { value: "America/New_York", label: "America/New_York (Eastern)" },
  { value: "America/Chicago", label: "America/Chicago (Central)" },
  { value: "America/Denver", label: "America/Denver (Mountain)" },
  { value: "America/Phoenix", label: "America/Phoenix (Arizona)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (Pacific)" },
  { value: "America/Anchorage", label: "America/Anchorage (Alaska)" },
  { value: "Pacific/Honolulu", label: "Pacific/Honolulu (Hawaii)" },
  { value: "Europe/London", label: "Europe/London" },
  { value: "Europe/Paris", label: "Europe/Paris" },
  { value: "Europe/Berlin", label: "Europe/Berlin" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo" },
  { value: "Asia/Kolkata", label: "Asia/Kolkata" },
  { value: "Australia/Sydney", label: "Australia/Sydney" },
  { value: "UTC", label: "UTC" },
];

export function SettingsPanel({ isDark }: { isDark: boolean }) {
  const muted = isDark ? "text-slate-500" : "text-slate-400";

  return (
    <div className="flex flex-col h-full -m-5">
      <div
        className={`shrink-0 border-b px-5 py-3 flex items-center gap-3 ${
          isDark ? "border-slate-800" : "border-slate-200"
        }`}
      >
        <h2
          className={`text-xs font-semibold uppercase tracking-wider ${
            isDark ? "text-slate-500" : "text-slate-400"
          }`}
        >
          Agent Settings
        </h2>
        <span className={`text-xs mono ${muted}`}>{SETTINGS.length} setting(s)</span>
      </div>

      <div className="flex-1 overflow-y-auto debug-scroll p-5 space-y-3">
        {SETTINGS.map((s) =>
          s.kind === "toggle" ? (
            <ToggleRow key={s.key} setting={s} isDark={isDark} />
          ) : (
            <TimezoneRow key={s.key} setting={s} isDark={isDark} />
          ),
        )}
        <BrowserSection isDark={isDark} />
      </div>
    </div>
  );
}

function SettingShell({
  label,
  description,
  debugLine,
  control,
  isDark,
}: {
  label: string;
  description: string;
  debugLine: string;
  control: React.ReactNode;
  isDark: boolean;
}) {
  const cardBg = isDark
    ? "bg-slate-900/40 border-slate-800/60"
    : "bg-white border-slate-200";
  return (
    <div
      className={`border rounded-xl p-4 flex items-start justify-between gap-6 fade-in ${cardBg}`}
    >
      <div className="min-w-0 flex-1">
        <div
          className={`text-sm font-medium ${
            isDark ? "text-slate-200" : "text-slate-800"
          }`}
        >
          {label}
        </div>
        <div
          className={`text-xs mt-1 leading-relaxed ${
            isDark ? "text-slate-400" : "text-slate-600"
          }`}
        >
          {description}
        </div>
        <div
          className={`text-[10px] mono mt-2 ${
            isDark ? "text-slate-600" : "text-slate-400"
          }`}
        >
          {debugLine}
        </div>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function ToggleRow({
  setting,
  isDark,
}: {
  setting: ToggleSetting;
  isDark: boolean;
}) {
  const value = useQuery(api.settings.get, { key: setting.key });
  const setSetting = useMutation(api.settings.set);

  const loading = value === undefined;
  const enabled = loading
    ? setting.defaultEnabled
    : value === null
      ? setting.defaultEnabled
      : value !== "false";

  async function toggle() {
    if (loading) return;
    await setSetting({ key: setting.key, value: enabled ? "false" : "true" });
  }

  const debugLine = `settings.${setting.key} = ${
    loading
      ? "…"
      : value === null
        ? `(unset, default ${setting.defaultEnabled ? "true" : "false"})`
        : `"${value}"`
  }`;

  return (
    <SettingShell
      label={setting.label}
      description={setting.description}
      debugLine={debugLine}
      isDark={isDark}
      control={
        <button
          onClick={toggle}
          disabled={loading}
          role="switch"
          aria-checked={enabled}
          aria-label={`Toggle ${setting.label}`}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
          } ${
            enabled
              ? isDark
                ? "bg-emerald-500 focus:ring-emerald-500/50 focus:ring-offset-slate-950"
                : "bg-emerald-500 focus:ring-emerald-500/50 focus:ring-offset-white"
              : isDark
                ? "bg-slate-700 focus:ring-slate-500/50 focus:ring-offset-slate-950"
                : "bg-slate-300 focus:ring-slate-400/50 focus:ring-offset-white"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      }
    />
  );
}

function TimezoneRow({
  setting,
  isDark,
}: {
  setting: TimezoneSetting;
  isDark: boolean;
}) {
  const value = useQuery(api.settings.get, { key: setting.key });
  const setSetting = useMutation(api.settings.set);
  const clearSetting = useMutation(api.settings.clear);

  const [draft, setDraft] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState<string>("");

  const loading = value === undefined;
  const stored = !loading && value !== null ? value : null;

  // Keep the input in sync when the stored value changes (e.g. agent updates
  // it from iMessage while the panel is open).
  useEffect(() => {
    if (!loading) setDraft(stored ?? "");
  }, [loading, stored]);

  // Render "now" in the saved zone (or the browser's, as a preview) so the
  // user can confirm they picked the right one.
  useEffect(() => {
    function tick() {
      const tz = stored ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
      try {
        const d = new Date();
        const fmt = new Intl.DateTimeFormat(undefined, {
          timeZone: tz,
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        });
        setNow(fmt.format(d));
      } catch {
        setNow("(invalid timezone)");
      }
    }
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [stored]);

  async function save(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Pick a timezone or clear to reset.");
      return;
    }
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: trimmed });
    } catch {
      setError(`"${trimmed}" isn't a recognized IANA timezone.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await setSetting({ key: setting.key, value: trimmed });
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setSaving(true);
    setError(null);
    try {
      await clearSetting({ key: setting.key });
      setDraft("");
    } finally {
      setSaving(false);
    }
  }

  const debugLine = `settings.${setting.key} = ${
    loading ? "…" : stored === null ? "(unset, falling back to server zone)" : `"${stored}"`
  }${now ? ` · now: ${now}` : ""}`;

  const inputBg = isDark
    ? "bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-600"
    : "bg-white border-slate-300 text-slate-800 placeholder:text-slate-400";
  const btnBg = isDark
    ? "bg-sky-600 hover:bg-sky-500 text-white"
    : "bg-sky-600 hover:bg-sky-500 text-white";
  const clearBtnBg = isDark
    ? "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
    : "text-slate-500 hover:text-slate-700 hover:bg-slate-100";

  return (
    <SettingShell
      label={setting.label}
      description={setting.description}
      debugLine={debugLine}
      isDark={isDark}
      control={
        <div className="flex flex-col items-end gap-2 min-w-[260px]">
          <div className="flex items-center gap-2 w-full">
            <select
              value={
                COMMON_TIMEZONES.some((t) => t.value === draft) ? draft : ""
              }
              onChange={(e) => setDraft(e.target.value)}
              disabled={saving || loading}
              className={`text-xs px-2 py-1.5 border rounded-md flex-1 ${inputBg}`}
            >
              <option value="">— pick a common zone —</option>
              {COMMON_TIMEZONES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 w-full">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="or paste IANA ID e.g. America/Chicago"
              disabled={saving || loading}
              className={`text-xs px-2 py-1.5 border rounded-md flex-1 mono ${inputBg}`}
            />
            <button
              onClick={() => save(draft)}
              disabled={saving || loading || draft.trim() === (stored ?? "")}
              className={`text-xs px-3 py-1.5 rounded-md disabled:opacity-50 ${btnBg}`}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
          {stored !== null && (
            <button
              onClick={clear}
              disabled={saving || loading}
              className={`text-[11px] px-2 py-1 rounded-md ${clearBtnBg}`}
            >
              Reset to server default
            </button>
          )}
          {error && <div className="text-[11px] text-rose-400">{error}</div>}
        </div>
      }
    />
  );
}
