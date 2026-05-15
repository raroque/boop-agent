import SwiftUI

struct FilePreviewScreen: View {
    let filename: String
    let kind: String            // "md" | "pdf" | "jpg" | etc.
    let sizeBytes: Int
    let threadIcon: LucideName
    let threadTint: ThreadTint
    let content: String         // for md/txt; for pdf/img a path will be threaded later
    var onClose: () -> Void
    var onOpenInThread: () -> Void
    var onDownload: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            header
            fileInfoCard
                .padding(.horizontal, BoopSpacing.edge)
                .padding(.top, 14)
            Divider().background(BoopColor.border).padding(.top, 14)
            ScrollView { contentBody.padding(BoopSpacing.edge) }
            Divider().background(BoopColor.border)
            actionBar
        }
        .background(BoopColor.bg.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
    }

    private var header: some View {
        HStack {
            Button(action: onClose) {
                HStack(spacing: 4) {
                    LucideIcon(name: .arrowLeft, size: 18)
                    Text("Back").font(BoopFont.medium(13))
                }
                .foregroundStyle(BoopColor.textPrimary)
            }
            Spacer()
            HStack(spacing: 14) {
                Button(action: { /* share — M2 */ }) {
                    LucideIcon(name: .share, size: 18).foregroundStyle(BoopColor.textSecondary)
                }
                Button(action: { /* more — M2 */ }) {
                    LucideIcon(name: .moreHorizontal, size: 18).foregroundStyle(BoopColor.textSecondary)
                }
            }
        }
        .padding(.horizontal, BoopSpacing.edge)
        .padding(.top, 14).padding(.bottom, 8)
    }

    private var fileInfoCard: some View {
        HStack(spacing: 12) {
            Text(kind.lowercased())
                .font(BoopFont.monoMedium(13))
                .foregroundStyle(.white)
                .frame(width: 48, height: 48)
                .background(BoopColor.accent, in: RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 2) {
                Text(filename).font(BoopFont.semibold(14)).foregroundStyle(BoopColor.textPrimary)
                Text(FileCard.size(sizeBytes)).font(BoopFont.meta).foregroundStyle(BoopColor.textTertiary)
            }
            Spacer()
            HStack(spacing: 6) {
                LucideIcon(name: threadIcon, size: 14).foregroundStyle(threadTint.text)
                Text(threadTint.rawValue.capitalized).font(BoopFont.meta).foregroundStyle(threadTint.text)
            }
            .padding(.horizontal, 10).padding(.vertical, 6)
            .background(threadTint.fill, in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(threadTint.border, lineWidth: 1))
        }
        .padding(12)
        .background(BoopColor.surfaceElev, in: RoundedRectangle(cornerRadius: BoopRadius.l))
        .overlay(RoundedRectangle(cornerRadius: BoopRadius.l).strokeBorder(BoopColor.border, lineWidth: 1))
    }

    @ViewBuilder
    private var contentBody: some View {
        switch kind.lowercased() {
        case "md", "txt":
            MarkdownView(source: content, sheetMode: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        case "pdf":
            Text("PDF preview coming in M2").font(BoopFont.bodyMedium).foregroundStyle(BoopColor.textSecondary)
        default:
            Text("Preview not supported for .\(kind)").font(BoopFont.bodyMedium).foregroundStyle(BoopColor.textSecondary)
        }
    }

    private var actionBar: some View {
        HStack(spacing: 10) {
            Button(action: onOpenInThread) {
                HStack(spacing: 8) {
                    LucideIcon(name: threadIcon, size: 16)
                    Text("Open in thread").font(BoopFont.medium(14))
                }
                .foregroundStyle(BoopColor.textPrimary)
                .frame(maxWidth: .infinity)
                .frame(height: 44)
                .background(BoopColor.surfaceElev, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(BoopColor.border, lineWidth: 1))
            }
            Button(action: onDownload) {
                HStack(spacing: 8) {
                    LucideIcon(name: .download, size: 16)
                    Text("Download").font(BoopFont.medium(14))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 44)
                .background(BoopColor.accent, in: RoundedRectangle(cornerRadius: 12))
            }
        }
        .padding(.horizontal, BoopSpacing.edge)
        .padding(.vertical, 12)
    }
}
