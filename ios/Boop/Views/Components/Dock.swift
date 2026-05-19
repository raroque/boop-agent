import SwiftUI

struct Dock: View {
    @Environment(ThreadsStore.self) private var threads
    @Binding var draft: String
    var onSend: (String) -> Void

    var body: some View {
        VStack(spacing: 8) {
            composerRow
            threadBar
        }
        .padding(.bottom, 10)
        .background(BoopColor.glassBg)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: BoopRadius.dock))
        .overlay(
            RoundedRectangle(cornerRadius: BoopRadius.dock)
                .strokeBorder(BoopColor.glassBorder, lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.45), radius: 14, x: 0, y: 8)
        .padding(.horizontal, BoopSpacing.l)
        .padding(.bottom, 18)
    }

    private var composerRow: some View {
        HStack(spacing: 8) {
            Button(action: { /* attach picker — M2 */ }) {
                LucideIcon(name: .plus, size: 18)
                    .foregroundStyle(BoopColor.textTertiary)
                    .frame(width: 32, height: 32)
            }
            TextField("", text: $draft,
                      prompt: Text("Message Boop").foregroundStyle(BoopColor.textTertiary),
                      axis: .vertical)
                .font(BoopFont.bodyLarge)
                .foregroundStyle(BoopColor.textPrimary)
                .lineLimit(1...6)
            Button(action: send) {
                LucideIcon(name: .arrowUp, size: 18)
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(BoopColor.accent, in: Circle())
            }
            .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(.leading, 12)
        .padding(.trailing, 6)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: BoopRadius.dock)
                .fill(Color.white.opacity(0.03))
        )
        .padding(.horizontal, 6)
        .padding(.top, 6)
    }

    private var threadBar: some View {
        HStack(spacing: 10) {
            ForEach(threads.threads) { thread in
                threadTab(thread)
            }
            Spacer(minLength: 0)
            newThreadButton
        }
        .padding(.horizontal, 12)
        .padding(.top, 2)
        .frame(height: 40)
    }

    /// One thread chip in the dock. Active threads render as the 36×36
    /// tinted pill in place; inactive ones as the smaller dim icon. We
    /// never reorder — the user's mental map relies on stable positions.
    @ViewBuilder
    private func threadTab(_ t: BoopThread) -> some View {
        let isActive = (t.id == threads.activeThreadId)
        let tint = ThreadTint.forThreadId(t.id)
        Button(action: {
            if !isActive { threads.selectThread(t.id) }
        }) {
            if isActive {
                LucideIcon(name: t.lucide, size: 18)
                    .foregroundStyle(tint.text)
                    .frame(width: 36, height: 36)
                    .background(tint.fill, in: Circle())
                    .overlay(Circle().strokeBorder(tint.border, lineWidth: 1))
                    .shadow(color: tint.solid.opacity(0.35), radius: 6, y: 2)
            } else {
                ZStack(alignment: .topTrailing) {
                    LucideIcon(name: t.lucide, size: 20)
                        .foregroundStyle(tint.text.opacity(0.55))
                        .frame(width: 32, height: 32)
                    if t.unread {
                        Circle().fill(BoopColor.accent).frame(width: 6, height: 6)
                            .overlay(Circle().strokeBorder(BoopColor.bg, lineWidth: 2))
                            .padding(.top, 2).padding(.trailing, 2)
                    }
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isActive ? "Active thread" : "Switch to thread")
        .contextMenu {
            Button(role: .destructive) {
                Task { await threads.archiveThread(t.id) }
            } label: {
                Label("Archive", systemImage: "archivebox")
            }
        }
    }

    private var newThreadButton: some View {
        Button(action: { Task { await threads.createNewThread() } }) {
            LucideIcon(name: .plus, size: 16)
                .foregroundStyle(BoopColor.textTertiary)
                .frame(width: 28, height: 28)
                .background(.clear, in: Circle())
                .overlay(Circle().strokeBorder(BoopColor.textTertiary, lineWidth: 1.5))
        }
        .buttonStyle(.plain)
        .disabled(threads.threads.count >= 4)
        .opacity(threads.threads.count >= 4 ? 0.30 : 1.0)
        .accessibilityLabel("New thread")
    }

    private func send() {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        draft = ""
        onSend(trimmed)
    }
}
