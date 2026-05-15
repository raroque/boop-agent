import SwiftUI

/// Three-dot agent-is-thinking indicator. Used in chat between user-tap-send
/// and the first SSE delta. Matches the design's typing indicator in
/// `Chat Screen → Typing Indicator`.
struct TypingBubble: View {
    @State private var phase: Int = 0
    private let timer = Timer.publish(every: 0.35, on: .main, in: .common).autoconnect()

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<3) { i in
                Circle()
                    .fill(phase == i ? BoopColor.textSecondary : BoopColor.textTertiary.opacity(0.55))
                    .frame(width: 7, height: 7)
                    .animation(.easeInOut(duration: 0.30), value: phase)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(BoopColor.bubbleAgentBg, in: RoundedRectangle(cornerRadius: BoopRadius.bubble))
        .overlay(
            RoundedRectangle(cornerRadius: BoopRadius.bubble)
                .strokeBorder(BoopColor.bubbleAgentBorder, lineWidth: 1)
        )
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.trailing, 40)
        .onReceive(timer) { _ in phase = (phase + 1) % 3 }
        .accessibilityLabel("Agent is thinking")
    }
}
