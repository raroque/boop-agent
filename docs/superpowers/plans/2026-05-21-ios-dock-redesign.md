# iOS Dock Redesign + Chat UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the iOS chat dock so the active thread is a welded tab hanging off the composer, inactive threads are bare icons, attach picker UI works (no upload yet), the chat list always shows new content above the dock, and the dock collapses to just the composer when the keyboard is up.

**Architecture:** Mostly SwiftUI view work in `ios/Boop/Views/Components/`. The dock owns slot layout, the welded-tab geometry, `@FocusState`-driven keyboard collapse, and an attach-picker action sheet. `ChatView` switches from `.padding(.bottom, 150)` to `.safeAreaInset(.bottom)` so the ScrollView treats the dock as real safe-area space and the auto-scroll anchor lands flush above it. Client-side draft attachments live on `ChatStore`; the send path detects them and clears + toasts instead of uploading (full pipeline is a follow-up).

**Tech Stack:** SwiftUI (iOS 17+, `@Observable`, `@FocusState`), `PhotosPicker` (PhotosUI), `UIImagePickerController` via `UIViewControllerRepresentable`, `.fileImporter`, Convex backend (unchanged this pass).

**Spec:** [`docs/superpowers/specs/2026-05-21-ios-dock-redesign.md`](../specs/2026-05-21-ios-dock-redesign.md)

**Verification note:** iOS in this repo has no `XCTest` target. The verification loop per task is **`xcodebuild` clean → run on Simulator → exercise the change visually → commit**. Where simulator verification is unrealistic (e.g. physical camera), state what the engineer must check on a real device.

**Commit convention:** Match existing iOS commits in this repo (`feat(ios): …`, `chore(ios): …`, `docs(ios): …`). Include the trailer:

```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `ios/Boop/Models/Models.swift` | Modify | Add `DraftAttachment` struct (client-side draft chip data). |
| `ios/Boop/State/ChatStore.swift` | Modify | Add `attachmentChips` published state + `addChip(_:)` / `removeChip(_:)` / `clearChips()` + send-with-chips stub branch. |
| `ios/Boop/Views/Components/ToastView.swift` | Create | Non-error transient banner (`$text-secondary` on `$surface-elev`). |
| `ios/Boop/Views/Components/AttachmentChipRow.swift` | Create | Horizontal scroll row of `DraftAttachment` chips with remove buttons. |
| `ios/Boop/Views/Components/AttachPicker.swift` | Create | View modifier presenting `confirmationDialog` → `PhotosPicker` / `UIImagePickerController` / `.fileImporter`. |
| `ios/Boop/Views/Components/Dock.swift` | Rewrite | New welded-tab geometry, slot row, `@FocusState` keyboard collapse, attach picker hook-up, chips row + toast hook-up. |
| `ios/Boop/Views/ChatView.swift` | Modify | Move Dock from ZStack into `.safeAreaInset(edge: .bottom)`; remove `.padding(.bottom, 150)` from messageList. |

---

## Task 1: `DraftAttachment` model

**Files:**
- Modify: `ios/Boop/Models/Models.swift` (append at end of file)

- [ ] **Step 1: Add the struct**

Append to `ios/Boop/Models/Models.swift`:

```swift
/// A picked attachment held in the composer's draft state, before the
/// user taps Send. Lives client-side only — the upload + /inbound
/// pipeline is a follow-up project. See
/// docs/superpowers/specs/2026-05-21-ios-dock-redesign.md §3.5.
struct DraftAttachment: Identifiable, Equatable {
    enum Kind: String {
        case image
        case file
    }

    let id: UUID
    let localURL: URL
    let filename: String
    let mimeType: String
    let sizeBytes: Int
    let kind: Kind

    init(localURL: URL,
         filename: String,
         mimeType: String,
         sizeBytes: Int,
         kind: Kind) {
        self.id = UUID()
        self.localURL = localURL
        self.filename = filename
        self.mimeType = mimeType
        self.sizeBytes = sizeBytes
        self.kind = kind
    }
}
```

- [ ] **Step 2: Build**

Run from repo root: `xcodebuild -project ios/Boop.xcodeproj -scheme Boop -destination 'generic/platform=iOS Simulator' build -quiet`
Expected: build succeeds with no new errors.

- [ ] **Step 3: Commit**

```bash
git add ios/Boop/Models/Models.swift
git commit -m "$(cat <<'EOF'
feat(ios): add DraftAttachment model for composer chips

Client-side draft state for the attach-picker UI. Upload + /inbound
extension is a follow-up project.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `ChatStore` chip state + send-with-chips stub

**Files:**
- Modify: `ios/Boop/State/ChatStore.swift`

- [ ] **Step 1: Add the published chip state**

Inside `ChatStore`, immediately after `private(set) var isAwaitingReply: Bool = false` (line ~25), insert:

```swift
/// Picked attachments staged in the composer. UI-only state — the
/// upload + /inbound extension is deferred. When the user taps Send
/// with chips present, they get cleared + a "coming soon" toast.
/// See spec §3.5.3.
private(set) var attachmentChips: [DraftAttachment] = []
```

- [ ] **Step 2: Add chip mutation methods**

Immediately after the existing `init(settings:)` (around line 51), insert these three methods:

```swift
func addChip(_ chip: DraftAttachment) {
    attachmentChips.append(chip)
}

func removeChip(id: UUID) {
    attachmentChips.removeAll { $0.id == id }
}

func clearChips() {
    attachmentChips.removeAll()
}
```

- [ ] **Step 3: Branch `send(_:)` for chips present**

Replace the existing `send(_:)` method (around lines 317–347) with:

```swift
func send(_ text: String) async {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)

    // Send-with-chips stub: chips present → clear them and surface
    // a transient toast. Text (if any) still sends normally below.
    if !attachmentChips.isEmpty {
        attachmentChips.removeAll()
        sendError = "Attachments coming soon"
        // Clear the toast after a short delay so it reads as transient.
        let toastText = sendError
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            guard let self else { return }
            if self.sendError == toastText { self.sendError = nil }
        }
    }

    guard !trimmed.isEmpty, let bearer, let baseURL = settings.serverBaseURL, let threadId else { return }

    // Only clear the error banner if it's NOT the "coming soon" toast
    // we just set above — we want that to stay visible for ~2.5s.
    if sendError != "Attachments coming soon" {
        sendError = nil
    }
    isAwaitingReply = true

    let localId = "local-\(UUID().uuidString)"
    appendActive(Message(id: localId, threadId: threadId, role: .user,
                         content: trimmed, createdAt: Date()))

    let client = BoopClient(baseURL: baseURL, bearer: bearer)
    do {
        let response = try await client.sendInbound(text: trimmed, threadId: threadId)
        if let serverId = response.userMessageId {
            var buf = perThread[threadId] ?? []
            if let idx = buf.firstIndex(where: { $0.id == localId }) {
                buf[idx].id = serverId
                perThread[threadId] = buf
            }
        }
    } catch {
        sendError = "Send failed: \(error.localizedDescription)"
        isAwaitingReply = false
    }
}
```

- [ ] **Step 4: Reset chips on unbind**

In the existing `unbind()` method (around line 57), add `attachmentChips.removeAll()` so an unpair clears any staged chips. The body should now end with:

```swift
isAwaitingReply = false
attachmentChips.removeAll()
```

- [ ] **Step 5: Build**

Run: `xcodebuild -project ios/Boop.xcodeproj -scheme Boop -destination 'generic/platform=iOS Simulator' build -quiet`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add ios/Boop/State/ChatStore.swift
git commit -m "$(cat <<'EOF'
feat(ios): ChatStore draft-attachment chip state + send stub

Chip mutation API + send-with-chips branch that clears chips and
shows a transient "Attachments coming soon" toast. No /inbound
changes — actual upload pipeline is a follow-up.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `ToastView` non-error banner variant

**Files:**
- Create: `ios/Boop/Views/Components/ToastView.swift`

- [ ] **Step 1: Create the file**

Create `ios/Boop/Views/Components/ToastView.swift`:

```swift
import SwiftUI

/// Transient banner used for non-error messages (e.g. "Attachments
/// coming soon"). Parallel to BannerView in ChatView but rendered in
/// `$text-secondary` on `$surface-elev` rather than the error palette.
/// Auto-dismiss is handled by the caller (ChatStore.sendError is
/// reused as the source-of-truth; the toast caller clears it after
/// the delay).
struct ToastView: View {
    let text: String

    var body: some View {
        Text(text)
            .font(BoopFont.meta)
            .foregroundStyle(BoopColor.textSecondary)
            .padding(.horizontal, BoopSpacing.edge).padding(.vertical, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(BoopColor.surfaceElev)
    }
}
```

- [ ] **Step 2: Build**

Run: `xcodebuild -project ios/Boop.xcodeproj -scheme Boop -destination 'generic/platform=iOS Simulator' build -quiet`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add ios/Boop/Views/Components/ToastView.swift
git commit -m "$(cat <<'EOF'
feat(ios): add ToastView for non-error transient banners

Parallel to BannerView but uses text-secondary on surface-elev so
non-error toasts (e.g. "Attachments coming soon") don't borrow the
red error palette.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `AttachmentChipRow` component

**Files:**
- Create: `ios/Boop/Views/Components/AttachmentChipRow.swift`

- [ ] **Step 1: Create the file**

Create `ios/Boop/Views/Components/AttachmentChipRow.swift`:

```swift
import SwiftUI

/// Horizontal scroll row rendering the user's staged attachment chips
/// above the composer. Each chip shows a type glyph, filename, and an
/// ✕ remove button. Tap ✕ → onRemove(id). Empty array → row collapses
/// to zero height.
///
/// See spec §3.5.2.
struct AttachmentChipRow: View {
    let chips: [DraftAttachment]
    var onRemove: (UUID) -> Void

    var body: some View {
        if chips.isEmpty {
            EmptyView()
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(chips) { chip in
                        chipView(chip)
                    }
                }
                .padding(.horizontal, 14)
            }
            .frame(height: 36)
        }
    }

    @ViewBuilder
    private func chipView(_ chip: DraftAttachment) -> some View {
        HStack(spacing: 6) {
            LucideIcon(name: glyph(for: chip), size: 18)
                .foregroundStyle(BoopColor.textSecondary)
                .frame(width: 18, height: 18)
            Text(chip.filename)
                .font(BoopFont.label)
                .foregroundStyle(BoopColor.textPrimary)
                .lineLimit(1)
                .truncationMode(.middle)
            Button(action: { onRemove(chip.id) }) {
                LucideIcon(name: .x, size: 12)
                    .foregroundStyle(BoopColor.textTertiary)
                    .frame(width: 22, height: 22)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Remove \(chip.filename)")
        }
        .padding(.leading, 8).padding(.trailing, 4)
        .frame(height: 36)
        .frame(maxWidth: 200)
        .background(BoopColor.surfaceElev, in: RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(BoopColor.border, lineWidth: 1)
        )
    }

    private func glyph(for chip: DraftAttachment) -> LucideIcon.Name {
        switch chip.kind {
        case .image: return .image
        case .file:  return .fileText
        }
    }
}
```

- [ ] **Step 2: Verify `LucideName` cases**

Run: `grep -n 'case image\|case fileText\|case x\b' ios/Boop/DesignSystem/LucideIcon.swift`

Expected: all three cases exist in the `LucideName` enum (confirmed in repo: lines 10, 22, 34). No changes needed.

If for any reason a case is missing, add it to `LucideName` following the existing pattern (raw-string raw value for hyphenated names; bare case name for single-word ones) and drop the corresponding `<name>.pdf` into `ios/Boop/Resources/Lucide/`.

- [ ] **Step 3: Build**

Run: `xcodebuild -project ios/Boop.xcodeproj -scheme Boop -destination 'generic/platform=iOS Simulator' build -quiet`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add ios/Boop/Views/Components/AttachmentChipRow.swift ios/Boop/DesignSystem/LucideIcon.swift
git commit -m "$(cat <<'EOF'
feat(ios): add AttachmentChipRow component

Horizontal-scroll row of draft-attachment chips with a per-chip
remove affordance. Renders nothing when chips array is empty so the
dock doesn't reserve space.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `AttachPicker` view modifier

**Files:**
- Create: `ios/Boop/Views/Components/AttachPicker.swift`

- [ ] **Step 1: Create the file**

Create `ios/Boop/Views/Components/AttachPicker.swift`:

```swift
import SwiftUI
import PhotosUI
import UIKit
import UniformTypeIdentifiers

/// Presents the attach picker action sheet and the three native
/// pickers (Photos / Camera / Files) it routes to. Use as a view
/// modifier on the dock — the dock owns the `isPresented` Bool that
/// drives the confirmationDialog.
///
/// Each picker calls `onPicked(DraftAttachment)` when an item is
/// successfully picked. Cancellation is a no-op.
///
/// See spec §3.5.1.
struct AttachPicker: ViewModifier {
    @Binding var isPresented: Bool
    var onPicked: (DraftAttachment) -> Void

    @State private var showPhotos = false
    @State private var showCamera = false
    @State private var showFiles = false
    @State private var photoItems: [PhotosPickerItem] = []

    private var cameraAvailable: Bool {
        UIImagePickerController.isSourceTypeAvailable(.camera)
    }

    func body(content: Content) -> some View {
        content
            .confirmationDialog("Add to message", isPresented: $isPresented, titleVisibility: .visible) {
                Button("Photo Library") { showPhotos = true }
                Button("Take Photo") { showCamera = true }
                    .disabled(!cameraAvailable)
                Button("Choose File") { showFiles = true }
                Button("Cancel", role: .cancel) { }
            }
            .photosPicker(isPresented: $showPhotos, selection: $photoItems, maxSelectionCount: 1, matching: .images)
            .onChange(of: photoItems) { _, items in
                Task { await handlePhotosPick(items) }
            }
            .fullScreenCover(isPresented: $showCamera) {
                CameraPicker { url, filename, mime in
                    showCamera = false
                    let chip = DraftAttachment(
                        localURL: url,
                        filename: filename,
                        mimeType: mime,
                        sizeBytes: (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0,
                        kind: .image
                    )
                    onPicked(chip)
                } onCancel: { showCamera = false }
            }
            .fileImporter(isPresented: $showFiles, allowedContentTypes: [.item], allowsMultipleSelection: false) { result in
                if case let .success(urls) = result, let url = urls.first {
                    handleFilePick(url)
                }
            }
    }

    // MARK: - Photo Library

    private func handlePhotosPick(_ items: [PhotosPickerItem]) async {
        defer { photoItems = [] }
        guard let item = items.first else { return }
        guard let data = try? await item.loadTransferable(type: Data.self) else { return }
        // Persist to a temp URL so the chip has a usable filename + URL.
        let tmpDir = FileManager.default.temporaryDirectory
        let filename = "image-\(Int(Date().timeIntervalSince1970)).jpg"
        let url = tmpDir.appendingPathComponent(filename)
        try? data.write(to: url, options: .atomic)
        let chip = DraftAttachment(
            localURL: url,
            filename: filename,
            mimeType: "image/jpeg",
            sizeBytes: data.count,
            kind: .image
        )
        await MainActor.run { onPicked(chip) }
    }

    // MARK: - File Importer

    private func handleFilePick(_ url: URL) {
        // Security-scoped resource: need to start/stop access for files
        // picked from the user's iCloud Drive / Files app.
        let didStart = url.startAccessingSecurityScopedResource()
        defer { if didStart { url.stopAccessingSecurityScopedResource() } }

        guard let attrs = try? FileManager.default.attributesOfItem(atPath: url.path) else { return }
        let size = (attrs[.size] as? Int) ?? 0
        let mime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        let kind: DraftAttachment.Kind = mime.hasPrefix("image/") ? .image : .file
        let chip = DraftAttachment(
            localURL: url,
            filename: url.lastPathComponent,
            mimeType: mime,
            sizeBytes: size,
            kind: kind
        )
        onPicked(chip)
    }
}

/// UIKit-bridged camera picker for the "Take Photo" option. Saves to
/// a temp URL and reports filename + mimeType back.
private struct CameraPicker: UIViewControllerRepresentable {
    var onPicked: (URL, String, String) -> Void
    var onCancel: () -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let pc = UIImagePickerController()
        pc.sourceType = .camera
        pc.delegate = context.coordinator
        return pc
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UINavigationControllerDelegate, UIImagePickerControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            guard let image = info[.originalImage] as? UIImage,
                  let data = image.jpegData(compressionQuality: 0.9) else {
                parent.onCancel()
                return
            }
            let tmpDir = FileManager.default.temporaryDirectory
            let filename = "photo-\(Int(Date().timeIntervalSince1970)).jpg"
            let url = tmpDir.appendingPathComponent(filename)
            try? data.write(to: url, options: .atomic)
            parent.onPicked(url, filename, "image/jpeg")
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.onCancel()
        }
    }
}

extension View {
    /// Convenience modifier — applies AttachPicker.
    func attachPicker(isPresented: Binding<Bool>, onPicked: @escaping (DraftAttachment) -> Void) -> some View {
        modifier(AttachPicker(isPresented: isPresented, onPicked: onPicked))
    }
}
```

- [ ] **Step 2: Confirm Info.plist privacy strings exist**

Run: `grep -A 1 'NSPhotoLibraryUsage\|NSCameraUsage' ios/Boop/Info.plist`

Expected: both `NSPhotoLibraryUsageDescription` and `NSCameraUsageDescription` keys with non-empty values. If either is missing, add them to `Info.plist`:

```xml
<key>NSPhotoLibraryUsageDescription</key>
<string>Boop uses your photo library to attach images to messages.</string>
<key>NSCameraUsageDescription</key>
<string>Boop uses the camera so you can attach a photo to a message.</string>
```

Without these, the app will crash the first time the picker tries to read photos / open the camera.

- [ ] **Step 3: Build**

Run: `xcodebuild -project ios/Boop.xcodeproj -scheme Boop -destination 'generic/platform=iOS Simulator' build -quiet`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add ios/Boop/Views/Components/AttachPicker.swift ios/Boop/Info.plist
git commit -m "$(cat <<'EOF'
feat(ios): add AttachPicker view modifier

Routes a confirmationDialog to PhotosPicker / UIImagePickerController
camera / .fileImporter. Each picked item resolves to a DraftAttachment
via a callback. UI-only — no upload pipeline.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Dock — composer pill + welded active tab geometry

**Files:**
- Rewrite: `ios/Boop/Views/Components/Dock.swift`

The dock rewrite happens in two passes: this task ships the new geometry with a SINGLE active tab and no inactive slots yet. Task 7 adds inactive slots + sliding animation. Task 8 adds keyboard collapse. Task 9 wires the attach picker + chips.

- [ ] **Step 1: Replace the Dock body**

Replace the entire contents of `ios/Boop/Views/Components/Dock.swift` with:

```swift
import SwiftUI

/// Bottom dock: composer pill with the active thread welded to its
/// bottom edge as a small tab, plus a row of inactive-thread icons
/// and a "+" new-thread button below. See spec
/// docs/superpowers/specs/2026-05-21-ios-dock-redesign.md.
///
/// This file ships in increments — Task 6 introduces the composer +
/// single welded active tab. Task 7 adds inactive slots + animation.
/// Task 8 adds keyboard collapse. Task 9 wires the attach picker.
struct Dock: View {
    @Environment(ThreadsStore.self) private var threads
    @Binding var draft: String
    var onSend: (String) -> Void

    var body: some View {
        VStack(spacing: 0) {
            composerPill
            weldedTabRow
        }
        .padding(.horizontal, BoopSpacing.m)
        .padding(.bottom, 18)
    }

    // MARK: - Composer pill

    private var composerPill: some View {
        HStack(spacing: 8) {
            attachButton
            TextField("", text: $draft,
                      prompt: Text("Message Boop").foregroundStyle(BoopColor.textTertiary),
                      axis: .vertical)
                .font(BoopFont.bodyLarge)
                .foregroundStyle(BoopColor.textPrimary)
                .lineLimit(1...6)
            voiceModeButton   // placeholder — inert this pass
            sendButton
        }
        .padding(.leading, 6).padding(.trailing, 4)
        .padding(.vertical, 4)
        .frame(minHeight: 48)
        .background(BoopColor.glassBg)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 24))
        .overlay(
            RoundedRectangle(cornerRadius: 24)
                .strokeBorder(BoopColor.glassBorder, lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.45), radius: 14, x: 0, y: 8)
        .zIndex(2)
    }

    // MARK: - Welded tab row

    private var weldedTabRow: some View {
        HStack(spacing: 0) {
            if let active = activeThread {
                weldedTab(for: active)
                    .padding(.leading, 36)
            }
            Spacer(minLength: 0)
        }
        .frame(height: 36)
        .zIndex(1)
        .offset(y: -1) // overlap the composer's bottom border by 1pt
    }

    private func weldedTab(for thread: BoopThread) -> some View {
        let tint = ThreadTint.forThreadId(thread.id)
        return LucideIcon(name: thread.lucide, size: 18)
            .foregroundStyle(tint.text)
            .frame(width: 44, height: 36)
            .background(BoopColor.glassBg)
            .background(.ultraThinMaterial)
            .clipShape(WeldedTabShape())
            .overlay(
                WeldedTabShape()
                    .stroke(BoopColor.glassBorder, lineWidth: 1)
            )
    }

    // MARK: - Composer subviews

    private var attachButton: some View {
        Button(action: { /* hooked up in Task 9 */ }) {
            LucideIcon(name: .plus, size: 18)
                .foregroundStyle(BoopColor.textTertiary)
                .frame(width: 36, height: 36)
        }
        .accessibilityLabel("Attach")
    }

    private var voiceModeButton: some View {
        // Placeholder. No-op this pass. See spec §1.1 #3. Uses SF
        // Symbols `mic.fill` because LucideName has no mic case;
        // dropping a Lucide mic asset is out of scope for this pass.
        ZStack {
            Circle().fill(BoopColor.surfaceElev)
            Circle().strokeBorder(BoopColor.border, lineWidth: 1)
            Image(systemName: "mic.fill")
                .font(.system(size: 14, weight: .regular))
                .foregroundStyle(ThreadTint.sky.text)
        }
        .frame(width: 36, height: 36)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private var sendButton: some View {
        Button(action: send) {
            LucideIcon(name: .arrowUp, size: 18)
                .foregroundStyle(.white)
                .frame(width: 40, height: 40)
                .background(BoopColor.accent, in: Circle())
        }
        .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        .accessibilityLabel("Send")
    }

    // MARK: - Helpers

    private var activeThread: BoopThread? {
        guard let id = threads.activeThreadId else { return nil }
        return threads.threads.first(where: { $0.id == id })
    }

    private func send() {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        draft = ""
        onSend(trimmed)
    }
}

/// The active welded tab outline: square top corners, 12pt bottom
/// corners. Drawn as a manual path so we can omit the top stroke
/// (it shares the composer's bottom hairline). Position the shape
/// inside a 44×36 frame; the top edge gets drawn flush with the
/// frame's top so the overlay parent's `.offset(y: -1)` makes it
/// merge into the composer above.
struct WeldedTabShape: Shape {
    func path(in rect: CGRect) -> Path {
        let r: CGFloat = 12
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - r))
        p.addArc(center: CGPoint(x: rect.maxX - r, y: rect.maxY - r),
                 radius: r,
                 startAngle: .degrees(0),
                 endAngle: .degrees(90),
                 clockwise: false)
        p.addLine(to: CGPoint(x: rect.minX + r, y: rect.maxY))
        p.addArc(center: CGPoint(x: rect.minX + r, y: rect.maxY - r),
                 radius: r,
                 startAngle: .degrees(90),
                 endAngle: .degrees(180),
                 clockwise: false)
        p.closeSubpath()
        return p
    }
}
```

- [ ] **Step 2: Verify `LucideName` cases used**

Run: `grep -n 'case arrowUp\|case plus' ios/Boop/DesignSystem/LucideIcon.swift`

Expected: both cases exist (confirmed in repo: lines 10 and 11). The mic icon is SF Symbols, not Lucide — no asset needed.

- [ ] **Step 3: Verify `ThreadTint.sky` exists**

`ThreadTint` is an enum with raw values; `.sky` is a valid case (confirmed in repo at `ios/Boop/DesignSystem/ThreadTints.swift:4`). `ThreadTint.sky.text` resolves to `solid.opacity(0.85)`. No changes needed.

- [ ] **Step 4: Build**

Run: `xcodebuild -project ios/Boop.xcodeproj -scheme Boop -destination 'generic/platform=iOS Simulator' build -quiet`
Expected: build succeeds.

- [ ] **Step 5: Simulator check**

Launch the app on Simulator (`xcrun simctl boot 'iPhone 16 Pro'`, then run from Xcode or `xcrun simctl launch`). Pair if you haven't already (use the existing pairing flow from prior plans).

Visually verify:
- Composer pill renders with attach (+) on left, "Message Boop" placeholder, mic placeholder, and orange send button on the right.
- Below the composer's bottom-left, a single welded tab hangs down ~36pt tall × 44pt wide, with the active thread's Lucide icon centered. The top edge of the tab fuses with the bottom edge of the composer — no visible seam.
- Tap the textfield. Type. Send. The message goes through the existing send path (Task 9 wires chip-aware send).

- [ ] **Step 6: Commit**

```bash
git add ios/Boop/Views/Components/Dock.swift
git commit -m "$(cat <<'EOF'
feat(ios): dock rewrite — composer + welded active tab geometry

Replaces the M1 flat dock layout with a composer pill that has the
active thread welded to its bottom edge. Inactive slots + sliding
animation + keyboard collapse + attach picker land in follow-up
commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Dock — inactive slots + sliding active tab

**Files:**
- Modify: `ios/Boop/Views/Components/Dock.swift`

- [ ] **Step 1: Replace `weldedTabRow` with slot layout + animation**

In `Dock.swift`, replace the `weldedTabRow` computed property (and its helper `weldedTab(for:)`) with:

```swift
// MARK: - Slot row (active welded tab + inactive bare icons + "+")

private static let slotWidth: CGFloat = 44
private static let slotGap: CGFloat   = 8
private static let slotLeading: CGFloat = 36

/// X offset of slot `index` (0-indexed) within the dock's content area.
/// Slot 0 is anchored at `slotLeading`; subsequent slots are spaced
/// `slotWidth + slotGap` apart. The welded tab translates between
/// these positions when the active thread changes.
private func slotX(_ index: Int) -> CGFloat {
    Self.slotLeading + CGFloat(index) * (Self.slotWidth + Self.slotGap)
}

private var slotRow: some View {
    ZStack(alignment: .topLeading) {
        // Inactive bare icons in their home slots.
        ForEach(Array(threads.threads.enumerated()), id: \.element.id) { idx, thread in
            if thread.id != threads.activeThreadId {
                inactiveIcon(for: thread)
                    .frame(width: Self.slotWidth, height: 36)
                    .position(x: slotX(idx) + Self.slotWidth / 2, y: 18)
            }
        }

        // The welded tab — single instance, animates its position.
        if let active = activeThread,
           let idx = threads.threads.firstIndex(where: { $0.id == active.id }) {
            weldedTab(for: active)
                .position(x: slotX(idx) + Self.slotWidth / 2, y: 17)
                .animation(.easeInOut(duration: 0.20), value: threads.activeThreadId)
        }

        // "+" new-thread button — far right.
        HStack {
            Spacer()
            newThreadButton
        }
        .frame(height: 36)
    }
    .frame(height: 36)
    .offset(y: -1) // overlap the composer's bottom border by 1pt
    .zIndex(1)
}

private func weldedTab(for thread: BoopThread) -> some View {
    let tint = ThreadTint.forThreadId(thread.id)
    return LucideIcon(name: thread.lucide, size: 18)
        .foregroundStyle(tint.text)
        .frame(width: Self.slotWidth, height: 36)
        .background(BoopColor.glassBg)
        .background(.ultraThinMaterial)
        .clipShape(WeldedTabShape())
        .overlay(
            WeldedTabShape().stroke(BoopColor.glassBorder, lineWidth: 1)
        )
}

private func inactiveIcon(for thread: BoopThread) -> some View {
    let tint = ThreadTint.forThreadId(thread.id)
    return Button(action: { threads.selectThread(thread.id) }) {
        ZStack(alignment: .topTrailing) {
            LucideIcon(name: thread.lucide, size: 18)
                .foregroundStyle(tint.text.opacity(0.55))
                .frame(width: 32, height: 32)
            if thread.unread {
                Circle().fill(BoopColor.accent).frame(width: 6, height: 6)
                    .overlay(Circle().strokeBorder(BoopColor.bg, lineWidth: 2))
                    .padding(.top, 2).padding(.trailing, 2)
            }
        }
    }
    .buttonStyle(.plain)
    .accessibilityLabel("Switch to thread")
    .contextMenu {
        Button(role: .destructive) {
            Task { await threads.archiveThread(thread.id) }
        } label: {
            Label("Archive", systemImage: "archivebox")
        }
    }
}

private var newThreadButton: some View {
    Button(action: { Task { await threads.createNewThread() } }) {
        LucideIcon(name: .plus, size: 12)
            .foregroundStyle(BoopColor.textTertiary)
            .frame(width: 26, height: 26)
            .overlay(
                Circle().strokeBorder(
                    BoopColor.textTertiary,
                    style: StrokeStyle(lineWidth: 1.5, dash: [3, 2])
                )
            )
    }
    .buttonStyle(.plain)
    .disabled(threads.threads.count >= 4)
    .opacity(threads.threads.count >= 4 ? 0.30 : 1.0)
    .accessibilityLabel("New thread")
}
```

- [ ] **Step 2: Update `body` to call `slotRow`**

In `Dock.swift`'s `body`, replace `weldedTabRow` with `slotRow`:

```swift
var body: some View {
    VStack(spacing: 0) {
        composerPill
        slotRow
    }
    .padding(.horizontal, BoopSpacing.l)
    .padding(.bottom, 18)
}
```

Also delete the now-unused old `weldedTabRow` if any reference remains.

- [ ] **Step 3: Build**

Run: `xcodebuild -project ios/Boop.xcodeproj -scheme Boop -destination 'generic/platform=iOS Simulator' build -quiet`
Expected: build succeeds.

- [ ] **Step 4: Simulator check**

Open at least 2 threads (use the "+" button or existing UI). Verify:
- The active thread shows as the welded tab at its slot's x-position.
- Other threads show as bare 18pt icons (no border, no fill) at their own slot x-positions, with 55% opacity.
- Tapping a bare icon → the welded tab slides to that slot in ~200ms; the icon at that slot vanishes (becomes the welded tab); the previously-active slot now shows a bare icon.
- "+" sits on the far right, dashed circle, disabled visually when you reach 4 threads.

- [ ] **Step 5: Commit**

```bash
git add ios/Boop/Views/Components/Dock.swift
git commit -m "$(cat <<'EOF'
feat(ios): dock — sliding welded tab + bare inactive icons

Welded active tab translates between fixed slot positions when the
user switches threads (200ms easeInOut). Inactive threads render
as bare 18pt Lucide glyphs at 55% opacity, no border.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Dock — keyboard collapse via `@FocusState`

**Files:**
- Modify: `ios/Boop/Views/Components/Dock.swift`

- [ ] **Step 1: Add focus state + animate the slot row**

In `Dock.swift`, after the existing `@Binding var draft: String`, add:

```swift
@FocusState private var composerFocused: Bool
```

- [ ] **Step 2: Bind the TextField to focus state**

In the `composerPill` body, modify the `TextField` initializer chain to add `.focused($composerFocused)` at the end:

```swift
TextField("", text: $draft,
          prompt: Text("Message Boop").foregroundStyle(BoopColor.textTertiary),
          axis: .vertical)
    .font(BoopFont.bodyLarge)
    .foregroundStyle(BoopColor.textPrimary)
    .lineLimit(1...6)
    .focused($composerFocused)
```

- [ ] **Step 3: Hide the slot row when focused**

Wrap the `slotRow` invocation in `body` with a conditional that animates between visible and hidden:

```swift
var body: some View {
    VStack(spacing: 0) {
        composerPill
        if !composerFocused {
            slotRow
                .transition(.opacity.combined(with: .move(edge: .bottom)))
        }
    }
    .animation(.easeInOut(duration: 0.20), value: composerFocused)
    .padding(.horizontal, BoopSpacing.l)
    .padding(.bottom, 18)
}
```

- [ ] **Step 4: Build**

Run: `xcodebuild -project ios/Boop.xcodeproj -scheme Boop -destination 'generic/platform=iOS Simulator' build -quiet`
Expected: build succeeds.

- [ ] **Step 5: Simulator check**

Tap into the composer's TextField. Verify:
- Keyboard slides up.
- The slot row (welded tab + inactive icons + "+") fades + slides out of view in ~200ms.
- The composer pill remains, now sitting alone above the keyboard.
- Tap outside the composer (existing `Self.hideKeyboard()` in `ChatView.onTapGesture`) → keyboard dismisses, slot row returns with the same animation.
- Swipe down on the chat list (existing `.scrollDismissesKeyboard(.interactively)`) → keyboard dismisses smoothly, slot row returns.

- [ ] **Step 6: Commit**

```bash
git add ios/Boop/Views/Components/Dock.swift
git commit -m "$(cat <<'EOF'
feat(ios): dock — collapse slot row when keyboard is up

@FocusState on the composer TextField; slot row animates out when
focused so the user has more chat-visible space while typing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Dock — attach picker + chip row integration

**Files:**
- Modify: `ios/Boop/Views/Components/Dock.swift`

- [ ] **Step 1: Add chip state + chat env**

In `Dock.swift`, at the top of the `Dock` struct after the existing environment:

```swift
@Environment(ChatStore.self) private var chat
@State private var showAttachPicker = false
```

- [ ] **Step 2: Wire the attach button**

Replace the existing `attachButton` body:

```swift
private var attachButton: some View {
    Button(action: { showAttachPicker = true }) {
        LucideIcon(name: .plus, size: 18)
            .foregroundStyle(BoopColor.textTertiary)
            .frame(width: 36, height: 36)
    }
    .accessibilityLabel("Attach")
}
```

- [ ] **Step 3: Render the chip row above the composer**

Update `body` to render the chip row above the composer when chips exist:

```swift
var body: some View {
    VStack(spacing: 0) {
        AttachmentChipRow(chips: chat.attachmentChips, onRemove: { id in
            chat.removeChip(id: id)
        })
        composerPill
        if !composerFocused {
            slotRow
                .transition(.opacity.combined(with: .move(edge: .bottom)))
        }
    }
    .animation(.easeInOut(duration: 0.20), value: composerFocused)
    .padding(.horizontal, BoopSpacing.l)
    .padding(.bottom, 18)
    .attachPicker(isPresented: $showAttachPicker) { chip in
        chat.addChip(chip)
    }
}
```

- [ ] **Step 4: Build**

Run: `xcodebuild -project ios/Boop.xcodeproj -scheme Boop -destination 'generic/platform=iOS Simulator' build -quiet`
Expected: build succeeds.

- [ ] **Step 5: Simulator check**

Tap the attach (+) button. Verify:
- Confirmation dialog appears with options "Photo Library", "Take Photo", "Choose File", "Cancel".
- Pick a photo from the library → a chip appears above the composer with the filename and an ✕ button. Tap ✕ → chip disappears.
- Tap "Take Photo" — should be disabled on Simulator (no camera). On a physical device, confirm the camera opens.
- Tap "Choose File" → Files app opens; pick a file → chip appears.
- With one or more chips present, type text and tap send. Verify: chips clear immediately, a non-error toast "Attachments coming soon" appears for ~2.5s, the text message sends normally.
- With chips present and empty text, tap send. Verify: chips clear, toast appears; no message is sent (matches the existing `guard !trimmed.isEmpty` in `ChatStore.send`).

- [ ] **Step 6: Commit**

```bash
git add ios/Boop/Views/Components/Dock.swift
git commit -m "$(cat <<'EOF'
feat(ios): dock — wire attach picker + chip row

Tapping + presents PhotosPicker / Camera / Files. Picked items
render as chips above the composer; tapping send with chips
present clears them and shows the "coming soon" toast.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: ChatView — `.safeAreaInset` for dock + auto-scroll fix

**Files:**
- Modify: `ios/Boop/Views/ChatView.swift`

- [ ] **Step 1: Move Dock into `.safeAreaInset`**

In `ChatView.swift`'s `body`, restructure so the Dock is hosted via `safeAreaInset(edge:)` rather than ZStack overlay. Replace the existing `body` (lines 13–45) with:

```swift
var body: some View {
    ZStack(alignment: .bottom) {
        BoopColor.bg.ignoresSafeArea()

        // The chat list runs edge-to-edge under the header so bubbles
        // scrolling up pass behind it. The gradient overlay above
        // tapers from solid black to fully clear, so bubbles entering
        // the header zone fade out gradually — chat feels taller than
        // the header's hard edge would imply.
        messageList
            .safeAreaInset(edge: .bottom, spacing: 0) {
                Dock(draft: $draft, onSend: { text in
                    Task { await chat.send(text) }
                })
            }

        VStack(spacing: 0) {
            topFade
            Spacer()
        }
        .allowsHitTesting(false)

        VStack(spacing: 0) {
            header
            if let err = chat.sendError {
                if err == "Attachments coming soon" {
                    ToastView(text: err)
                } else {
                    BannerView(text: err)
                }
            }
            Spacer()
        }
    }
    // Tap anywhere outside an interactive element (Dock buttons, the
    // composer field, menu button) → resign first responder so the
    // keyboard goes away. Buttons + TextField have higher gesture
    // priority, so they keep working normally.
    .onTapGesture { Self.hideKeyboard() }
}
```

Note: the `Dock(...)` invocation moves OUT of the ZStack and INTO `safeAreaInset`. Delete the original `Dock(...)` invocation that was the last child of the ZStack.

- [ ] **Step 2: Drop the manual bottom padding**

In `messageList` (around lines 90–135), change the padding on the LazyVStack from:

```swift
.padding(.horizontal, 14).padding(.top, 140)
.padding(.bottom, 150)
```

to:

```swift
.padding(.horizontal, 14).padding(.top, 140)
.padding(.bottom, 12)
```

The `safeAreaInset` now reserves the dock's space; the 12pt extra is breathing room above the dock.

- [ ] **Step 3: Build**

Run: `xcodebuild -project ios/Boop.xcodeproj -scheme Boop -destination 'generic/platform=iOS Simulator' build -quiet`
Expected: build succeeds.

- [ ] **Step 4: Simulator check — auto-scroll above dock**

Run the app. Open a thread with enough messages to fill the screen.

Verify:
- The last bubble (or typing bubble / sub-agent pill) sits flush above the dock — NOT hidden behind it.
- Send a message: new message scrolls to bottom, lands directly above the dock.
- When a streaming reply arrives, text appears just above the dock as it grows — never hidden by it.
- Trigger a sub-agent (any agent that fans out, e.g. via the chat). The pill should slide into view above the dock, not behind it.
- When the keyboard is up (composer focused), the slot row collapses (from Task 8) and the dock height shrinks — verify the chat reclaims the freed space cleanly (scroll position is consistent with the new dock height).

- [ ] **Step 5: Commit**

```bash
git add ios/Boop/Views/ChatView.swift
git commit -m "$(cat <<'EOF'
fix(ios): host Dock in safeAreaInset so chat auto-scroll lands above it

Replaces the .padding(.bottom, 150) hack with .safeAreaInset(.bottom)
that owns the Dock. The ScrollView now treats the dock as real safe
area, so scrollTo("bottom") lands the last bubble flush above the
dock instead of hidden behind it.

Also routes the "Attachments coming soon" toast through ToastView
instead of the error-styled BannerView.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Final end-to-end sanity pass

**Files:**
- (no edits — validation only)

- [ ] **Step 1: Run a full simulator pass**

Boot a clean Simulator (`xcrun simctl erase 'iPhone 16 Pro'` if needed) and run the app fresh. Pair the device against your dev server (existing flow from prior plans). Then walk through:

1. Cold-launch (single thread state) — composer + welded tab on the only thread + "+" anchored right.
2. Create a second thread via "+" — verify welded tab stays on the original, the new thread appears as a bare inactive icon, "+" slides right.
3. Tap the new thread's icon — verify welded tab slides over (~200ms), the previously-active thread becomes a bare icon.
4. Send a message — verify it lands at the bottom, flush above the dock.
5. Tap into composer — verify slot row collapses, chat reclaims space.
6. Tap "+" attach — verify confirmation dialog, pick a photo from library, see chip, remove chip with ✕.
7. Pick another photo + type text, hit send — verify chips clear, "Attachments coming soon" toast appears for ~2.5s with the neutral (non-red) styling, text message sends.
8. Long-press a thread icon (active or inactive) — verify Archive context menu still works.
9. Toggle reduce motion in Simulator (Settings → Accessibility → Motion → Reduce Motion ON) — verify the welded tab still indicates the active thread visually but the slide animation is replaced by a crossfade or instant swap.
10. Open at least 4 threads — verify "+" goes disabled.

- [ ] **Step 2: Verify `xcodebuild` still clean**

Run: `xcodebuild -project ios/Boop.xcodeproj -scheme Boop -destination 'generic/platform=iOS Simulator' build -quiet`
Expected: zero new warnings, zero errors.

- [ ] **Step 3: Verify the server tests haven't regressed**

This pass touched no server code, so the suite should be untouched. Run a quick sanity check:

```bash
npm test -- tests/apns.test.ts
```

Expected: 8/8 pass (matches the cache-series baseline from memory).

- [ ] **Step 4: Update the iOS status memory note**

(For a human engineer: no action.)

(For an agentic worker: after the implementation lands, update `/Users/lakunle/.claude/projects/-Users-lakunle-project-boop-agent/memory/project_ios_status.md` to record that the dock redesign + chat UX polish landed on `feat/ios-channel`, mention the commits added in this plan, and re-list known gaps.)

- [ ] **Step 5: Final commit (only if you added an update commit during the pass)**

If no functional changes during the sanity pass, skip this. Otherwise:

```bash
git commit -m "$(cat <<'EOF'
chore(ios): post-redesign sanity-pass touchups

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Notes & follow-ups

- **Reduce-motion crossfade**: Tasks 7 and 8 use `.animation(.easeInOut(duration: 0.20), value: …)`. SwiftUI honors `UIAccessibility.isReduceMotionEnabled` automatically for most implicit animations, but the welded-tab slide uses `.position(x:)` which SwiftUI may not gate. If the simulator check in Task 11 step 1 #9 shows the slide still moving under Reduce Motion, gate the position with a manual check:

  ```swift
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  // …
  .position(x: reduceMotion ? slotX(idx) + Self.slotWidth / 2 : slotX(idx) + Self.slotWidth / 2)
  .animation(reduceMotion ? nil : .easeInOut(duration: 0.20), value: threads.activeThreadId)
  ```

- **Slot spacing for 4 threads**: at 393pt screen width with 16pt horizontal dock padding, dock width is 361pt. With `slotLeading=36, slotWidth=44, slotGap=8`: slot 4 ends at `36 + 4*44 + 3*8 = 236pt`, leaving 125pt for the "+" button on the right. Comfortable. If you bump `slotLeading` higher or `slotGap` wider, re-check that "+" doesn't crowd slot 4 on smaller devices (iPhone SE at 375pt).

- **The voice-mode mic placeholder**: it's rendered as a styled circle so the composer's metrics match the Pencil mockup. It does nothing — tapping it should not even register a button action. Confirm during Task 6 simulator check that taps on the mic ZStack are inert (no visual press feedback). If you see press feedback, wrap the ZStack in `.allowsHitTesting(false)`.

- **Attach upload pipeline (follow-up project)**: when ready, the path is:
  1. Add multipart support to `server/ios/router.ts:/inbound`.
  2. Upload `DraftAttachment.localURL` contents to Convex storage via the existing `assistant_attachments` pattern (see `server/ios/router.ts:128`).
  3. Persist attachment metadata on the user message via `api.messages.send`.
  4. Drop the chip-clear-and-toast stub branch in `ChatStore.send(_:)` and replace it with a real send that includes attachments in the request body.
