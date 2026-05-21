# iOS Dock Redesign + Chat UX Polish

**Date:** 2026-05-21
**Status:** Spec — ready for plan
**Branch:** `feat/ios-channel`
**Predecessors:**
- `docs/superpowers/specs/2026-05-15-ios-redesign-brief.md` — sets visual tokens, color palette, motion language.
- `docs/superpowers/plans/2026-05-15-ios-redesign-plan-a-foundation.md` — Plan A shipped the M1 dock (flat stacked layout).
**Design source of truth:** `ios_app_design.pen` — frame `Dock Outer` (id `GCPTT`).

## Background

The M1 dock (`ios/Boop/Views/Components/Dock.swift`) ships the carved-attached-tab pattern from the brief as a **flat stacked layout** — composer row on top, thread-icon row below, no shared geometry between them. The brief's §4.1 specifies a unified shape where the active thread visually attaches to the composer; that was deferred during M1 in favor of finishing multi-thread + APNs + local cache.

This spec turns the M1 dock into the visual the brief described — but with the welding inverted from how the brief drew it. The active tab now hangs DOWN from the composer's bottom edge (welded to it), instead of being notched UP into the composer. Inactive threads become bare floating icons. The composer + active tab read as one continuous glass object.

Alongside the dock, this pass closes two chat UX gaps that have been visible since M1:
1. New content sometimes lands behind the dock — the ScrollView's bottom anchor doesn't know the dock is there.
2. The keyboard hides part of the chat without compensating space being reclaimed from the dock.

The brief's §11 open question #1 ("exact concave-joint geometry on the dock") is resolved by this spec: there is no concave joint. The active tab is a separate welded shape.

## 1. Geometry & layout

The dock is a vertical area at the bottom of the chat. Top-to-bottom:

```
┌──────────────────────────────────────────────────┐
│  +    Message Boop                  🎤    ↑      │  Composer pill: ~48pt tall, full-pill radius
└─┐                                                 │
  │ 📅                                              │  Active welded tab: 44×36, square top, 12pt bottom radius
  └──────┘    💡    <>                         ⊕    │  Inactive bare icons + dashed "+" — same horizontal row
```

### 1.1 Composer pill

- Frame: full dock width minus 12pt horizontal margin, ~48pt tall, corner radius 24pt (full pill).
- Surface: `$glass-bg` fill, 40pt `background_blur`, 1pt `$glass-border` hairline.
- Layout: horizontal, 8pt gap, padding `[0, 4, 0, 6]`, alignItems centered.
- Children, left to right:
  1. **Attach button** — 36×36pt frame, full-circle radius, transparent fill, Lucide `plus` glyph 18pt in `$text-tertiary`. Tap → presents the attach picker (§3.5).
  2. **Text input** — `Inter` 14pt `$text-tertiary` placeholder "Message Boop". `lineLimit(1...6)` vertical-axis TextField — grows from 1 to 6 lines as the user types.
  3. **Voice-mode button** *(placeholder)* — 36×36pt frame, `$surface-elev` fill, 1pt `$border` stroke, Lucide `mic` glyph 16pt in `$tint-sky`. Renders inert in this pass (no action wired).
  4. **Send button** — 40×40pt circle, `$accent` fill, Lucide `arrow-up` glyph 18pt in white. Disabled while the draft is empty.

### 1.2 Active welded tab

- Frame: 44pt wide × 36pt tall. Corner radius `[0, 0, 12, 12]` (square top, rounded bottom).
- Surface: identical to the composer — `$glass-bg` fill, 40pt `background_blur`, 1pt `$glass-border`. **The top stroke is omitted** (`thickness: { bottom: 1, left: 1, right: 1 }`). Positioned so its top edge overlaps the composer's bottom edge by 1pt — the two strokes merge into one continuous outline.
- Contents: a single 18pt Lucide glyph in the thread's `tint-*-text` color, vertically centered (~9pt from the tab's top, 13pt from its left edge).
- Position: x-coordinate is the active thread's "home slot" (see §1.4). The tab's vertical position is fixed: it always sits flush against the composer's bottom edge.

### 1.3 Inactive thread icons

- Bare 18pt Lucide glyph per thread, in the thread's `tint-*` color at **55% opacity**. No fill, no border, no tab shape.
- 32×30pt tap target around each glyph (centered alignment).
- Tap → switch the active thread; the welded tab slides to that slot (§3).

### 1.4 Slot layout & "+" button

- The dock reserves up to **4 horizontal slots** for threads, in stable order (slot 1 = oldest live thread, slot 4 = newest). Order never changes when the active thread changes.
- Slots are evenly spaced in a horizontal row directly under the composer. The active slot displays the welded tab; the others display bare icons.
- The "**+**" button anchors at the far right of the row — 26pt circle, transparent fill, 1pt `$border-strong` dashed stroke, Lucide `plus` glyph 12pt in `$text-tertiary`. Tap → `ThreadsStore.createNewThread()`. Visually disabled (30% opacity, no tap target) when 4 threads are already open.

## 2. States

### 2.1 Single thread

- Welded tab in slot 1, no inactive icons. "+" anchored to the right.
- This is the cold-start state (after pairing) and the state after archiving all but one thread.

### 2.2 Two to four threads

- One welded tab + (1 to 3) bare inactive icons + "+".
- At 4 threads, "+" is disabled.

### 2.3 Unread on an inactive thread

- A 6pt `$accent` circle with a 2pt `$bg`-color halo sits top-right of the bare icon's bounding box. The dot disappears as soon as the user switches into that thread (matches existing `unread` semantics from Plan B).

### 2.4 Archive (long-press) menu

- Long-press on any thread tab (active or inactive) presents a `.contextMenu` with a single destructive item: **Archive** (Lucide `archive` glyph). Selecting it calls `ThreadsStore.archiveThread(_:)` — unchanged from M1.

### 2.5 Keyboard active

See §3.7 — the entire inactive-icon row and welded tab hide; only the composer pill remains.

## 3. Switching behavior

### 3.1 Tap inactive → welded tab slides

- The welded tab animates horizontally from its current slot to the tapped slot in **200ms** with `easeInOut` (Material standard easing).
- Simultaneously:
  - The icon glyph in the welded tab crossfades (180ms) from the old thread's icon+tint to the new thread's icon+tint.
  - The slot the welded tab is leaving fades a bare icon in (180ms, same curve).
  - The slot the welded tab is arriving at fades its bare icon out (180ms).
- Surface morph is a **single continuous animation** — the welded tab is one view that translates; it does NOT crossfade-out then crossfade-in at a new position.

### 3.2 Reduce-motion fallback

When `UIAccessibility.isReduceMotionEnabled` is true, replace the slide+morph with a 200ms in-place crossfade. The welded tab does not move; instead its surface fades to the new tinted glyph and the inactive icons reorder via opacity only.

### 3.3 Tap the already-active tab

No-op (no animation, no state change).

## 3.5 Attach picker UI

This pass ships the picker UI surface. The upload + send pipeline is a separate follow-up project (see §6).

### 3.5.1 Picker presentation

- Tap **+** in the composer → SwiftUI `confirmationDialog` titled "Add to message" with options:
  - **Photo Library** — presents `PhotosPicker` (`PhotosPickerItem`, image+video filter).
  - **Take Photo** — presents a `UIImagePickerController` wrapped in `UIViewControllerRepresentable`, camera source. If the device has no camera (Simulator), the row is disabled.
  - **Choose File** — presents `.fileImporter(allowedContentTypes: [.item])`.
  - **Cancel** — dismisses.

### 3.5.2 Attachment chips

- Picked items render as **chips** in a horizontal `ScrollView` directly above the composer pill, inside the dock area.
- Each chip: ~140pt wide × 36pt tall, 12pt corner radius, `$surface-elev` fill, 1pt `$border` stroke.
  - **Type glyph** (left, 18pt) — Lucide `image` / `file-text` / `file` based on UTI.
  - **Filename** (middle) — Inter 12.5pt `$text-primary`, truncated single-line.
  - **Remove ✕** (right, 22pt tap target) — Lucide `x` 12pt `$text-tertiary`. Tap → removes the chip.
- Chips row uses 6pt internal gap, 14pt left padding aligning with the composer's left edge.
- Empty chips array → row collapses (0pt height, hidden).

### 3.5.3 Send-with-chips stub

While chips are present:
- **Send button** stays enabled if the draft is non-empty OR chips exist.
- On tap with chips present → chips are cleared, a transient toast banner (non-error variant — `$text-secondary` on `$surface-elev`, see §4) shows "Attachments coming soon" for ~2.5s, and the text (if any) sends normally via the existing `/inbound` path.
- This stub keeps the picker UI fully testable in isolation without faking server behavior.

## 3.6 Auto-scroll on new content

The chat list scrolls to the bottom whenever new content arrives:

| Trigger | Animation |
| --- | --- |
| New message (user or assistant) | 180ms `easeInOut` scroll, anchor `.bottom` |
| Typing bubble appears (`isAwaitingReply` true) | 180ms `easeInOut` |
| Sub-agent pill appears in the list | 180ms `easeInOut` |
| Streaming text grows on the last bubble (`messages.last?.content` changes) | No animation — keeps pace with the per-token stream |

### 3.6.1 Anchor lands above the dock

Replace `messageList`'s current `.padding(.bottom, 150)` with `.safeAreaInset(edge: .bottom)` that hosts the dock. The ScrollView then treats the dock as part of its safe area; `scrollTo("bottom", anchor: .bottom)` lands the last bubble flush above the dock instead of behind it.

### 3.6.2 Scrolled-up behavior

If the user is scrolled up and new content arrives, we still scroll to bottom. This matches the desired UX of "new content always visible" and is intentional. A future v2 may introduce a "↓ new messages" pill that defers the scroll until tapped — explicitly out of scope here.

## 3.7 Keyboard collapse

- The composer's TextField uses `@FocusState`. The dock observes that focus state.
- **On focus (keyboard appearing):**
  - The slot row (welded tab + inactive icons + "+") hides with a 200ms `easeInOut` opacity+height collapse.
  - The dock's outer frame height reduces from ~110pt to just the composer pill height (~48pt).
  - Chat list gains ~62pt of visible space (the reclaimed dock area).
- **On blur (keyboard dismissing):**
  - Slot row slides back in with the same 200ms ease.
  - Dock restores to full height.
- The composer pill itself never collapses — its width, position, and contents (attach, mic, send, draft) stay the same in both states.
- **Attach chips (§3.5.2) remain visible** during keyboard-focus — they're tied to the current draft.
- **Reduce-motion**: replace the height animation with a 200ms opacity-only crossfade.

## 4. Surface & color tokens

All tokens are defined in `ios/Boop/DesignSystem/BoopColor.swift` and the design brief (§3.2, §3.3). This spec adds no new tokens.

| Element | Token |
| --- | --- |
| Composer + welded tab fill | `$glass-bg` |
| Composer + welded tab border | `$glass-border` |
| Composer + welded tab blur | `background_blur` radius 40 |
| Welded tab top stroke | **omitted** (only bottom, left, right strokes drawn) |
| Active icon glyph | `$tint-{amber,sky,emerald,violet,pink,citrine,mint,crimson}-text` (per thread hash) |
| Inactive icon glyph | Same tint at 55% opacity |
| Send button | `$accent` (`#ff5a1f`) |
| Attach (+) + mic | `$text-tertiary` / `$surface-elev` |
| "+" new-thread button | Transparent fill, `$border-strong` dashed stroke, `$text-tertiary` glyph |
| Chip background | `$surface-elev` |
| Chip border | `$border` |
| Toast banner ("Attachments coming soon") | `$text-secondary` text on `$surface-elev` background — extends `BannerView` with a non-error variant, or introduces a sibling `ToastView` |

## 5. Code scope

### 5.1 Files touched

| File | Change |
| --- | --- |
| `ios/Boop/Views/Components/Dock.swift` | Rewrite — new welded-tab geometry, slot layout, `@FocusState` for keyboard collapse, attach-picker presentation. |
| `ios/Boop/Views/ChatView.swift` | Replace `.padding(.bottom, 150)` with `.safeAreaInset(.bottom) { dock }`; remove the bottom Dock from the ZStack since safeAreaInset is now the dock owner. |
| `ios/Boop/Views/Components/AttachmentChipRow.swift` | New — horizontal scroll row rendering picked attachments as chips with remove affordance. |
| `ios/Boop/State/ChatStore.swift` | Add `attachmentChips: [DraftAttachment]` published state + `addChip(_:)` / `removeChip(_:)` / `clearChips()` methods. **No server integration** — purely client-side draft state. |
| `ios/Boop/Models/Models.swift` | Add `DraftAttachment` struct (`id`, `localURL`, `filename`, `mimeType`, `sizeBytes`). |

### 5.2 No-touch files

- `server/ios/router.ts` — `/inbound` is unchanged this pass; attachments stay client-side only.
- `convex/messages.ts` / `convex/threads.ts` — unchanged.
- `ios/Boop/Networking/BoopClient.swift` — unchanged this pass.
- `ios/Boop/Views/AttachmentPreviewSheet.swift` — used for VIEWING received attachments; unrelated to the draft chips.

### 5.3 Threading

All animation work is `withAnimation { ... }` on the main thread, fed by `@State` and `@FocusState` changes. No background queues.

## 6. Open questions / follow-ups

1. **Attachment upload pipeline (separate project).** Extend `/inbound` to accept multipart bodies, upload picked files to Convex storage, persist attachments alongside the user message, surface them in the agent context. Big enough for its own spec + plan.
2. **"↓ new messages" pill.** Future v2 alternative to forced auto-scroll when the user is scrolled up.
3. **Voice mode.** The mic button is a visual placeholder this pass. Building actual voice → text → /inbound is a separate scope.
4. **Sub-agent pill placement.** Brief says "just above the dock." Verify it doesn't visually collide with the welded tab; if it does, the pill may need to sit above the composer pill instead.
5. **Welded-tab dimensions.** Currently 44×36 with x=36 from the dock's left edge — locked as the mockup default but expected to nudge during implementation (see §1.4 about slot spacing across 1–4 threads).

## 7. Out of scope

- Actual attachment upload, agent context integration, multipart `/inbound`.
- Voice-mode functionality (mic button is inert).
- Sub-agent pill repositioning or restyling.
- Light mode (still deferred to M2).
- Live Activities, widgets, Siri shortcuts.
- Multi-device UX (one `deviceId` per install still holds).
- Attachment-blob caching (bytes still re-fetch from signed URL on view).
- The "↓ new messages" deferred-scroll pill.

---

*End of spec.*
