import { api } from "../../convex/_generated/api.js";
import { convex } from "../convex-client.js";

const DEFAULT_RETENTION_DAYS = 3;
const DEFAULT_INTERVAL_MS = 12 * 60 * 60 * 1000;

function parseEnvNumber(
  name: string,
  fallback: number,
  opts: { min: number; integer?: boolean } = { min: 0 },
): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < opts.min) {
    console.warn(`[image-cleanup] ignoring invalid ${name}="${raw}", using ${fallback}`);
    return fallback;
  }
  return opts.integer ? Math.floor(n) : n;
}

export function getImageRetentionDays(): number {
  return parseEnvNumber("BOOP_IMAGE_RETENTION_DAYS", DEFAULT_RETENTION_DAYS, {
    min: 0,
    integer: true,
  });
}

// Hard cap on how many expired rows we scan in one cleanup invocation. The
// per-tick scan stops if we hit this even when more pages are available — the
// next interval picks up where we left off thanks to ascending createdAt.
const MAX_SCAN_PAGES = 50;
const MEMORY_REF_PAGE_SIZE = 50;

async function findAnchoredStorageIds(storageIds: string[]): Promise<Set<string>> {
  const wanted = [...new Set(storageIds)];
  const found = new Set<string>();
  if (wanted.length === 0) return found;

  let cursor: string | null = null;
  for (;;) {
    // TODO(codegen): drop cast once schema push regenerates Convex API.
    const result = (await convex.query(api.memoryRecords.findImageRefsPage, {
      storageIds: wanted as never,
      cursor,
      pageSize: MEMORY_REF_PAGE_SIZE,
    } as never)) as {
      foundStorageIds: string[];
      isDone: boolean;
      continueCursor: string | null;
    };
    for (const id of result.foundStorageIds) found.add(id);
    if (found.size === wanted.length || result.isDone) break;
    if (result.continueCursor === cursor) {
      console.warn("[image-cleanup] memory ref cursor did not advance; keeping unresolved refs");
      break;
    }
    cursor = result.continueCursor;
  }
  return found;
}

export async function runImageCleanup(): Promise<{ deleted: number; kept: number }> {
  const retention = getImageRetentionDays();
  if (retention === 0) return { deleted: 0, kept: 0 };

  const olderThanMs = Date.now() - retention * 24 * 60 * 60 * 1000;
  let deleted = 0;
  let kept = 0;
  let afterMs = 0;

  for (let page = 0; page < MAX_SCAN_PAGES; page++) {
    // TODO(codegen): drop cast once schema push regenerates Convex API.
    const result = (await convex.query(api.messages.expiredWithImages, {
      olderThanMs,
      afterMs,
      scanLimit: 200,
    } as never)) as {
      rows: Array<{ _id: string; imageStorageIds?: string[] }>;
      hasMore: boolean;
      nextAfterMs: number;
    };

    const pairs = result.rows.flatMap((msg) =>
      (msg.imageStorageIds ?? []).map((storageId) => ({ messageId: msg._id, storageId })),
    );
    let anchoredStorageIds: Set<string>;
    try {
      anchoredStorageIds = await findAnchoredStorageIds(pairs.map((p) => p.storageId));
    } catch (err) {
      console.warn("[image-cleanup] anchor scan failed; keeping page", err);
      kept += pairs.length;
      if (!result.hasMore) break;
      if (result.nextAfterMs <= afterMs) break;
      afterMs = result.nextAfterMs;
      continue;
    }
    const toDelete = pairs.filter((p) => !anchoredStorageIds.has(p.storageId));
    kept += pairs.length - toDelete.length;
    await Promise.all(
      toDelete.map(async (p) => {
        await convex.mutation(api.messages.clearMessageImage, {
          messageId: p.messageId as never,
          storageId: p.storageId as never,
        });
        try {
          await convex.mutation(api.messages.deleteImageBytes, {
            storageId: p.storageId as never,
          });
          deleted += 1;
        } catch (err) {
          console.warn(`[image-cleanup] failed to delete image bytes ${p.storageId}`, err);
        }
      }),
    );

    if (!result.hasMore) break;
    if (result.nextAfterMs <= afterMs) break;
    afterMs = result.nextAfterMs;
  }

  return { deleted, kept };
}

export function startImageCleanup(): () => void {
  if (getImageRetentionDays() === 0) {
    console.log("[image-cleanup] disabled (BOOP_IMAGE_RETENTION_DAYS=0)");
    return () => undefined;
  }
  const intervalMs = parseEnvNumber("BOOP_IMAGE_CLEANUP_INTERVAL_MS", DEFAULT_INTERVAL_MS, {
    min: 1,
  });
  console.log(
    `[image-cleanup] enabled (retention=${getImageRetentionDays()}d, interval=${intervalMs}ms)`,
  );
  // In-flight guard so a slow cleanup can't race against the next tick.
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runImageCleanup();
      if (r.deleted > 0 || r.kept > 0) {
        console.log(`[image-cleanup] deleted=${r.deleted} kept=${r.kept}`);
      }
    } catch (err) {
      console.warn("[image-cleanup] tick failed", err);
    } finally {
      running = false;
    }
  };
  void tick();
  const handle = setInterval(tick, intervalMs);
  return () => clearInterval(handle);
}
