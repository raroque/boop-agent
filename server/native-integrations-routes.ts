import { Router } from "express";

interface NativeIntegrationMeta {
  name: string;
  displayName: string;
  description: string;
  envVar: string;
  docsUrl: string;
  setupSteps: string[];
}

// Native integrations live in server/integrations/*.ts and register themselves
// during server startup. This list is the human-facing metadata for the
// Connections UI. Keep in sync when adding a new native integration.
const NATIVE_INTEGRATIONS: NativeIntegrationMeta[] = [
  {
    name: "granola",
    displayName: "Granola",
    description: "Meeting notes — AI summaries and transcripts.",
    envVar: "GRANOLA_API_TOKEN",
    docsUrl: "https://docs.granola.ai/introduction",
    setupSteps: [
      "Open the Granola desktop app → Settings → Connectors → API keys.",
      "Create a key (it starts with `grn_`).",
      "Add `GRANOLA_API_TOKEN=grn_…` to .env.local and restart the server.",
    ],
  },
  {
    name: "apify",
    displayName: "Apify",
    description: "Web-scraping marketplace — search and run actors for Airbnb, Booking, Zillow, LinkedIn, etc.",
    envVar: "APIFY_API_TOKEN",
    docsUrl: "https://docs.apify.com/platform/integrations/api",
    setupSteps: [
      "Sign in at https://console.apify.com → Settings → Integrations → API tokens.",
      "Create a Personal API token (it starts with `apify_api_`).",
      "Add `APIFY_API_TOKEN=apify_api_…` to .env.local and restart the server.",
      "Optional: tune cost guards via APIFY_RUN_BUDGET_CAP_USD, APIFY_RUN_TIMEOUT_CAP_SECONDS, APIFY_RUN_MEMORY_CAP_MB, APIFY_RUN_MAX_ITEMS_CAP.",
    ],
  },
];

export function createNativeIntegrationsRouter(): Router {
  const router = Router();
  router.get("/", (_req, res) => {
    res.json({
      integrations: NATIVE_INTEGRATIONS.map((i) => ({
        ...i,
        configured: Boolean(process.env[i.envVar]),
      })),
    });
  });
  return router;
}
