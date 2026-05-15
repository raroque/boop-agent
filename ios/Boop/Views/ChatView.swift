import SwiftUI

struct ChatView: View {
    @Binding var showMenu: Bool
    @Environment(ChatStore.self) private var chat
    @Environment(ThreadsStore.self) private var threads
    @State private var draft: String = ""
    @FocusState private var composerFocused: Bool

    var body: some View {
        ZStack(alignment: .bottom) {
            BoopColor.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                if let err = chat.sendError { BannerView(text: err) }
                messageList
            }
            Dock(draft: $draft, onSend: { text in
                Task { await chat.send(text) }
            })
        }
    }

    private var header: some View {
        HStack {
            Text("Boop")
                .font(BoopFont.semibold(17))
                .foregroundStyle(BoopColor.textPrimary)
                .accessibilityAddTraits(.isHeader)
            Spacer()
            Button(action: { showMenu = true }) {
                DotGrid().foregroundStyle(BoopColor.textPrimary).frame(width: 32, height: 32)
            }
            .accessibilityLabel("Menu")
        }
        .padding(.horizontal, BoopSpacing.edge)
        .padding(.top, 14).padding(.bottom, 10)
        .overlay(
            Rectangle().fill(BoopColor.border).frame(height: 1),
            alignment: .bottom
        )
    }

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: BoopSpacing.m) {
                    ForEach(chat.messages) { msg in
                        MessageBubble(message: msg).id(msg.id)
                    }
                    if chat.isAwaitingReply {
                        TypingBubble().id("typing")
                    }
                    Color.clear.frame(height: 1).id("bottom")
                }
                .padding(.horizontal, 14).padding(.top, 12)
                .padding(.bottom, 150)
                .animation(.easeInOut(duration: 0.18), value: chat.isAwaitingReply)
            }
            .onChange(of: chat.messages.count) {
                withAnimation { proxy.scrollTo("bottom", anchor: .bottom) }
            }
            .onChange(of: chat.messages.last?.content) {
                proxy.scrollTo("bottom", anchor: .bottom)
            }
            .onChange(of: chat.isAwaitingReply) { _, awaiting in
                if awaiting { withAnimation { proxy.scrollTo("bottom", anchor: .bottom) } }
            }
            .onAppear { proxy.scrollTo("bottom", anchor: .bottom) }
        }
    }
}

/// 2×2 dot grid that triggers the menu sheet. The trailing-comma-free
/// rounded init style avoids the parser gotcha.
struct DotGrid: View {
    var body: some View {
        Grid(horizontalSpacing: 4, verticalSpacing: 4) {
            GridRow {
                Circle().frame(width: 6, height: 6)
                Circle().frame(width: 6, height: 6)
            }
            GridRow {
                Circle().frame(width: 6, height: 6)
                Circle().frame(width: 6, height: 6)
            }
        }
    }
}

private struct BannerView: View {
    let text: String
    var body: some View {
        Text(text)
            .font(BoopFont.meta)
            .foregroundStyle(BoopColor.error)
            .padding(.horizontal, BoopSpacing.edge).padding(.vertical, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(BoopColor.error.opacity(0.10))
    }
}
