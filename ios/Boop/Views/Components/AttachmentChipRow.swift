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

    private func glyph(for chip: DraftAttachment) -> LucideName {
        switch chip.kind {
        case .image: return .image
        case .file:  return .fileText
        }
    }
}
