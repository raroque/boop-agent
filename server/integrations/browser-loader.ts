import { createBrowserMcp } from "../browser/tools.js";
import { registerIntegration } from "./registry.js";

export function registerBrowserIntegration(): void {
  registerIntegration({
    name: "browser",
    description:
      "Full web browser (real Chrome with your saved logins). Pass this to spawn_agent ONLY when no native Composio toolkit covers the task — for gmail/calendar/slack/github/notion/linear/etc., use those toolkits instead. Best for sites without a native toolkit (portals, niche SaaS, anything you've logged into via the boop profile).",
    createServer: async () => createBrowserMcp(),
  });
  console.log("[browser] registered (fallback for sites without a native toolkit)");
}
