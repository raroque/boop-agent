import SwiftUI
@preconcurrency import PDFKit
import UIKit

/// Full-screen file preview matching the "File Preview" frame in
/// ios_app_design.pen.
///
/// Layout (top → bottom):
///   • Header — `< Files` (chevron+label, accent) on the left,
///     share circle + ellipsis circle on the right.
///   • File info — 44×44 colored glyph + title + meta line + thread tag.
///   • Divider.
///   • Preview body — markdown / image / PDF, depending on attachment kind.
///   • Divider.
///   • Action bar — `[Open in thread] [Download]` 50/50.
///
/// `thread`, `sourceLabel`, `createdAt`, and `backLabel` are optional
/// context props supplied by the caller. Without them the sheet still
/// renders sensibly (no thread tag, "Back" instead of "Files").
struct AttachmentPreviewSheet: View {
    let attachment: Attachment
    var thread: BoopThread? = nil
    var sourceLabel: String = "Agent"
    var createdAt: Date = Date()
    var backLabel: String = "Back"
    var onOpenInThread: (() -> Void)? = nil

    @Environment(\.dismiss) private var dismiss
    @State private var shareItems: [Any] = []
    @State private var showShare = false

    var body: some View {
        VStack(spacing: 0) {
            header
            fileInfoCard
            divider
            previewBody
            divider
            actionBar
        }
        .background(BoopColor.bg.ignoresSafeArea())
        .sheet(isPresented: $showShare) {
            ActivityView(items: shareItems)
        }
    }

    // MARK: - header

    private var header: some View {
        HStack(spacing: 12) {
            Button(action: { dismiss() }) {
                HStack(spacing: 4) {
                    LucideIcon(name: .chevronLeft, size: 20)
                    Text(backLabel)
                        .font(BoopFont.medium(15))
                }
                .foregroundStyle(BoopColor.accent)
            }
            Spacer()
            circleButton(icon: .share, action: shareNow)
            circleButton(icon: .ellipsis, action: { /* TODO: more menu */ })
        }
        .padding(.horizontal, 16)
        .frame(height: 48)
    }

    private func circleButton(icon: LucideName, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            LucideIcon(name: icon, size: 16)
                .foregroundStyle(BoopColor.textSecondary)
                .frame(width: 32, height: 32)
                .background(BoopColor.surfaceElev, in: Circle())
        }
    }

    // MARK: - file info

    private var fileInfoCard: some View {
        HStack(alignment: .top, spacing: 14) {
            glyph
            VStack(alignment: .leading, spacing: 4) {
                Text(attachment.displayName)
                    .font(BoopFont.semibold(16))
                    .foregroundStyle(BoopColor.textPrimary)
                    .lineLimit(2)
                Text(metaLine)
                    .font(BoopFont.regular(12))
                    .foregroundStyle(BoopColor.textTertiary)
                threadTag
            }
            Spacer(minLength: 0)
        }
        .padding(16)
    }

    private var glyph: some View {
        let kind = attachment.displayKind.uppercased()
        let display = String(kind.prefix(3))
        return Text(display)
            .font(BoopFont.monoMedium(kind.count >= 3 ? 12 : 13))
            .foregroundStyle(glyphFG)
            .frame(width: 44, height: 44)
            .background(glyphBG, in: RoundedRectangle(cornerRadius: 10))
    }

    private var glyphBG: Color {
        let k = attachment.displayKind.lowercased()
        if k == "pdf" { return BoopColor.accent }
        if ["jpg","jpeg","png","heic","gif","webp"].contains(k) { return BoopColor.success }
        return BoopColor.textPrimary
    }

    private var glyphFG: Color {
        let k = attachment.displayKind.lowercased()
        if k == "pdf" { return .white }
        return BoopColor.bg
    }

    private var metaLine: String {
        let size = FileCard.size(attachment.sizeBytes)
        let creator = "Created by \(sourceLabel)"
        let time = Self.relativeTimeString(createdAt)
        return "\(size) · \(creator) · \(time)"
    }

    private static func relativeTimeString(_ date: Date) -> String {
        let calendar = Calendar.current
        let timeFormatter = DateFormatter()
        timeFormatter.dateFormat = "h:mm a"
        if calendar.isDateInToday(date) {
            return "Today, \(timeFormatter.string(from: date))"
        }
        if calendar.isDateInYesterday(date) {
            return "Yesterday, \(timeFormatter.string(from: date))"
        }
        let dayFormatter = DateFormatter()
        dayFormatter.dateFormat = "MMM d, h:mm a"
        return dayFormatter.string(from: date)
    }

    @ViewBuilder
    private var threadTag: some View {
        if let thread {
            let tint = ThreadTint.forThreadId(thread.id)
            let display = thread.label.map { "\($0) thread" } ?? "Thread"
            HStack(spacing: 5) {
                LucideIcon(name: thread.lucide, size: 12)
                    .foregroundStyle(tint.solid)
                Text(display)
                    .font(BoopFont.medium(11))
                    .foregroundStyle(tint.solid)
            }
            .padding(.top, 2)
        }
    }

    // MARK: - divider

    private var divider: some View {
        Rectangle()
            .fill(BoopColor.border)
            .frame(height: 1)
    }

    // MARK: - preview body

    @ViewBuilder
    private var previewBody: some View {
        if let urlString = attachment.signedUrl, let url = URL(string: urlString) {
            switch attachment.kind {
            case .image:
                ScrollView {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .empty:
                            ProgressView().tint(BoopColor.accent)
                                .frame(maxWidth: .infinity, minHeight: 240)
                        case .success(let image):
                            image.resizable().scaledToFit()
                        case .failure:
                            previewMessage("Couldn't load image")
                        @unknown default:
                            EmptyView()
                        }
                    }
                    .padding(20)
                }
            case .pdf:
                PDFPreview(url: url)
            case .doc:
                previewMessage("Doc preview not supported yet. Tap Download to save.")
            }
        } else {
            previewMessage("No URL on this attachment.")
        }
    }

    private func previewMessage(_ text: String) -> some View {
        Text(text)
            .font(BoopFont.bodyMedium)
            .foregroundStyle(BoopColor.textSecondary)
            .multilineTextAlignment(.center)
            .padding(20)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - action bar

    private var actionBar: some View {
        HStack(spacing: 10) {
            Button(action: openInThread) {
                HStack(spacing: 8) {
                    LucideIcon(name: .messageSquare, size: 16)
                        .foregroundStyle(BoopColor.textSecondary)
                    Text("Open in thread")
                        .font(BoopFont.medium(14))
                        .foregroundStyle(BoopColor.textPrimary)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 44)
                .background(BoopColor.surfaceElev, in: RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .strokeBorder(BoopColor.border, lineWidth: 1)
                )
            }
            Button(action: shareNow) {
                HStack(spacing: 8) {
                    LucideIcon(name: .download, size: 16)
                        .foregroundStyle(.white)
                    Text("Download")
                        .font(BoopFont.medium(14))
                        .foregroundStyle(.white)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 44)
                .background(BoopColor.accent, in: RoundedRectangle(cornerRadius: 12))
            }
        }
        .padding(EdgeInsets(top: 12, leading: 16, bottom: 32, trailing: 16))
    }

    private func openInThread() {
        if let onOpenInThread {
            onOpenInThread()
        } else {
            dismiss()
        }
    }

    private func shareNow() {
        guard let urlString = attachment.signedUrl, let url = URL(string: urlString) else { return }
        shareItems = [url]
        showShare = true
    }
}

/// Wraps PDFView from PDFKit so a remote PDF URL renders inline.
private struct PDFPreview: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> PDFView {
        let view = PDFView()
        view.autoScales = true
        view.displayMode = .singlePageContinuous
        view.displayDirection = .vertical
        view.backgroundColor = UIColor.clear
        Task.detached {
            guard let doc = PDFDocument(url: url) else { return }
            await MainActor.run { view.document = doc }
        }
        return view
    }

    func updateUIView(_ view: PDFView, context: Context) {}
}

/// UIActivityViewController bridge for share + Save to Files.
private struct ActivityView: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
