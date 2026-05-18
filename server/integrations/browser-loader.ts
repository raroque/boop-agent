import { createBrowserMcp, createBrowserTools } from "../browser/tools.js";
import { getBrowserSettings } from "../runtime-config.js";
import { registerIntegration } from "./registry.js";

export function registerBrowserIntegration(): void {
  registerIntegration({
    name: "browser",
    description:
      "Optional local Patchright Chrome browser with a persistent profile. Use as a fallback for sites without native integrations, login-required services, visual workflows, or bot-wall-sensitive pages.",
    isEnabled: async () => (await getBrowserSettings()).enabled,
    createServer: async () => createBrowserMcp(),
    createTools: async () => createBrowserTools(),
  });
  console.log("[browser] registered local Patchright Chrome integration");
}
