import SwiftUI
import UIKit

struct ChatView: View {
    @Binding var showMenu: Bool
    var onOpenAgent: (String?) -> Void = { _ in }

    @Environment(ChatStore.self) private var chat
    @Environment(ThreadsStore.self) private var threads
    @Environment(AgentsStore.self) private var agentsStore
    @State private var draft: String = ""

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
        // Tap anywhere outside an interactive element (Dock buttons, the
        // composer field, menu button) → resign first responder so the
        // keyboard goes away. Buttons + TextField have higher gesture
        // priority, so they keep working normally.
        .onTapGesture { Self.hideKeyboard() }
    }

    private static func hideKeyboard() {
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder),
            to: nil, from: nil, for: nil,
        )
    }

    private var header: some View {
        HStack {
            AnimatedGIFView(name: "boop")
                .frame(width: 47, height: 47)
                .accessibilityLabel("Boop")
                .accessibilityAddTraits(.isHeader)
            Spacer()
            Button(action: { showMenu = true }) {
                DotGrid().foregroundStyle(BoopColor.textPrimary).frame(width: 32, height: 32)
            }
            .accessibilityLabel("Menu")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 6)
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
                    ForEach(agentsStore.activeAgents) { agent in
                        SubAgentPill(
                            agentName: agent.name,
                            toolCount: agentsStore.toolCounts[agent.agentId] ?? 0,
                            onTap: { onOpenAgent(agent.agentId) }
                        )
                        .id("agent-\(agent.agentId)")
                    }
                    Color.clear.frame(height: 1).id("bottom")
                }
                .padding(.horizontal, 14).padding(.top, 12)
                .padding(.bottom, 150)
                .animation(.easeInOut(duration: 0.18), value: chat.isAwaitingReply)
                .animation(.easeInOut(duration: 0.18), value: agentsStore.activeAgents.count)
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
            .onChange(of: agentsStore.activeAgents.count) { _, newCount in
                if newCount > 0 { withAnimation { proxy.scrollTo("bottom", anchor: .bottom) } }
            }
            .onAppear { proxy.scrollTo("bottom", anchor: .bottom) }
            // Drag the chat list down to interactively fade out the
            // keyboard — iOS-native pattern, matches Messages / Mail.
            .scrollDismissesKeyboard(.interactively)
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
