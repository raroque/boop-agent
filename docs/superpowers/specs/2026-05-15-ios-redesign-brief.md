# Boop iOS — Design Brief

**Date:** 2026-05-15
**Status:** Draft for designer iteration
**Audience:** product designer + iOS engineer
**Scope:** redesign + feature expansion of the Boop iOS app from M1 (pairing/chat/SSE) into a multi-thread, file-aware, sub-agent-visible client

This brief is **not** an engineering spec — it captures product intent, visual identity, interaction patterns, and screen specifications so a designer can refine and a future implementation plan can be written against an agreed direction. The corresponding implementation plan will live in `docs/superpowers/plans/`.

---

## 1. Product intent

Boop is the user's personal agent, reachable from anywhere. M1 made the iOS client work; this redesign makes it feel like the *primary* place to use Boop — faster, more legible, more capable than iMessage or Telegram.

**The chat is the product.** Every redesign decision should make the chat clearer, more responsive, more present. Navigation, files, and sub-agent visibility exist in service of the chat — never competing with it for attention.

**Voice and tone of the design** — modern, sleek, restrained. Reference: [linear.app](https://linear.app). Sophisticated grays, one disciplined accent, dense legible typography, fast micro-motion, refined materials. The opposite of "AI startup with rainbow gradients."

---

## 2. Feature set

### 2.1 Multi-thread conversations

The user can have **up to four concurrent threads** open at once. Each thread is its own conversation with its own message history and shared user memory (the agent can `recall()` facts about the user across all threads).

- Threads are **persistent server-side**. Closing a tab archives the thread; archived threads are not visible in the M1 UI but can be reopened later (deferred to M2).
- New thread is created when the user taps the **"+"** in the bottom rail. The thread starts empty; the agent picks an **icon identifier** for it after the first reply, using a curated set of ~40 Lucide icons (see §7 for the cluster list) via a new `set_thread_icon` self-tool.
- Each thread is further visually distinguished by a **deterministic tint color** drawn from an 8-color palette (see §3.3), hashed from the thread's ID. Same thread = same tint forever. The agent does not pick the color.

### 2.2 Global files library

A separate screen showing **every file** the user has sent or the agent has produced — across all threads. Reached from the top-right "≡" menu.

- Filters: **type** (all / images / PDFs / Markdown / other), **source** (from agent / from you), **thread** (chip per thread tint+icon).
- Grouped by **day** (Today, Yesterday, This week, Older).
- Each row: type glyph (color-coded), filename, mono-styled metadata (size, source, time), originating-thread icon on the right.
- Tap a row → opens the same bottom-sheet preview as in chat (.md formatted, .pdf embedded preview, image full-bleed).
- When the filter switches to **Images**, the list collapses into a 3-column thumbnail grid.

### 2.3 Sub-agent watcher

A live timeline of what sub-agents are currently doing inside the agent's turn. Reached from the top-right "≡" menu, also surfaced as an **inline pill** inside the chat whenever a sub-agent is running for the current thread.

- Live-only in M1 (no historical run log — that's M2).
- Each running sub-agent shows: name (e.g. `calendar-agent`), turn-id + elapsed (mono), origin-thread icon, and a vertical timeline of its tool calls.
- Tool call timeline: each step has a status marker (done = green tick, running = pulsing accent), tool name in mono badge, args preview (single-line truncated), and duration.
- When a sub-agent finishes, its card fades out after ~3s.

### 2.4 Rich-text chat formatting

Agent replies render full Markdown natively in the chat bubble: headers (H1–H3), lists, bold/italic, links, inline code, fenced code blocks with light syntax tinting, blockquotes.

- Code blocks use a subtly different surface than the bubble background so they read as a distinct region inside the message.
- Long replies should never wall-of-text — generous paragraph spacing, hierarchical headers.
- File outputs from the agent (PDF, MD, PNG, TXT) arrive as **first-class file cards** in the chat — tappable, with type-glyph, name, size, source, time.

### 2.5 In-line attachment preview

Tapping a file card opens an iOS bottom sheet (~84% of screen height) showing the file rendered:

- **.md** → formatted prose with H1/H2/H3 hierarchy, lists, code blocks, blockquotes, links
- **.pdf** → native PDFKit preview, scroll-paginated
- **image** → full-bleed viewer with pinch-to-zoom (M2)
- **.txt** → monospace, scrollable

Sheet header: filename, size, source. Sheet actions: download (⤓), share (⋯), close (×). Drag handle at the top for swipe-to-dismiss.

---

## 3. Visual identity

### 3.1 Type stack

| Role | Font | Weights used | Use |
| --- | --- | --- | --- |
| UI | **Inter** | 400, 500, 600 | All body text, labels, navigation, message content |
| Mono | **JetBrains Mono** | 400, 500, 600 | Code blocks, durations, counts, file sizes, mono badges (tool names, threadIds) |
| Headings inside markdown | Inter | 600 with tight tracking (-0.02 em to -0.03 em) | H1/H2/H3 in rendered MD |

Sizes target an iPhone 16/17 Pro at 1× scale. Inter is bundled (license permits); JetBrains Mono is bundled (free, OFL).

```
Base scale (Inter unless noted)
  hero/H1     22pt / 600 / -0.03em
  H2          16pt / 600 / -0.02em
  H3          14pt / 600 / -0.01em
  body L      14.5pt / 400 / -0.01em
  body M      13.5pt / 400 / 0em
  label       12.5pt / 500 / 0em
  meta        11pt / 400 / +0.02em
  meta-caps   10.5pt / 600 / +0.12em / UPPERCASE
  mono        12px / 500 (JetBrains Mono)
  mono-small  10.5px / 500 (JetBrains Mono)
```

### 3.2 Color tokens — dark mode

Dark mode is the primary mode and should be designed first. Light mode is M2.

```
bg              #08090a    page background
surface         #0d0e10    sheets, modals, lifted regions
surface-elev    #131418    cards, file rows, agent bubbles
border          #1f2024    1px hair borders (the primary depth signal — not shadows)
border-strong   #2a2b2f    hover/pressed borders, dashed "+" buttons

text-primary    #f7f8f8
text-secondary  #8b909a
text-tertiary  #62666d   metadata, timestamps, mono counts

accent          #ff5a1f   primary action only: send button, brand
accent-glow     rgba(255, 90, 31, 0.40)  shadow color for elevated accent elements
success         #5dd5a0   completed tool-step markers, success states
warn            #f3d57a   warn states (subtle, rarely used)
error           #ff7882   error banner, failed states

code-bg         #0c0d10   slightly darker than surface-elev — used inside bubbles for code blocks
code-fg         #c8cad0
code-keyword    #ff8358   tints accent slightly for syntax
code-string     #5dd5a0
code-function   #7aa2ff
code-comment    #62666d
```

**Rule:** the **accent color is reserved for one purpose at a time on a given screen** — almost always the primary action (Send) or the currently-active state. Never decorate with it.

### 3.3 Per-thread tint palette

Eight tints, deterministically hashed from threadId. Each tint has three levels:

```
tint-amber     fill rgba(255, 100, 50, .10)   border rgba(255, 100, 50, .30)   text #ff9269   solid #ff6432
tint-sky       fill rgba(122, 162, 255, .10)  border rgba(122, 162, 255, .30)  text #95b3ff   solid #7aa2ff
tint-emerald   fill rgba(93, 213, 160, .10)   border rgba(93, 213, 160, .30)   text #8de2bd   solid #5dd5a0
tint-violet    fill rgba(180, 130, 240, .10)  border rgba(180, 130, 240, .30)  text #cba4f6   solid #b482f0
tint-pink      fill rgba(240, 130, 180, .10)  border rgba(240, 130, 180, .30)  text #f4a5c8   solid #f082b4
tint-citrine   fill rgba(240, 200, 100, .10)  border rgba(240, 200, 100, .30)  text #f3d57a   solid #f0c864
tint-mint      fill rgba(100, 220, 200, .10)  border rgba(100, 220, 200, .30)  text #95eadb   solid #64dcc8
tint-crimson   fill rgba(255, 120, 130, .10)  border rgba(255, 120, 130, .30)  text #ff9aa3   solid #ff7882
```

**Tint behavior:**
- **Active thread:** the icon disc inside the attached tab uses `fill` + `border`; the icon glyph uses `text`.
- **Inactive thread:** the bare icon uses `text` at 55% opacity. No fill, no border.
- **Files screen:** the small thread-emoji chip on each file row uses `fill` at full opacity, `text` color for the icon.
- **Sub-agent watcher:** the origin-thread icon on each agent card uses the tint.

The accent color (`#ff5a1f`) shares space with `tint-amber` — they're visually compatible; the active tab using amber tint will read as "primary" naturally.

### 3.4 Material — glass

The bottom **dock** (composer + attached tab + inactive tab icons) uses a glass material:

- `background: rgba(20, 22, 26, 0.55)`
- `backdrop-filter: blur(28px) saturate(180%)` — SwiftUI: `.ultraThinMaterial`
- `border: 1px solid rgba(255, 255, 255, 0.10)` — hair border, top-aligned
- `inset 0 1px 0 rgba(255, 255, 255, 0.10)` — subtle highlight on the top edge for physicality
- `drop-shadow(0 10px 30px rgba(0, 0, 0, 0.40))` — depth

Agent message bubbles also use a softer glass:
- `background: rgba(255, 255, 255, 0.05)`
- `backdrop-filter: blur(20px)`
- `border: 1px solid rgba(255, 255, 255, 0.08)`

User bubbles are solid accent — no glass, since the orange is the visual anchor.

### 3.5 Motion principles

- **Speed**: 150–220ms for most transitions. Anything longer feels heavy.
- **Easing**: `cubic-bezier(0.4, 0, 0.2, 1)` (Material standard easing) for most things. Avoid bounce/spring on UI elements that aren't meant to feel playful.
- **Reduced motion**: honor `UIAccessibility.isReduceMotionEnabled` — replace transforms with opacity crossfades, disable backdrop blur if performance is impacted.

| Element | Motion |
| --- | --- |
| Tab switch — active icon crossfade | 180ms ease, opacity 0→1 with no shape morph |
| Menu (≡) expand | 200ms slide-down + fade |
| File preview sheet present | 260ms ease-out spring, dismiss 220ms ease-in |
| Sub-agent tool-step "running" pulse | 1400ms cubic-bezier, infinite, between 30% and 100% opacity on the marker dot |
| Typing bubble dots | 350ms stagger between three dots, opacity 30%↔70% |
| Reply streaming | per-token append, no easing — text just appears (M3 token streaming) |
| Pull-to-refresh history | native iOS spring, no override |

### 3.6 Spacing scale

Dense by default, in the Linear tradition. Base unit is 4pt.

```
4   tight inline gap (icon→text inside a chip)
6   tight stack
8   default vertical stack between siblings
10  card internal padding (compact)
12  card padding, button padding-y
14  card padding (standard), section padding-x
16  list item padding-x, sheet content padding-x
18  card padding (loose), screen edge gutter
22  sheet content padding-y top
28  glass-rail outer padding (vertical, from screen bottom)
```

### 3.7 Border radius scale

```
4   inline code background
6   meta tag / mono badge
8   subtle surface, small file glyphs
10  search input, filter chip (square)
12  card / file-row / agent card
14  agent bubble, message bubble
16  card cluster, menu popover
18  composer text input, user bubble outer
22  bottom-sheet top, modal sheet
24  composer + dock unified shape (the "carved" composer)
50% (999px)   filter pill, FAB-style buttons, icon discs, send button
```

---

## 4. Component library

### 4.1 The dock (composer + attached active tab + inactive icons)

The hero component. One unified shape combining the message composer with the active thread tab, drawn as a single SVG/SwiftUI `Path`.

**Anatomy** (heights given for an iPhone 17 Pro, 1× scale):

```
┌──────────────────────────────────────────────────────────┐  ── 56pt composer height
│  +      Message Boop                              ↑      │
└──┐                                                       │  ── concave joint, 16pt radius
   │  ●                                                    │  ── attached tab, 50pt tall
   │ icon                                                  │
   └──────────┘   ◌   ◌   ◌                          ⊕    │  ── inactive icons floating below
```

- **Composer width**: screen width minus 24pt edges
- **Attached-tab horizontal position**: left-anchored, offset 40pt from the left edge of the dock, 72pt wide
- **Concave joints**: 16pt arc radius, smooth transition into the composer's bottom edge
- **Active icon disc**: 36pt circle, centered in the attached-tab area; uses thread tint
- **Inactive icons**: 40pt tap target, 20pt glyph, no container, tint color at 55% opacity
- **Plus button**: 40pt tap target, dashed border `border-strong`, 18pt glyph, far-right anchored
- **Unread dot**: 6pt accent circle with 2pt dark halo, top-right of an inactive icon

**Switching threads** does NOT morph the shape. The active icon disc inside the fixed-position tab simply crossfades (180ms) to the newly-tapped thread's icon and tint. The tapped-from icon position briefly tints brighter then returns to inactive.

**The dock floats 18pt off the bottom of the screen**, with horizontal margins of 12pt. The keyboard pushes it up via `.safeAreaInset(edge: .bottom)`.

### 4.2 Top header

Minimal. Two elements:

- **Brand wordmark** "Boop" — Inter 17pt 600, letter-spacing -0.3px, left-aligned
- **Menu trigger ≡** — 32×32pt tap target, 16pt glyph, right-aligned. Active state: surface-elev background, accent border

The header sits at the top, padding 52pt down from the screen's safe area top (account for the notch).

### 4.3 Message bubbles

| Variant | Background | Foreground | Border-radius | Border |
| --- | --- | --- | --- | --- |
| User | accent solid (#ff5a1f) | white | 14, 14, 5, 14 (bottom-right cut) | none |
| Agent | glass (rgba 255/255/255/.05) | text-primary | 14, 14, 14, 5 (bottom-left cut) | 1px rgba 255/255/255/.08 |
| Agent file card | surface-elev | text-primary | 12 all corners | 1px border token |

**Bubble width**: max 84% of chat width, content-sized
**Padding**: 9pt top/bottom, 13pt left/right
**Line height**: 1.5
**Strong text inside agent bubble**: `font-weight: 600`, color shifts to white for stronger contrast
**Links**: `accent` color (slightly brighter in dark, `#ff8358`), underline with 2pt offset
**Code spans inside bubble**: code-bg fill, 4pt radius, 0/5pt padding, accent-tint text color

### 4.4 File cards (in chat + in files browser row)

**In chat**:

```
┌───┬────────────────────────────────────────────┬──┐
│md │ prompt-caching-notes.md                    │  │
│   │ 2.4 kB · created by agent · just now       │  │
└───┴────────────────────────────────────────────┴──┘
```

- Type glyph: 36×36pt square, 8pt radius, color-coded by type (md=text-primary on surface-elev, pdf=accent, jpg=success, txt=text-tertiary on surface). Unknown / other types fall back to the txt style.
- Filename: body-M 500
- Metadata row: meta size — separator dot — source — separator dot — time, all in text-tertiary
- Card border: 1px border-token, 12pt radius
- Hits the same row pattern in the Files browser, with an added thread-tint chip on the right

### 4.5 Filter chips (Files screen)

Pill-shaped, two states:

```
inactive: surface-elev bg, border-token border, text-primary, weight 500, 12.5pt
active:   text-primary bg, bg-color text (inverted), no border
```

Counts inside chips use JetBrains Mono at 11pt, 60% opacity.

### 4.6 Agent activity card (sub-agent watcher)

Vertical layout, surface-elev container, 14pt radius.

**Top section** (12pt padding): origin-tint icon disc (28pt) + agent name (body-M 600) + meta line (mono 11pt: turn-id + elapsed) + origin-thread icon (28pt right-anchored).

**Tool stream** (6pt padding): vertical timeline with a 1.5px border-token rail on the left and step markers attached at -4.5pt offset.

Each step:
- **Marker**: 7pt circle. Done = success token. Running = accent token with 3pt outer glow ring, pulsing.
- **Tool name**: mono badge, 12pt, slightly darker bg
- **Args**: text-tertiary, single-line truncated with ellipsis
- **Duration**: mono 10.5pt, right-aligned

### 4.7 Bottom sheet (for menu, file preview, settings)

- Top: 36pt × 4pt rounded drag indicator at center
- Header row: title (body-M 600) + actions (icon group, right-aligned)
- 1px border-token divider beneath header
- Body: padded 18pt horizontal, scrollable
- Background: `surface` (#0d0e10)
- Top corners: 22pt radius
- Top border: 1px hair border (so the sheet edge reads when at full-cover)
- Shadow: 0 -8px 30px rgba(0,0,0,0.5) — only when partially-covering

### 4.8 Top-right menu popover

Tap the **≡** to open a small popover anchored top-right.

- Width: 220pt
- Background: surface-elev, 1px border-token, 14pt radius
- Inner padding: 6pt
- Item rows: 11pt vertical / 12pt horizontal, 10pt radius, body-M 500
- Item icons: 17pt, text-secondary, 24pt label gutter
- Optional badge on a row: accent fill, white 10pt 600, 7pt horizontal padding, 8pt radius

Items in M1, in order:
1. Files
2. Live agents (with badge when sub-agents are running)
3. Archived threads (UI shell, real list lives in M2)
4. *divider*
5. Settings

Tap-outside dismisses; tap the trigger again dismisses; the trigger morphs `≡ → ×` when open.

### 4.9 Markdown rendering (in chat + in MD preview sheet)

| Element | Treatment in bubble | Treatment in sheet |
| --- | --- | --- |
| H1 | n/a (avoided) | 22pt 600 -0.03em |
| H2 | h-md (15pt 600 -0.02em) | 16pt 600 -0.02em |
| H3 | bold inline | 14pt 600 -0.01em |
| Paragraph | body-L 14.5pt | body-M 13.5pt |
| Bullet list | 18pt indent, 2pt item spacing | 18pt indent, 3pt item spacing |
| Ordered list | same as bullet | same as bullet |
| **Bold** | weight 600, color #fff in dark mode | weight 600, text-primary |
| *Italic* | italic, body color | italic, body color |
| Inline `code` | code-bg fill, accent-tint fg, 4pt radius | same |
| Fenced code | code-bg fill, 1px border-token, 8pt radius, 10/12pt padding, JetBrains Mono 12pt, syntax tinting | same, slightly tighter padding |
| Blockquote | n/a | 2px accent left border, italic body, text-secondary |
| Link | accent fg, underline w/ 2pt offset | same |
| Horizontal rule | n/a | 1px border-token, 16pt vertical margin |

Paragraph spacing: 8pt between sibling block elements. Lists: 6pt top, 6pt bottom from surrounding paragraphs.

---

## 5. Screen specs

### 5.1 Chat (primary screen)

Layout top-to-bottom:

1. Status bar / notch area
2. Header — brand + ≡
3. Messages — scrollable, padding 12/14pt, gap 8pt, padded 130pt at bottom (under the dock)
4. Sub-agent pill — only present if a sub-agent is running for this thread; sticks just above the dock with a colored fill
5. **Dock** — composer + attached active tab + inactive tab icons + plus button. Floats 18pt off the bottom.

Behavior:
- New messages auto-scroll to bottom
- Long messages with markdown render their full content in the bubble
- File outputs from the agent appear as their own message slot (file card)
- Typing bubble (three dots in agent style) shows from send-tap until first delta/ack arrives

### 5.2 Files (sheet from menu)

Header: "Files" title + × close
Body, in order:

1. Search input — surface-elev, 10pt radius, magnifying glass glyph, placeholder "Search files"
2. Filter row 1 — type chips (All, Images, PDFs, MD, Other) with mono counts
3. Filter row 2 — source chips (From agent, From you) + thread chips (one per thread that contributed files, tinted — includes archived threads)
4. Day-grouped file rows ("Today", "Yesterday", "This week", "Older")
5. When images filter is active: 3-column thumbnail grid replaces the row list

### 5.3 Live agents (sheet from menu)

Header: "Live agents" title + status pill (`◉ N running` with pulsing dot) + × close
Body: vertically-stacked agent cards (§4.6). Empty state: text-secondary "No agents running" centered in body.

### 5.4 File preview (sheet, opened by tapping any file card)

Header: filename + size + source line; right-aligned ⤓ ⋯ × actions
Body: rendered file content
- **.md** → markdown-rendered prose (see §4.9)
- **.pdf** → PDFKit viewer with native scroll-paginate
- **image** → fit-to-width by default, pinch-to-zoom (M2)
- **.txt** → mono content, line wrap

### 5.5 Settings (sheet from menu)

Reuses the existing M1 settings screen — refreshed to match the new visual identity. Sections: Server, Device, Unpair button. New visual treatment (surface-elev cards, body-M typography, restrained accent).

---

## 6. Empty / loading / error states

### 6.1 Empty states

| Screen | Empty state |
| --- | --- |
| New thread (just created, no messages) | Centered Inter 22pt "What can I help with?" + 13.5pt subtitle "Send any message to get started." in text-secondary. Plus the dock at the bottom. |
| Live agents (none running) | Centered text-secondary "No agents running" — body-M, sits in the middle of the sheet body. |
| Files (no files yet) | Centered icon (file-stack from Lucide) + "Nothing here yet" body-M + "Send a file or ask Boop to make one." meta-caps text-tertiary subtitle. |
| Search returns nothing | "No results for *query*" body-M, "Try a different filter" text-tertiary. |
| Archived threads (M2 stub) | "Archived threads will live here." text-secondary. |

### 6.2 Loading states

| State | Treatment |
| --- | --- |
| Awaiting reply (between send and first delta) | Typing bubble (three-dot animated) in agent-bubble style, left-anchored above the dock. |
| Sub-agent running (chat-context) | Inline tinted pill below the user's message: `[ ◉ calendar-agent · 2 tools  → ]`. Pulsing dot. Tap-to-open expands into the watcher sheet. |
| Loading history (cold start) | Subtle skeleton rows above the dock — three agent-bubble silhouettes with shimmer. ~600ms or less typically; if longer, transition to "Couldn't load history" error after 8s. |
| File preview sheet loading | Sheet animates in immediately; body shows centered spinner for up to 1s before content. |

### 6.3 Error states

| State | Treatment |
| --- | --- |
| Send failed (network) | Inline red banner under header: "Send failed — tap to retry". Clears on next successful send (already implemented in M1). |
| SSE dropped (mid-conversation) | Subtle yellow-tinted status pill below header: "Reconnecting…". Disappears on reconnect (already implemented in M1). |
| Pairing code expired | On the pairing screen, the code area shifts to a small red note: "Code expired — tap *Start over*". |
| Bearer invalid (server revoked) | Full-screen takeover: brand wordmark + "This device was unpaired. Tap to re-pair." centered, accent button. |

---

## 7. Iconography

**Library**: [Lucide](https://lucide.dev) (MIT). Subset of ~50 icons bundled.

**Stroke**: 1.6–1.8 depending on rendering size. 1.8 for icons at 18pt or larger; 1.6 for 22pt+. Stroke-linecap and stroke-linejoin both `round`.

**Curated thread icons** (the set the agent picks from):

```
Topic clusters →
  calendar, clock, alarm-clock
  lightbulb, sparkles, palette, brush
  search, telescope, microscope
  mail, message-circle, send
  code, terminal, git-branch
  briefcase, building, file-text
  shopping-cart, dollar-sign, credit-card
  plane, map, compass
  book, book-open, bookmark
  music, headphones
  heart, smile, party-popper
  dumbbell, salad
  car, train-front
  graduation-cap
  phone-call, video
  utensils, coffee
  list-todo, check-square
  globe, languages
  baby, paw-print
```

(The exact set is finalized in implementation; the brief specifies the *intent* — diverse enough for any thread topic, restrained enough to feel coherent.)

**Menu / structural icons**:
- Menu trigger: `menu` (≡)
- Close: `x` (×)
- Send: `arrow-up` (↑) with thicker stroke
- Plus / new: `plus` (+)
- Settings: `settings` (gear)
- Files: `folder`
- Live agents: `zap`
- Archive: `archive`
- Attach: `plus` (in composer)
- Search: `search`

---

## 8. Accessibility

- **VoiceOver labels** on every icon-only control (Calendar tab, Send, Menu, etc.).
- **Dynamic Type**: body text scales; UI chrome stays fixed. Bubbles, file rows, and code blocks scale with content size.
- **Reduced motion**: typing bubble freezes mid-animation; sheet present uses crossfade instead of slide; no backdrop-blur if `UIAccessibility.isReduceTransparencyEnabled`.
- **Contrast**: every text token meets WCAG AA against its background. The brief uses `#f7f8f8` over `#08090a` (>16:1) and the lowest-contrast pair, `text-tertiary` over `surface`, is ~5.6:1 which passes AA for body but not for fine print (use sparingly).
- **Tap targets**: minimum 40×40pt (the dock inactive icons are 40pt tap targets with 20pt glyphs).

---

## 9. What's not in this brief (deliberately)

- **Light mode** — designed in a follow-up; tokens already structured to swap.
- **APNs push notifications** — M2.
- **Streaming token-by-token render** — M3 (requires server-side agent SDK refactor).
- **Multi-device list** ("which iPhones are paired") — M2.
- **Archived threads list UI** — M2 (the data is captured in M1; just no browse screen yet).
- **iPad layout** — explicit defer; iPhone-only M1.
- **macOS Catalyst** — out of scope.

---

## 10. Reference mockups

Static HTML mockups for designer iteration live in this repo at:

```
.superpowers/brainstorm/38076-1778863238/content/
├── navigation-shell-v2.html       layout shell (idle + menu)
├── chat-formatting.html           rich markdown + MD preview
├── files-and-watcher.html         Files browser + Live agents
├── dark-mode-system.html          all screens in dark
├── icon-libraries.html            Lucide vs Phosphor vs SF Symbols + tint palette
└── attached-tab.html              the dock with carved active tab
```

Open with the visual companion server at the brainstorm session URL, or view directly in a browser.

---

## 11. Open questions for the designer

These are the spots where the brief is *intentionally* incomplete — places the designer should push back / refine:

1. **Exact concave-joint geometry on the dock** — the SVG path in the mockup uses radius 16 with the tab at fixed position 40pt from left. Is that the right ratio?
2. **Inactive icon-row baseline** — should they sit centered vertically inside the dock's tab strip, or aligned to the bottom of the attached tab?
3. **Active-tab swap animation** — currently specified as crossfade. Should there be a subtle scale-pop on the new icon (102%→100%) to mark the transition?
4. **Per-thread tints** — eight is chosen for visual coherence + room (more than 4 threads × 2 if a user reopens an archived one). Is the palette balanced? Should we drop one for being too close to the accent (`tint-amber`)?
5. **Empty-state illustrations** — currently text-only. Should the empty "Files" / "No agents running" states have a sparse line illustration?
6. **Sub-agent inline pill** — does the pill belong inside the message stream (where the user's prompt was), or stuck to the bottom above the dock?
7. **App icon** — out of brief scope but pressing. Currently a default placeholder.
8. **Onboarding** — the pairing screen exists in M1 but is unstyled. Does it deserve its own brief, or is it covered by following these tokens / components?

---

*End of brief.*
