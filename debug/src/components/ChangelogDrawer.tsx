import { useCallback, useEffect, useState, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowReloadHorizontalIcon,
  BookOpen01Icon,
  Cancel01Icon,
  GithubIcon,
  Link04Icon,
} from "@hugeicons/core-free-icons";

interface ChangelogPayload {
  repo: string;
  branch: string;
  version: string;
  source: "github-changelog" | "github-releases" | "local-changelog";
  url: string | null;
  fetchedAt: string;
  markdown: string;
  warning?: string;
}

interface ChangelogDrawerProps {
  open: boolean;
  onClose: () => void;
  isDark: boolean;
}

function sourceLabel(source?: ChangelogPayload["source"]) {
  if (source === "github-changelog") return "GitHub changelog";
  if (source === "github-releases") return "GitHub releases";
  if (source === "local-changelog") return "Local fallback";
  return "Loading";
}

function cleanUrl(raw: string): string {
  return raw.replace(/[),.;:]+$/g, "");
}

function renderInline(text: string, isDark: boolean): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[1] && match[2]) {
      const url = cleanUrl(match[2]);
      nodes.push(
        <a
          key={`${url}-${match.index}`}
          href={url}
          target="_blank"
          rel="noreferrer"
          className="font-medium underline decoration-current/30 underline-offset-2 hover:decoration-current"
        >
          {match[1]}
        </a>,
      );
    } else if (match[3]) {
      nodes.push(
        <code
          key={`code-${match.index}`}
          className={`rounded px-1 py-0.5 mono ${
            isDark ? "bg-white/10 text-zinc-200" : "bg-zinc-100 text-zinc-800"
          }`}
        >
          {match[3]}
        </code>,
      );
    } else if (match[4]) {
      nodes.push(<strong key={`strong-${match.index}`}>{match[4]}</strong>);
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function ChangelogMarkdown({
  markdown,
  isDark,
}: {
  markdown: string;
  isDark: boolean;
}) {
  const nodes: ReactNode[] = [];
  let listItems: string[] = [];

  function flushList(key: string) {
    if (!listItems.length) return;
    const items = listItems;
    listItems = [];
    nodes.push(
      <ul key={key} className="space-y-2 pl-4 text-sm leading-relaxed list-disc">
        {items.map((item, index) => (
          <li key={`${key}-${index}`}>{renderInline(item, isDark)}</li>
        ))}
      </ul>,
    );
  }

  markdown.split("\n").forEach((rawLine, index) => {
    const line = rawLine.trimEnd();
    const key = `line-${index}`;

    if (!line.trim()) {
      flushList(`${key}-list`);
      return;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushList(`${key}-list`);
      const level = heading[1].length;
      const text = heading[2];
      if (level === 1) {
        nodes.push(
          <h2 key={key} className="pt-1 text-xl font-semibold tracking-normal">
            {renderInline(text, isDark)}
          </h2>,
        );
      } else if (level === 2) {
        nodes.push(
          <h3
            key={key}
            className={`pt-5 text-sm font-semibold tracking-normal ${
              isDark ? "text-zinc-100" : "text-zinc-950"
            }`}
          >
            {renderInline(text, isDark)}
          </h3>,
        );
      } else {
        nodes.push(
          <h4
            key={key}
            className={`pt-3 text-xs font-semibold uppercase tracking-[0.08em] ${
              isDark ? "text-zinc-400" : "text-zinc-500"
            }`}
          >
            {renderInline(text, isDark)}
          </h4>,
        );
      }
      return;
    }

    if (/^-{3,}$/.test(line.trim())) {
      flushList(`${key}-list`);
      nodes.push(
        <div
          key={key}
          className={`my-4 h-px ${isDark ? "bg-white/10" : "bg-zinc-200"}`}
        />,
      );
      return;
    }

    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      listItems.push(bullet[1]);
      return;
    }

    flushList(`${key}-list`);
    nodes.push(
      <p key={key} className="text-sm leading-relaxed">
        {renderInline(line.trim(), isDark)}
      </p>,
    );
  });

  flushList("final-list");

  return <div className="space-y-3">{nodes}</div>;
}

export function ChangelogDrawer({ open, onClose, isDark }: ChangelogDrawerProps) {
  const [payload, setPayload] = useState<ChangelogPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/changelog${refresh ? "?refresh=true" : ""}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Changelog fetch failed (${res.status})`);
      }
      setPayload((await res.json()) as ChangelogPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && !payload && !loading) void load(false);
  }, [load, loading, open, payload]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const surface = isDark
    ? "border-white/10 bg-[#1f1f23] text-zinc-100 shadow-black/30"
    : "border-zinc-200 bg-white text-zinc-950 shadow-zinc-300/40";
  const muted = isDark ? "text-zinc-500" : "text-zinc-500";
  const buttonClass = isDark
    ? "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-zinc-100"
    : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950";

  return (
    <>
      <button
        aria-label="Close changelog"
        onClick={onClose}
        tabIndex={-1}
        className="absolute inset-0 z-30 cursor-default bg-black/10 opacity-0"
      />
      <aside
        className={`changelog-drawer absolute inset-y-0 right-0 z-40 flex w-[min(480px,calc(100vw-2rem))] flex-col border-l shadow-2xl ${surface}`}
        aria-label="Changelog"
      >
        <div
          className={`flex shrink-0 items-start justify-between gap-4 border-b px-4 py-4 ${
            isDark ? "border-white/10" : "border-zinc-200"
          }`}
        >
          <div className="min-w-0">
            <div className={`flex items-center gap-2 text-[11px] mono ${muted}`}>
              <HugeiconsIcon icon={GithubIcon} size={14} />
              <span className="truncate">{payload?.repo ?? "GitHub"}</span>
            </div>
            <h2 className="mt-1 flex items-center gap-2 text-base font-semibold">
              <HugeiconsIcon icon={BookOpen01Icon} size={18} />
              Changelog
            </h2>
            <div className={`mt-1 text-xs ${muted}`}>
              {payload
                ? `${sourceLabel(payload.source)} · v${payload.version}`
                : "Fetching from GitHub"}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {payload?.url && (
              <a
                href={payload.url}
                target="_blank"
                rel="noreferrer"
                className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border transition-colors ${buttonClass}`}
                title="Open on GitHub"
              >
                <HugeiconsIcon icon={Link04Icon} size={15} />
              </a>
            )}
            <button
              onClick={() => load(true)}
              disabled={loading}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border disabled:opacity-50 ${buttonClass}`}
              title="Refresh changelog"
            >
              <HugeiconsIcon
                icon={ArrowReloadHorizontalIcon}
                size={15}
                className={loading ? "spin-smooth" : ""}
              />
            </button>
            <button
              onClick={onClose}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border ${buttonClass}`}
              title="Close"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={15} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto debug-scroll px-4 py-4">
          {loading && !payload ? (
            <div className="space-y-3">
              {Array.from({ length: 8 }, (_, index) => (
                <div
                  key={index}
                  className={`h-5 rounded-xl shimmer ${
                    isDark ? "bg-white/5" : "bg-zinc-100"
                  }`}
                />
              ))}
            </div>
          ) : error ? (
            <div
              className={`rounded-2xl border px-3 py-3 text-sm ${
                isDark
                  ? "border-rose-400/20 bg-rose-400/10 text-rose-200"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              }`}
            >
              {error}
            </div>
          ) : payload ? (
            <div className={isDark ? "text-zinc-300" : "text-zinc-700"}>
              {payload.warning && (
                <div
                  className={`mb-4 rounded-2xl border px-3 py-2 text-xs ${
                    isDark
                      ? "border-amber-400/20 bg-amber-400/10 text-amber-200"
                      : "border-amber-200 bg-amber-50 text-amber-800"
                  }`}
                >
                  {payload.warning}
                </div>
              )}
              <ChangelogMarkdown markdown={payload.markdown} isDark={isDark} />
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}
