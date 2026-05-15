import SwiftUI

struct SubAgentPill: View {
    let agentName: String
    let toolCount: Int
    var onTap: () -> Void = {}

    @State private var pulse = false

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 10) {
                Circle().fill(BoopColor.accent).frame(width: 7, height: 7)
                    .opacity(pulse ? 0.30 : 1.0)
                    .animation(.easeInOut(duration: 0.70).repeatForever(autoreverses: true), value: pulse)
                label
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(BoopColor.textTertiary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .buttonStyle(.plain)
        .background(BoopColor.accent.opacity(0.08))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(BoopColor.accent.opacity(0.30), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .onAppear { pulse = true }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var label: Text {
        Text(agentName)
            .font(BoopFont.medium(13))
            .foregroundStyle(BoopColor.textPrimary)
        + Text(" · \(toolCount) tools")
            .font(BoopFont.regular(13))
            .foregroundStyle(BoopColor.textSecondary)
    }
}
