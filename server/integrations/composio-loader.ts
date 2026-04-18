import {
  buildComposioIntegrationModule,
  getComposio,
  listConnectedToolkits,
} from "../composio.js";
import { registerIntegration } from "./registry.js";

export async function registerComposioToolkits(): Promise<void> {
  if (!getComposio()) {
    console.log("[composio] disabled — COMPOSIO_API_KEY not set");
    return;
  }
  const connected = await listConnectedToolkits();
  const active = connected.filter((c) => c.status === "ACTIVE");
  if (active.length === 0) {
    console.log("[composio] 0 toolkits connected");
    return;
  }
  const seen = new Set<string>();
  for (const conn of active) {
    if (seen.has(conn.slug)) continue;
    seen.add(conn.slug);
    registerIntegration(buildComposioIntegrationModule(conn.slug));
  }
  console.log(`[composio] registered ${seen.size} toolkit(s): ${[...seen].join(", ")}`);
}
