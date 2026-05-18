import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api.js";
import {
  EmptyState,
  HeaderPill,
  PanelPage,
  bodyTextClass,
  mutedTextClass,
  panelCardClass,
  subtlePanelClass,
} from "./PanelPrimitives.js";

function formatSchedule(schedule: string): string {
  return schedule;
}

function timeAgo(ts?: number): string {
  if (!ts) return "never";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const STATUS_COLOR: Record<string, { dot: string; text: string }> = {
  running: { dot: "bg-sky-400 live-dot", text: "text-sky-400" },
  completed: { dot: "bg-emerald-400", text: "text-emerald-400" },
  failed: { dot: "bg-rose-400", text: "text-rose-400" },
};

export function AutomationsPanel({ isDark }: { isDark: boolean }) {
  const automations = useQuery(api.automations.list, {});
  const setEnabled = useMutation(api.automations.setEnabled);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const hoverBg = isDark ? "hover:bg-white/5" : "hover:bg-zinc-50";
  const mutedText = mutedTextClass(isDark);

  const list = automations ?? [];
  const enabledCount = list.filter((a: any) => a.enabled).length;

  if (selectedId) {
    return (
      <AutomationDetail
        automationId={selectedId}
        onBack={() => setSelectedId(null)}
        isDark={isDark}
      />
    );
  }

  return (
    <PanelPage
      eyebrow="Schedule"
      title="Automations"
      description="Recurring jobs the agent runs without a live conversation."
      stat={<HeaderPill isDark={isDark}>{enabledCount} enabled / {list.length} total</HeaderPill>}
    >
      <div className="space-y-3">
        {automations === undefined ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className={panelCardClass(isDark, "h-20 shimmer")} />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState isDark={isDark}>
            No automations yet. Text the agent: <em>"every morning at 8, summarize my calendar"</em>.
          </EmptyState>
        ) : (
          list.map((auto: any) => (
            <div
              key={auto._id}
              className={`${panelCardClass(isDark, "cursor-pointer px-4 py-3.5 transition-colors fade-in")} ${hoverBg}`}
              onClick={() => setSelectedId(auto.automationId)}
            >
              <div className="flex items-center gap-2.5 mb-1.5">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEnabled({
                      automationId: auto.automationId,
                      enabled: !auto.enabled,
                    });
                  }}
                  className={`toggle-switch relative inline-flex items-center w-9 h-5 rounded-full shrink-0 ${
                    auto.enabled
                      ? "bg-emerald-500"
                      : isDark
                        ? "bg-zinc-700"
                        : "bg-zinc-300"
                  }`}
                >
                  <span
                    className={`toggle-thumb inline-block w-3.5 h-3.5 rounded-full bg-white shadow-sm ${
                      auto.enabled ? "translate-x-[18px]" : "translate-x-[3px]"
                    }`}
                  />
                </button>

                <span
                  className={`text-sm font-medium truncate ${
                    isDark ? "text-zinc-100" : "text-zinc-900"
                  } ${!auto.enabled ? "opacity-50" : ""}`}
                >
                  {auto.name}
                </span>

                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                    isDark
                      ? "bg-zinc-100/10 text-zinc-300"
                      : "bg-zinc-100 text-zinc-700"
                  }`}
                >
                  Scheduled
                </span>

                <span className={`text-xs ml-auto mono ${mutedText}`}>
                  {formatSchedule(auto.schedule)}
                </span>
              </div>

              <p
                className={`text-xs truncate mb-2 ml-[46px] ${mutedText} ${
                  !auto.enabled ? "opacity-50" : ""
                }`}
              >
                {auto.task}
              </p>

              <div
                className={`flex items-center gap-3 ml-[46px] text-[10px] mono ${
                  isDark ? "text-zinc-600" : "text-zinc-400"
                }`}
              >
                {auto.lastRunAt && <span>Last run: {timeAgo(auto.lastRunAt)}</span>}
                {auto.nextRunAt && auto.enabled && (
                  <span>
                    Next:{" "}
                    {new Date(auto.nextRunAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
                {auto.integrations.length > 0 && (
                  <span>integrations: {auto.integrations.join(", ")}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </PanelPage>
  );
}

function AutomationDetail({
  automationId,
  onBack,
  isDark,
}: {
  automationId: string;
  onBack: () => void;
  isDark: boolean;
}) {
  const auto = useQuery(api.automations.get, { automationId });
  const runs = useQuery(api.automations.recentRuns, { automationId, limit: 30 });
  const setEnabled = useMutation(api.automations.setEnabled);
  const remove = useMutation(api.automations.remove);

  const mutedText = mutedTextClass(isDark);

  if (!auto) {
    return (
      <div className="mx-auto max-w-[1040px] pb-10">
        <div className={panelCardClass(isDark, "h-20 shimmer")} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1040px] space-y-4 pb-10 fade-in">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onBack}
          className={`rounded-xl px-2.5 py-1.5 text-xs transition-colors ${
            isDark
              ? "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
              : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800"
          }`}
        >
          Back
        </button>

        <button
          onClick={() =>
            setEnabled({ automationId: auto.automationId, enabled: !auto.enabled })
          }
          className={`toggle-switch relative inline-flex items-center w-9 h-5 rounded-full shrink-0 ${
            auto.enabled
              ? "bg-emerald-500"
              : isDark
                ? "bg-zinc-700"
                : "bg-zinc-300"
          }`}
        >
          <span
            className={`toggle-thumb inline-block w-3.5 h-3.5 rounded-full bg-white shadow-sm ${
              auto.enabled ? "translate-x-[18px]" : "translate-x-[3px]"
            }`}
          />
        </button>

        <span
          className={`text-sm font-medium ${
            isDark ? "text-zinc-100" : "text-zinc-900"
          }`}
        >
          {auto.name}
        </span>

        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
            isDark
              ? "bg-zinc-100/10 text-zinc-300"
              : "bg-zinc-100 text-zinc-700"
          }`}
        >
          Scheduled
        </span>

        <span className={`text-xs ml-auto mono ${mutedText}`}>
          {formatSchedule(auto.schedule)}
        </span>

        <button
          onClick={() => {
            if (confirm(`Delete automation "${auto.name}"?`)) {
              remove({ automationId: auto.automationId });
              onBack();
            }
          }}
          className="text-[11px] text-rose-500 hover:text-rose-400"
        >
          Delete
        </button>
      </div>

      <div className={panelCardClass(isDark, "space-y-2 px-4 py-3")}>
        <div>
          <span
            className={`text-[10px] font-bold mono ${
              isDark ? "text-zinc-600" : "text-zinc-400"
            }`}
          >
            TASK{" "}
          </span>
          <span
            className={`text-xs ${bodyTextClass(isDark)}`}
          >
            {auto.task}
          </span>
        </div>
        {auto.integrations.length > 0 && (
          <div>
            <span
              className={`text-[10px] font-bold mono ${
                isDark ? "text-zinc-600" : "text-zinc-400"
              }`}
            >
              INTEGRATIONS{" "}
            </span>
            <span
              className={`text-xs ${bodyTextClass(isDark)}`}
            >
              {auto.integrations.join(", ")}
            </span>
          </div>
        )}
        {auto.nextRunAt && auto.enabled && (
          <div>
            <span
              className={`text-[10px] font-bold mono ${
                isDark ? "text-zinc-600" : "text-zinc-400"
              }`}
            >
              NEXT RUN{" "}
            </span>
            <span
              className={`text-xs ${bodyTextClass(isDark)}`}
            >
              {new Date(auto.nextRunAt).toLocaleString()}
            </span>
          </div>
        )}
      </div>

      <div className={panelCardClass(isDark, "overflow-hidden")}>
        <div className={`border-b px-4 py-2 ${isDark ? "border-white/10" : "border-zinc-100"}`}>
          <span
            className={`text-[10px] font-semibold uppercase tracking-wider ${
              isDark ? "text-zinc-600" : "text-zinc-400"
            }`}
          >
            Run History ({runs?.length ?? 0})
          </span>
        </div>

        {runs === undefined ? (
          <div className="p-5 space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={subtlePanelClass(isDark, "h-10 shimmer")}
              />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <p
            className={`text-sm text-center py-8 ${
              isDark ? "text-slate-600" : "text-slate-400"
            }`}
          >
            No runs yet
          </p>
        ) : (
          <div
            className={`divide-y ${
              isDark ? "divide-white/10" : "divide-zinc-100"
            }`}
          >
            {runs.map((run: any) => {
              const color = STATUS_COLOR[run.status] ?? STATUS_COLOR.running;
              return (
                <div
                  key={run._id}
                  className={`px-5 py-2.5 ${
                    isDark ? "hover:bg-white/5" : "hover:bg-zinc-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${color.dot}`}
                    />
                    <span
                      className={`text-[10px] font-bold mono w-20 shrink-0 capitalize ${color.text}`}
                    >
                      {run.status}
                    </span>
                    <span
                      className={`text-xs flex-1 truncate ${
                        isDark ? "text-slate-400" : "text-slate-600"
                      }`}
                    >
                      {run.result
                        ? run.result.slice(0, 120)
                        : run.error
                          ? run.error.slice(0, 120)
                          : "—"}
                    </span>
                    <span
                      className={`text-[10px] mono shrink-0 ${
                        isDark ? "text-zinc-600" : "text-zinc-400"
                      }`}
                    >
                      {run.startedAt ? timeAgo(run.startedAt) : ""}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
