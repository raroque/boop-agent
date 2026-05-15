import { ComposioSection } from "./ComposioSection.js";
import { NativeIntegrationsSection } from "./NativeIntegrationsSection.js";
import { CredentialsSection } from "./CredentialsSection.js";
import { DevicesSection } from "./DevicesSection.js";

export function ConnectionsPanel({ isDark }: { isDark: boolean }) {
  return (
    <div className="h-full overflow-y-auto debug-scroll">
      <DevicesSection isDark={isDark} />
      <NativeIntegrationsSection isDark={isDark} />
      <CredentialsSection isDark={isDark} />
      <ComposioSection isDark={isDark} />
    </div>
  );
}
