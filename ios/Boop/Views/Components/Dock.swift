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
    @FocusState private var composerFocused: Bool

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
                .focused($composerFocused)
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

            // "+" new-thread button — far right. `.frame(maxWidth:
            // .infinity)` is required because the other ZStack children
            // use `.position`, which contributes no intrinsic width —
            // without this the HStack collapses to fit `newThreadButton`
            // alone and the button drifts left instead of trailing.
            HStack {
                Spacer()
                newThreadButton
            }
            .frame(maxWidth: .infinity)
            .frame(height: 36)
        }
        .frame(maxWidth: .infinity)
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
                WeldedTabShape().strokeBorder(BoopColor.glassBorder, lineWidth: 1)
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
/// corners, **no top edge**. Drawn as an open path: `.stroke`/
/// `.strokeBorder` paints only the three visible sides + two arcs,
/// while `clipShape` auto-closes the open top for fill purposes so
/// the silhouette still reads as a closed tab.
/// Conforms to `InsettableShape` so callers can use `.strokeBorder`
/// for inner-stroke parity with the composer pill above.
struct WeldedTabShape: InsettableShape {
    var insetAmount: CGFloat = 0

    func path(in rect: CGRect) -> Path {
        let bounds = rect.insetBy(dx: insetAmount, dy: insetAmount)
        let r: CGFloat = max(0, 12 - insetAmount)
        var p = Path()
        // Start at top-right. Tracing clockwise around an open-topped
        // shape: right edge → bottom-right arc → bottom → bottom-left
        // arc → left edge. No `closeSubpath()` so the top stays unpainted.
        p.move(to: CGPoint(x: bounds.maxX, y: bounds.minY))
        p.addLine(to: CGPoint(x: bounds.maxX, y: bounds.maxY - r))
        p.addArc(center: CGPoint(x: bounds.maxX - r, y: bounds.maxY - r),
                 radius: r,
                 startAngle: .degrees(0),
                 endAngle: .degrees(90),
                 clockwise: false)
        p.addLine(to: CGPoint(x: bounds.minX + r, y: bounds.maxY))
        p.addArc(center: CGPoint(x: bounds.minX + r, y: bounds.maxY - r),
                 radius: r,
                 startAngle: .degrees(90),
                 endAngle: .degrees(180),
                 clockwise: false)
        p.addLine(to: CGPoint(x: bounds.minX, y: bounds.minY))
        return p
    }

    func inset(by amount: CGFloat) -> some InsettableShape {
        var copy = self
        copy.insetAmount += amount
        return copy
    }
}
