# George v2 — File-by-file Build Plan

Tracer-bullet build plan for migrating George from "Claude Code slash-commands + Python tools + markdown files" to "boop-agent fork + Convex + TypeScript dispatcher + Telegram bot." Single dispatcher, all tools, full lift in one go.

Conventions:
- Target paths relative to `/Users/iruoy/Repositories/YOURI/george-v2/`.
- "Port-from" paths absolute under `/Users/iruoy/Repositories/YOURI/george/`.
- "Boop-ref" = file in upstream `raroque/boop-agent` we keep, modify, or replace.
- `DRY_RUN=on` = every tool writing externally (ICU PUT, Actual writes, Telegram send) short-circuits to a logged no-op until cutover.

---

## Phase 0 — Bootstrap

Goal: buildable, typechecking fork in `george-v2`, parts we don't need stripped or shimmed, credentials wired.

| Path | Purpose | Port-from |
|---|---|---|
| `.gitignore` | Ignore `node_modules`, `.env*`, `dist/`, `convex/_generated/`, `data-migration/`, `*.db*`. | (new) |
| `README.md` | Project intro + one-paragraph architecture diff vs v1. | (new) |
| `package.json` | Boop deps minus Composio, Browser (Patchright), proactive-email; add `@anthropic-ai/claude-agent-sdk`, `convex`, `croner`, `express`, `ws`, `zod`. Scripts: `dev`, `dev:parallel`, `deploy:convex`, `typecheck`, `migrate`, `start`. | boop `package.json` |
| `tsconfig.json` | Boop defaults, strict on. | boop |
| `.env.example` | `CONVEX_DEPLOYMENT`, `CONVEX_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_ALLOWED_CHAT_ID`, `PUBLIC_BASE_URL`, `ICU_ATHLETE_ID`, `ICU_API_KEY`, `ACTUAL_SERVER_URL`, `ACTUAL_PASSWORD`, `ACTUAL_BUDGET_SYNC_ID`, `ACTUAL_BUDGET_PASSWORD`, `DRY_RUN=on`, `USER_TIMEZONE=Europe/Amsterdam`. | (new) |
| `server/index.ts` | Express + WS bootstrap; wires Telegram webhook + automations loop + heartbeat. **Remove** all Composio, browser, proactive-email wiring. | boop `server/index.ts` |
| `server/env-setup.ts` | Env loader. Drop Composio/browser keys. Validate Telegram + ICU + Actual. | boop `server/env-setup.ts` |
| `server/convex-client.ts` | Unchanged. | boop |
| `server/runtime-config.ts` | Hard-pin to Claude Agent SDK (Codex path deleted). Keep model selection (default `claude-sonnet-4`). | boop |
| `server/runtimes/claude.ts` | Keep verbatim. Auth: "use logged-in `claude login` on host." | boop |
| `server/runtimes/codex-app-server.ts` | **Delete.** | — |
| `server/integrations/*` | **Delete the directory.** No Composio at launch. | — |
| `server/browser/*`, `server/browser-routes.ts`, `server/composio*.ts`, `server/proactive-email.ts` | **Delete.** Not in scope. | — |
| `server/error-format.ts`, `server/usage.ts`, `server/changelog.ts`, `server/timezone-config.ts`, `server/embeddings.ts` | Keep verbatim. | boop |
| `server/heartbeat.ts` | Keep — catches stuck tool runs (Actual subprocess can hang). | boop |
| `convex/tsconfig.json` | Keep. | boop |
| `scripts/dev.sh` | `convex dev` + `tsx watch server/index.ts` in parallel. | boop equiv |
| `docs/ARCHITECTURE.md` | One-pager: dispatcher → tools → Convex → Telegram. Why we deleted exec-agent / Composio / browser. | (new) |

Exit: `pnpm install`, `pnpm typecheck`, `pnpm dev` green. App boots, Telegram webhook endpoint responds `{deduped:false, no-op}`.

---

## Phase 1 — Persona + dispatcher (single agent, no sub-agents)

Goal: collapse `interaction-agent.ts` + `execution-agent.ts` into one dispatcher with George's persona. Tools registry exists but empty (filled in Phase 2).

| Path | Purpose | Port-from |
|---|---|---|
| `server/dispatcher.ts` | **New, replaces both** `interaction-agent.ts` and `execution-agent.ts`. Single Claude Agent SDK runtime call. Holds full ~30 tool surface, no `spawn_agent`, no `boop-ack` ceremony. Loads history (configurable; default 20). Runs post-turn extraction. | boop `server/interaction-agent.ts` (skeleton), `server/execution-agent.ts` (tool plumbing) |
| `server/interaction-agent.ts` | **Delete.** | — |
| `server/execution-agent.ts` | **Delete.** | — |
| `server/persona/george.ts` | Exports `GEORGE_SYSTEM_PROMPT`. Verbatim port of voice/backstory/key-moments/never-use. Strip bash-shelling rules from v1 (`date '+%Y-%m-%d %H:%M %Z'`, memory CLI invocations) → replaced with: "Use `memory.recall()` before responding. Use `now()` for current time." | `/Users/iruoy/Repositories/YOURI/george/.claude/agents/george.md` |
| `server/persona/coach.ts` | Coach knowledge base as static module export, injected into system prompt conditionally when coach tools are in scope (or always — open decision #2). Operating rules, intensity distribution, load mgmt, strength, taper, RED-S, communication. **Excludes** algorithm tables (tools/config in Phase 2). | `/Users/iruoy/Repositories/YOURI/george/.claude/agents/coach.md` |
| `server/persona/finance.ts` | Finance knowledge base as TS export. Operating rules, categorization principles, spending-analysis rules, goal math, runway formula, purchase framework. **Numbers and formulas** described — computation in tools. | `/Users/iruoy/Repositories/YOURI/george/.claude/agents/finance.md` |
| `server/persona/index.ts` | Composes `GEORGE_SYSTEM_PROMPT + COACH + FINANCE + tool-usage-rules + safety-overrides`. | (new) |
| `server/dispatcher-tools/index.ts` | Tool registry. Imports + concatenates all tool modules. Each tool guarded by `DRY_RUN` if it writes. | boop `automation-tools.ts`/`draft-tools.ts` |
| `server/dispatcher-tools/_dry-run.ts` | Wrapper: `withDryRun(tool, { writes: true })` short-circuits to `{ dryRun: true, wouldHaveSent: …}` when `DRY_RUN=on`. | (new) |
| `server/dispatcher-tools/now.ts` | Phase-1 tool: `now()` → `{ iso, tz, weekday }`. Used to validate dispatcher loop end-to-end. | `/Users/iruoy/Repositories/YOURI/george/lib/coach/dates.py` |
| `server/dispatcher-tools/echo.ts` | Trivial `echo({text})` → text. Smoke test in Phase 5. | (new) |
| `convex/schema.ts` | Phase-1 min: `messages`, `conversations`, `drafts`, `automations`, `automationRuns`, `usageRecords`, `telegramDedup` (renamed from `sendblueDedup`, key = `update_id`). Memory tables added in Phase 3. | boop `convex/schema.ts` |
| `convex/messages.ts`, `convex/conversations.ts`, `convex/usageRecords.ts` | Keep verbatim. | boop |
| `convex/telegramDedup.ts` | Rename of `sendblueDedup.ts`. Same shape, key = Telegram `update_id`. | boop `convex/sendblueDedup.ts` |
| `convex/settings.ts` | Keep — used for `DRY_RUN` runtime override. | boop |
| `server/telegram.ts` | **Stub** for Phase 1: accept inbound webhook, verify secret, dedup on `update_id`, gate on `TELEGRAM_ALLOWED_CHAT_ID`, call dispatcher, log reply to console only. Real send in Phase 5. | boop `server/sendblue.ts` (skeleton) |

Exit: POST sample Telegram update to local webhook → dispatcher invokes `now()` → replies on stdout. No Convex memory yet.

---

## Phase 2 — Deterministic tools (tracer-bullet ordering)

~30 tools across coach + finance + memory + drafts + self-config. Build order = one **vertical slice** before breadth: get `/coach:checkin`-equivalent flow end-to-end first.

### Phase 2a — Coach tracer slice (readiness check-in)

| Path | Purpose | Port-from |
|---|---|---|
| `server/lib/icu/client.ts` | Intervals.icu HTTP client. Direct (no subprocess). Methods: `wellness(range)`, `wellnessPut(date, data)`, `activities(range)`, `activity(id)`, `athleteSummary()`, `events(range)`, `eventCreate/Update/Delete`, `eventsApplyPlan`, `foldersCreate/Delete`, `workouts*`. | `/Users/iruoy/Repositories/YOURI/george/lib/coach/icu_cli.py` (HTTP), `/lib/coach/icu.py` (surface) |
| `server/lib/icu/types.ts` | Wellness / Activity / Event TS types. | derive from icu_cli.py |
| `server/lib/coach/readiness.ts` | **Direct port of algorithm.** Sleep/HRV/rHR/Fatigue/Soreness/Mood+Mot weights, modifiers (alcohol, SpO2, injury, stress, consecutive low), bands (GREEN/AMBER/YELLOW/ORANGE/RED), red-flag override, missing-data redistribution. Pure function, unit-testable. | `/Users/iruoy/Repositories/YOURI/george/lib/coach/readiness.py` |
| `server/lib/coach/rules.ts` | Module-as-config: alert triggers (overtraining tiers, illness above/below neck, RED-S, heat, hyponatremia), niggle escalation, ACWR load-spike, cross-discipline fatigue, time-constrained session priority. Returns structured verdicts dispatcher quotes verbatim. | `/Users/iruoy/Repositories/YOURI/george/.claude/services/coach/alerts.md` |
| `server/lib/coach/periodization.ts` | Module-as-config: macrocycle blueprints (70.3 12/20/40, marathon 12/20/40), intensity distribution by phase, deload pattern, plan-adaptation rules, session library recipes, ICU description templates, heat acclimation, nutrition phases, strength load estimation. | `/Users/iruoy/Repositories/YOURI/george/.claude/services/coach/periodization.md` |
| `server/dispatcher-tools/coach/get_wellness.ts` | `coach.getWellness({from,to})` → wellness rows. | icu.py wellness() |
| `server/dispatcher-tools/coach/get_activities.ts` | `coach.getActivities({from,to})` and `coach.getActivity({id})`. | icu.py activities/activity |
| `server/dispatcher-tools/coach/get_athlete_summary.ts` | `coach.getAthleteSummary()` → CTL/ATL/TSB. | icu.py athlete_summary |
| `server/dispatcher-tools/coach/get_events.ts` | `coach.getEvents({from,to})` → calendar items (source of truth for today's session). | icu.py events |
| `server/dispatcher-tools/coach/compute_readiness.ts` | `coach.computeReadiness({wellness, baselines, alcoholDrinks, consecutiveLowDays, redFlag})` → ReadinessResult. Pure wrapper around `readiness.ts`. **LLM never invents this score.** | readiness.py |
| `server/dispatcher-tools/coach/check_alerts.ts` | `coach.checkAlerts({wellness, recentActivities, plannedToday, injuryHistory})` → alerts array w/ severity + recommended action. Wraps `rules.ts`. | alerts.md |
| `server/dispatcher-tools/coach/write_wellness.ts` | `coach.writeWellness({date, data})` — subjective scores back to ICU. **DRY_RUN-guarded.** | icu.py wellness_put |
| `convex/schema.ts` | Add `coachDailyLogs`, `coachConversationLogs`, `coachEvents` (race calendar mirror), `coachAthleteProfile`, `coachCurrentPlan`, `coachWellnessBaselines`. | (new fields) |
| `convex/coach.ts` | Convex CRUD for above. | (new) |
| `server/dispatcher-tools/coach/log_checkin.ts` | `coach.logCheckin({date, summary, readiness, prescription, sideItems})` — append to `coachDailyLogs` + `coachConversationLogs`. | conversations/*.md format |

End of 2a: George can do full check-in turn via iMessage simulation — pulls wellness, computes readiness deterministically, fetches today's calendar event, drafts session prescription, logs it.

### Phase 2b — Coach breadth

| Path | Purpose | Port-from |
|---|---|---|
| `server/dispatcher-tools/coach/log_debrief.ts` | `coach.logDebrief({date, sessionId, rpe, pain, fueling, learnings})` — append to daily log + conversation log. | debrief.md command |
| `server/dispatcher-tools/coach/weekly_summary.ts` | `coach.weeklySummary({weekStart})` — aggregate activities, compute ACWR ratio, hit-rate, intensity distribution, fatigue trend. Pure. | review.md + readiness module |
| `server/dispatcher-tools/coach/build_plan.ts` | `coach.buildPlan({phase, weekStart, athleteContext})` — produces structured week w/ session names + targets + ICU descriptions. Pulls `periodization.ts` templates. **Returns plan object, does not write.** | plan.md command |
| `server/dispatcher-tools/coach/draft_icu_events.ts` | `coach.draftIcuEvents({plan})` — converts plan object into ICU event payloads. Stages a `drafts` row. **DRY_RUN-guarded; write happens in `send_draft`.** | icu.py events_apply_plan |
| `server/dispatcher-tools/coach/raceweek_pack.ts` | `coach.raceweekPack({raceId})` — pulls race from events, builds taper week + race-day nutrition template + checklist. | raceweek.md |
| `server/dispatcher-tools/coach/postrace_pack.ts` | `coach.postracePack({raceId, results})` — debrief structure + recovery protocol. | postrace.md |
| `server/dispatcher-tools/coach/get_zones.ts` | `coach.getZones()` — reads stored zones/thresholds from Convex `coachAthleteProfile` + memory. | athlete-profile.md, memory zones queries |
| `server/dispatcher-tools/coach/calibration_check.ts` | `coach.calibrationCheck()` — flags zones marked "estimated" or stale tests. | plan.md calibration check |
| `server/dispatcher-tools/coach/get_status.ts` | `coach.getStatus()` — quick dashboard: today's session, this-week load, fatigue trend, next race countdown. | status.md |

### Phase 2c — Finance breadth

| Path | Purpose | Port-from |
|---|---|---|
| `server/lib/actual/client.ts` | Actual Budget client. Choose: **(a)** native TS via `@actual-app/api` (preferred — same package the Python wrapper subprocs), or **(b)** keep existing Node CLI (`lib/finance/actual_node/index.js`) and `execFile` it. Recommendation: (a). Methods mirror `actual.py`. | `/Users/iruoy/Repositories/YOURI/george/lib/finance/actual.py` + `actual_node/index.js` |
| `server/lib/actual/types.ts` | TS types for accounts, transactions, categories, payees, rules. | (new) |
| `server/lib/finance/abn_amro.ts` | CAMT.053 zip/xml parser. BEA/eCom/`/TRTP/`/bank-notice decoders. **Direct port, no behavior change** — keep stable_hash for dedup. | `/Users/iruoy/Repositories/YOURI/george/lib/finance/abn_amro.py` |
| `server/lib/finance/csv_import.ts` | CSV preset parser (ING / Rabobank / Bunq / generic). | `/Users/iruoy/Repositories/YOURI/george/lib/finance/csv_import.py` |
| `server/lib/finance/bank_import.ts` | Unified parse + dedup + Actual rules apply. | `/Users/iruoy/Repositories/YOURI/george/lib/finance/bank_import.py` |
| `server/lib/finance/analytics.ts` | Deterministic math: savings rate, runway (essential + lifestyle), recurring vs discretionary split, Kruisposten subtraction, category outlier vs trailing 3/6mo, goal monthly-required, investment scenario fan (0/4/6%). | finance.md "Spending analysis", "Goal math", "Cash runway" |
| `server/dispatcher-tools/finance/get_accounts.ts` | `finance.getAccounts()` → with balances. | actual.py accounts/balances |
| `server/dispatcher-tools/finance/get_transactions.ts` | `finance.getTransactions({accountId, from, to})`. | actual.py transactions |
| `server/dispatcher-tools/finance/get_budget_month.ts` | `finance.getBudgetMonth({month})`. | actual.py budget_month |
| `server/dispatcher-tools/finance/get_categories.ts` | `finance.getCategories()` — always fresh, never cached. | actual.py categories |
| `server/dispatcher-tools/finance/get_payees.ts` | `finance.getPayees()`. | actual.py payees |
| `server/dispatcher-tools/finance/get_rules.ts` | `finance.getRules()`. | actual.py rules |
| `server/dispatcher-tools/finance/spending_summary.ts` | `finance.spendingSummary({from,to})` → uses `analytics.ts`. Pure compute. | finance.md spending analysis |
| `server/dispatcher-tools/finance/runway.ts` | `finance.runway()` → essential vs lifestyle months. | finance.md runway |
| `server/dispatcher-tools/finance/goal_progress.ts` | `finance.goalProgress({goalId})` → math from `analytics.ts`. | goals.md + actual balances |
| `server/dispatcher-tools/finance/purchase_decision.ts` | `finance.purchaseDecision({amount, description})` → structured fields (affordability, goal impact, alternative cost, memory pattern hits). Recommendation text is dispatcher's job. | purchase.md |
| `server/dispatcher-tools/finance/parse_bank_export.ts` | `finance.parseBankExport({path, bank})` → preview rows (no write). | bank_import.py |
| `server/dispatcher-tools/finance/draft_import.ts` | `finance.draftImport({accountId, parsed})` — stages a `drafts` row with import payload. **DRY_RUN-guarded.** | bank_import.py + actual.import_transactions |
| `server/dispatcher-tools/finance/draft_rule.ts` | `finance.draftRule({condition, action, affectedCount})` — stages a rule for approval. **DRY_RUN-guarded.** | actual.py create_rule |
| `server/dispatcher-tools/finance/draft_recategorize.ts` | `finance.draftRecategorize({txIds, categoryId})` — stages bulk recategorize. **DRY_RUN-guarded.** | actual.py update_transaction |
| `convex/schema.ts` | Add `financeGoals`, `financeProfile`, `financeReviewLogs`, `financeImportLogs`, `racingEvents` (calendar mirror for race-week trigger). | (new fields) |
| `convex/finance.ts` | CRUD for finance tables. | (new) |

### Phase 2d — Memory + drafts + self-config

| Path | Purpose | Port-from |
|---|---|---|
| `convex/schema.ts` | Add `memoryRecords`, `memoryEvents`, `consolidationRuns` (boop tiered model: tier short/long/permanent, segment identity/preference/correction/relationship/project/knowledge/context, decayRate, importance, embedding). | boop `convex/schema.ts` |
| `convex/memoryRecords.ts`, `convex/memoryEvents.ts`, `convex/consolidation.ts` | Keep verbatim. | boop |
| `server/memory/recall.ts` | Recall over Convex: vector cosine over `memoryRecords.embedding` + substring fallback. Domain filter (`coach`/`finance`). | boop `server/memory/recall.ts` + `/Users/iruoy/Repositories/YOURI/george/lib/memory/store.py` (search semantics) |
| `server/memory/write.ts` | Write with embedding. | boop |
| `server/memory/extract.ts` | Post-turn extraction. Skip proactive turns. Classify into segments. | boop |
| `server/memory/clean.ts` | 6-hour decay loop (transient/context tier purged after 3 days). | boop |
| `server/consolidation.ts` | 3-phase proposer-adversary-judge daily run. | boop |
| `server/dispatcher-tools/memory/recall.ts` | `memory.recall({query, domain?, limit?})`. | boop |
| `server/dispatcher-tools/memory/write.ts` | `memory.write({content, domain, segment, importance, expiresAt?})`. | boop |
| `server/dispatcher-tools/drafts/save.ts` | `drafts.save({kind, summary, payload})`. Identical contract to boop. | boop `server/draft-tools.ts` |
| `server/dispatcher-tools/drafts/send.ts` | `drafts.send({draftId})` — dispatches to matching execute handler per `kind`. **This is where DRY_RUN gates.** | boop |
| `server/dispatcher-tools/drafts/reject.ts` | `drafts.reject({draftId})`. | boop |
| `server/drafts/handlers/icu_events.ts` | Execute `kind: "coach.icu_events"` — calls `icu/client.ts` event_create/update for each. | (new) |
| `server/drafts/handlers/wellness.ts` | Execute `kind: "coach.wellness_put"`. | (new) |
| `server/drafts/handlers/import_transactions.ts` | Execute `kind: "finance.import"` — calls `actual/client.ts` import_transactions. | (new) |
| `server/drafts/handlers/create_rule.ts` | Execute `kind: "finance.rule"`. | (new) |
| `server/drafts/handlers/recategorize.ts` | Execute `kind: "finance.recategorize"`. | (new) |
| `server/dispatcher-tools/self/get_persona.ts` | `self.getPersona()` — returns current persona blob (debugging only). | (new) |
| `server/dispatcher-tools/self/get_settings.ts` | `self.getSettings()` → `{ dryRun, model, contextWindow, timezone }`. | boop `self-tools.ts` |
| `server/dispatcher-tools/self/set_setting.ts` | `self.setSetting({key, value})` — confined to whitelist (dryRun, contextWindow). | boop |

Exit of Phase 2: every tool covered, all guarded by DRY_RUN where applicable, unit tests on `readiness.ts`, `rules.ts`, `analytics.ts`, `abn_amro.ts`. Full check-in + debrief + purchase-decision + spending-review flows runnable against live ICU and Actual in **read-only** mode.

---

## Phase 3 — Convex schema + migration

Goal: one re-runnable script lifting every markdown file and `memory.db` row into Convex. Idempotent — re-runs safe (uses stable hash keys).

| Path | Purpose | Port-from |
|---|---|---|
| `convex/schema.ts` | Final schema. All Phase 2 tables consolidated. | (consolidated) |
| `scripts/migrate/README.md` | How to run. Pre-conditions. DRY_RUN flag behavior. | (new) |
| `scripts/migrate/index.ts` | Entry. Loads `.env`, opens Convex client, runs each step in order with `--from <step>` resume. Default: dry-run mode prints counts and diffs. | (new) |
| `scripts/migrate/parse-markdown.ts` | Frontmatter + section parser shared by all markdown loaders. | (new) |
| `scripts/migrate/01_shared_profile.ts` | `data/shared/profile.md` → `sharedProfile` (single doc). | `/Users/iruoy/Repositories/YOURI/george/data/shared/profile.md` |
| `scripts/migrate/02_athlete_profile.ts` | `data/coach/athlete-profile.md` → `coachAthleteProfile`. | `/Users/iruoy/Repositories/YOURI/george/data/coach/athlete-profile.md` |
| `scripts/migrate/03_current_plan.ts` | `data/coach/current-plan.md` → `coachCurrentPlan`. | `/Users/iruoy/Repositories/YOURI/george/data/coach/current-plan.md` |
| `scripts/migrate/04_events.ts` | `data/coach/events.md` → `coachEvents`. | `/Users/iruoy/Repositories/YOURI/george/data/coach/events.md` |
| `scripts/migrate/05_plans.ts` | `data/coach/plans/*.md` → `coachPlans`. | `/Users/iruoy/Repositories/YOURI/george/data/coach/plans/` |
| `scripts/migrate/06_daily_logs.ts` | `data/coach/logs/daily/*.md` (60 files) → `coachDailyLogs`. Key: date. | `/Users/iruoy/Repositories/YOURI/george/data/coach/logs/daily/` |
| `scripts/migrate/07_conversations.ts` | `data/coach/logs/conversations/*.md` (119 files) → `coachConversationLogs`. Key: filename. | `/Users/iruoy/Repositories/YOURI/george/data/coach/logs/conversations/` |
| `scripts/migrate/08_weekly_reviews.ts` | `data/coach/logs/weekly-reviews.md` → `coachWeeklyReviews`. | weekly-reviews.md |
| `scripts/migrate/09_coach_archive.ts` | `data/coach/archive/{weekly,races,logs}/*.md` → `coachArchive`. | archive/ |
| `scripts/migrate/10_finance_profile.ts` | `data/finance/profile.md` → `financeProfile`. | finance/profile.md |
| `scripts/migrate/11_finance_goals.ts` | `data/finance/goals.md` → `financeGoals`. | finance/goals.md |
| `scripts/migrate/12_finance_logs.ts` | `data/finance/logs/*.md` → `financeReviewLogs`. | finance/logs/ |
| `scripts/migrate/13_finance_archive.ts` | `data/finance/archive/` → `financeArchive`. | finance/archive/ |
| `scripts/migrate/14_memory_db.ts` | Open `data/memory.db` SQLite → for each row: re-embed with boop's embeddings (`server/embeddings.ts`), map domain → segment (coaching→coach, finance→finance), map type → segment (fact→knowledge, preference→preference, decision→correction, event→context, pattern→knowledge, temporary→context), preserve `created_at` + `expires_at`. **Re-embed once.** | `/Users/iruoy/Repositories/YOURI/george/data/memory.db` + `/Users/iruoy/Repositories/YOURI/george/lib/memory/db.py` |
| `scripts/migrate/15_verify.ts` | Counts diff between source and Convex. Spot-checks 5 random rows per table. | (new) |

Rule: every step uses `upsert` keyed on stable hash of source path + frontmatter date. Re-running is a no-op.

Exit: `pnpm migrate --dry-run` prints clean diff. `pnpm migrate --apply` brings Convex to parity with v1 markdown.

---

## Phase 4 — Proactive triggers (cron + ICU activity poller)

| Path | Purpose | Port-from |
|---|---|---|
| `server/automations.ts` | Boop 30-second poll loop. Reads `automations` where `nextRunAt <= now`. **Removes** Composio-only `spawnExecutionAgent` path. Replaced with `runProactiveTurn({ topic, context })` calling single dispatcher with synthesized "proactive: <topic>" prompt. | boop `server/automations.ts` |
| `server/automation-tools.ts` | MCP tools `automation.create/list/toggle/delete`. Used by user via chat ("George, remind me…") plus seed below. | boop |
| `convex/automations.ts`, `convex/automationRuns.ts` | Keep verbatim. | boop |
| `scripts/seed-automations.ts` | One-shot. Idempotent. Inserts: `morning-checkin` (`0 6 * * *`), `weekly-review` (`0 19 * * 0`), `weekly-plan` (`0 20 * * 0`), `monthly-finance-review` (`0 9 1 * *`), `race-week-opener` (daily computed: 7d before any `racingEvents.date`), `post-race-debrief` (daily computed: 1d after). All `timezone: Europe/Amsterdam`. | (new) |
| `server/triggers/race_week.ts` | Helper: each automation tick, computes upcoming-race-window triggers and inserts one-shots into `automations`. | (new) |
| `server/triggers/post_race.ts` | Same pattern for post-race. | (new) |
| `server/triggers/icu_poller.ts` | Every 5 min, calls `coach.getActivities({from: now-1h, to: now})`. For any activity not seen before (Convex `seenActivities` table), inserts one-shot `coach-debrief` scheduled +30 min from `activity.start`. | (new — uses icu/client.ts) |
| `convex/seenActivities.ts` | Dedup store for poller. | (new) |
| `server/triggers/proactive_prompts.ts` | Maps automation `topic` → prompt + tool hint passed into dispatcher. E.g., `morning-checkin` → "Good morning. Run check-in: pull today's wellness, today's planned session, compute readiness, write brief opener; if YELLOW or worse, ask for subjective scores before prescribing." | (new) |
| `convex/schema.ts` | Add `racingEvents` poll source + `seenActivities`. | (new fields) |

Open (deferred #5): keep poller; switch to ICU webhook later if their API supports it. The poll interface (`getActivities`) doesn't change.

Exit: at 06:00 local, George texts user check-in opener (console-only until Phase 5). At 30 min after synced ICU activity, George texts debrief opener.

---

## Phase 5 — Telegram adapter + deploy

| Path | Purpose | Port-from |
|---|---|---|
| `server/telegram.ts` | Full impl. Inbound: Telegram Bot API posts update JSON to `/telegram/webhook/<TELEGRAM_WEBHOOK_SECRET>` → verify header `X-Telegram-Bot-Api-Secret-Token` → dedup on `update_id` → gate on `message.chat.id == TELEGRAM_ALLOWED_CHAT_ID` → call dispatcher → send reply via `POST https://api.telegram.org/bot<TOKEN>/sendMessage` `{chat_id, text, parse_mode: "MarkdownV2"}`. Chunk replies >4096 chars. **DRY_RUN-guarded on send.** | boop `server/sendblue.ts` (skeleton) |
| `server/telegram-types.ts` | Telegram Update + Message + SendMessage response types. | Telegram Bot API docs |
| `convex/telegramDedup.ts` | Already in Phase 1, key = `update_id`. | (extend) |
| `scripts/telegram-register-webhook.sh` | Calls `https://api.telegram.org/bot<TOKEN>/setWebhook` with `{url: <PUBLIC_BASE_URL>/telegram/webhook/<SECRET>, secret_token: <SECRET>, allowed_updates:["message"]}`. Idempotent. | (new) |
| `infra/vps/systemd/george.service` | Systemd unit running `pnpm start` on Linux VPS. Restart on failure. Reads `.env` from `/etc/george/env`. | (new) |
| `infra/vps/caddyfile` | Reverse proxy `PUBLIC_BASE_URL` → `localhost:8787`. Auto-TLS via Let's Encrypt. | (new) |
| `infra/vps/README.md` | Deploy checklist: `git pull`, `pnpm install --prod`, `pnpm deploy:convex`, `systemctl restart george`, run `telegram-register-webhook.sh` once. Also: `claude login` on VPS for SDK auth. | (new) |
| `scripts/smoke.ts` | End-to-end: post fake Telegram update → verify Convex `messages` row + dispatcher reply logged + outbound `sendMessage` stub-hit. | (new) |
| `docs/RUNBOOK.md` | What to do when ICU down, Telegram down, Claude SDK auth expires, webhook deregisters. | (new) |

Exit: message from Telegram app → VPS webhook → dispatcher → reply in Telegram chat. `DRY_RUN` still `on`.

---

## Phase 6 — Cutover

| Path | Purpose | Port-from |
|---|---|---|
| `scripts/migrate/run-final.sh` | Wraps: `convex export → git tag pre-cutover` then `pnpm migrate --apply`. | (new) |
| `scripts/flip-dry-run.ts` | Sets `settings.dryRun = false` via Convex mutation. | (new) |
| `docs/CUTOVER.md` | Checklist: snapshot v1 git tag, export Convex, re-run migration (idempotent), verify counts, flip `DRY_RUN`, send test message, archive v1 repo, freeze v1 `.claude/commands/*` (read-only). | (new) |
| (v1 cleanup) | In `/Users/iruoy/Repositories/YOURI/george`: add `STATUS: archived 2026-MM-DD — see george-v2` to `README.md`. **Not done by this plan**, but cutover doc tracks it. | (manual) |

Exit: `DRY_RUN=off`, real ICU writes + Actual writes flowing only via draft → user-confirm → send path. Old George stops being touched.

---

## Tool surface summary (sanity check — ~30 tools)

Coach (~19): `now`, `getWellness`, `getActivities`, `getActivity`, `getAthleteSummary`, `getEvents`, `computeReadiness`, `checkAlerts`, `writeWellness`, `logCheckin`, `logDebrief`, `weeklySummary`, `buildPlan`, `draftIcuEvents`, `raceweekPack`, `postracePack`, `getZones`, `calibrationCheck`, `getStatus`.

Finance (14): `getAccounts`, `getTransactions`, `getBudgetMonth`, `getCategories`, `getPayees`, `getRules`, `spendingSummary`, `runway`, `goalProgress`, `purchaseDecision`, `parseBankExport`, `draftImport`, `draftRule`, `draftRecategorize`.

Memory + drafts + self (8): `memory.recall`, `memory.write`, `drafts.save`, `drafts.send`, `drafts.reject`, `self.getSettings`, `self.setSetting`, `automation.create/list/toggle/delete` (4).

Total ≈ 35 — within "~30" budget.

---

## Open implementation decisions

1. **Convex doc shape per migrated markdown** — flat (`{ raw: string, frontmatter: {…} }`) vs fielded. Recommendation: **fielded for small queryable docs (profile, goals, current-plan, events); flat-with-frontmatter for logs (daily, conversations, reviews) where prose is the value.**
2. **System prompt structure** — monolithic vs modular. Phase 1 ships modular (`persona/{george,coach,finance,index}.ts`); dispatcher always loads composed monolith. Open: switch to conditional injection per tool surface in scope (saves tokens, complicates persona consistency).
3. **Context window passed to dispatcher** — boop default 10, recommended 20–30 for George. Decision deferred to Phase 1; settable via `self.setSetting({contextWindow})` and overridable per turn.
4. **Backup cadence for Convex** — `npx convex export` daily. Open: target store (git in repo's `backups/` branch vs Backblaze B2). Cron line added to VPS once decided.
5. **ICU webhook vs polling** — Phase 4 ships 5-min polling. Open: switch to webhook if intervals.icu exposes one stable enough; tool surface (`coach.getActivities`) does not change, only `server/triggers/icu_poller.ts`.
6. **Where readiness/alerts rules live in TS** — Phase 2 ships them as TypeScript modules-as-config (`server/lib/coach/rules.ts`, `periodization.ts`). Open: extract to JSON in `data-config/` for external editing without code changes. Recommendation: stay in TS until tables actually change more than once a quarter.
