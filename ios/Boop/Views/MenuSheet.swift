import SwiftUI

struct MenuSheet: View {
    var onFiles: () -> Void
    var onLiveAgents: () -> Void
    var onArchived: () -> Void
    var onSettings: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(BoopColor.borderStrong)
                .frame(width: 36, height: 4)
                .padding(.vertical, 8)
            Text("Menu")
                .font(BoopFont.semibold(16))
                .foregroundStyle(BoopColor.textPrimary)
                .padding(.bottom, 12)

            VStack(spacing: 10) {
                HStack(spacing: 10) {
                    card(title: "Files",       icon: .folder)   { onFiles() }
                    card(title: "Live agents", icon: .zap)      { onLiveAgents() }
                }
                HStack(spacing: 10) {
                    card(title: "Archived",    icon: .archive)  { onArchived() }
                    card(title: "Settings",    icon: .settings) { onSettings() }
                }
            }
            .padding(.horizontal, BoopSpacing.edge)
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .background(BoopColor.surface)
        .presentationDetents([.height(384)])
        .presentationDragIndicator(.hidden)
        .presentationCornerRadius(BoopRadius.sheet)
    }

    private func card(title: String, icon: LucideName, action: @escaping () -> Void) -> some View {
        Button(action: { action(); dismiss() }) {
            VStack(alignment: .leading, spacing: 12) {
                LucideIcon(name: icon, size: 24)
                    .foregroundStyle(BoopColor.textPrimary)
                    .frame(width: 36, height: 36)
                    .background(BoopColor.surfaceElev, in: RoundedRectangle(cornerRadius: 10))
                Text(title)
                    .font(BoopFont.medium(14))
                    .foregroundStyle(BoopColor.textPrimary)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(height: 100)
        }
        .buttonStyle(.plain)
        .background(BoopColor.surfaceElev, in: RoundedRectangle(cornerRadius: BoopRadius.card))
        .overlay(
            RoundedRectangle(cornerRadius: BoopRadius.card)
                .strokeBorder(BoopColor.border, lineWidth: 1)
        )
    }
}
