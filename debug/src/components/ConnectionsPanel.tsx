import { ComposioSection } from "./ComposioSection.js";
import { NativeIntegrationsSection } from "./NativeIntegrationsSection.js";

export function ConnectionsPanel({ isDark }: { isDark: boolean }) {
  return (
    <div className="h-full overflow-y-auto debug-scroll">
      <NativeIntegrationsSection isDark={isDark} />
      <ComposioSection isDark={isDark} />
    </div>
  );
}
