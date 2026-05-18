// Set a dummy CONVEX_URL so convex-client.ts does not throw at module
// initialization when tests run outside a real Convex deployment.
// Tests that exercise Convex queries/mutations should mock the client directly.
if (!process.env.CONVEX_URL) {
  process.env.CONVEX_URL = "https://test.convex.cloud";
}
