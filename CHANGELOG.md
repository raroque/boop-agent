# Changelog

Notable changes per release. `[BREAKING]` entries require action on your fork — `/upgrade-boop` will surface these and offer to run the relevant migration skill.

Format:
- One section per release.
- Prefix breaking items with `[BREAKING]` and include a migration path (ideally a skill to run).

---

## Unreleased — iOS redesign Plan A (multi-thread + new visual system)

Foundation of the redesigned iOS client. After Plan A: up to 4 concurrent threads per device, each with an agent-picked Lucide icon and deterministic per-thread color tint; native Markdown rendering in chat bubbles; full-screen .md/.pdf file preview; bottom-sheet menu with 2×2 cards; full dark-mode design system (Inter + JetBrains Mono, color tokens, ~60 bundled Lucide icons). See the design brief at `docs/superpowers/specs/2026-05-15-ios-redesign-brief.md` and the implementation plan at `docs/superpowers/plans/2026-05-15-ios-redesign-plan-a-foundation.md`.

**Server**
- Added: `threads` Convex table (deviceId, icon, label, archived, createdAt, lastMessageAt). Max 4 open threads per device, enforced via `.take()` for bounded reads. Plus 6 CRUD helpers including `ensureDefault` for back-compat with M1 single-thread devices.
- Added: `messages.threadId` optional field + `by_thread` index + `listForThread` query. Existing M1 rows without a `threadId` continue to read.
- Added: `parseIosConversationId` + `iosConversationId` helpers in `server/channels/types.ts`. Conversation IDs are now `ios:<deviceId>:<threadId>` for new threads, with `ios:<deviceId>` (M1) still parsing as default-thread.
- Added: `/channels/ios/threads`, `/threads/create`, `/threads/:id/archive`, `/threads/:id/icon` endpoints. `/inbound`, `/messages`, `/stream` now accept (or require, for SSE) a `threadId`; missing `threadId` on `/inbound` and `/messages` falls back to `ensureDefault`.
- Added: `set_thread_icon` self-tool — the dispatcher picks a Lucide icon (from a curated set of ~40) on the first reply in a new thread, via a per-turn `currentTurnThreadId` ref plumbed from `handleUserMessage`. Dispatcher prompt updated with the threading guidance.
- Added: `tests/threads.test.ts` + `tests/ios-thread-routes.test.ts` — node:test smoke covering the Convex CRUD + the HTTP routes against a running dev server.

**iOS**
- Changed: `ChannelId` is unchanged at the type level (still `"sms" | "tg" | "ios"`) but conversation IDs now embed `threadId` for iOS. iOS app must always pass `threadId` on `/inbound` and `/stream` going forward.
- Added: `ios/Boop/Resources/Fonts/` — Inter (Regular/Medium/SemiBold) + JetBrains Mono (Regular/Medium), bundled and registered at launch via `CTFontManagerRegisterFontsForURL`.
- Added: design-system tokens — `BoopColor` (dark-mode primary), `BoopFont` (Inter + JetBrains Mono scale), `BoopSpacing` + `BoopRadius` constants. Match the design brief 1:1.
- Added: `ThreadTints` — 8-color palette (amber/sky/emerald/violet/pink/citrine/mint/crimson) with `.solid`/`.fill`/`.border`/`.text` accessors and a deterministic FNV-1a hash from `threadId`. Same thread → same tint forever.
- Added: ~60 Lucide icons bundled as vector PDF imagesets under `Resources/Assets.xcassets/Lucide`. `LucideName` enum + `LucideIcon` view; the agent picks from the curated set via `set_thread_icon`.
- Added: `BoopThread` + `ServerThread` + `ThreadsResponse` + `CreateThreadResponse` shapes. `ThreadsStore` manages the list of open threads, active selection, unread flags, and integrates with `ChatStore.switchTo(threadId:)`.
- Changed: `BoopClient` gains `listThreads()` / `createThread()` / `archiveThread(threadId:)`; existing `sendInbound` / `fetchMessages` / `SSEConnection` now require a `threadId`. SSE URL appends `?threadId=...` so the server can scope events per-thread.
- Changed: `ChatStore` is keyed off `switchTo(threadId:)`. Switching cancels the current stream, clears messages, fetches new history, restarts the stream — clean break instead of trying to fan out one SSE across threads.
- Added: components — `TypingBubble` (three-dot animation), `MarkdownView` (one-pass line parser + `AttributedString` inline), `MessageBubble` (Markdown for assistant, plain for user), `FileCard` (chat + files-screen row), `SubAgentPill` (live agent-running indicator), `Dock` (composer + thread bar in one glass surface).
- Added: `MenuSheet` — bottom sheet, 2×2 cards (Files / Live agents / Archived / Settings). Triggered by the new dot-grid header button.
- Added: `FilePreviewScreen` — full-screen viewer for `.md` and `.txt` (rendered via `MarkdownView` in sheet mode), with header (back/share/more), file-info card, and a bottom action bar (Open in Thread / Download). `.pdf` is a placeholder for M2.
- Changed: `ChatView` is now `BoopColor.bg` + dot-grid header + scrolling message list + floating glass `Dock` + error-banner. `RootView` wires up `ThreadsStore` + auto-creates the first thread on a fresh device + presents `MenuSheet` + nested `SettingsView`. `PairingView` and `SettingsView` restyled with the new tokens.
- Known build blocker: bundling the Lucide imagesets triggers `actool` to demand a simulator runtime matching the SDK version. On a Mac running Xcode 26.5 with only the iOS 26.4 simulator runtime installed, the build fails at asset compilation. Workarounds: install the iOS 26.5 simulator runtime via Xcode → Settings → Platforms, or build for a real iPhone (which uses the device's installed OS, not the simulator runtime). Every Swift file in the new code typechecks cleanly via `swiftc -typecheck`.

**Out of scope for Plan A (lands in Plan B)**
- Files browser screen and Live agents watcher screen (their menu cards in MenuSheet currently dispatch to placeholders).
- iOS-side SSE fan-out for unread badges on inactive threads (server fires per-thread events, client only listens on the active one for now).

## Unreleased — Native iOS channel

- Added: `ios` channel — a third channel alongside Sendblue (iMessage) and Telegram, designed for a native iOS app that pairs with the server over HTTP/SSE. Conversation IDs are `ios:<deviceId>`. Endpoints live under `/channels/ios`: `pair/create` + `pair/check` + `pair/consume` for the bearer-token pairing flow, `inbound` for user messages, `messages` for cold-start history, and `stream` for SSE.
- Added: `server/channels/ios.ts` — implements the `Channel` interface so iOS is a first-class registry member. `send()` is a defensive `assistant_message` broadcast (the SSE stream is the real delivery path); `webhookRouter()` returns the iOS router; `isConfigured()` always true (no env vars). The router is now auto-mounted via `mountChannelRouters` instead of a direct `app.use` in `server/index.ts`.
- Added: `convex/devices.ts` + `devices` table — stores `deviceId`, hashed pairing code, hashed bearer token, label, and `lastSeenAt`. Plaintext bearer never touches Convex; the dashboard consumes the 6-digit code and the phone polls `/pair/check` for one-shot bearer pickup from an in-memory delivery map.
- Added: SSE allowlist on `/channels/ios/stream` — forwards only `assistant_delta`, `assistant_message`, `assistant_ack`, `thinking`, and `error` events, scoped to the authenticated device's `conversationId`.
- Added: `server/broadcast.ts:subscribe` — internal `EventEmitter` API so SSE can tap broadcasts without pretending to be a WebSocket. Existing dashboard WS fan-out unchanged. Tests in `tests/broadcast.test.ts`.
- Added: `assistant_delta` event emitted per text block in `server/interaction-agent.ts` with a per-turn `seq` counter, so the iOS UI can render streaming replies in order.
- Added: F5-style retry-with-backoff on the final `messages.send` write in `runTurn`. SSE already streamed the reply, so a silent persist failure used to leave an orphan (visible live, gone on cold reload). Three attempts with 100ms × 3^n backoff, then an `error` broadcast so iOS clients can flag the lost row.
- Added: iOS pairing UI in the dashboard (`debug/src/components/DevicesSection.tsx`) — live device list (Convex `useQuery`) with last-seen relative time, 6-digit pair input + label, revoke button with confirm. Surfaced as the first card in the Connections panel.
- Added: `set_active_channel` now accepts `"ios"` / `"iphone"` so the user can route proactive nudges and automation results to their iPhone over SSE.
- Added: dispatcher's recent-history window now unions across SMS + Telegram + iOS primaries, so cross-channel context continuity follows the user onto the iPhone.
- Changed: `ChannelId` type widened to `"sms" | "tg" | "ios"`. `channelIdOf()` recognizes the `ios:` prefix. Narrow type casts in `interaction-agent.ts` widened to `ConversationId` since iOS-sourced turns now hit `send_ack` / browser-resume dispatch paths.
- Rate limits (in-process, single-process server): pair/create 3 per IP per hour; pair/consume 20 per IP per hour. Pairing-code TTL: 10 min. Bearer-delivery pickup TTL: 10 min.
- End-to-end verified via curl: pair create → dashboard consume → phone bearer pickup → authed inbound → SSE stream with delta/message → history persists to Convex → bad-bearer 401 → one-shot bearer delivery.
- Upgrade note: the Xcode app that consumes these endpoints lives in a separate branch and is still in progress.

## Unreleased — Inbound file attachments

- Added: **Telegram and iMessage (Sendblue) now accept inbound photos**
  (JPG/PNG/HEIC/WEBP/GIF), **PDFs**, and **plain-text documents**
  (.txt/.md/.docx). Files are described via OpenAI gpt-4o vision-to-text
  (PDFs use selective per-page rendering — text-heavy pages skip vision)
  and stored in Convex storage. The description and signed URL are embedded
  in the user-message body so sub-agents (like `pdf-pitch`) can re-fetch
  and re-analyze with their own visual depth.
- Added: **Convex storage usage** — this feature uses Convex storage for the
  first time outside of the existing PDF artifact pipeline. Files persist
  until explicitly deleted; an auto-cleanup policy is a planned follow-up.
- Added: **New env vars** (both optional): `BOOP_VISION_MODEL` (default
  `gpt-4o`) and `BOOP_VISION_COST_CAP_USD` (default `1.50`). Cost cap stops
  processing mid-PDF if accumulated vision cost would exceed it.
- Changed: **Schema** — `messages.attachments?` field added (additive —
  existing rows unaffected). `usageRecords.source` extended with three new
  literals: `"vision"`, `"pdf-extract"`, `"docx-extract"`.
- Changed: **Channels** — previously-silent drops on Telegram for stickers,
  videos, GIFs, and video notes now produce a polite "not supported yet"
  reply. This was the original root-cause bug that motivated the feature.
- Added: Configurable limits — 20 MB per image, 20 MB per PDF, 200 KB per
  text doc, 20 pages per PDF, $1.50 cost cap per message. All in
  `server/attachments.ts:ATTACHMENT_LIMITS`.

For configuration, see `.env.example` (BOOP_VISION_MODEL, BOOP_VISION_COST_CAP_USD).
For design rationale, see `docs/superpowers/specs/2026-05-01-inbound-attachments-design.md`.

## Unreleased — pdf-pitch skill + landscape/full-bleed renderer

- Added: `pdf-pitch` skill (`.claude/skills/pdf-pitch/SKILL.md`) for landscape, slide-per-page presentation PDFs — pitch decks, investor briefs, fundraising decks, sales decks. Each `<section class="slide">` is sized exactly 297mm × 210mm with `break-after: page; break-inside: avoid; overflow: hidden`, so content can't bleed across pages. Cover slide paints full-bleed.
- Added: `pageOptions` arg on the `mcp__boop-pdf__generate_pdf` tool — `{ orientation?: "portrait" | "landscape", margin?: { top?, right?, bottom?, left? } }`. Defaults preserve current behavior (A4 portrait, 20mm margin) for the existing six skills. `pdf-pitch` passes `orientation: "landscape"` and `margin: 0` so the cover background can reach the page edges.
- Added: `"pitch"` literal to the `kind` enum in `server/pdf-tools.ts`, the `kindV` validator in `convex/pdfArtifacts.ts`, and the `pdfArtifacts` schema column in `convex/schema.ts`. This is a widening of the union; existing rows continue to validate.
- Changed: `pdf-brief` description tightened — explicitly DOES NOT trigger on pitch / deck / investor / fundraising / co-founder briefs. Those route to `pdf-pitch`. Daily/morning/meeting/research briefs still route to `pdf-brief`.
- Changed: thumbnail viewport is now landscape-aware (283×200 for landscape, 200×283 for portrait) so the artifact preview matches orientation.
- Updated: `docs/superpowers/specs/pdf-skills-trigger-checklist.md` with `pdf-pitch` rows and negative-case rows on `pdf-brief` ("investor brief" should NOT fire pdf-brief).

## Unreleased — Telegram channel

- Added: `server/channels/` — channel-abstraction layer with a `Channel` interface (types, registry, dispatch, runTurn). Both Sendblue and Telegram register through this. The runTurn function is the shared inbound turn runner extracted from the Sendblue webhook.
- Added: Telegram bot integration (`server/channels/telegram.ts`). Inbound text + voice notes, outbound text with PDF document attachment fallback, typing indicator, hybrid env+Convex allowlist (fail-closed), webhook secret verification, dedup on `update_id`. Mounted at `/telegram/webhook`.
- Added: voice transcription via OpenAI `gpt-4o-mini-transcribe` (`server/transcribe.ts`). Telegram inbound voice notes are downloaded, transcribed, and processed exactly like text — content stored as `🎤 (voice m:ss) <transcript>`. Cap of 10 minutes (`TELEGRAM_VOICE_MAX_DURATION` to override). Without `OPENAI_API_KEY`, voice notes get a polite "type instead" reply. Cost recorded in `usageRecords` with `source: "transcribe"`.
- Added: active-channel system. `set_active_channel` self-tool flips which channel receives unsolicited messages (automation results, proactive nudges). Direct replies always follow the channel the user texted from. Defaults to `sms`. Persisted in the existing `settings` table as `activeChannel` and `channelPrimary.<channel>`. Dispatcher's recent-history window now unions across both channels' primaries via the new `messages.recentAcrossChannels` query — cross-channel context continuity without `recall()`.
- Added: hybrid Telegram allowlist. Static via `TELEGRAM_ALLOWED_CHAT_IDS` env var, dynamic via Convex `telegramAllowedChatIds` (no restart needed). Rejected chat_ids land in `telegramPendingAllowlist` for interactive approval. New `npm run telegram:approve` CLI walks the queue.
- Added: Telegram webhook auto-registration. `scripts/telegram-webhook.mjs` calls Telegram's `setWebhook` API on every `npm run dev` boot (idempotent on Telegram's side). Set `TELEGRAM_AUTO_WEBHOOK=false` to opt out. Banner in `npm run dev` shows the Telegram URL + bot username when configured.
- Added: env vars — `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_IDS`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_AUTO_WEBHOOK`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_VOICE_MAX_DURATION`. See `.env.example`.
- Added: Convex tables `telegramDedup`, `telegramPendingAllowlist`, `telegramAllowedChatIds`. Empty until first inbound.
- Added: `transcribe` source on `usageRecords` so Whisper costs roll up alongside LLM costs in `usageRecords:summary`.
- Added: optional `silent` boolean on `automations` rows for "run but don't notify" workflows. New automations write `silent` based on the `notify` arg passed to `create_automation`.
- Added: optional `boolean` arg `notify` on the `create_automation` self-tool (default true). Pass `notify: false` to suppress channel push; the run still records in `automationRuns` so the result is queryable.
- Added: docs/telegram-verification.md — manual verification checklist for the feature.
- Changed: dispatcher and outbound flows now route through `dispatch(conversationId, ...)` from the channel registry. Sendblue still functions identically; the prefix-checking branches at `interaction-agent.ts:send_ack`, `automations.ts:cron-result`, and `proactive-email.ts:final-reply` are gone.
- Changed: `broadcast("message_in", ...)` payload renamed/dropped fields. Old: `{ conversationId, content, from_number, handle }`. New: `{ conversationId, content, from }`. No in-repo consumers depend on the old fields; an out-of-tree dashboard subscribed to the WS event would need to read `from` instead of `from_number`.
- **[BREAKING]** Env var `BOOP_USER_PHONE` removed. Proactive nudges now route to whichever channel is "active" (resolved per `resolveActiveChannel`). Migration: text Boop once on the channel you want notifications on, then `set_active_channel imessage` (or `telegram`). Until you've texted the channel at least once, Boop has no `channelPrimary.<ch>` recorded and proactive dispatch logs a warning and drops.
- **[BREAKING]** `create_automation` no longer pins `notifyConversationId` to the originating conversation by default. New automations float to the active channel. Existing automation rows keep their pinned `notifyConversationId` and continue working as before. Migration: none required for existing rows. New automations created without an explicit pin go to active channel.

## Unreleased — Local embeddings fallback + mandatory recall

- Added: free local embedding fallback via `@huggingface/transformers` (`Xenova/bge-large-en-v1.5`, 1024-dim). `server/embeddings.ts` now tries Voyage → OpenAI → local in order. All three providers produce 1024-dim vectors so the existing Convex `vectorIndex("by_embedding", { dimensions: 1024 })` stays compatible — users running with a paid key see no change; users without one go from "recall silently degraded to literal substring match" to working semantic recall out of the box.
- Added: `preloadLocalModel()` called on server start. No-op when a paid key is set. Otherwise the model loads in the background (~440MB one-time download to `~/.cache/huggingface`, then ~1s warm reloads) so the first user-facing `recall()` doesn't pay the load cost.
- Added: `EmbeddingBanner` in the Memory tab. Surfaces when any active memory lacks an embedding (e.g. existing rows from before this change), with a one-click "Re-embed now" button that streams progress over WebSocket. Re-embed walks unembedded rows via cursor pagination + dedupe Set so persistent failures don't loop and a 5,000-row corpus doesn't full-scan per page.
- Added: `GET /memory/embedding-status` and `POST /memory/reembed` HTTP endpoints; `convex/memoryRecords.ts` gains `embeddingStats`, `listUnembeddedPage`, and `setEmbedding`. `convex/cookieImports.ts`-style table is NOT introduced here — that's PR #31's territory.
- Added: CLI setup step "Memory search — embedding provider" in `scripts/setup.ts`. Asks local / Voyage / OpenAI, with optional pre-download of the local model (`scripts/preload-embeddings.ts`) so first-run users don't wait on the model load during their first recall.
- Added: `executionAgents.status` literal `"paused"` in `convex/schema.ts` for cross-branch compatibility with PR #31's pause-and-resume flow. Non-breaking for existing rows.
- Changed: dispatcher's Memory rule rewritten from soft suggestion ("call recall() early for anything that might touch user preferences") to mandatory hard rule. **Recall before any user-fact claim — including negative claims**. Saying *"I don't have a phone number for [contact]"* without first calling `recall()` is now framed as a critical failure (it was caught on a real conversation: a stored phone number got fabricated as missing). Multiple recalls per turn explicitly encouraged. Conversation history reframed as "not memory — anything older than the last few turns is gone."
- Changed: `embeddingsAvailable()` always returns `true` now. `get_config` reports a new `embeddingsProvider: "voyage" | "openai" | "local"` field so the dispatcher can tell the user which provider's actually running. The legacy `embeddingsEnabled` boolean previously checked only `VOYAGE_API_KEY` and lied to OpenAI users; it now reflects the real "embeddings work at all?" state.
- Fixed (Greptile P1): `runReembed()` could re-process the same failing rows up to 100×25 = 2,500 times because `listUnembedded` always returned the highest-importance unembedded rows from the index top — a row whose `embed()` returned `null` stayed unembedded and reappeared on every subsequent page query. Now tracks attempted IDs in a per-run `Set` so each row is processed at most once per `/memory/reembed` POST. Progress broadcasts on failures too, not just successes.
- Fixed (Greptile P2 → P1 on rebase): `listUnembedded` did a 5,000-row table scan + in-process filter per page call (O(total memories) per pagination step). Replaced with `listUnembeddedPage`, a cursor-based query using Convex's `paginate()` over the `by_lifecycle` index. Each page reads exactly `pageSize` rows; the loop walks the active set once per re-embed run regardless of corpus size.
- Fixed (Greptile P1): `getLocalExtractor` cached the rejected `loading` promise on a failed model load — a transient network error during the 440MB first download would permanently disable embeddings for the entire server session until restart. Now resets `loading = null` on rejection via a detached `.catch` so the next call retries fresh.
- Fixed (Greptile P1, follow-up): `EmbeddingBanner` left `busy=true` indefinitely after a WebSocket drop, hiding the "Re-embed now" button forever — the only recovery was a hard refresh. `refresh()` now syncs `busy` directly from the server's `running` flag, plus a 3s polling effect while busy so a dropped `done` event self-heals on the next poll.
- Fixed (Greptile P2, follow-up): re-embed progress denominator was a stale snapshot (`X / status.withoutEmbedding`); a memory written mid-run could push `embedded` past the captured total, producing nonsense like "52 / 50". Denominator now clamps to `Math.max(snapshot, embedded + failed)`.
- Added: consolidation runs now persist `details` JSON progressively — after the proposer, adversary, and judge phases — so navigating into a running run shows partial reasoning instead of "Proposals will appear here when the proposer finishes." The detail panel hydrates incrementally from Convex.
- Added: `memorySnapshots` (id → `{ content, segment, tier }`) embedded in each consolidation `details` payload, scoped to memories actually referenced by a proposal. New `MemoryRef` UI component in `ConsolidationPanel.tsx` renders the actual content text next to each `mem_xxx` ID — proposals/decisions are now readable without cross-referencing the Memory tab. Older runs without snapshots fall back gracefully to "(no snapshot)".
- Fixed: consolidation runs that exited via the early-return paths (`memories < 6` or proposer returned `{"proposals":[]}`) updated the Convex row's `status: completed` but never broadcast `consolidation_completed` over WebSocket. The live timeline stopped at "proposed" with no closing tick. Both paths now fire the completion event with the `notes` string in the payload.
- Upgrade note: existing memories created before this change have `embedding: undefined`. Vector recall won't find them until you re-embed. Open the Memory tab → click "Re-embed now" → the warm BGE-large model fills them in at ~10 rows/s. Optional but recommended; without it, recall on legacy facts falls back to literal substring matching (which is what you had before this change anyway).
- Upgrade note: first run with no paid key triggers the ~440MB Transformers.js download in the background. Console logs `[embeddings] loading local model …` and you'll see `local model ready in NNNms` when it's done. Subsequent boots reload from `~/.cache/huggingface` in ~1s. Don't kill the server during the first download or you'll have to re-fetch.
- Upgrade note: consolidation runs that completed before this change stored their `details` JSON without `memorySnapshots`. The detail panel will render those proposals with `mem_xxx · (no snapshot)` placeholders. The next manual or scheduled run will produce the new richer format — no migration needed, the schema is forward-compatible.

## Unreleased — Proactive email surfacing

- Added: webhook-driven Gmail watcher. On boot (or on every `npm run dev` ngrok URL change), Boop registers a project-level webhook subscription against Composio's `/api/v3.1/webhook_subscriptions` endpoint and a `GMAIL_NEW_GMAIL_MESSAGE` trigger instance per active Gmail connection. When Composio fires `composio.trigger.message`, the new `POST /composio/webhook` route verifies the HMAC signature, runs a Haiku classifier, and on a positive decision routes the summary into the interaction agent as a synthetic `role="system"` message — the IA decides the iMessage tone and any follow-up.
- Added: `server/composio-webhook.ts` — REST helpers (`GET/POST/PATCH/DELETE /api/v3.1/webhook_subscriptions`) plus `ensureWebhookSubscription(publicUrl)` that POSTs once or PATCHes the URL on subsequent runs, persisting the returned signing secret to the existing `settings` table.
- Added: `server/proactive-email.ts` — `handleEmailEvent`, `classifyEmailImportance` (hardcoded rubric + recall of `preference`-segment memories so the user can teach it via `write_memory`), `dispatchProactiveNotice`, and `ensureProactiveWatcher` for the boot setup. Per-connection warmup safeguard skips classification on the first event after a process boot.
- Added: `scripts/composio-webhook.ts` (one-shot tsx) + auto-call from `scripts/dev.mjs` on every ngrok URL change. Set `COMPOSIO_AUTO_WEBHOOK=false` to opt out.
- Added: `BOOP_USER_PHONE` env var in `.env.example` — required to dispatch proactive notices.
- Added: `kind?: "user" | "proactive"` parameter on `handleUserMessage` (server/interaction-agent.ts). Proactive messages persist with `role="system"` so they don't pollute the user-message history.
- Added: `proactive` source on `usageRecords` so the classifier's per-event cost rolls up cleanly in `usageRecords:summary`.
- Added: `ensureTrigger(triggerSlug, connectedAccountId)` helper in `server/composio.ts`.
- Added: classifier rubric tightening — drops cold outreach disguised as personal (sales pitches with first-name greetings on prospecting domains), user's-own-SaaS form submissions (UserJot/Canny/Webflow Forms/Formspark/Tally), user-initiated auth flows (magic-link sign-ins), expired deadlines, and low-severity automated scans. Summary writing rule now requires second-person framing so notices don't refer to the user in the third person.
- Added: user-identity injection. Classifier prompt now includes the user's connected Gmail addresses so it can reason about self-sends/forwards across accounts. Cached for 30 minutes per process.
- Added: deterministic self-send pre-filter in `handleEmailEvent`. If `sender` matches any user identity, the event drops before reaching the LLM — cheaper, can't be argued out of by a clever email body.
- Added: `proactive_enabled` flag in the `settings` table (default true) plus a new **Settings** tab in the Debug UI with a toggle. Flipping the toggle silences proactive notices within ~30s without disconnecting Gmail. Read in `handleEmailEvent` via `isProactiveEnabled()` (cached, 30s TTL).
- Added: user-timezone setting + `set_timezone` self-tool. Stored as a `user_timezone` row in the `settings` table (IANA ID); accepts friendly aliases ("central", "PT", "Tokyo", "London"…) which resolve to canonical zones via `server/timezone-config.ts`. Falls back to the server's local zone when unset. `get_config` now returns `userTimezone`, `timezoneFallback`, and `currentLocalTime` so the IA can ask the user when it's missing. Settings tab gains a timezone selector + raw IANA input. The classifier prompt now includes the user's local "now" so the rubric judges expired deadlines correctly.
- Fixed: automations were evaluating cron expressions in the **server's** timezone instead of the user's. "Every morning at 10am" would fire at 10am wherever the host runs, not 10am for the user. New `timezone` column on `automations` (set at create time so changing the global setting later doesn't retroactively shift existing schedules); `nextRunFor` / `validateSchedule` thread the IANA zone through to `croner`; pre-TZ rows fall back to the user's current setting at run time. `create_automation` tool description now tells the IA to write times in user-local clock — no UTC conversion.
- Fixed: dispatcher's iMessage replies were sometimes concatenating pre-tool-call narration with the final post-tool answer (e.g. "Got it — saving that now.Saved — you're on Central…") into a single iMessage. Root cause: the assistant-turn loop in `server/interaction-agent.ts` accumulated text across all turns. Now `reply` resets on each new assistant turn so only the last turn's text becomes the iMessage. Streaming via `onThinking` still sees every text block.
- Fixed (Greptile P1): `gmt` timezone alias resolved to `Europe/London`, which observes BST (UTC+1) for ~6 months a year — users specifying "GMT" expecting year-round UTC+0 would have their automation schedules and deadline checks fire 1 hour off. Now maps to `UTC`.
- Fixed (Greptile P1): `extractAndStore` ran on proactive turns, persisting email-derived facts (sender names, subjects) into the user's preference / memory store — the same store the classifier reads when deciding what to surface next, creating a feedback loop. Now skipped when `kind === "proactive"`.
- Fixed (Greptile P1): `send_ack` inside `handleUserMessage` fired `sendImessage` unconditionally for any `sms:`-prefixed conversation, so if the IA called it during a proactive turn the user would receive both the ack and the final notice as two separate iMessages. The send is now gated on `kind !== "proactive"`; the ack is still persisted + broadcast for the debug UI.
- Fixed (Greptile P1, prior review): `BOOP_USER_PHONE` was used verbatim to construct the proactive `conversationId`. A bare-10-digit env value produced an `sms:NNNNNNNNNN` conversation that didn't match the `sms:+1NNNNNNNNNN` ID Sendblue builds for inbound messages from the same person, splitting the thread. Now normalized to E.164 in `dispatchProactiveNotice`.
- Fixed (Greptile P1, prior review): defensive null-guard on `verifyWebhook` result in the `/composio/webhook` handler — if a future SDK version returned a payload-less result instead of throwing on bad signature, the dispatch would crash post-ack with an unhandled rejection.
- Fixed: proactive dispatch was running the IA but never sending the IA's reply over iMessage — `handleUserMessage` only sends from inside `send_ack`; the final reply is the caller's responsibility (matches the user-driven path in `server/sendblue.ts`). `dispatchProactiveNotice` now sends and persists the reply, with a fallback to the raw classifier summary if the IA stays silent.

## Unreleased — Self-inspection & runtime model switching

- Added: `server/self-tools.ts` — interaction-agent MCP server (`boop-self`) exposing `get_config`, `list_integrations`, `search_composio_catalog`, `inspect_toolkit`, and `set_model`. Lets the user ask Boop about its own configuration from iMessage without spawning a sub-agent.
- Added: runtime model override via `convex/settings.ts` + `server/runtime-config.ts`. Both the dispatcher and execution agent now read the model from a Convex-backed setting on each turn (with 30s in-memory cache and `BOOP_MODEL` fallback). User can say "use opus" / "switch to sonnet" / "make it faster (haiku)" from iMessage; takes effect on the next turn. Aliases: `opus`, `sonnet`, `haiku`.
- Added: `agentLogs.accounts` field — each tool_use row now records which Composio account aliases were targeted (e.g. `gmail_charry-fusc`). Surfaced as a small badge in the debug UI's agent timeline. Pulled from `account` / `connectedAccountId` / `tools[].account` in tool input.
- Added: new Convex `settings` table (key/value/updatedAt) and `convex/settings.ts` with `get` / `set` / `clear`.
- Fixed: per-connection identity lookup. `fetchToolkitIdentity` was calling `composio.tools.execute` without a `connectedAccountId`, so multiple Gmail / Slack / etc. connections all got labeled with the user's *default* account email. Now scoped per connection — the Connections panel shows the correct email per row.

## Unreleased — Composio integration layer

- **[BREAKING]** Hand-built integrations (`/integrations/gmail`, `/integrations/google-calendar`, `/integrations/notion`, `/integrations/slack`, `/integrations/_template`) removed. To reconnect equivalents: set `COMPOSIO_API_KEY` in `.env.local`, open the Debug UI's Connections tab, click Connect on the toolkit you want. The dispatcher will see it under the same slug (`gmail`, `slack`, `notion`, `googlecalendar`).
- **[BREAKING]** Convex `connections` table dropped. Composio stores OAuth state on its side. Any existing rows in that table are discarded on the next `convex dev` push.
- **[BREAKING]** `server/oauth.ts` removed. The `/oauth/*` HTTP routes no longer exist. OAuth flows now live at `https://platform.composio.dev`.
- **[BREAKING]** Env vars removed: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_ACCESS_TOKEN`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_BOT_TOKEN`, `SLACK_USER_TOKEN`, `NOTION_TOKEN`. Delete from `.env.local`.
- Added: `server/composio.ts`, `server/composio-routes.ts`, `server/integrations/composio-loader.ts`, `debug/src/components/ComposioSection.tsx`.
- Added: `@composio/core`, `@composio/claude-agent-sdk` npm deps.
- Added: env vars `COMPOSIO_API_KEY`, `COMPOSIO_USER_ID` (optional, defaults to `boop-default`).
- Added: `/upgrade-boop` Claude Code skill for bringing upstream changes into a customized fork.
- Added: `CHANGELOG.md` and `CONTRIBUTING.md`.
- Fixed: Sendblue links updated from `sendblue.co` to `sendblue.com` (the `.co` host 301-redirects; API base aligned with Sendblue's own docs).
