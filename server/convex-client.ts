import { ConvexHttpClient } from "convex/browser";

const url = process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL;
if (!url) {
  throw new Error(
    "Convex URL is not set. Run `npm run setup` or `npx convex dev` to configure VITE_CONVEX_URL.",
  );
}

export const convex = new ConvexHttpClient(url);
