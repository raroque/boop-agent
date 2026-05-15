import { useEffect, useState } from "react";
import { IntegrationLogo } from "../lib/branding.js";

interface NativeIntegration {
  name: string;
  displayName: string;
  description: string;
  envVar: string;
  docsUrl: string;
  setupSteps: string[];
  configured: boolean;
}

interface Response {
  integrations: NativeIntegration[];
}

export function NativeIntegrationsSection({ isDark }: { isDark: boolean }) {
  const [data, setData] = useState<NativeIntegration[] | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/native-integrations")
      .then((r) => r.json() as Promise<Response>)
      .then((j) => setData(j.integrations))
      .catch(() => setData([]))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded || !data || data.length === 0) return null;

  const cardBg = isDark ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200";
  const muted = isDark ? "text-slate-500" : "text-slate-400";
  const activeCount = data.filter((i) => i.configured).length;

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <h2
          className={`text-xs font-semibold uppercase tracking-wider ${
            isDark ? "text-slate-500" : "text-slate-400"
          }`}
        >
          Native integrations
        </h2>
        {activeCount > 0 && (
          <span
            className={`text-xs mono font-medium ${
              isDark ? "text-slate-600" : "text-slate-300"
            }`}
          >
            {activeCount}
          </span>
        )}
        <span className={`text-[10px] ${isDark ? "text-slate-600" : "text-slate-400"}`}>
          Configured via .env.local — no OAuth flow
        </span>
      </div>
      <div className="grid gap-3">
        {data.map((i) => (
          <NativeIntegrationCard key={i.name} i={i} cardBg={cardBg} muted={muted} isDark={isDark} />
        ))}
      </div>
    </section>
  );
}

function NativeIntegrationCard({
  i,
  cardBg,
  muted,
  isDark,
}: {
  i: NativeIntegration;
  cardBg: string;
  muted: string;
  isDark: boolean;
}) {
  const badge = i.configured
    ? isDark
      ? "bg-emerald-400/10 text-emerald-500"
      : "bg-emerald-50 text-emerald-700"
    : isDark
      ? "bg-slate-400/10 text-slate-400"
      : "bg-slate-100 text-slate-500";
  const dot = i.configured ? "bg-emerald-400" : "bg-slate-500";
  const linkClass = isDark
    ? "text-sky-400 hover:text-sky-300 underline"
    : "text-sky-600 hover:text-sky-700 underline";

  return (
    <div className={`border rounded-xl px-4 py-3 fade-in ${cardBg}`}>
      <div className="flex items-center gap-4">
        <IntegrationLogo raw={i.name} size={32} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium ${isDark ? "text-slate-200" : "text-slate-800"}`}>
              {i.displayName}
            </span>
            <span className={`text-xs mono ${muted}`}>{i.name}</span>
            <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
              {i.configured ? "Configured" : "Not configured"}
            </span>
          </div>
          <p className={`text-xs ${muted} leading-snug mt-0.5`}>{i.description}</p>
        </div>
        <a
          href={i.docsUrl}
          target="_blank"
          rel="noreferrer"
          className={`text-[11px] shrink-0 ${linkClass}`}
        >
          Docs ↗
        </a>
      </div>

      {!i.configured && (
        <div className={`mt-3 pt-3 border-t ${isDark ? "border-slate-800" : "border-slate-200"}`}>
          <div className={`text-[11px] font-medium mb-2 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
            Setup:
          </div>
          <ol className="space-y-1.5">
            {i.setupSteps.map((step, idx) => (
              <li
                key={idx}
                className={`text-xs flex items-start ${isDark ? "text-slate-300" : "text-slate-700"}`}
              >
                <span
                  className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-semibold mr-2 shrink-0 ${
                    isDark ? "bg-sky-400/15 text-sky-300" : "bg-sky-100 text-sky-800"
                  }`}
                >
                  {idx + 1}
                </span>
                <span className="leading-snug">{step}</span>
              </li>
            ))}
          </ol>
          <div className={`mt-2 text-[11px] ${muted}`}>
            Env var: <span className="mono">{i.envVar}</span>
          </div>
        </div>
      )}
    </div>
  );
}
