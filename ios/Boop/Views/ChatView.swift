import SwiftUI

struct ChatView: View {
    @Binding var showSettings: Bool
    @Environment(ChatStore.self) private var chat
    @State private var draft = ""
    @FocusState private var composerFocused: Bool

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if let err = chat.sendError {
                    BannerView(text: err)
                }
                MessageListView()
                Divider()
                composer
            }
            .navigationTitle("Boop")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    ConnectionDot(state: chat.connectionState)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                    }
                }
            }
        }
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 8) {
            TextField("Message Boop", text: $draft, axis: .vertical)
                .lineLimit(1...6)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color.gray.opacity(0.12), in: RoundedRectangle(cornerRadius: 18))
                .focused($composerFocused)

            Button {
                let toSend = draft
                draft = ""
                Task { await chat.send(toSend) }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 32))
            }
            .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }
}

private struct MessageListView: View {
    @Environment(ChatStore.self) private var chat

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(chat.messages) { msg in
                        MessageBubble(message: msg)
                            .id(msg.id)
                    }
                    if chat.isAwaitingReply {
                        TypingBubble()
                            .id("typing")
                            .transition(.opacity.combined(with: .scale(scale: 0.9, anchor: .leading)))
                    }
                    Color.clear
                        .frame(height: 1)
                        .id("bottom")
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .animation(.easeInOut(duration: 0.15), value: chat.isAwaitingReply)
            }
            .onChange(of: chat.messages.count) {
                withAnimation { proxy.scrollTo("bottom", anchor: .bottom) }
            }
            .onChange(of: chat.messages.last?.content) {
                proxy.scrollTo("bottom", anchor: .bottom)
            }
            .onChange(of: chat.isAwaitingReply) { _, awaiting in
                if awaiting {
                    withAnimation { proxy.scrollTo("bottom", anchor: .bottom) }
                }
            }
            .onAppear {
                proxy.scrollTo("bottom", anchor: .bottom)
            }
        }
    }
}

/// Three-dot "agent is thinking" bubble. Plays a staggered opacity loop
/// so the user has visible feedback the moment they tap send and through
/// the 3–8s wait for Anthropic to respond.
private struct TypingBubble: View {
    @State private var phase: Int = 0
    private let timer = Timer.publish(every: 0.35, on: .main, in: .common).autoconnect()

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<3) { i in
                Circle()
                    .fill(Color.gray.opacity(phase == i ? 0.7 : 0.3))
                    .frame(width: 7, height: 7)
                    .animation(.easeInOut(duration: 0.3), value: phase)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Color.gray.opacity(0.18), in: RoundedRectangle(cornerRadius: 18))
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.trailing, 40)
        .onReceive(timer) { _ in
            phase = (phase + 1) % 3
        }
    }
}

private struct MessageBubble: View {
    let message: Message

    var body: some View {
        HStack {
            if message.role == .user { Spacer(minLength: 40) }
            VStack(alignment: message.role == .user ? .trailing : .leading, spacing: 4) {
                Text(message.content)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(background, in: RoundedRectangle(cornerRadius: 18))
                    .foregroundStyle(foreground)
                    .textSelection(.enabled)
                if message.isStreaming {
                    Text("…")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }
            if message.role != .user { Spacer(minLength: 40) }
        }
    }

    private var background: Color {
        switch message.role {
        case .user: .accentColor
        case .assistant: Color.gray.opacity(0.18)
        case .system: Color.yellow.opacity(0.18)
        }
    }

    private var foreground: Color {
        message.role == .user ? .white : .primary
    }
}

private struct ConnectionDot: View {
    let state: ChatStore.ConnectionState

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: 10, height: 10)
            .help(label)
    }

    private var color: Color {
        switch state {
        case .idle, .disconnected: .gray
        case .connecting: .orange
        case .connected: .green
        }
    }

    private var label: String {
        switch state {
        case .idle: "Idle"
        case .connecting: "Connecting"
        case .connected: "Connected"
        case .disconnected(let msg): msg ?? "Disconnected"
        }
    }
}

private struct BannerView: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.footnote)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.red.opacity(0.12))
            .foregroundStyle(.red)
    }
}
