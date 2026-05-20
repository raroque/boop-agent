import "../server/env-setup.js";
import { convex } from "../server/convex-client.js";
import { api } from "../convex/_generated/api.js";

const prefix = process.argv[2] ?? "";

async function main() {
  const devices = await convex.query(api.devices.list, {});
  const match = devices.find((d) => d.deviceId.startsWith(prefix));
  if (!match) {
    console.error("no match for prefix:", prefix);
    process.exit(1);
  }
  console.log(match.deviceId);
}
main().catch((e) => { console.error(e); process.exit(1); });
