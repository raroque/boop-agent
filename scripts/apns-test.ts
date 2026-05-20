#!/usr/bin/env tsx
/**
 * One-shot APNs smoke test. Sends a test push to a paired iOS device so
 * you can isolate "is APNs reaching the phone?" from "is the broadcast
 * subscription working?".
 *
 * Usage:
 *   npx tsx scripts/apns-test.ts <deviceId-or-hex-token> [message]
 *
 * The first arg is auto-detected:
 *   - 32+ hex chars  → treated as a raw APNs device token; environment
 *                      defaults to development unless --prod is passed.
 *   - anything else  → treated as a Convex deviceId; the script looks up
 *                      the stored APNs token + environment via Convex.
 *
 * Examples:
 *   npx tsx scripts/apns-test.ts 8a1c...64hex                  # dev sandbox
 *   npx tsx scripts/apns-test.ts 8a1c...64hex "hi" --prod      # prod APNs
 *   npx tsx scripts/apns-test.ts e7f9a3-uuid-deviceid          # auto env
 *
 * Exit codes:
 *   0 — push delivered (HTTP 200)
 *   1 — config / lookup error before sending
 *   2 — APNs rejected the push (any non-2xx, with reason printed)
 */

import "../server/env-setup.js";
import { push } from "../server/apns.js";
import { convex } from "../server/convex-client.js";
import { api } from "../convex/_generated/api.js";

function usage(): never {
  console.error(
    "Usage: npx tsx scripts/apns-test.ts <deviceId-or-hex-token> [message] [--prod]",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0) usage();

const forceProd = args.includes("--prod");
const positional = args.filter((a) => !a.startsWith("--"));
const identifier = positional[0];
const customBody = positional.slice(1).join(" ");
if (!identifier) usage();

const isHexToken = /^[0-9a-fA-F]{32,}$/.test(identifier);

async function resolveTarget(): Promise<{
  deviceToken: string;
  environment: "development" | "production";
  label: string;
}> {
  if (isHexToken) {
    return {
      deviceToken: identifier,
      environment: forceProd ? "production" : "development",
      label: "(direct token)",
    };
  }
  const t = await convex.query(api.devices.apnsTargetForDevice, {
    deviceId: identifier,
  });
  if (!t) {
    console.error(
      `No APNs target found for deviceId ${identifier}. Either the device hasn't paired yet, hasn't reported its APNs token (open the app on the phone once with notifications enabled), or got 410-evicted.`,
    );
    process.exit(1);
  }
  return {
    deviceToken: t.apnsDeviceToken,
    environment: forceProd
      ? "production"
      : (t.apnsEnvironment as "development" | "production"),
    label: t.label ?? "(unlabeled)",
  };
}

async function main(): Promise<void> {
  const target = await resolveTarget();
  const body = customBody || "Test push from apns-test.ts";
  console.log(
    `→ pushing to ${target.label} | env=${target.environment} | token=${target.deviceToken.slice(0, 8)}…${target.deviceToken.slice(-4)}`,
  );

  const result = await push({
    deviceToken: target.deviceToken,
    environment: target.environment,
    title: "Boop test",
    body,
    threadId: "test",
  });

  if (result.status >= 200 && result.status < 300) {
    console.log(`✓ delivered (HTTP ${result.status})`);
    process.exit(0);
  }

  console.error(`✗ APNs rejected (HTTP ${result.status}, reason="${result.reason ?? "none"}")`);

  // Friendly hints for the common rejection codes.
  const hints: Record<string, string> = {
    BadDeviceToken:
      "Token doesn't match the environment. If the build is TestFlight, retry with --prod. If it's an Xcode-installed debug build, use development (default).",
    Unregistered: "Token was revoked (app uninstalled or OS rotated). The phone will get a fresh one on next launch.",
    InvalidProviderToken: "JWT was rejected — check APNS_TEAM_ID + APNS_KEY_ID + APNS_PRIVATE_KEY in .env.local.",
    ExpiredProviderToken: "JWT expired. push() retries once automatically; if you see this, the retry also failed.",
    DeviceTokenNotForTopic: "Bundle ID mismatch between APNS_BUNDLE_ID and the token's bundle. Should be dev.boop.Boop.",
    TopicDisallowed: "APNS_BUNDLE_ID doesn't match what the .p8 key is authorised for.",
    PayloadTooLarge: "Push payload exceeded 4KB. Shouldn't happen with this script.",
  };
  if (result.reason && hints[result.reason]) {
    console.error(`hint: ${hints[result.reason]}`);
  }
  process.exit(2);
}

main().catch((err) => {
  console.error("unexpected error:", err);
  process.exit(1);
});
