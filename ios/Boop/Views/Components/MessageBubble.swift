import SwiftUI

struct MessageBubble: View {
    let message: Message
    @Environment(ThreadsStore.self) private var threadsStore
    @State private var previewing: Attachment?

    private var thread: BoopThread? {
        threadsStore.threads.first { $0.id == message.threadId }
    }

    var body: some View {
        HStack {
            if message.role == .user { Spacer(minLength: 40) }
            VStack(alignment: message.role == .user ? .trailing : .leading, spacing: 6) {
                if !message.content.isEmpty {
                    content
                        .padding(.horizontal, 13)
                        .padding(.vertical, 9)
                        .background(backgroundColor)
                        .clipShape(shape)
                        .overlay(borderOverlay)
                }
                ForEach(message.attachments) { att in
                    FileCard(
                        filename: att.displayName,
                        kind: att.displayKind,
                        sizeBytes: att.sizeBytes,
                        source: message.role == .user ? .user : .agent,
                        createdAt: message.createdAt,
                        onTap: { previewing = att },
                    )
                }
            }
            .frame(maxWidth: 320, alignment: message.role == .user ? .trailing : .leading)
            if message.role != .user { Spacer(minLength: 40) }
        }
        .sheet(item: $previewing) { att in
            AttachmentPreviewSheet(
                attachment: att,
                thread: thread,
                sourceLabel: message.role == .user ? "You" : "Agent",
                createdAt: message.createdAt
            )
        }
    }

    @ViewBuilder
    private var content: some View {
        switch message.role {
        case .user:
            Text(message.content)
                .font(BoopFont.bodyLarge)
                .foregroundStyle(.white)
                .textSelection(.enabled)
        case .assistant, .system:
            MarkdownView(source: message.content)
                .textSelection(.enabled)
        }
    }

    private var backgroundColor: Color {
        switch message.role {
        case .user: return BoopColor.accent
        default:    return BoopColor.bubbleAgentBg
        }
    }

    private var shape: UnevenRoundedRectangle {
        let r = BoopRadius.bubble
        return UnevenRoundedRectangle(
            topLeadingRadius: r,
            bottomLeadingRadius: message.role == .user ? r : 5,
            bottomTrailingRadius: message.role == .user ? 5 : r,
            topTrailingRadius: r
        )
    }

    @ViewBuilder
    private var borderOverlay: some View {
        if message.role != .user {
            shape.strokeBorder(BoopColor.bubbleAgentBorder, lineWidth: 1)
        }
    }
}
