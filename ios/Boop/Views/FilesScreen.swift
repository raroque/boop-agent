import SwiftUI

/// Cross-thread files browser presented as a sheet. Matches the
/// "Files Browser" frame in ios_app_design.pen:
///   header (title + close + divider) →
///   search → kind chips → source/thread chips →
///   date-grouped file rows (TODAY, YESTERDAY, THIS WEEK, EARLIER).
///
/// Filters compose: searchText ∧ kind ∧ source ∧ thread.
/// Data comes from `GET /channels/ios/files` — every attachment the
/// agent has produced or the user has sent across all threads on this
/// device.
struct FilesScreen: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppSettings.self) private var settings
    @Environment(ThreadsStore.self) private var threadsStore

    let bearer: String

    // MARK: - state
    @State private var entries: [FileEntry] = []
    @State private var loading = true
    @State private var loadError: String?
    @State private var previewing: FileEntry?

    @State private var searchText: String = ""
    @State private var kindFilter: KindFilter = .all
    @State private var sourceFilter: SourceFilter = .any
    @State private var threadFilter: String? = nil  // threadId

    var body: some View {
        VStack(spacing: 0) {
            sheetHeader
            contentBody
        }
        .background(BoopColor.bg.ignoresSafeArea())
        .task { await load() }
        .sheet(item: $previewing) { entry in
            AttachmentPreviewSheet(
                attachment: entry.attachment,
                thread: threadFor(entry.threadId),
                sourceLabel: entry.role == "user" ? "You" : "Agent",
                createdAt: entry.createdAtDate,
                backLabel: "Files",
                onOpenInThread: {
                    threadsStore.selectThread(entry.threadId)
                    previewing = nil
                    dismiss()
                }
            )
        }
    }

    // MARK: - header

    private var sheetHeader: some View {
        VStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 2)
                .fill(BoopColor.textTertiary)
                .frame(width: 36, height: 4)
                .padding(.top, 8)

            HStack {
                Text("Files")
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

    // MARK: - content

    @ViewBuilder
    private var contentBody: some View {
        if loading {
            loadingView
        } else if let err = loadError {
            errorView(err)
        } else if entries.isEmpty {
            emptyView
        } else {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    searchBar
                    kindChipRow
                    sourceThreadChipRow
                    fileSections
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 16)
            }
        }
    }

    private var loadingView: some View {
        VStack(spacing: 12) {
            Spacer()
            ProgressView().tint(BoopColor.accent)
            Text("Loading files…")
                .font(BoopFont.bodyMedium)
                .foregroundStyle(BoopColor.textSecondary)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 10) {
            Spacer()
            LucideIcon(name: .alertCircle, size: 32)
                .foregroundStyle(BoopColor.error)
            Text(message)
                .font(BoopFont.bodyMedium)
                .foregroundStyle(BoopColor.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Button("Try again") { Task { await load() } }
                .font(BoopFont.medium(14))
                .foregroundStyle(BoopColor.accent)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private var emptyView: some View {
        VStack(spacing: 8) {
            Spacer()
            LucideIcon(name: .folder, size: 40)
                .foregroundStyle(BoopColor.textTertiary)
            Text("No files yet")
                .font(BoopFont.semibold(16))
                .foregroundStyle(BoopColor.textPrimary)
            Text("Files Boop generates or that you attach will show up here.")
                .font(BoopFont.bodyMedium)
                .foregroundStyle(BoopColor.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - search

    private var searchBar: some View {
        HStack(spacing: 8) {
            LucideIcon(name: .search, size: 16)
                .foregroundStyle(BoopColor.textTertiary)
            TextField("Search files", text: $searchText)
                .font(BoopFont.regular(13.5))
                .foregroundStyle(BoopColor.textPrimary)
                .tint(BoopColor.accent)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
            if !searchText.isEmpty {
                Button(action: { searchText = "" }) {
                    LucideIcon(name: .x, size: 14)
                        .foregroundStyle(BoopColor.textTertiary)
                }
            }
        }
        .padding(.horizontal, 12)
        .frame(height: 40)
        .background(BoopColor.surfaceElev, in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(BoopColor.border, lineWidth: 1))
    }

    // MARK: - kind chips

    private var kindChipRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(KindFilter.allCases) { kind in
                    KindChip(
                        label: kind.label,
                        count: kindCount(kind),
                        selected: kindFilter == kind,
                        onTap: { kindFilter = kind }
                    )
                }
            }
        }
    }

    private func kindCount(_ kind: KindFilter) -> Int {
        entries.filter { kind.matches($0.attachment) }.count
    }

    // MARK: - source / thread chips

    private var sourceThreadChipRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                SourceChip(icon: .bot, label: "From agent",
                           selected: sourceFilter == .agent,
                           onTap: { sourceFilter = sourceFilter == .agent ? .any : .agent })
                SourceChip(icon: .user, label: "From you",
                           selected: sourceFilter == .user,
                           onTap: { sourceFilter = sourceFilter == .user ? .any : .user })
                ForEach(threadsWithFiles, id: \.id) { thread in
                    ThreadChip(
                        thread: thread,
                        selected: threadFilter == thread.id,
                        onTap: {
                            threadFilter = threadFilter == thread.id ? nil : thread.id
                        }
                    )
                }
            }
        }
    }

    private var threadsWithFiles: [BoopThread] {
        let ids = Set(entries.map(\.threadId))
        return threadsStore.threads.filter { ids.contains($0.id) }
    }

    private func threadFor(_ id: String) -> BoopThread? {
        threadsStore.threads.first { $0.id == id }
    }

    // MARK: - filtered + grouped

    private var filteredEntries: [FileEntry] {
        entries.filter { entry in
            kindFilter.matches(entry.attachment) &&
            sourceFilter.matches(entry.role) &&
            (threadFilter == nil || threadFilter == entry.threadId) &&
            (searchText.isEmpty || entry.attachment.displayName
                .localizedCaseInsensitiveContains(searchText))
        }
    }

    private var groupedEntries: [(DateBucket, [FileEntry])] {
        let calendar = Calendar.current
        let now = Date()
        var buckets: [DateBucket: [FileEntry]] = [:]
        for entry in filteredEntries {
            let bucket = DateBucket.for(date: entry.createdAtDate, now: now, calendar: calendar)
            buckets[bucket, default: []].append(entry)
        }
        return DateBucket.allCases.compactMap { bucket in
            guard let list = buckets[bucket], !list.isEmpty else { return nil }
            return (bucket, list.sorted { $0.createdAt > $1.createdAt })
        }
    }

    @ViewBuilder
    private var fileSections: some View {
        if filteredEntries.isEmpty {
            VStack(spacing: 4) {
                Text("No files match these filters")
                    .font(BoopFont.bodyMedium)
                    .foregroundStyle(BoopColor.textSecondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 32)
        } else {
            ForEach(groupedEntries, id: \.0) { bucket, list in
                VStack(alignment: .leading, spacing: 10) {
                    Text(bucket.title)
                        .font(BoopFont.semibold(10.5))
                        .tracking(1.3)
                        .foregroundStyle(BoopColor.textTertiary)
                    ForEach(list) { entry in
                        FilesBrowserRow(
                            entry: entry,
                            thread: threadFor(entry.threadId),
                            onTap: { previewing = entry }
                        )
                    }
                }
            }
        }
    }

    // MARK: - load

    private func autoOpenPreviewIfRequested() {
        guard ProcessInfo.processInfo.arguments.contains("--open-preview"),
              previewing == nil,
              let first = entries.first
        else { return }
        previewing = first
    }

    private func load() async {
        loading = true
        loadError = nil
        guard let baseURL = settings.serverBaseURL else {
            loadError = "Server URL not set."
            loading = false
            return
        }
        let client = BoopClient(baseURL: baseURL, bearer: bearer)
        do {
            let response = try await client.fetchFiles()
            entries = response.files
        } catch {
            loadError = "Couldn't load files: \(error.localizedDescription)"
        }
        loading = false
        autoOpenPreviewIfRequested()
    }
}

// MARK: - kind filter

enum KindFilter: String, CaseIterable, Identifiable {
    case all, images, pdfs, md, other

    var id: String { rawValue }
    var label: String {
        switch self {
        case .all: return "All"
        case .images: return "Images"
        case .pdfs: return "PDFs"
        case .md: return "MD"
        case .other: return "Other"
        }
    }

    func matches(_ a: Attachment) -> Bool {
        let kind = a.displayKind.lowercased()
        switch self {
        case .all: return true
        case .images: return ["jpg", "jpeg", "png", "heic", "gif", "webp"].contains(kind)
        case .pdfs: return kind == "pdf"
        case .md: return kind == "md" || kind == "markdown"
        case .other:
            return !["jpg","jpeg","png","heic","gif","webp","pdf","md","markdown"].contains(kind)
        }
    }
}

// MARK: - source filter

enum SourceFilter {
    case any, agent, user

    func matches(_ role: String) -> Bool {
        switch self {
        case .any: return true
        case .agent: return role != "user"
        case .user: return role == "user"
        }
    }
}

// MARK: - date bucket

enum DateBucket: String, CaseIterable {
    case today, yesterday, thisWeek, earlier

    var title: String {
        switch self {
        case .today: return "TODAY"
        case .yesterday: return "YESTERDAY"
        case .thisWeek: return "THIS WEEK"
        case .earlier: return "EARLIER"
        }
    }

    static func `for`(date: Date, now: Date, calendar: Calendar) -> DateBucket {
        if calendar.isDateInToday(date) { return .today }
        if calendar.isDateInYesterday(date) { return .yesterday }
        let weekAgo = calendar.date(byAdding: .day, value: -7, to: now) ?? now
        return date >= weekAgo ? .thisWeek : .earlier
    }
}

// MARK: - chips

private struct KindChip: View {
    let label: String
    let count: Int
    let selected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 6) {
                Text(label)
                    .font(BoopFont.medium(12))
                    .foregroundStyle(selected ? BoopColor.bg : BoopColor.textPrimary)
                Text(String(count))
                    .font(BoopFont.mono(11))
                    .foregroundStyle(selected ? BoopColor.bg.opacity(0.6) : BoopColor.textPrimary.opacity(0.6))
            }
            .padding(.horizontal, 12)
            .frame(height: 30)
            .background(
                selected ? BoopColor.textPrimary : BoopColor.surfaceElev,
                in: Capsule()
            )
            .overlay(
                Capsule().strokeBorder(
                    selected ? Color.clear : BoopColor.border,
                    lineWidth: 1
                )
            )
        }
        .buttonStyle(.plain)
    }
}

private struct SourceChip: View {
    let icon: LucideName
    let label: String
    let selected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 5) {
                LucideIcon(name: icon, size: 13)
                    .foregroundStyle(selected ? BoopColor.bg : BoopColor.textSecondary)
                Text(label)
                    .font(BoopFont.medium(11.5))
                    .foregroundStyle(selected ? BoopColor.bg : BoopColor.textPrimary)
            }
            .padding(.horizontal, 10)
            .frame(height: 28)
            .background(
                selected ? BoopColor.textPrimary : BoopColor.surfaceElev,
                in: Capsule()
            )
            .overlay(
                Capsule().strokeBorder(
                    selected ? Color.clear : BoopColor.border,
                    lineWidth: 1
                )
            )
        }
        .buttonStyle(.plain)
    }
}

private struct ThreadChip: View {
    let thread: BoopThread
    let selected: Bool
    let onTap: () -> Void

    var body: some View {
        let tint = ThreadTint.forThreadId(thread.id)
        let label = thread.label ?? "Thread"
        Button(action: onTap) {
            HStack(spacing: 5) {
                LucideIcon(name: thread.lucide, size: 12)
                    .foregroundStyle(tint.solid)
                Text(label)
                    .font(BoopFont.medium(11))
                    .foregroundStyle(tint.solid)
                    .lineLimit(1)
            }
            .padding(.horizontal, 10)
            .frame(height: 28)
            .background(tint.fill, in: Capsule())
            .overlay(
                Capsule().strokeBorder(
                    selected ? tint.solid : tint.border,
                    lineWidth: selected ? 1.5 : 1
                )
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - file row

private struct FilesBrowserRow: View {
    let entry: FileEntry
    let thread: BoopThread?
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                glyph
                VStack(alignment: .leading, spacing: 3) {
                    Text(entry.attachment.displayName)
                        .font(BoopFont.medium(13.5))
                        .foregroundStyle(BoopColor.textPrimary)
                        .lineLimit(1)
                    Text(metaLine)
                        .font(BoopFont.regular(11))
                        .foregroundStyle(BoopColor.textTertiary)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                threadChip
            }
            .padding(12)
        }
        .buttonStyle(.plain)
        .background(BoopColor.surfaceElev, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(BoopColor.border, lineWidth: 1))
    }

    // 36×36 colored badge with the file-extension label.
    private var glyph: some View {
        let kind = entry.attachment.displayKind.uppercased()
        let display = String(kind.prefix(3))
        return Text(display)
            .font(BoopFont.monoMedium(kind.count >= 3 ? 10 : 11))
            .foregroundStyle(glyphFG)
            .frame(width: 36, height: 36)
            .background(glyphBG, in: RoundedRectangle(cornerRadius: 8))
    }

    private var glyphBG: Color {
        let k = entry.attachment.displayKind.lowercased()
        if k == "pdf" { return BoopColor.accent }
        if ["jpg","jpeg","png","heic","gif","webp"].contains(k) { return BoopColor.success }
        return BoopColor.textPrimary
    }

    private var glyphFG: Color {
        let k = entry.attachment.displayKind.lowercased()
        if k == "pdf" { return .white }
        if ["jpg","jpeg","png","heic","gif","webp"].contains(k) { return BoopColor.bg }
        return BoopColor.bg
    }

    private var metaLine: String {
        let size = FileCard.size(entry.attachment.sizeBytes)
        let source = entry.role == "user" ? "You" : "Agent"
        let time = Self.timeString(entry.createdAtDate)
        return "\(size) · \(source) · \(time)"
    }

    @ViewBuilder
    private var threadChip: some View {
        if let thread {
            let tint = ThreadTint.forThreadId(thread.id)
            ZStack {
                RoundedRectangle(cornerRadius: 6).fill(tint.fill)
                LucideIcon(name: thread.lucide, size: 12)
                    .foregroundStyle(tint.solid)
            }
            .frame(width: 24, height: 24)
        }
    }

    private static func timeString(_ date: Date) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(date) || calendar.isDateInYesterday(date) {
            let f = DateFormatter()
            f.dateFormat = "h:mm a"
            return f.string(from: date)
        }
        let f = DateFormatter()
        f.dateFormat = "MMM d"
        return f.string(from: date)
    }
}

