import SwiftUI

/// A file in the chat (sent by user OR produced by the agent). Tap → opens
/// the full-screen FilePreviewScreen.
struct FileCard: View {
    let filename: String
    let kind: String        // "md" | "pdf" | "jpg" | "txt" | etc.
    let sizeBytes: Int
    let source: Source
    let createdAt: Date
    var threadTint: ThreadTint? = nil   // shown as a small chip on right in files browser; nil in chat
    var onTap: () -> Void = {}

    enum Source { case agent, user }

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 10) {
                glyph
                VStack(alignment: .leading, spacing: 2) {
                    Text(filename)
                        .font(BoopFont.medium(13.5))
                        .foregroundStyle(BoopColor.textPrimary)
                        .lineLimit(1)
                    Text(metaString)
                        .font(BoopFont.meta)
                        .foregroundStyle(BoopColor.textTertiary)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                if let threadTint { tintChip(threadTint) }
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(BoopColor.textTertiary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
        }
        .buttonStyle(.plain)
        .background(BoopColor.surfaceElev, in: RoundedRectangle(cornerRadius: BoopRadius.l))
        .overlay(
            RoundedRectangle(cornerRadius: BoopRadius.l)
                .strokeBorder(BoopColor.border, lineWidth: 1)
        )
        .frame(maxWidth: 320, alignment: .leading)
    }

    private var glyph: some View {
        Text(kind.lowercased())
            .font(BoopFont.monoMedium(12))
            .foregroundStyle(glyphFG)
            .frame(width: 36, height: 36)
            .background(glyphBG, in: RoundedRectangle(cornerRadius: 8))
    }

    private var glyphBG: Color {
        switch kind.lowercased() {
        case "md": return BoopColor.surface
        case "pdf": return BoopColor.accent
        case "jpg", "jpeg", "png", "heic", "gif": return BoopColor.success
        default: return BoopColor.border
        }
    }
    private var glyphFG: Color {
        switch kind.lowercased() {
        case "md": return BoopColor.textPrimary
        case "pdf", "jpg", "jpeg", "png", "heic", "gif": return .white
        default: return BoopColor.textPrimary
        }
    }

    private var metaString: String {
        let parts = [Self.size(sizeBytes), sourceLabel, Self.relativeTime(createdAt)]
        return parts.joined(separator: " · ")
    }
    private var sourceLabel: String { source == .agent ? "agent" : "you" }

    private func tintChip(_ t: ThreadTint) -> some View {
        RoundedRectangle(cornerRadius: 6)
            .fill(t.fill).overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(t.border, lineWidth: 1))
            .frame(width: 22, height: 22)
    }

    static func size(_ bytes: Int) -> String {
        if bytes < 1024 { return "\(bytes) B" }
        if bytes < 1024 * 1024 { return String(format: "%.1f kB", Double(bytes) / 1024) }
        return String(format: "%.1f MB", Double(bytes) / 1024 / 1024)
    }
    static func relativeTime(_ d: Date) -> String {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .abbreviated
        return f.localizedString(for: d, relativeTo: Date())
    }
}
