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
                    Color.clear
                        .frame(height: 1)
                        .id("bottom")
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
            }
            .onChange(of: chat.messages.count) {
                withAnimation { proxy.scrollTo("bottom", anchor: .bottom) }
            }
            .onChange(of: chat.messages.last?.content) {
                proxy.scrollTo("bottom", anchor: .bottom)
            }
            .onAppear {
                proxy.scrollTo("bottom", anchor: .bottom)
            }
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
