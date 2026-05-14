# Image viewing — Design

**Date:** 2026-05-13
**Status:** Proposed
**Topic:** Add the ability for Boop to view images sent over iMessage.

---

## 1. Goals

Let Boop "see" images the user texts it. The dispatcher (interaction agent) sees image content directly. The dispatcher can pass images to spawned execution agents when relevant. Image content also becomes memory.

The feature is gated by configuration. Defaults preserve current behavior.

## 2. Non-goals

- Sending images outbound from Boop. Receive-only.
- Image generation. Receive and view only.
- Multi-modal documents (PDF, video) — images only.

## 3. Architecture overview

```
iMessage (Sendblue) ── webhook ──► server/sendblue.ts
                                       │
                                       ▼ download image bytes
                                  Convex file storage
                                       │
                                       ▼ storageId on message
                                  Interaction Agent
                                  (sees text + image)
                                       │
                ┌──────────────────────┼─────────────────────┐
                ▼                      ▼                     ▼
         spawn_agent w/         memory extraction      reply in chat
         imageRefs[]            (Haiku describes
           │                     image → memory)
           ▼
   Execution Agent (receives image content blocks for tasks
                    that depend on the image)
```

## 4. Configuration

| Env var | Values | Default | Meaning |
|---|---|---|---|
| `BOOP_IMAGE_RETENTION_DAYS` | integer | `3` | TTL for image bytes in Convex storage. `0` disables cleanup. |
| `BOOP_IMAGE_CLEANUP_INTERVAL_MS` | integer | `43200000` (12h) | How often the cleanup sweep runs. |

## 5. Image pipeline

### 5.1 Ingest (`server/sendblue.ts`)

- The Sendblue webhook payload includes a media URL (or array of URLs) on MMS messages. Detect when present.
- Download bytes synchronously with:
  - 10-second timeout
  - 10MB hard cap (streamed; abort early once running total exceeds the cap, since `content-length` is often absent on CDN/redirect responses)
  - MIME allowlist: `image/jpeg`, `image/png`, `image/webp`, `image/gif`
- Upload bytes to Convex file storage via a new mutation. Returned `Id<"_storage">` is appended to `imageStorageIds` on the message record.
- On any failure (download error, oversize, wrong MIME, Convex upload failure), the message is still stored text-only with `mediaError: "<short reason>"`. The dispatcher sees a system note prepended to the user text: `[user sent images but they couldn't be downloaded: <reason>]`.

### 5.2 Dispatcher consumption (`server/interaction-agent.ts`)

When building the SDK turn input, if the latest user message has `imageStorageIds`:
- Fetch bytes from Convex storage
- Base64-encode each
- Construct Anthropic SDK content blocks: `[{type:"image", source:{type:"base64", media_type, data}}, ..., {type:"text", text: userText}]`
- Replace the string prompt with the content array

System prompt update: a new "Images" section is appended explaining that the user may text photos and the dispatcher should treat them as part of the message, with guidance about passing relevant images through to `spawn_agent` via `imageRefs`.

### 5.3 Propagation to execution agents (`server/execution-agent.ts`)

- The `spawn_agent` tool definition gains an optional parameter: `imageRefs: string[]` (Convex storageIds).
- The dispatcher decides which images, if any, are relevant to the spawned task and includes them. The dispatcher-side handler filters the model's chosen IDs against the ones actually attached to the current inbound turn — guards against the model passing a hallucinated or stale ref.
- `spawnExecutionAgent()` resolves those storageIds to bytes and prepends image content blocks to the execution agent's task prompt.
- If a referenced storageId no longer exists, the spawn fails with a structured tool error. The dispatcher can retry without the missing image.
- V1 limitation: image refs are not persisted to `executionAgents` and are therefore not replayed on `retryAgent`. Re-trigger from the original turn if image inputs are required.

### 5.4 Memory extraction (`server/memory/extract.ts`)

- When a turn contains images, the existing post-turn extraction call also receives them as content blocks.
- It produces normal text memory records as before, **plus** may produce a description-style record like `"User sent a photo: <one-sentence description>"` tagged with `imageStorageIds` pointing back to the image.
- This is what makes "remember that photo I sent" searchable.
- Memory records gain an optional `imageStorageIds: Id<"_storage">[]` field.
- The extraction prompt instructs the model to set `describesImage: true` on only the one fact that describes the inbound image; the caller links those facts to the image storage IDs.

### 5.5 Schema changes (`convex/schema.ts`)

- `messages` table:
  - `imageStorageIds?: v.array(v.id("_storage"))`
  - `mediaError?: v.string()`
  - new `by_createdAt` index (used by the cleanup sweep)
- `memoryRecords` table:
  - `imageStorageIds?: v.array(v.id("_storage"))`

## 6. Image retention and cleanup

### 6.1 Policy

- Raw image bytes have a TTL of `BOOP_IMAGE_RETENTION_DAYS` days (default 3) from the message's `createdAt`.
- An image is **exempt** from deletion as long as at least one `memoryRecords` row references its `storageId`. If the memory extractor decided the photo was worth keeping, it stays.
- If the last referencing memory record is later pruned (consolidation drops it), the image becomes eligible for cleanup on the next sweep.
- `BOOP_IMAGE_RETENTION_DAYS=0` disables cleanup entirely (debug/testing only).

### 6.2 Implementation (`server/images/clean.ts`, new)

Periodic job (default every 12 hours, configurable via `BOOP_IMAGE_CLEANUP_INTERVAL_MS`):

```
for each page of messages older than RETENTION_DAYS with non-empty imageStorageIds:
  for each storageId on that message:
    if no memoryRecords row contains this storageId:
      delete bytes from Convex storage
      remove id from messages.imageStorageIds
```

Pagination uses a cursor over the `by_createdAt` index so the sweep is bounded per tick. Job is idempotent. Concurrent ticks are guarded against by a "running" flag.

### 6.3 Dashboard

- Dashboard tab gains a stat: `"Image storage: N files"` (capped scan, surfaces a `truncated` flag like the other metrics).
- Memory tab shows a small image-thumbnail badge next to memory records with non-empty `imageStorageIds`.
- No manual "purge" button in V1.

## 7. Error handling

| Failure | Behavior |
|---|---|
| Sendblue payload malformed or media URL missing | Skip image, store message text-only, log warning |
| Image download HTTP error or timeout (>10s) | Store message with `mediaError: "download failed: <code>"`, dispatcher sees prepended system note |
| Image exceeds 10MB cap | Stream-side abort with `mediaError: "image too large: >N bytes"` |
| Unsupported MIME type | Same `mediaError` path |
| Convex storage upload fails | Same `mediaError` path; bytes dropped (no local disk fallback) |
| Dispatcher SDK call rejects images (Anthropic API error) | Retry SDK call without images, prepend system note: `[image input failed; the user's text was: ...]` |
| `spawn_agent({imageRefs})` references missing storageId | Tool call returns structured error; dispatcher decides to retry without images |
| Memory extraction fails on image turn | Log to `agentLogs`, no record written, don't block user reply — matches current extraction-failure behavior |

## 8. Testing strategy

This repo has no existing test framework. Adding **`vitest`** as a dev dependency, with tests focused on high-risk pure-logic code:

1. **MIME and size validation** (`server/images/mime.ts`):
   - Accepts PNG, JPEG, WebP, GIF under 10MB
   - Rejects PDF, application/octet-stream, missing content-type
   - Rejects 10MB + 1 byte
2. **Content-block builder** (`server/images/content-blocks.ts`):
   - Given `{text, imageStorageIds}` and a mock bytes-fetcher, produces correct Anthropic SDK content array structure (base64 encoding, media_type, ordering)

`npm test` script added; CI / pre-commit hookup is out of scope for this design.

## 9. Manual smoke test checklist

Run before merging.

1. Text Boop a single PNG with caption "what's in this photo?" → reply describes the image
2. Text a JPEG with no caption → reply is contextually appropriate
3. Text two images in one message → both in `_storage`, both visible to dispatcher
4. Text a 15MB image → polite failure, `mediaError` recorded
5. Text a `.pdf` (Sendblue allows non-image attachments) → graceful rejection, message stored text-only
6. Send a photo + ask Boop to "search the web for this product" → execution agent spawns with `imageRefs`, succeeds
7. Wait 24h, send "remember that photo I sent yesterday?" → memory recall surfaces the image-description memory record
8. Inspect Convex dashboard: `_storage` table has entries, `messages.imageStorageIds` populated, `memoryRecords` has description-style record
9. Wait `BOOP_IMAGE_RETENTION_DAYS + 1` days for an image with no memory references → image deleted on next cleanup pass
10. Verify a memory-referenced image survives past the retention window
11. `npm test` passes

## 10. Out of scope / future work

- Outbound MMS (sending images back to the user). Sendblue supports it; adding it later does not require revisiting this design.
- Image generation tools.
- Persisting image refs on `executionAgents` so `retryAgent` can replay image inputs.

## 11. Schema migration notes

All schema additions are optional (`v.optional(...)`). No backfill needed. Existing rows continue to work. The new `by_createdAt` index on `messages` is additive.
