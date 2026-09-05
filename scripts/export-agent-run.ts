import "../server/env-setup.js";
import { writeFile } from "node:fs/promises";

const { api } = await import("../convex/_generated/api.js");
const { convex } = await import("../server/convex-client.js");
const { buildAgentRunExport, collectAgentLogs } = await import("../server/agent-run-export.js");

const LOG_PAGE_SIZE = 500;
const [agentId, outputPath] = process.argv.slice(2);

if (!agentId || agentId === "--help" || agentId === "-h") {
  console.error("Usage: npx tsx scripts/export-agent-run.ts <agent-id> [output.json]");
  process.exit(agentId ? 0 : 1);
}

const agent = await convex.query(api.agents.get, { agentId });

if (!agent) {
  console.error(`Agent run not found: ${agentId}`);
  process.exit(1);
}

const logs = await collectAgentLogs((cursor) =>
  convex.query(api.agents.getLogsPage, {
    agentId,
    cursor,
    limit: LOG_PAGE_SIZE,
  }),
);

const json = `${JSON.stringify(buildAgentRunExport(agent, logs), null, 2)}\n`;

if (outputPath) {
  await writeFile(outputPath, json, "utf8");
  console.error(`Exported ${agentId} to ${outputPath}`);
} else {
  process.stdout.write(json);
}
