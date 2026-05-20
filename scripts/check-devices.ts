import "../server/env-setup.js";
import { convex } from "../server/convex-client.js";
import { api } from "../convex/_generated/api.js";

async function main() {
  const devices = await convex.query(api.devices.list, {});
  console.log("paired devices:", devices.length);
  for (const d of devices) {
    const t = await convex.query(api.devices.apnsTargetForDevice, {
      deviceId: d.deviceId,
    });
    const tokenStatus = t
      ? `APNs ✓ env=${t.apnsEnvironment} token=${t.apnsDeviceToken.slice(0, 8)}…${t.apnsDeviceToken.slice(-4)}`
      : "APNs ✗ no token registered";
    const lastSeen = new Date(d.lastSeenAt).toISOString();
    console.log(
      "  -",
      d.label ?? "(unlabeled)",
      "deviceId=" + d.deviceId.slice(0, 8) + "...",
      "lastSeen=" + lastSeen,
      tokenStatus,
    );
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
