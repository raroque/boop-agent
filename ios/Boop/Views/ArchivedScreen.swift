import SwiftUI

/// Sheet that lists archived threads, newest-first, with a tap-to-restore
/// affordance. Restoration calls `ThreadsStore.unarchiveThread(_:)` which
/// fails gracefully when the device already has 4 open threads — the
/// failure surfaces as the row's caption flipping to the toast message.
struct ArchivedScreen: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppSettings.self) private var settings
    @Environment(ThreadsStore.self) private var threadsStore

    let bearer: String

    @State private var entries: [ServerThread] = []
    @State private var loading = true
    @State private var loadError: String?
    @State private var restoringId: String?
    @State private var pendingDelete: ServerThread?
    @State private var deletingId: String?

    var body: some View {
        VStack(spacing: 0) {
            header
            content
        }
        .background(BoopColor.bg.ignoresSafeArea())
        .task { await load() }
        .confirmationDialog(
            "Delete this thread forever?",
            isPresented: pendingDeleteBinding,
            titleVisibility: .visible,
            presenting: pendingDelete,
        ) { row in
            Button("Delete forever", role: .destructive) {
                Task { await delete(row) }
            }
            Button("Cancel", role: .cancel) {}
        } message: { row in
            Text("\(row.label ?? "This thread") and its messages will be removed permanently. This can't be undone.")
        }
    }

    private var pendingDeleteBinding: Binding<Bool> {
        Binding(
            get: { pendingDelete != nil },
            set: { if !$0 { pendingDelete = nil } },
        )
    }

    private var header: some View {
        VStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 2)
                .fill(BoopColor.textTertiary)
                .frame(width: 36, height: 4)
                .padding(.top, 8)

            HStack {
                Text("Archived")
                    .font(BoopFont.semibold(14.5))
                    .foregroundStyle(BoopColor.textPrimary)
                Spacer()
                Button(action: { dismiss() }) {
                    LucideIcon(name: .x, size: 16)
                        .foregroundStyle(BoopColor.textSecondary)
                        .frame(width: 32, height: 32)
                        .background(BoopColor.surfaceElev, in: Circle())
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 12)

            Rectangle()
                .fill(BoopColor.border)
                .frame(height: 1)
        }
    }

    @ViewBuilder
    private var content: some View {
        if loading {
            ProgressView()
                .tint(BoopColor.accent)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let err = loadError {
            messageState(title: "Couldn't load archived threads", subtitle: err)
        } else if entries.isEmpty {
            messageState(
                title: "Nothing archived yet",
                subtitle: "Threads you archive will show up here. Tap one to bring it back.",
            )
        } else {
            ScrollView {
                LazyVStack(spacing: 10) {
                    if let restoreError = threadsStore.loadError {
                        banner(restoreError)
                    }
                    ForEach(entries, id: \._id) { row in
                        ArchivedThreadRow(
                            row: row,
                            restoring: restoringId == row._id,
                            deleting: deletingId == row._id,
                            onTap: { Task { await restore(row) } },
                        )
                        .contextMenu {
                            Button(role: .destructive) {
                                pendingDelete = row
                            } label: {
                                Label("Delete forever", systemImage: "trash")
                            }
                            Button {
                                Task { await restore(row) }
                            } label: {
                                Label("Restore", systemImage: "arrow.uturn.left")
                            }
                        }
                    }
                }
                .padding(EdgeInsets(top: 16, leading: 16, bottom: 24, trailing: 16))
            }
        }
    }

    private func messageState(title: String, subtitle: String) -> some View {
        VStack(spacing: 8) {
            Text(title)
                .font(BoopFont.medium(15))
                .foregroundStyle(BoopColor.textPrimary)
            Text(subtitle)
                .font(BoopFont.regular(13))
                .foregroundStyle(BoopColor.textSecondary)
                .multilineTextAlignment(.center)
        }
        .padding(.horizontal, 32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func banner(_ text: String) -> some View {
        Text(text)
            .font(BoopFont.medium(13))
            .foregroundStyle(BoopColor.textPrimary)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(BoopColor.surfaceElev, in: RoundedRectangle(cornerRadius: 10))
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .strokeBorder(BoopColor.border, lineWidth: 1),
            )
    }

    private func load() async {
        guard let baseURL = settings.serverBaseURL else { return }
        loading = true
        loadError = nil
        let client = BoopClient(baseURL: baseURL, bearer: bearer)
        do {
            let response = try await client.listArchivedThreads()
            entries = response.threads
        } catch {
            loadError = error.localizedDescription
        }
        loading = false
    }

    private func restore(_ row: ServerThread) async {
        restoringId = row._id
        await threadsStore.unarchiveThread(row._id)
        restoringId = nil
        // If unarchive succeeded the row no longer belongs in this list.
        // ThreadsStore surfaces conflicts via loadError; only dismiss + drop
        // when the active thread now points at the restored id.
        if threadsStore.activeThreadId == row._id {
            entries.removeAll { $0._id == row._id }
            dismiss()
        }
    }

    private func delete(_ row: ServerThread) async {
        deletingId = row._id
        let ok = await threadsStore.deleteThread(row._id)
        deletingId = nil
        if ok {
            entries.removeAll { $0._id == row._id }
        }
    }
}

/// One row in the archived-threads list. Renders the per-thread tint,
/// icon, label (or fallback), last-message timestamp, and a "Restore"
/// glyph on the trailing edge.
private struct ArchivedThreadRow: View {
    let row: ServerThread
    let restoring: Bool
    let deleting: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(tint.fill)
                    LucideIcon(name: lucide, size: 18)
                        .foregroundStyle(tint.solid)
                }
                .frame(width: 40, height: 40)
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .strokeBorder(tint.border, lineWidth: 1),
                )

                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(BoopFont.medium(14))
                        .foregroundStyle(BoopColor.textPrimary)
                        .lineLimit(1)
                    Text(subtitle)
                        .font(BoopFont.regular(12))
                        .foregroundStyle(BoopColor.textTertiary)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                if restoring || deleting {
                    ProgressView().tint(BoopColor.textSecondary)
                } else {
                    LucideIcon(name: .archive, size: 16)
                        .foregroundStyle(BoopColor.textSecondary)
                }
            }
            .padding(12)
            .background(BoopColor.surfaceElev, in: RoundedRectangle(cornerRadius: BoopRadius.card))
            .overlay(
                RoundedRectangle(cornerRadius: BoopRadius.card)
                    .strokeBorder(BoopColor.border, lineWidth: 1),
            )
            .opacity(deleting ? 0.5 : 1)
        }
        .buttonStyle(.plain)
        .disabled(restoring || deleting)
    }

    private var tint: ThreadTint { ThreadTint.forThreadId(row._id) }

    private var lucide: LucideName {
        guard let icon = row.icon else { return .fallback }
        return LucideName.knownByName(icon)
    }

    private var title: String {
        row.label ?? "Thread"
    }

    private var subtitle: String {
        guard let ms = row.lastMessageAt else { return "Archived" }
        let date = Date(timeIntervalSince1970: ms / 1000)
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        return "Last activity \(formatter.localizedString(for: date, relativeTo: Date()))"
    }
}
