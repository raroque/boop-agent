# iOS APNs Push (Plan C) Implementation Plan

**Goal:** Send push notifications to the iPhone when an `assistant_message` or `proactive_notice` lands, so messages reach the user even when the app is backgrounded / closed. This is the M4-partial slice from the office-hours plan — basic remote pushes only. Live Activities, widgets, and App Intents stay out of scope.

**Problem today:** the iOS app only receives messages while SSE is live in the foreground. Backgrounding the app silently drops anything proactive the agent sends. Per the README's known gaps, this is the biggest day-to-day reliability gap left from M1.

**Architecture:**

```
broadcast("assistant_message" | "proactive_notice", { conversationId, content, … })
                         │
                         ▼
                ┌────────────────────┐
                │ server/apns.ts     │  subscribes once at boot, filters
                │ subscriber         │  ios:<deviceId>:<threadId> ids
                └─────────┬──────────┘
                          │
                          ▼
   parse → lookup device row by deviceId → if apnsDeviceToken set → POST to
   api.{sandbox.}push.apple.com over HTTP/2 with ES256 JWT auth-token,
   APS payload { alert.title, alert.body, threadId }. On 410 Gone clear
   the row's apnsDeviceToken. JWT is cached for ~50 min (Apple's limit
   is 1 hour but we rotate early to dodge clock skew).
```

iOS side:
1. App pairs (existing flow).
2. After pair succeeds, request notification permission. On grant call `UIApplication.shared.registerForRemoteNotifications()`.
3. AppDelegate adaptor receives `didRegisterForRemoteNotificationsWithDeviceToken` → POST to `/channels/ios/apns/register`.
4. `UNUserNotificationCenter.delegate.willPresent` suppresses banners while the app is foregrounded (standard pattern — APNs still delivers normally when backgrounded).
5. `didReceiveResponse` (user tapped the banner) reads `threadId` from `userInfo`, makes `ThreadsStore` switch active thread.

**Scope (intentional)**:
- Plain remote-notification pushes only on `assistant_message` and `proactive_notice`.
- No Live Activities (ActivityKit push tokens are distinct + expire 12h after activity end — separate work).
- No silent / content-available pushes.
- No widgets, no App Intents, no Siri shortcuts.
- One device token per device row — multi-device-per-user is already out of scope per the office-hours plan.

**Why JWT (.p8) over cert-based auth:** modern Apple recommendation; no renewal cycle; one key serves all your apps for a team. The .p8 is short and stable enough to ship as an env var.

**Why hand-roll HTTP/2 instead of `apn` / `@parse/node-apn`:** Node ships `node:http2` in the stdlib; the request is one POST per push and Apple's contract is stable. Hand-rolled is ~100 lines, removes a dependency, and keeps the surface area small enough that we can reason about reconnect / 410-handling end-to-end.

**Tech:** Convex, Express, TypeScript, SwiftUI (iOS 17+), `node:http2`, `node:crypto` (ES256 JWT). No new dependencies.

---

## File structure

### Server (TypeScript)
- **Create**:
  - `server/apns.ts` — config loader, JWT signer + cache, HTTP/2 client + connection pool, push helper, broadcast subscriber, 410 cleanup.
- **Modify**:
  - `convex/schema.ts` — add `apnsEnvironment` field + `by_apnsToken` index on `devices`.
  - `convex/devices.ts` — `setApnsToken`, `clearApnsTokenByToken`.
  - `server/ios/router.ts` — `POST /apns/register`, `POST /apns/unregister`.
  - `server/index.ts` — `await initApns()` on boot.
  - `.env.example` — APNs vars block.

### Server tests
- **Create**: `tests/apns.test.ts` — JWT round-trip via the public key, payload-builder unit tests, 410 cleanup integration against a stub `pushWith` injected into the subscriber.

### iOS (SwiftUI)
- **Create**:
  - `ios/Boop/State/PushDelegate.swift` — `AppDelegateAdaptor` host + `UNUserNotificationCenterDelegate` (foreground suppression + tap-to-open).
  - `ios/Boop/Resources/Boop.entitlements` — `aps-environment = development`.
- **Modify**:
  - `ios/Boop/BoopApp.swift` — install `@UIApplicationDelegateAdaptor`.
  - `ios/Boop/State/PairingStore.swift` — on paired, request notification permission (one-shot, idempotent).
  - `ios/Boop/Networking/BoopClient.swift` — `registerApns(deviceToken:environment:)`.
  - `ios/Boop/Storage/AppSettings.swift` — `pendingDeepLinkThreadId` so taps survive cold-start.
  - `ios/Boop/State/ThreadsStore.swift` — consume `pendingDeepLinkThreadId` after `loadThreads`.
  - `ios/project.yml` — `CODE_SIGN_ENTITLEMENTS: Boop/Resources/Boop.entitlements`.

### Docs
- `ios/README.md` — new "Push notifications" setup section (Apple Developer steps + env vars).
- `CHANGELOG.md` — Plan C entry.

---

## Task ordering

1. Plan doc (this file).
2. Convex schema: `apnsEnvironment` + `by_apnsToken` index.
3. Convex mutations: `setApnsToken`, `clearApnsTokenByToken`.
4. Server: `server/apns.ts` (config, JWT, HTTP/2 client, push, subscriber, 410 cleanup).
5. Server: `/apns/register`, `/apns/unregister` routes.
6. Server: boot-time init in `server/index.ts`.
7. iOS: `Boop.entitlements` + project.yml capability.
8. iOS: `PushDelegate.swift` + `AppDelegateAdaptor` in `BoopApp`.
9. iOS: notification permission request after pair + token POST.
10. iOS: deep-link from notification tap → switch active thread.
11. Tests: JWT, payload, 410 cleanup.
12. README iOS push-setup section + `.env.example`.
13. Typecheck + run tests.
14. CHANGELOG entry.

## Failure modes

| # | Failure | Coverage |
|---|---------|----------|
| 1 | APNs vars unset | `initApns` logs once and short-circuits; broadcast subscriber never registers. Push degrades silently — SSE still works in foreground. |
| 2 | Device token rejected (410 Gone) | `clearApnsTokenByToken(token)` on the matched row; next assistant_message no-ops for that device until it re-registers on the next launch. |
| 3 | JWT expires mid-request | Apple returns 403 + `ExpiredProviderToken`; we rotate, retry once, then drop the push (don't infinitely retry — next message will re-push). |
| 4 | HTTP/2 connection drops | http2 client lazily reconnects on next push; no in-flight requeue (best-effort delivery only). |
| 5 | Notification arrives while app is foregrounded | `willPresent` returns `[]` — APNs silently dropped on this device. iOS app already has the SSE stream so the content is in chat. |
| 6 | Notification arrives while app is closed | OS handles normally; `didReceiveResponse` (on tap) reads `threadId`, stashes into `pendingDeepLinkThreadId`, `ThreadsStore` consumes after pair-check + `loadThreads` so the right thread is active on cold-start. |
| 7 | User denies permission | `registerForRemoteNotifications` not called; no token, no push. App still works exactly as before — this is purely additive. |
| 8 | Re-pair on the same device | Old `apnsDeviceToken` carries forward only if the OS still vends the same token (it does until app reinstall). New pair re-POSTs the token on launch regardless, so the row stays current. |

## Definition of done

- Background the app. Send a message that triggers an assistant reply. Push appears on the lock screen with the reply text.
- Tap the push → app opens to the right thread.
- `assistant_message` broadcasts where the conversationId isn't ios-prefixed (Sendblue / Telegram) cause no APNs call.
- Without APNs env vars, server boots fine and logs `[apns] disabled (config missing)`.
- 410 Gone clears the token (verify via the unit test's stub).
