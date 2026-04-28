import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api.js";

const EVENT_COLOR: Record<string, string> = {
  "memory.written": "bg-emerald-500/20 text-emerald-400",
  "memory.recalled": "bg-sky-500/20 text-sky-400",
  "memory.extracted": "bg-violet-500/20 text-violet-400",
  "memory.consolidated": "bg-amber-500/20 text-amber-400",
  "memory.cleaned": "bg-slate-500/20 text-slate-400",
};

export function EventsPanel({ isDark }: { isDark: boolean }) {
  const events = useQuery(api.memoryEvents.recent, { limit: 200 });

  const card = isDark
    ? "bg-slate-900/40 border-slate-800"
    : "bg-white border-slate-200";
  const row = isDark
    ? "bg-slate-900/50 border-slate-800"
    : "bg-slate-50 border-slate-200";
  const muted = isDark ? "text-slate-500" : "text-slate-400";

  return (
    <div className={`rounded-lg border p-4 ${card}`}>
      <h2 className={`text-xs uppercase tracking-wider mb-3 ${muted}`}>
        Recent events
      </h2>
      {!events ? (
        <div className={`py-6 text-center text-sm ${muted}`}>Loading…</div>
      ) : events.length === 0 ? (
        <div className={`py-6 text-center text-sm ${muted}`}>
          No events yet. Chat with the agent to see memory events stream in.
        </div>
      ) : (
        <div className="space-y-1.5">
          {events.map((e: any) => (
            <div key={e._id} className={`border rounded-lg p-2.5 ${row}`}>
              <div className="flex items-center gap-2 text-[10px] mono">
                <span
                  className={`px-1.5 py-0.5 rounded ${EVENT_COLOR[e.eventType] ?? "bg-slate-800/50 text-slate-400"}`}
                >
                  {e.eventType}
                </span>
                {e.conversationId && <span className={muted}>{e.conversationId}</span>}
                {e.memoryId && <span className={muted}>mem:{e.memoryId.slice(-6)}</span>}
                {e.agentId && <span className={muted}>agent:{e.agentId.slice(-6)}</span>}
                <span className={`${muted} ml-auto`}>
                  {new Date(e.createdAt).toLocaleTimeString()}
                </span>
              </div>
              {e.data && (
                <div
                  className={`text-[11px] mono mt-1 break-all ${isDark ? "text-slate-400" : "text-slate-600"}`}
                >
                  {e.data}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
