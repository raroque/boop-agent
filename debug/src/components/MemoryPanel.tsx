import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api.js";
import type { Id } from "../../../convex/_generated/dataModel.js";
import MemoryGraphView from "./MemoryGraphView.js";
import { EmbeddingBanner } from "./EmbeddingBanner.js";
import {
  EmptyState,
  HeaderPill,
  PanelPage,
  mutedTextClass,
  panelCardClass,
  subtlePanelClass,
} from "./PanelPrimitives.js";

type Tier = "all" | "short" | "long" | "permanent";
type Segment = "all" | "identity" | "preference" | "relationship" | "project" | "knowledge" | "context";
type ViewMode = "table" | "graph";

const TIER_OPTIONS: { value: Tier; label: string }[] = [
  { value: "all", label: "All" },
  { value: "short", label: "Short" },
  { value: "long", label: "Long" },
  { value: "permanent", label: "Permanent" },
];

const SEGMENT_OPTIONS: Segment[] = [
  "all",
  "identity",
  "preference",
  "relationship",
  "project",
  "knowledge",
  "context",
];

const TIER_BADGE: Record<string, { dark: string; light: string }> = {
  short: {
    dark: "text-sky-400 bg-sky-400/10 border-sky-500/20",
    light: "text-sky-600 bg-sky-50 border-sky-200",
  },
  long: {
    dark: "text-violet-400 bg-violet-400/10 border-violet-500/20",
    light: "text-violet-600 bg-violet-50 border-violet-200",
  },
  permanent: {
    dark: "text-amber-400 bg-amber-400/10 border-amber-500/20",
    light: "text-amber-600 bg-amber-50 border-amber-200",
  },
};

const SEGMENT_COLOR: Record<string, { dark: string; light: string }> = {
  identity: { dark: "text-rose-400", light: "text-rose-600" },
  preference: { dark: "text-teal-400", light: "text-teal-600" },
  relationship: { dark: "text-pink-400", light: "text-pink-600" },
  project: { dark: "text-orange-400", light: "text-orange-600" },
  knowledge: { dark: "text-blue-400", light: "text-blue-600" },
  context: { dark: "text-slate-400", light: "text-slate-500" },
};

function MemoryImageBadge({ storageId }: { storageId: string }) {
  const url = useQuery(api.messages.getStorageUrl, {
    storageId: storageId as Id<"_storage">,
  });
  if (!url) return <div className="w-12 h-12 bg-neutral-200 rounded" />;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img
        src={url}
        alt="image memory"
        className="w-12 h-12 object-cover rounded border border-neutral-300"
      />
    </a>
  );
}

export function MemoryPanel({ isDark }: { isDark: boolean }) {
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [tierFilter, setTierFilter] = useState<Tier>("all");
  const [segmentFilter, setSegmentFilter] = useState<Segment>("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const records = useQuery(api.memoryRecords.list, {
    tier: tierFilter !== "all" ? (tierFilter as any) : undefined,
    lifecycle: "active",
    limit: 500,
  });

  const allRecords = records ?? [];
  const filtered = allRecords.filter((r: any) => {
    if (segmentFilter !== "all" && r.segment !== segmentFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        (r.content ?? "").toLowerCase().includes(q) ||
        (r.memoryId ?? "").toLowerCase().includes(q) ||
        (r.segment ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const btnActive = isDark
    ? "bg-zinc-100 text-zinc-950 shadow-sm"
    : "bg-white text-zinc-950 shadow-sm";
  const btnInactive = isDark
    ? "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
    : "text-zinc-500 hover:bg-white/70 hover:text-zinc-800";

  return (
    <PanelPage
      eyebrow="Store"
      title="Memory"
      description="Search, filter, and inspect the active memory store."
      stat={<HeaderPill isDark={isDark}>{filtered.length}/{allRecords.length}</HeaderPill>}
      maxWidth={viewMode === "graph" ? "max-w-none" : "max-w-[1040px]"}
    >
      <EmbeddingBanner isDark={isDark} />
      <div className={panelCardClass(isDark, "flex flex-wrap items-center gap-2 px-3 py-3")}>
        <div
          className={`segmented-control flex items-center rounded-2xl border p-1 ${
            isDark ? "border-white/10 bg-[#17171a]" : "border-zinc-200 bg-zinc-100"
          }`}
        >
          {(["table", "graph"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`segmented-button px-2.5 py-1 text-xs capitalize ${
                viewMode === mode ? btnActive : btnInactive
              } rounded-xl`}
            >
              {mode}
            </button>
          ))}
        </div>

        {viewMode === "table" && (
          <>
            <div className="flex items-center gap-1">
              {TIER_OPTIONS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTierFilter(t.value)}
                  className={`segmented-button rounded-xl px-2.5 py-1 text-xs ${
                    tierFilter === t.value ? btnActive : btnInactive
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <select
              value={segmentFilter}
              onChange={(e) => setSegmentFilter(e.target.value as Segment)}
              className={`rounded-xl border px-2.5 py-1.5 text-xs focus:outline-none ${
                isDark
                  ? "border-white/10 bg-[#17171a] text-zinc-300"
                  : "border-zinc-200 bg-white text-zinc-700"
              }`}
            >
              {SEGMENT_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "All segments" : s}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search memories…"
              className={`min-w-[200px] flex-1 rounded-xl border px-3 py-1.5 text-sm focus:outline-none ${
                isDark
                  ? "border-white/10 bg-[#17171a] text-zinc-300 placeholder:text-zinc-600"
                  : "border-zinc-200 bg-white text-zinc-700 placeholder:text-zinc-400"
              }`}
            />
          </>
        )}
      </div>

      {viewMode === "graph" && (
        <div className={panelCardClass(isDark, "h-[calc(100vh-190px)] min-h-[520px] overflow-hidden")}>
          <MemoryGraphView records={allRecords as any} isDark={isDark} />
        </div>
      )}

      {viewMode === "table" && (
        <div className={panelCardClass(isDark, "overflow-hidden")}>
          {records === undefined ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 6 }, (_, i) => (
                <div
                  key={i}
                  className={subtlePanelClass(isDark, "h-14 shimmer")}
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState isDark={isDark}>
              No records match your filters
            </EmptyState>
          ) : (
            <div
              className={`divide-y ${
                isDark ? "divide-white/10" : "divide-zinc-100"
              }`}
            >
              {filtered.map((r: any) => {
                const isExpanded = expandedId === r.memoryId;
                const tierBadge = TIER_BADGE[r.tier] ?? { dark: "", light: "" };
                const segColor =
                  SEGMENT_COLOR[r.segment] ?? {
                    dark: "text-slate-400",
                    light: "text-slate-500",
                  };

                return (
                  <div
                    key={r.memoryId}
                    className={`px-5 py-3 cursor-pointer transition-colors ${
                      isDark ? "hover:bg-white/5" : "hover:bg-zinc-50"
                    }`}
                    onClick={() =>
                      setExpandedId(isExpanded ? null : r.memoryId)
                    }
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                          isDark ? tierBadge.dark : tierBadge.light
                        }`}
                      >
                        {r.tier}
                      </span>
                      <span
                        className={`text-[10px] font-semibold ${
                          isDark ? segColor.dark : segColor.light
                        }`}
                      >
                        {r.segment}
                      </span>
                      <span
                        className={`text-[10px] mono ml-auto ${
                          mutedTextClass(isDark)
                        }`}
                      >
                        {(r.importance ?? 0).toFixed(2)}
                      </span>
                      <span
                        className={`text-[10px] mono ${
                          isDark ? "text-zinc-600" : "text-zinc-300"
                        }`}
                      >
                        {r.accessCount ?? 0}x
                      </span>
                    </div>

                    <p
                      className={`text-sm ${
                        isExpanded ? "" : "line-clamp-2"
                      } ${isDark ? "text-slate-300" : "text-slate-700"}`}
                    >
                      {r.content}
                    </p>

                    {Array.isArray(r.imageStorageIds) && r.imageStorageIds.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {r.imageStorageIds.map((id: string) => (
                          <MemoryImageBadge key={id} storageId={id} />
                        ))}
                      </div>
                    )}

                    {isExpanded && (
                      <div className="mt-3 space-y-2 text-xs slide-down">
                        <div
                          className={`grid grid-cols-2 gap-x-6 gap-y-1 ${
                            mutedTextClass(isDark)
                          }`}
                        >
                          <div>
                            ID:{" "}
                            <span
                              className={`mono ${
                                isDark ? "text-slate-400" : "text-slate-600"
                              }`}
                            >
                              {r.memoryId}
                            </span>
                          </div>
                          <div>
                            Decay:{" "}
                            <span
                              className={`mono ${
                                isDark ? "text-slate-400" : "text-slate-600"
                              }`}
                            >
                              {r.decayRate}
                            </span>
                          </div>
                          {r.sourceTurn && (
                            <div>
                              Turn:{" "}
                              <span
                                className={`mono ${
                                  isDark ? "text-slate-400" : "text-slate-600"
                                }`}
                              >
                                {r.sourceTurn}
                              </span>
                            </div>
                          )}
                          <div>
                            Last accessed:{" "}
                            <span
                              className={isDark ? "text-slate-400" : "text-slate-600"}
                            >
                              {new Date(r.lastAccessedAt).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </PanelPage>
  );
}
