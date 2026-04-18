import { ComposioSection } from "./ComposioSection.js";

export function ConnectionsPanel({ isDark }: { isDark: boolean }) {
  return (
    <div className="h-full overflow-y-auto debug-scroll">
      <ComposioSection isDark={isDark} />
    </div>
  );
}
