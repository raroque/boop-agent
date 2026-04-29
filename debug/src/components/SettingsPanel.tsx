import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api.js";
import { RuntimePanel } from "./RuntimePanel.js";

type SettingsTab = "runtime" | "messaging" | "integrations" | "backend" | "actions";

interface SetupStatus {
  runtime: {
    status: {
      claude: { configured: boolean };
      openai: { apiKeyPresent: boolean };
    };
  };
  messaging: {
    mode: "dashboard-only" | "sendblue";
    sendblueConfigured: boolean;
    sendblueKeyPresent: boolean;
    sendblueSecretPresent: boolean;
    sendblueFromNumberPresent: boolean;
    sendblueFromNumber: string;
    sendblueFromNumberMasked: string;
    tunnelMode: string;
    publicUrl: string;
    ngrokDomain: string;
    ngrokInstalled: boolean;
    ngrokDomainPresent: boolean;
    autoWebhook: boolean;
  };
  integrations: {
    composioApiKeyPresent: boolean;
    composioUserId: string;
  };
  backend: {
    convexConfigured: boolean;
    convexDeployment: string;
    convexUrl: string;
    viteConvexUrl: string;
    viteConvexSiteUrl: string;
    convexUrlPresent: boolean;
    viteConvexUrlPresent: boolean;
    port: string;
    codexInstalled: boolean;
  };
}

interface SettingsColors {
  shell: string;
  header: string;
  border: string;
  title: string;
  sub: string;
  muted: string;
  list: string;
  row: string;
  rowHover: string;
  tabActive: string;
  tabIdle: string;
  accent: string;
  button: string;
  buttonGhost: string;
  input: string;
  code: string;
}

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "runtime", label: "Runtime" },
  { id: "messaging", label: "Messaging" },
  { id: "integrations", label: "Integrations" },
  { id: "backend", label: "Backend" },
  { id: "actions", label: "Actions" },
];

const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Africa/Dar_es_Salaam",
  "Asia/Tokyo",
  "UTC",
];

type Draft = Record<string, string>;
type ToastState = { message: string; tone: "error" | "success" };

export function SettingsPanel({ isDark }: { isDark: boolean }) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("runtime");
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [secretDraft, setSecretDraft] = useState<Draft>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const colors = getColors(isDark);

  function showToast(message: string, tone: ToastState["tone"] = "error") {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 5200);
  }

  async function refresh() {
    setError(null);
    try {
      const response = await fetch("/api/setup/status");
      if (!response.ok) throw new Error(await readApiError(response, "Could not load settings"));
      const payload = (await response.json()) as SetupStatus;
      setStatus(payload);
      hydrateDraft(payload);
    } catch (err) {
      const message = cleanErrorMessage(err, "Could not load settings");
      setError(message);
      showToast(message);
    }
  }

  function hydrateDraft(payload: SetupStatus) {
    setDraft({
      BOOP_TUNNEL: payload.messaging.tunnelMode || "none",
      PUBLIC_URL: payload.messaging.publicUrl || "",
      NGROK_DOMAIN: payload.messaging.ngrokDomain || "",
      SENDBLUE_FROM_NUMBER: payload.messaging.sendblueFromNumber || "",
      SENDBLUE_AUTO_WEBHOOK: payload.messaging.autoWebhook ? "true" : "false",
      COMPOSIO_USER_ID: payload.integrations.composioUserId || "boop-default",
      PORT: payload.backend.port || "3456",
      CONVEX_DEPLOYMENT: payload.backend.convexDeployment || "",
      CONVEX_URL: payload.backend.convexUrl || "",
      VITE_CONVEX_URL: payload.backend.viteConvexUrl || "",
      VITE_CONVEX_SITE_URL: payload.backend.viteConvexSiteUrl || "",
    });
    setSecretDraft({});
  }

  function setField(key: string, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function setSecret(key: string, value: string) {
    setSecretDraft((current) => ({ ...current, [key]: value }));
  }

  async function save(row: string, updates: Record<string, string>) {
    setSaving(row);
    setSaved(null);
    setError(null);
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== "__skip__"),
    );
    try {
      const response = await fetch("/api/setup/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: filtered }),
      });
      if (!response.ok) throw new Error(await readApiError(response, "Could not save settings"));
      const payload = (await response.json()) as SetupStatus;
      setStatus(payload);
      hydrateDraft(payload);
      setSaved(row);
      showToast("Saved setting", "success");
      window.setTimeout(() => setSaved(null), 1400);
    } catch (err) {
      const message = cleanErrorMessage(err, "Could not save settings");
      setError(message);
      showToast(message);
    } finally {
      setSaving(null);
    }
  }

  async function copyCommand(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedCommand(command);
      window.setTimeout(() => setCopiedCommand(null), 1200);
    } catch {
      setCopiedCommand(null);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className={`-m-5 flex h-[calc(100%+2.5rem)] flex-col ${colors.shell}`}>
      <header className={`flex h-[61px] shrink-0 items-center justify-between border-b px-6 ${colors.header}`}>
        <h2 className={`text-xl font-semibold tracking-tight ${colors.title}`}>Settings</h2>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs font-semibold text-emerald-400">Saved</span>}
          <button type="button" onClick={refresh} className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${colors.buttonGhost}`}>
            Refresh
          </button>
        </div>
      </header>

      <div className={`shrink-0 border-b px-6 ${colors.header}`}>
        <div className="flex h-12 items-end gap-7 overflow-x-auto debug-scroll">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative h-12 whitespace-nowrap px-0 text-[13px] font-semibold transition-colors ${activeTab === tab.id ? colors.tabActive : colors.tabIdle}`}
            >
              {tab.label}
              {activeTab === tab.id && <span className={`absolute inset-x-0 bottom-0 h-[2px] rounded-full ${colors.accent}`} />}
            </button>
          ))}
        </div>
      </div>

      {toast && <SettingsToast toast={toast} onDismiss={() => setToast(null)} isDark={isDark} />}

      <main className="min-h-0 flex-1 overflow-auto debug-scroll">
        <div className="mx-auto w-full max-w-6xl p-6">
          {activeTab === "runtime" && <RuntimeSettings isDark={isDark} colors={colors} status={status} secretDraft={secretDraft} setSecret={setSecret} save={save} saving={saving} saved={saved} />}
          {activeTab === "messaging" && <MessagingSettings status={status} colors={colors} draft={draft} secretDraft={secretDraft} setField={setField} setSecret={setSecret} save={save} saving={saving} saved={saved} copyCommand={copyCommand} copiedCommand={copiedCommand} />}
          {activeTab === "integrations" && <IntegrationSettings status={status} colors={colors} draft={draft} secretDraft={secretDraft} setField={setField} setSecret={setSecret} save={save} saving={saving} saved={saved} />}
          {activeTab === "backend" && <BackendSettings status={status} colors={colors} draft={draft} setField={setField} save={save} saving={saving} saved={saved} />}
          {activeTab === "actions" && <ActionSettings status={status} colors={colors} copyCommand={copyCommand} copiedCommand={copiedCommand} />}
        </div>
      </main>
    </div>
  );
}

function SettingsToast({
  toast,
  onDismiss,
  isDark,
}: {
  toast: ToastState;
  onDismiss: () => void;
  isDark: boolean;
}) {
  const tone =
    toast.tone === "error"
      ? "border-rose-500/30 bg-rose-500/15 text-rose-100"
      : "border-emerald-500/30 bg-emerald-500/15 text-emerald-100";
  return (
    <div
      className={`absolute right-5 top-5 z-50 flex max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur ${
        isDark ? tone : toast.tone === "error" ? "border-rose-300 bg-rose-50 text-rose-800" : "border-emerald-300 bg-emerald-50 text-emerald-800"
      }`}
    >
      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-current" />
      <span className="min-w-0 flex-1 leading-5">{toast.message}</span>
      <button type="button" onClick={onDismiss} className="shrink-0 text-xs opacity-70 hover:opacity-100">
        Dismiss
      </button>
    </div>
  );
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  const text = await response.text();
  if (!text) return `${fallback} (${response.status})`;
  try {
    const parsed = JSON.parse(text) as { error?: string; message?: string };
    return parsed.error ?? parsed.message ?? `${fallback} (${response.status})`;
  } catch {
    return cleanErrorText(text, fallback, response.status);
  }
}

function cleanErrorMessage(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : String(err);
  return cleanErrorText(message, fallback);
}

function cleanErrorText(raw: string, fallback: string, status?: number): string {
  const text = raw.replace(/\s+/g, " ").trim();
  if (/Cannot POST \/setup\/settings/i.test(text)) {
    return "Settings save endpoint is not running. Restart the dev server, then try again.";
  }
  if (/<!doctype html/i.test(text) || /<html/i.test(text)) {
    return status ? `${fallback} (${status})` : fallback;
  }
  return text || fallback;
}

function RuntimeSettings({
  isDark,
  colors,
  status,
  secretDraft,
  setSecret,
  save,
  saving,
  saved,
}: {
  isDark: boolean;
  colors: SettingsColors;
  status: SetupStatus | null;
  secretDraft: Draft;
  setSecret: (key: string, value: string) => void;
  save: (row: string, updates: Record<string, string>) => void;
  saving: string | null;
  saved: string | null;
}) {
  return (
    <div className="space-y-6">
      <SettingsHeading title="Runtime" />
      <RuntimePanel isDark={isDark} />
      <SettingsHeading title="Provider auth" />
      <SettingsList colors={colors}>
        <SettingsRow
          colors={colors}
          label="OpenAI API key"
          description="Used only when OpenAI API is selected. Current key is never shown."
          state={status?.runtime.status.openai.apiKeyPresent ? "Present" : "Missing"}
          ready={Boolean(status?.runtime.status.openai.apiKeyPresent)}
          control={<SecretInput colors={colors} value={secretDraft.OPENAI_API_KEY ?? ""} placeholder="Paste new key" onChange={(value) => setSecret("OPENAI_API_KEY", value)} />}
          action={<SaveButton colors={colors} saving={saving === "OPENAI_API_KEY"} saved={saved === "OPENAI_API_KEY"} disabled={!secretDraft.OPENAI_API_KEY?.trim()} onClick={() => save("OPENAI_API_KEY", { OPENAI_API_KEY: secretDraft.OPENAI_API_KEY ?? "__skip__" })} />}
        />
        <SettingsRow
          colors={colors}
          label="Anthropic API key"
          description="Optional. Claude Code sign-in can still be used without setting this."
          state={status?.runtime.status.claude.configured ? "Present" : "Optional"}
          ready
          control={<SecretInput colors={colors} value={secretDraft.ANTHROPIC_API_KEY ?? ""} placeholder="Paste replacement" onChange={(value) => setSecret("ANTHROPIC_API_KEY", value)} />}
          action={<SaveButton colors={colors} saving={saving === "ANTHROPIC_API_KEY"} saved={saved === "ANTHROPIC_API_KEY"} disabled={!secretDraft.ANTHROPIC_API_KEY?.trim()} onClick={() => save("ANTHROPIC_API_KEY", { ANTHROPIC_API_KEY: secretDraft.ANTHROPIC_API_KEY ?? "__skip__" })} />}
        />
      </SettingsList>
    </div>
  );
}

function MessagingSettings({
  status,
  colors,
  draft,
  secretDraft,
  setField,
  setSecret,
  save,
  saving,
  saved,
  copyCommand,
  copiedCommand,
}: {
  status: SetupStatus | null;
  colors: SettingsColors;
  draft: Draft;
  secretDraft: Draft;
  setField: (key: string, value: string) => void;
  setSecret: (key: string, value: string) => void;
  save: (row: string, updates: Record<string, string>) => void;
  saving: string | null;
  saved: string | null;
  copyCommand: (command: string) => void;
  copiedCommand: string | null;
}) {
  const messaging = status?.messaging;
  const dashboardOnly = messaging?.mode === "dashboard-only";

  return (
    <div className="space-y-4">
      <SettingsHeading title="Messaging" />
      <SettingsList colors={colors}>
        <SettingsRow
          colors={colors}
          label="Tunnel mode"
          description="Choose local-only testing, free ngrok, reserved ngrok, or your own URL."
          state={dashboardOnly ? "Local" : "Webhook"}
          ready
          control={<SelectInput colors={colors} value={draft.BOOP_TUNNEL ?? "none"} onChange={(value) => setField("BOOP_TUNNEL", value)}><option value="none">No tunnel</option><option value="free">Free ngrok</option><option value="ngrok-domain">ngrok reserved domain</option><option value="static">Static URL</option></SelectInput>}
          action={<SaveButton colors={colors} saving={saving === "BOOP_TUNNEL"} saved={saved === "BOOP_TUNNEL"} onClick={() => save("BOOP_TUNNEL", { BOOP_TUNNEL: draft.BOOP_TUNNEL ?? "none" })} />}
        />
        <SettingsRow
          colors={colors}
          label="Public URL"
          description="Sendblue posts inbound messages here when texting is enabled."
          state={messaging?.publicUrl ? "Set" : "Empty"}
          ready={draft.BOOP_TUNNEL === "none" || Boolean(draft.PUBLIC_URL)}
          control={<TextInput colors={colors} value={draft.PUBLIC_URL ?? ""} placeholder="https://..." onChange={(value) => setField("PUBLIC_URL", value)} />}
          action={<SaveButton colors={colors} saving={saving === "PUBLIC_URL"} saved={saved === "PUBLIC_URL"} onClick={() => save("PUBLIC_URL", { PUBLIC_URL: draft.PUBLIC_URL ?? "" })} />}
        />
        <SettingsRow
          colors={colors}
          label="ngrok domain"
          description="Only needed for a reserved ngrok domain."
          state={messaging?.ngrokDomainPresent ? "Set" : "Optional"}
          ready
          control={<TextInput colors={colors} value={draft.NGROK_DOMAIN ?? ""} placeholder="your-domain.ngrok-free.app" onChange={(value) => setField("NGROK_DOMAIN", value)} />}
          action={<SaveButton colors={colors} saving={saving === "NGROK_DOMAIN"} saved={saved === "NGROK_DOMAIN"} onClick={() => save("NGROK_DOMAIN", { NGROK_DOMAIN: draft.NGROK_DOMAIN ?? "" })} />}
        />
        <SettingsRow
          colors={colors}
          label="Sendblue key id"
          description="Replace the key used for inbound and outbound text delivery."
          state={messaging?.sendblueKeyPresent ? "Present" : "Missing"}
          ready={Boolean(messaging?.sendblueKeyPresent) || dashboardOnly}
          control={<SecretInput colors={colors} value={secretDraft.SENDBLUE_API_KEY ?? ""} placeholder="Paste replacement" onChange={(value) => setSecret("SENDBLUE_API_KEY", value)} />}
          action={<SaveButton colors={colors} saving={saving === "SENDBLUE_API_KEY"} saved={saved === "SENDBLUE_API_KEY"} disabled={!secretDraft.SENDBLUE_API_KEY?.trim()} onClick={() => save("SENDBLUE_API_KEY", { SENDBLUE_API_KEY: secretDraft.SENDBLUE_API_KEY ?? "__skip__" })} />}
        />
        <SettingsRow
          colors={colors}
          label="Sendblue secret"
          description="Secret value is write-only from this screen."
          state={messaging?.sendblueSecretPresent ? "Present" : "Missing"}
          ready={Boolean(messaging?.sendblueSecretPresent) || dashboardOnly}
          control={<SecretInput colors={colors} value={secretDraft.SENDBLUE_API_SECRET ?? ""} placeholder="Paste replacement" onChange={(value) => setSecret("SENDBLUE_API_SECRET", value)} />}
          action={<SaveButton colors={colors} saving={saving === "SENDBLUE_API_SECRET"} saved={saved === "SENDBLUE_API_SECRET"} disabled={!secretDraft.SENDBLUE_API_SECRET?.trim()} onClick={() => save("SENDBLUE_API_SECRET", { SENDBLUE_API_SECRET: secretDraft.SENDBLUE_API_SECRET ?? "__skip__" })} />}
        />
        <SettingsRow
          colors={colors}
          label="From number"
          description="Must be the Sendblue-provisioned number people text to."
          state={messaging?.sendblueFromNumberPresent ? "Set" : "Missing"}
          ready={Boolean(messaging?.sendblueFromNumberPresent) || dashboardOnly}
          control={<TextInput colors={colors} value={draft.SENDBLUE_FROM_NUMBER ?? ""} placeholder="+14695551234" onChange={(value) => setField("SENDBLUE_FROM_NUMBER", value)} />}
          action={<SaveButton colors={colors} saving={saving === "SENDBLUE_FROM_NUMBER"} saved={saved === "SENDBLUE_FROM_NUMBER"} onClick={() => save("SENDBLUE_FROM_NUMBER", { SENDBLUE_FROM_NUMBER: draft.SENDBLUE_FROM_NUMBER ?? "" })} />}
        />
        <SettingsRow
          colors={colors}
          label="Auto webhook"
          description="Register Sendblue webhook automatically when the dev server starts."
          state={draft.SENDBLUE_AUTO_WEBHOOK === "true" ? "On" : "Off"}
          ready
          control={<SelectInput colors={colors} value={draft.SENDBLUE_AUTO_WEBHOOK ?? "false"} onChange={(value) => setField("SENDBLUE_AUTO_WEBHOOK", value)}><option value="true">Enabled</option><option value="false">Disabled</option></SelectInput>}
          action={<SaveButton colors={colors} saving={saving === "SENDBLUE_AUTO_WEBHOOK"} saved={saved === "SENDBLUE_AUTO_WEBHOOK"} onClick={() => save("SENDBLUE_AUTO_WEBHOOK", { SENDBLUE_AUTO_WEBHOOK: draft.SENDBLUE_AUTO_WEBHOOK ?? "false" })} />}
        />
        <SettingsRow
          colors={colors}
          label="ngrok auth"
          description="One-time terminal command for free ngrok tunnels."
          state={messaging?.ngrokInstalled ? "Installed" : "Not found"}
          ready={Boolean(messaging?.ngrokInstalled) || dashboardOnly}
          control={<code className={`block truncate rounded-xl px-3 py-2 text-xs ${colors.code}`}>ngrok config add-authtoken &lt;your-token&gt;</code>}
          action={<CopyButton colors={colors} command="ngrok config add-authtoken <your-token>" copiedCommand={copiedCommand} onCopy={copyCommand} />}
        />
      </SettingsList>
    </div>
  );
}

function IntegrationSettings({
  status,
  colors,
  draft,
  secretDraft,
  setField,
  setSecret,
  save,
  saving,
  saved,
}: {
  status: SetupStatus | null;
  colors: SettingsColors;
  draft: Draft;
  secretDraft: Draft;
  setField: (key: string, value: string) => void;
  setSecret: (key: string, value: string) => void;
  save: (row: string, updates: Record<string, string>) => void;
  saving: string | null;
  saved: string | null;
}) {
  const hasKey = Boolean(status?.integrations.composioApiKeyPresent);

  return (
    <div className="space-y-4">
      <SettingsHeading title="Integrations" />
      <SettingsList colors={colors}>
        <SettingsRow
          colors={colors}
          label="Composio key"
          description="Enables Gmail, Slack, GitHub, Linear, Notion, and other tools."
          state={hasKey ? "Present" : "Missing"}
          ready={hasKey}
          control={<SecretInput colors={colors} value={secretDraft.COMPOSIO_API_KEY ?? ""} placeholder="Paste replacement" onChange={(value) => setSecret("COMPOSIO_API_KEY", value)} />}
          action={<SaveButton colors={colors} saving={saving === "COMPOSIO_API_KEY"} saved={saved === "COMPOSIO_API_KEY"} disabled={!secretDraft.COMPOSIO_API_KEY?.trim()} onClick={() => save("COMPOSIO_API_KEY", { COMPOSIO_API_KEY: secretDraft.COMPOSIO_API_KEY ?? "__skip__" })} />}
        />
        <SettingsRow
          colors={colors}
          label="User id"
          description="Stable owner id for connected accounts."
          state="Owner"
          ready
          control={<TextInput colors={colors} value={draft.COMPOSIO_USER_ID ?? "boop-default"} onChange={(value) => setField("COMPOSIO_USER_ID", value)} />}
          action={<SaveButton colors={colors} saving={saving === "COMPOSIO_USER_ID"} saved={saved === "COMPOSIO_USER_ID"} onClick={() => save("COMPOSIO_USER_ID", { COMPOSIO_USER_ID: draft.COMPOSIO_USER_ID ?? "boop-default" })} />}
        />
        <SettingsRow
          colors={colors}
          label="Connected tools"
          description="OAuth connections live in the Connections page."
          state={hasKey ? "Available" : "Locked"}
          ready={hasKey}
          control={<span className={`text-sm ${colors.sub}`}>Manage connected toolkits</span>}
          action={<button type="button" onClick={() => navigateTo("connections")} className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${colors.button}`}>Open</button>}
        />
      </SettingsList>
    </div>
  );
}

function BackendSettings({
  status,
  colors,
  draft,
  setField,
  save,
  saving,
  saved,
}: {
  status: SetupStatus | null;
  colors: SettingsColors;
  draft: Draft;
  setField: (key: string, value: string) => void;
  save: (row: string, updates: Record<string, string>) => void;
  saving: string | null;
  saved: string | null;
}) {
  const backend = status?.backend;
  const convexReady = Boolean(backend?.convexConfigured);

  return (
    <div className="space-y-4">
      <SettingsHeading title="Backend" />
      <SettingsList colors={colors}>
        <SettingsRow colors={colors} label="Server port" description="Local API server port. Restart dev after changing this." state="Restart" ready control={<TextInput colors={colors} value={draft.PORT ?? "3456"} onChange={(value) => setField("PORT", value)} />} action={<SaveButton colors={colors} saving={saving === "PORT"} saved={saved === "PORT"} onClick={() => save("PORT", { PORT: draft.PORT ?? "3456" })} />} />
        <SettingsRow colors={colors} label="Deployment" description="Convex deployment name saved by setup." state={convexReady ? "Ready" : "Missing"} ready={convexReady} control={<TextInput colors={colors} value={draft.CONVEX_DEPLOYMENT ?? ""} placeholder="dev:..." onChange={(value) => setField("CONVEX_DEPLOYMENT", value)} />} action={<SaveButton colors={colors} saving={saving === "CONVEX_DEPLOYMENT"} saved={saved === "CONVEX_DEPLOYMENT"} onClick={() => save("CONVEX_DEPLOYMENT", { CONVEX_DEPLOYMENT: draft.CONVEX_DEPLOYMENT ?? "" })} />} />
        <SettingsRow colors={colors} label="CONVEX_URL" description="Server-side Convex URL." state={backend?.convexUrlPresent ? "Present" : "Missing"} ready={Boolean(backend?.convexUrlPresent)} control={<TextInput colors={colors} value={draft.CONVEX_URL ?? ""} placeholder="https://...convex.cloud" onChange={(value) => setField("CONVEX_URL", value)} />} action={<SaveButton colors={colors} saving={saving === "CONVEX_URL"} saved={saved === "CONVEX_URL"} onClick={() => save("CONVEX_URL", { CONVEX_URL: draft.CONVEX_URL ?? "" })} />} />
        <SettingsRow colors={colors} label="VITE_CONVEX_URL" description="Dashboard Convex URL." state={backend?.viteConvexUrlPresent ? "Present" : "Missing"} ready={Boolean(backend?.viteConvexUrlPresent)} control={<TextInput colors={colors} value={draft.VITE_CONVEX_URL ?? ""} placeholder="https://...convex.cloud" onChange={(value) => setField("VITE_CONVEX_URL", value)} />} action={<SaveButton colors={colors} saving={saving === "VITE_CONVEX_URL"} saved={saved === "VITE_CONVEX_URL"} onClick={() => save("VITE_CONVEX_URL", { VITE_CONVEX_URL: draft.VITE_CONVEX_URL ?? "" })} />} />
        <SettingsRow colors={colors} label="HTTP actions URL" description="Convex site URL used for HTTP actions." state={draft.VITE_CONVEX_SITE_URL ? "Set" : "Optional"} ready control={<TextInput colors={colors} value={draft.VITE_CONVEX_SITE_URL ?? ""} placeholder="https://...convex.site" onChange={(value) => setField("VITE_CONVEX_SITE_URL", value)} />} action={<SaveButton colors={colors} saving={saving === "VITE_CONVEX_SITE_URL"} saved={saved === "VITE_CONVEX_SITE_URL"} onClick={() => save("VITE_CONVEX_SITE_URL", { VITE_CONVEX_SITE_URL: draft.VITE_CONVEX_SITE_URL ?? "" })} />} />
        <SettingsRow colors={colors} label="Codex CLI" description="Needed only when Codex runtime is selected." state={backend?.codexInstalled ? "Installed" : "Not found"} ready={Boolean(backend?.codexInstalled)} control={<span className={`text-sm ${colors.sub}`}>Install outside Boop</span>} />
      </SettingsList>
    </div>
  );
}

function ActionSettings({ status, colors, copyCommand, copiedCommand }: { status: SetupStatus | null; colors: SettingsColors; copyCommand: (command: string) => void; copiedCommand: string | null }) {
  const missing = setupGaps(status);

  return (
    <div className="space-y-6">
      <SettingsHeading title="Agent behavior" />
      <AgentPreferenceSettings colors={colors} />
      <SettingsHeading title="Next steps" />
      <SettingsList colors={colors}>
        {(missing.length ? missing : ["Use Chat to test locally."]).map((item) => (
          <SettingsRow key={item} colors={colors} label={item} description={missing.length ? "Finish this setup step when needed." : "Local runtime and dashboard are usable."} state={missing.length ? "Todo" : "Clear"} ready={!missing.length} control={<span className="text-sm font-semibold">{missing.length ? "Not done" : "Ready"}</span>} />
        ))}
      </SettingsList>
      <SettingsHeading title="Commands" />
      <SettingsList colors={colors}>
        <CommandRow colors={colors} label="Preview setup" description="Run the setup UI without changing files." command="npm run setup:demo" copiedCommand={copiedCommand} onCopy={copyCommand} />
        <CommandRow colors={colors} label="Apply setup" description="Write .env.local and configure skipped pieces." command="npm run setup" copiedCommand={copiedCommand} onCopy={copyCommand} />
        <CommandRow colors={colors} label="Start dev" description="Run server, Convex watcher, and debug dashboard." command="npm run dev" copiedCommand={copiedCommand} onCopy={copyCommand} />
      </SettingsList>
    </div>
  );
}

function AgentPreferenceSettings({ colors }: { colors: SettingsColors }) {
  const proactive = useQuery(api.settings.get, { key: "proactive_enabled" });
  const timezone = useQuery(api.settings.get, { key: "user_timezone" });
  const setSetting = useMutation(api.settings.set);
  const clearSetting = useMutation(api.settings.clear);
  const [proactiveDraft, setProactiveDraft] = useState("true");
  const [timezoneDraft, setTimezoneDraft] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (typeof proactive === "string") setProactiveDraft(proactive);
  }, [proactive]);

  useEffect(() => {
    if (typeof timezone === "string") setTimezoneDraft(timezone);
    else if (timezone === null) setTimezoneDraft("");
  }, [timezone]);

  async function saveSetting(row: string, key: string, value: string) {
    setSaving(row);
    setSaved(null);
    try {
      if (key === "user_timezone" && !value.trim()) {
        await clearSetting({ key });
      } else {
        await setSetting({ key, value: value.trim() });
      }
      setSaved(row);
      window.setTimeout(() => setSaved(null), 1800);
    } finally {
      setSaving(null);
    }
  }

  return (
    <SettingsList colors={colors}>
      <SettingsRow
        colors={colors}
        label="Proactive email surfacing"
        description="Watch connected Gmail for important new mail. Turn off without disconnecting Gmail."
        state={proactiveDraft === "false" ? "Off" : "On"}
        ready
        control={
          <SelectInput colors={colors} value={proactiveDraft} onChange={setProactiveDraft}>
            <option value="true">On</option>
            <option value="false">Off</option>
          </SelectInput>
        }
        action={
          <SaveButton
            colors={colors}
            saving={saving === "proactive_enabled"}
            saved={saved === "proactive_enabled"}
            disabled={proactiveDraft === (proactive ?? "true")}
            onClick={() => saveSetting("proactive_enabled", "proactive_enabled", proactiveDraft)}
          />
        }
      />
      <SettingsRow
        colors={colors}
        label="User timezone"
        description="Used for local-time automations and date reasoning."
        state={timezoneDraft ? "Set" : "Fallback"}
        ready={Boolean(timezoneDraft)}
        control={
          <div className="grid grid-cols-[minmax(0,1fr)_150px] gap-2">
            <TextInput
              colors={colors}
              value={timezoneDraft}
              placeholder="America/Chicago"
              onChange={setTimezoneDraft}
            />
            <SelectInput colors={colors} value={COMMON_TIMEZONES.includes(timezoneDraft) ? timezoneDraft : ""} onChange={setTimezoneDraft}>
              <option value="">Pick</option>
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </SelectInput>
          </div>
        }
        action={
          <SaveButton
            colors={colors}
            saving={saving === "user_timezone"}
            saved={saved === "user_timezone"}
            disabled={timezoneDraft === (timezone ?? "")}
            onClick={() => saveSetting("user_timezone", "user_timezone", timezoneDraft)}
          />
        }
      />
    </SettingsList>
  );
}

function SettingsHeading({ title }: { title: string }) {
  return <h3 className="text-base font-semibold tracking-tight">{title}</h3>;
}

function SettingsList({ colors, children }: { colors: SettingsColors; children: ReactNode }) {
  return <section className={`overflow-hidden rounded-xl border ${colors.list}`}>{children}</section>;
}

function SettingsRow({
  colors,
  label,
  description,
  state,
  ready,
  control,
  action,
}: {
  colors: SettingsColors;
  label: string;
  description: string;
  state: string;
  ready: boolean;
  control: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`grid min-h-[84px] grid-cols-[minmax(260px,1fr)_minmax(340px,430px)] items-center gap-8 border-b px-4 py-4 last:border-b-0 md:px-5 ${colors.border} ${colors.row} ${colors.rowHover}`}>
      <div className="min-w-0">
        <div className="text-sm font-semibold">{label}</div>
        <div className={`mt-1 max-w-xl text-sm leading-5 ${colors.sub}`}>{description}</div>
      </div>
      <div className="flex min-w-0 items-center justify-end gap-3">
        <div className="min-w-0 flex-1">{control}</div>
        <div className="flex w-[82px] shrink-0 justify-end">{action}</div>
        <div className="flex w-[92px] shrink-0 items-center gap-2 text-xs">
          <span className={`h-2 w-2 rounded-full ${ready ? "bg-emerald-400" : "bg-amber-400"}`} />
          <span className={ready ? colors.sub : "text-amber-300"}>{state}</span>
        </div>
      </div>
    </div>
  );
}

function TextInput({ colors, value, placeholder, onChange }: { colors: SettingsColors; value: string; placeholder?: string; onChange: (value: string) => void }) {
  return <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className={`h-10 w-full rounded-xl border px-3 text-sm outline-none transition-colors ${colors.input}`} />;
}

function SecretInput({ colors, value, placeholder, onChange }: { colors: SettingsColors; value: string; placeholder?: string; onChange: (value: string) => void }) {
  return <input type="password" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className={`h-10 w-full rounded-xl border px-3 text-sm outline-none transition-colors ${colors.input}`} />;
}

function SelectInput({ colors, value, onChange, children }: { colors: SettingsColors; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className={`h-10 w-full rounded-xl border px-3 text-sm outline-none ${colors.input}`}>{children}</select>;
}

function SaveButton({ colors, saving, saved, disabled = false, onClick }: { colors: SettingsColors; saving: boolean; saved: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={saving || disabled} onClick={onClick} className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${colors.button}`}>
      {saving ? "Saving" : saved ? "Saved" : "Save"}
    </button>
  );
}

function CommandRow({ colors, label, description, command, copiedCommand, onCopy }: { colors: SettingsColors; label: string; description: string; command: string; copiedCommand: string | null; onCopy: (command: string) => void }) {
  return <SettingsRow colors={colors} label={label} description={description} state="Command" ready control={<code className={`block truncate rounded-xl px-3 py-2 text-xs ${colors.code}`}>{command}</code>} action={<CopyButton colors={colors} command={command} copiedCommand={copiedCommand} onCopy={onCopy} />} />;
}

function CopyButton({ colors, command, copiedCommand, onCopy }: { colors: SettingsColors; command: string; copiedCommand: string | null; onCopy: (command: string) => void }) {
  return <button type="button" onClick={() => onCopy(command)} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${colors.buttonGhost}`}>{copiedCommand === command ? "Copied" : "Copy"}</button>;
}

function setupGaps(status: SetupStatus | null): string[] {
  if (!status) return ["Load setup status"];
  const missing: string[] = [];
  if (!status.backend.convexConfigured) missing.push("Configure Convex");
  if (!status.integrations.composioApiKeyPresent) missing.push("Add Composio key");
  if (!status.messaging.sendblueConfigured) missing.push("Add Sendblue for real texts");
  if (status.messaging.tunnelMode !== "none" && !status.messaging.publicUrl) missing.push("Set public tunnel URL");
  return missing;
}

function navigateTo(view: "connections") {
  window.location.hash = `#/${view}`;
}

function getColors(isDark: boolean): SettingsColors {
  return isDark
    ? {
        shell: "bg-slate-950 text-slate-100",
        header: "border-slate-800 bg-slate-950/90",
        border: "border-slate-800",
        title: "text-slate-100",
        sub: "text-slate-400",
        muted: "text-slate-500",
        list: "border-slate-800 bg-black/10",
        row: "bg-transparent text-slate-100",
        rowHover: "hover:bg-slate-900/45",
        tabActive: "text-slate-100",
        tabIdle: "text-slate-500 hover:text-slate-200",
        accent: "bg-sky-400",
        button: "border-slate-700 bg-slate-100 text-slate-950 hover:bg-white disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900 disabled:text-slate-600",
        buttonGhost: "border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-700 hover:text-white",
        input: "border-slate-800 bg-slate-900/70 text-slate-100 placeholder:text-slate-600 focus:border-sky-500",
        code: "bg-slate-900/70 text-slate-300",
      }
    : {
        shell: "bg-slate-50 text-slate-950",
        header: "border-slate-200 bg-white/95",
        border: "border-slate-200",
        title: "text-slate-950",
        sub: "text-slate-600",
        muted: "text-slate-500",
        list: "border-slate-200 bg-white",
        row: "bg-transparent text-slate-950",
        rowHover: "hover:bg-slate-50",
        tabActive: "text-slate-950",
        tabIdle: "text-slate-500 hover:text-slate-900",
        accent: "bg-slate-950",
        button: "border-slate-900 bg-slate-900 text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400",
        buttonGhost: "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-950",
        input: "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-500",
        code: "bg-slate-100 text-slate-700",
      };
}
