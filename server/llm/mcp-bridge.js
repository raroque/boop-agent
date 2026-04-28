import { createConnection } from "net";

const socketPath = process.argv[2];
if (!socketPath) {
  console.error("Usage: node mcp-bridge.js <socketPath>");
  process.exit(1);
}

const client = createConnection(socketPath, () => {
  process.stdin.pipe(client);
  client.pipe(process.stdout);
});

client.on("error", (err) => {
  console.error("Bridge connection error:", err);
  process.exit(1);
});

client.on("close", () => {
  process.exit(0);
});
