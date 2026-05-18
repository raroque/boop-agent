import { ComposioSection } from "./ComposioSection.js";

export function ConnectionsPanel({ isDark }: { isDark: boolean }) {
  return (
    <div className="min-h-full">
      <ComposioSection isDark={isDark} />
    </div>
  );
}
