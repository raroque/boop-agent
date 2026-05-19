import SwiftUI

/// Inline chat row that signals "a sub-agent is running for this turn".
/// Matches the "Sub-Agent Pill" in ios_app_design.pen — sky-tinted capsule,
/// pulsing dot, `<name> · <N> tools →`. Tap opens the full agent view.
struct SubAgentPill: View {
    let agentName: String
    let toolCount: Int
    var onTap: () -> Void = {}

    @State private var pulse = false

    var body: some View {
        HStack {
            Spacer(minLength: 0)
            Button(action: onTap) {
                HStack(spacing: 6) {
                    pulsingDot
                    label
                }
                .padding(.leading, 10)
                .padding(.trailing, 12)
                .frame(height: 28)
                .background(skyTint(0.08), in: Capsule())
                .overlay(Capsule().strokeBorder(skyTint(0.30), lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(agentName), \(toolCount) tools — open agent")
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
        .onAppear { pulse = true }
    }

    private var pulsingDot: some View {
        Circle()
            .fill(skyTint(1.0))
            .frame(width: 7, height: 7)
            .opacity(pulse ? 0.35 : 1.0)
            .animation(.easeInOut(duration: 0.70).repeatForever(autoreverses: true), value: pulse)
    }

    /// Concatenated `<name> · <N> tools →` so the tracking matches the design.
    private var label: some View {
        let tools = toolCount == 1 ? "1 tool" : "\(toolCount) tools"
        return Text("\(agentName) · \(tools) →")
            .font(BoopFont.medium(11))
            .foregroundStyle(skyTint(1.0))
    }

    /// The design uses `$tint-sky` (#7aa2ff). Replicated locally so we
    /// don't have to thread the full ThreadTint enum through.
    private func skyTint(_ alpha: Double) -> Color {
        Color(boopHex: "#7aa2ff").opacity(alpha)
    }
}
