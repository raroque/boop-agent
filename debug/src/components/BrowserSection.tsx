import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowReloadHorizontalIcon,
  ArrowRight01Icon,
  BrowserIcon,
  CancelCircleIcon,
  ChromeIcon,
  CircleLockCheckIcon,
  ComputerSettingsIcon,
  Download01Icon,
  EyeIcon,
  FloppyDiskIcon,
  Globe02Icon,
  Login03Icon,
  PlayIcon,
} from "@hugeicons/core-free-icons";
import { api } from "../../../convex/_generated/api.js";
import { panelCardClass, subtlePanelClass } from "./PanelPrimitives.js";

interface BrowserSettings {
  enabled: boolean;
  profileDir: string;
  showUi: boolean;
  loginHandoffEnabled: boolean;
  startUrl: string;
  channel: string;
  executablePath: string;
  extraArgs: string[];
}

interface BrowserStatus {
  running: boolean;
  patchrightVersion: string;
  detectedChromePath: string | null;
  launchedAt: number | null;
  settings: BrowserSettings;
  activeUrl: string | null;
}

const ENABLED_KEY = "browser_enabled";
const SHOW_UI_KEY = "browser_show_ui";
const LOGIN_HANDOFF_KEY = "browser_login_handoff";
const PROFILE_DIR_KEY = "browser_profile_dir";
const START_URL_KEY = "browser_start_url";
const CHANNEL_KEY = "browser_channel";
const EXECUTABLE_KEY = "browser_executable_path";
const EXTRA_ARGS_KEY = "browser_extra_args";

function validateBrowserSetting(settingKey: string, value: string): string | null {
  if (settingKey !== START_URL_KEY || !value.trim()) return null;

  try {
    const trimmed = value.trim();
    const withScheme = /^(https?:|about:)/i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const parsed = new URL(withScheme);
    const isAboutBlank =
      parsed.protocol === "about:" &&
      parsed.pathname.toLowerCase() === "blank" &&
      !parsed.search &&
      !parsed.hash;
    if (["http:", "https:"].includes(parsed.protocol) || isAboutBlank) return null;
  } catch {
    // Fall through to the shared validation message below.
  }

  return "Launch URL must be http(s) or about:blank.";
}

export function BrowserSection({ isDark }: { isDark: boolean }) {
  const [status, setStatus] = useState<BrowserStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const storedEnabled = useQuery(api.settings.get, { key: ENABLED_KEY });
  const startUrl = useQuery(api.settings.get, { key: START_URL_KEY });
  const [launchUrl, setLaunchUrl] = useState("");
  const [launchUrlFocused, setLaunchUrlFocused] = useState(false);
  const launchUrlInitialized = useRef(false);
  const setSetting = useMutation(api.settings.set);

  const enabled =
    storedEnabled === undefined
      ? (status?.settings.enabled ?? false)
      : storedEnabled === null
        ? false
        : storedEnabled === "true";

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/browser/status");
      if (!res.ok) throw new Error(`status ${res.status}`);
      setStatus((await res.json()) as BrowserStatus);
    } catch (err) {
      setMessage({ tone: "err", text: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (startUrl === undefined) return;
    if (!launchUrlInitialized.current) {
      launchUrlInitialized.current = true;
      if (startUrl) setLaunchUrl(startUrl);
      return;
    }
    if (!launchUrlFocused) setLaunchUrl(startUrl ?? "");
  }, [launchUrlFocused, startUrl]);

  async function setLocalBrowserEnabled(nextEnabled: boolean) {
    setBusy("Enable");
    setMessage(null);
    try {
      await setSetting({ key: ENABLED_KEY, value: nextEnabled ? "true" : "false" });
      if (!nextEnabled) {
        await fetch("/api/browser/close", { method: "POST" }).catch(() => undefined);
        setAdvancedOpen(false);
      }
      setMessage({
        tone: "ok",
        text: nextEnabled
          ? "Local browser use is enabled."
          : "Local browser use is disabled. Chrome was closed if it was running.",
      });
      await refresh();
    } catch (err) {
      setMessage({ tone: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  async function callBrowser(
    action: string,
    path: string,
    body?: Record<string, unknown>,
  ) {
    setBusy(action);
    setMessage(null);
    try {
      const res = await fetch(`/api/browser/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.error ?? data.output ?? `${action} failed (${res.status})`);
      }
      setMessage({
        tone: "ok",
        text:
          data.message ??
          (path === "close"
            ? "Chrome closed."
            : path === "install"
              ? "Chrome installed for Patchright."
              : `Chrome running at ${data.url ?? data.activeUrl ?? "about:blank"}.`),
      });
      await refresh();
    } catch (err) {
      setMessage({ tone: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  const muted = isDark ? "text-zinc-400" : "text-zinc-500";
  const subtle = isDark ? "text-zinc-500" : "text-zinc-400";
  const label = isDark ? "text-zinc-50" : "text-zinc-950";
  const running = status?.running ?? false;
  const settings = status?.settings;
  const launchedAt = status?.launchedAt
    ? new Date(status.launchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <section className={panelCardClass(isDark, "fade-in overflow-hidden")}>
      <div className="px-4 py-4 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span
            className={`h-10 w-10 rounded-xl inline-flex items-center justify-center shrink-0 ${
              isDark ? "bg-white/5 text-zinc-300" : "bg-zinc-100 text-zinc-700"
            }`}
          >
            <HugeiconsIcon icon={ChromeIcon} size={20} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <div className={`text-sm font-medium ${label}`}>Local browser use</div>
            <div className={`text-xs mt-1 leading-relaxed max-w-3xl ${muted}`}>
              Optional local Chrome profile for login-required services, visual workflows,
              and pages that may reject ordinary automation.
            </div>
            <div className={`text-[10px] mono mt-2 ${subtle}`}>
              {storedEnabled === undefined
                ? `${ENABLED_KEY} = ...`
                : storedEnabled === null
                  ? `${ENABLED_KEY} = (default false)`
                  : `${ENABLED_KEY} = "${storedEnabled}"`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <StatusPill running={running} launchedAt={launchedAt} isDark={isDark} />
          <SwitchButton
            checked={enabled}
            disabled={storedEnabled === undefined || busy !== null}
            label="Toggle Local browser use"
            isDark={isDark}
            onClick={() => setLocalBrowserEnabled(!enabled)}
          />
        </div>
      </div>

      {!enabled ? (
        <div className={`border-t px-4 py-4 ${isDark ? "border-white/10" : "border-zinc-200"}`}>
          <div className={subtlePanelClass(isDark, "px-3 py-3 text-xs leading-relaxed text-zinc-500")}>
            Off by default. Agents will not see or use the local browser integration until this is
            enabled. Patchright Chrome is installed only when you use the install control below
            after enabling it.
          </div>
          {message && <MessageLine message={message} isDark={isDark} />}
        </div>
      ) : (
        <div className={`border-t p-4 space-y-5 slide-down ${isDark ? "border-white/10" : "border-zinc-200"}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
            <StatusMetric
              label="Window"
              value={settings ? (settings.showUi ? "Visible" : "Hidden") : "..."}
              icon={EyeIcon}
              isDark={isDark}
            />
            <StatusMetric
              label="Login handoff"
              value={settings ? (settings.loginHandoffEnabled ? "Enabled" : "Off") : "..."}
              icon={CircleLockCheckIcon}
              isDark={isDark}
            />
            <StatusMetric
              label="Patchright"
              value={status?.patchrightVersion ?? "..."}
              icon={BrowserIcon}
              isDark={isDark}
            />
            <StatusMetric
              label="Chrome"
              value={status?.detectedChromePath ? "System detected" : "Not detected"}
              icon={ComputerSettingsIcon}
              isDark={isDark}
            />
          </div>

          {status?.activeUrl && (
            <div className={subtlePanelClass(isDark, "px-3 py-2 text-[11px] mono truncate text-zinc-500")}>
              active: {status.activeUrl}
            </div>
          )}

          <BrowserGroup
            icon={EyeIcon}
            title="Behavior"
            description="These switches control how agents use the local Chrome profile."
            isDark={isDark}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <BrowserToggle
                settingKey={SHOW_UI_KEY}
                label="Show browser UI"
                description="Open Chrome on the desktop instead of running hidden."
                defaultEnabled={true}
                isDark={isDark}
              />
              <BrowserToggle
                settingKey={LOGIN_HANDOFF_KEY}
                label="Spawn login instance"
                description={'Allows handoff with: "I need you to log in first. I’ve spawned an instance on your machine."'}
                defaultEnabled={false}
                isDark={isDark}
              />
            </div>
          </BrowserGroup>

          <BrowserGroup
            icon={Globe02Icon}
            title="Manual launch"
            description="Use this for a quick local test without changing the saved launch URL."
            isDark={isDark}
          >
            <div className="flex flex-col gap-3">
              <input
                type="url"
                value={launchUrl}
                onChange={(event) => setLaunchUrl(event.target.value)}
                onFocus={() => setLaunchUrlFocused(true)}
                onBlur={() => setLaunchUrlFocused(false)}
                placeholder="URL to open now"
                className={inputClass(isDark, "w-full")}
              />
              <div className="flex flex-wrap gap-2">
                <BrowserButton
                  icon={PlayIcon}
                  isDark={isDark}
                  disabled={busy !== null}
                  onClick={() => callBrowser("Launch", "launch", { url: launchUrl })}
                >
                  {busy === "Launch" ? "Launching..." : "Launch"}
                </BrowserButton>
                <BrowserButton
                  icon={Login03Icon}
                  isDark={isDark}
                  disabled={busy !== null}
                  onClick={() => callBrowser("Login", "login", { url: launchUrl })}
                >
                  {busy === "Login" ? "Spawning..." : "Spawn login"}
                </BrowserButton>
                <BrowserButton
                  icon={CancelCircleIcon}
                  isDark={isDark}
                  disabled={busy !== null}
                  onClick={() => callBrowser("Close", "close")}
                >
                  Close
                </BrowserButton>
                <BrowserButton
                  icon={ArrowReloadHorizontalIcon}
                  isDark={isDark}
                  disabled={busy !== null}
                  onClick={refresh}
                >
                  Refresh
                </BrowserButton>
              </div>
              {message && <MessageLine message={message} isDark={isDark} />}
            </div>
          </BrowserGroup>

          <div className={`border-t pt-4 ${isDark ? "border-white/10" : "border-zinc-200"}`}>
            <button
              type="button"
              onClick={() => setAdvancedOpen((value) => !value)}
              aria-expanded={advancedOpen}
              className={`w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                isDark ? "hover:bg-white/5" : "hover:bg-zinc-50"
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <HugeiconsIcon
                  icon={ComputerSettingsIcon}
                  size={16}
                  strokeWidth={1.8}
                  className={isDark ? "text-zinc-400" : "text-zinc-500"}
                />
                <span>
                  <span className={`block text-xs font-semibold uppercase tracking-wider ${label}`}>
                    Advanced settings
                  </span>
                  <span className={`block text-[11px] mt-0.5 leading-relaxed ${subtle}`}>
                    Profile path, startup URL, Chrome binary, extra flags, and install.
                  </span>
                </span>
              </span>
              <span className="inline-flex items-center gap-2 shrink-0">
                <span className={`hidden sm:inline text-[11px] mono ${subtle}`}>
                  {advancedOpen ? "shown" : "hidden"}
                </span>
                <HugeiconsIcon
                  icon={advancedOpen ? ArrowDown01Icon : ArrowRight01Icon}
                  size={18}
                  strokeWidth={1.9}
                  className={subtle}
                />
              </span>
            </button>

            {advancedOpen && (
              <div className="pt-4 space-y-4 slide-down">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  <BrowserTextSetting
                    settingKey={START_URL_KEY}
                    label="Launch URL"
                    placeholder="https://example.com"
                    fallback="about:blank"
                    isDark={isDark}
                  />
                  <BrowserTextSetting
                    settingKey={PROFILE_DIR_KEY}
                    label="Profile directory"
                    placeholder="~/.boop/browser-profile"
                    fallback="~/.boop/browser-profile"
                    isDark={isDark}
                  />
                  <BrowserTextSetting
                    settingKey={CHANNEL_KEY}
                    label="Chrome channel"
                    placeholder="chrome"
                    fallback="chrome"
                    isDark={isDark}
                  />
                  <BrowserTextSetting
                    settingKey={EXECUTABLE_KEY}
                    label="Executable path"
                    placeholder="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
                    fallback="channel default"
                    isDark={isDark}
                  />
                  <div className="xl:col-span-2">
                    <BrowserTextSetting
                      settingKey={EXTRA_ARGS_KEY}
                      label="Extra Chrome flags"
                      placeholder="--disable-features=SomeFeature"
                      fallback="none"
                      multiline
                      isDark={isDark}
                    />
                  </div>
                </div>
                <BrowserButton
                  icon={Download01Icon}
                  isDark={isDark}
                  disabled={busy !== null}
                  onClick={() => callBrowser("Install", "install")}
                >
                  {busy === "Install" ? "Installing..." : "Install Patchright Chrome"}
                </BrowserButton>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function MessageLine({
  message,
  isDark,
}: {
  message: { tone: "ok" | "err"; text: string };
  isDark: boolean;
}) {
  return (
    <div
      className={`text-[11px] mt-3 ${
        message.tone === "ok"
          ? isDark
            ? "text-emerald-400"
            : "text-emerald-600"
          : isDark
            ? "text-rose-400"
            : "text-rose-600"
      }`}
    >
      {message.text}
    </div>
  );
}

function StatusPill({
  running,
  launchedAt,
  isDark,
}: {
  running: boolean;
  launchedAt: string | null;
  isDark: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs shrink-0 ${
        running
          ? isDark
            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
            : "border-emerald-200 bg-emerald-50 text-emerald-700"
          : isDark
            ? "border-white/10 bg-white/5 text-zinc-400"
            : "border-zinc-200 bg-zinc-50 text-zinc-500"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${running ? "bg-emerald-400" : "bg-zinc-400"}`} />
      {running ? `Running${launchedAt ? ` since ${launchedAt}` : ""}` : "Stopped"}
    </span>
  );
}

function StatusMetric({
  label,
  value,
  icon,
  isDark,
}: {
  label: string;
  value: string;
  icon: any;
  isDark: boolean;
}) {
  return (
    <div
      className={`rounded-lg px-3 py-2.5 flex items-center gap-2 min-w-0 ${
        isDark ? "bg-white/5" : "bg-zinc-50"
      }`}
    >
      <HugeiconsIcon
        icon={icon}
        size={16}
        strokeWidth={1.8}
        className={isDark ? "text-zinc-500" : "text-zinc-400"}
      />
      <div className="min-w-0">
        <div className={`text-[10px] uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
          {label}
        </div>
        <div className={`text-xs truncate ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>
          {value}
        </div>
      </div>
    </div>
  );
}

function BrowserGroup({
  icon,
  title,
  description,
  isDark,
  children,
}: {
  icon: any;
  title: string;
  description: string;
  isDark: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`border-t pt-4 ${isDark ? "border-white/10" : "border-zinc-200"}`}>
      <div className="flex items-start gap-2 mb-3">
        <HugeiconsIcon
          icon={icon}
          size={16}
          strokeWidth={1.8}
          className={isDark ? "text-zinc-400" : "text-zinc-500"}
        />
        <div>
          <div className={`text-xs font-semibold uppercase tracking-wider ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
            {title}
          </div>
          <div className="text-[11px] mt-0.5 leading-relaxed text-zinc-500">
            {description}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

function BrowserToggle({
  settingKey,
  label,
  description,
  defaultEnabled,
  isDark,
}: {
  settingKey: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
  isDark: boolean;
}) {
  const value = useQuery(api.settings.get, { key: settingKey });
  const setSetting = useMutation(api.settings.set);
  const loading = value === undefined;
  const enabled = loading ? defaultEnabled : value === null ? defaultEnabled : value !== "false";

  return (
    <div className={rowPanelClass(isDark)}>
      <div className="min-w-0">
        <div className={`text-xs font-medium ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
          {label}
        </div>
        <div className={`text-[11px] mt-1 leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
          {description}
        </div>
        <div className={`text-[10px] mono mt-1.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
          {value === undefined
            ? `${settingKey} = ...`
            : value === null
              ? `${settingKey} = (default ${defaultEnabled ? "true" : "false"})`
              : `${settingKey} = "${value}"`}
        </div>
      </div>
      <SwitchButton
        checked={enabled}
        disabled={loading}
        label={`Toggle ${label}`}
        isDark={isDark}
        onClick={() => setSetting({ key: settingKey, value: enabled ? "false" : "true" })}
      />
    </div>
  );
}

function BrowserTextSetting({
  settingKey,
  label,
  placeholder,
  fallback,
  multiline = false,
  isDark,
}: {
  settingKey: string;
  label: string;
  placeholder: string;
  fallback: string;
  multiline?: boolean;
  isDark: boolean;
}) {
  const value = useQuery(api.settings.get, { key: settingKey });
  const setSetting = useMutation(api.settings.set);
  const clearSetting = useMutation(api.settings.clear);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (value !== undefined && !focused && !dirty) setDraft(value ?? "");
  }, [dirty, focused, value]);

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const trimmed = draft.trim();
      const validationError = validateBrowserSetting(settingKey, trimmed);
      if (validationError) {
        setSaveError(validationError);
        return;
      }
      if (trimmed) {
        const nextValue = multiline ? draft : trimmed;
        await setSetting({ key: settingKey, value: nextValue });
        setDraft(nextValue);
      } else {
        await clearSetting({ key: settingKey });
        setDraft("");
      }
      setDirty(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const loading = value === undefined;

  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <span className={`text-[10px] uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
        {label}
      </span>
      <div className="flex flex-col sm:flex-row gap-2 min-w-0">
        {multiline ? (
          <textarea
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setDirty(true);
              setSaveError(null);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            disabled={loading || saving}
            rows={3}
            className={inputClass(isDark, "w-full min-h-[76px]")}
          />
        ) : (
          <input
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setDirty(true);
              setSaveError(null);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            disabled={loading || saving}
            className={inputClass(isDark, "w-full")}
          />
        )}
        <BrowserButton
          icon={FloppyDiskIcon}
          isDark={isDark}
          disabled={loading || saving}
          onClick={save}
          className="sm:w-auto"
        >
          {saving ? "Saving..." : "Save"}
        </BrowserButton>
      </div>
      <span className={`text-[10px] mono truncate ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
        {value === undefined
          ? `${settingKey} = ...`
          : value === null
            ? `${settingKey} = (default ${fallback})`
            : `${settingKey} = "${value}"`}
      </span>
      {saveError && (
        <span className={`text-[11px] ${isDark ? "text-rose-300" : "text-rose-600"}`}>
          {saveError}
        </span>
      )}
    </label>
  );
}

function SwitchButton({
  checked,
  disabled,
  label,
  isDark,
  onClick,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  isDark: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 ${
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      } ${
        checked
          ? "bg-emerald-500 focus:ring-emerald-500/40"
          : isDark
            ? "bg-zinc-700 focus:ring-zinc-500/40"
            : "bg-zinc-300 focus:ring-zinc-400/40"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function BrowserButton({
  children,
  disabled,
  onClick,
  isDark,
  icon,
  className = "",
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  isDark: boolean;
  icon?: any;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition disabled:opacity-50 ${
        isDark
          ? "border-white/10 bg-white/5 hover:bg-white/10 text-zinc-200"
          : "border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700"
      } ${className}`}
    >
      {icon && <HugeiconsIcon icon={icon} size={14} strokeWidth={1.8} />}
      {children}
    </button>
  );
}

function inputClass(isDark: boolean, extra = "") {
  const sizing = extra || "w-full";
  return `min-w-0 text-xs px-3 py-1.5 rounded-md border outline-none focus:ring-2 ${
    isDark
      ? "bg-white/5 border-white/10 text-zinc-200 placeholder-zinc-600 focus:ring-zinc-500/30"
      : "bg-white border-zinc-200 text-zinc-800 placeholder-zinc-400 focus:ring-zinc-500/20"
  } ${sizing}`;
}

function rowPanelClass(isDark: boolean) {
  return `flex items-start justify-between gap-3 rounded-lg px-3 py-3 ${
    isDark ? "bg-white/5" : "bg-zinc-50"
  }`;
}
