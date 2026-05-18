import type { ReactNode } from "react";

export function panelCardClass(isDark: boolean, extra = "") {
  return `panel-card-motion rounded-2xl border shadow-sm ${
    isDark
      ? "border-white/10 bg-[#202024] shadow-black/20"
      : "border-zinc-200 bg-white shadow-zinc-200/50"
  } ${extra}`;
}

export function subtlePanelClass(isDark: boolean, extra = "") {
  return `rounded-2xl border ${
    isDark ? "border-white/10 bg-white/5" : "border-zinc-200 bg-zinc-50"
  } ${extra}`;
}

export function mutedTextClass(isDark: boolean) {
  return isDark ? "text-zinc-500" : "text-zinc-400";
}

export function bodyTextClass(isDark: boolean) {
  return isDark ? "text-zinc-300" : "text-zinc-700";
}

export function PanelPage({
  eyebrow,
  title,
  description,
  stat,
  action,
  children,
  maxWidth = "max-w-[1040px]",
}: {
  eyebrow: string;
  title: string;
  description: string;
  stat?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  maxWidth?: string;
}) {
  return (
    <div className={`mx-auto ${maxWidth} space-y-5 pb-10`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
            {eyebrow}
          </div>
          <h2 className="mt-1 text-[22px] font-semibold tracking-normal">{title}</h2>
          <p className="mt-1 text-sm text-zinc-500">{description}</p>
        </div>
        {(stat || action) && (
          <div className="flex items-center gap-2">
            {stat}
            {action}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

export function HeaderPill({
  children,
  isDark,
  className = "",
}: {
  children: ReactNode;
  isDark: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex w-fit items-center whitespace-nowrap rounded-2xl border px-2.5 py-1 text-xs mono ${
        isDark
          ? "border-white/10 bg-white/5 text-zinc-400"
          : "border-zinc-200 bg-white text-zinc-500"
      } ${className}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  children,
  isDark,
}: {
  children: ReactNode;
  isDark: boolean;
}) {
  return (
    <div className={subtlePanelClass(isDark, "px-4 py-10 text-center text-sm text-zinc-500")}>
      {children}
    </div>
  );
}
