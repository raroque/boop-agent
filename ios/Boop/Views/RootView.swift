import SwiftUI

struct RootView: View {
    @Environment(AppSettings.self) private var settings
    @State private var pairing: PairingStore?
    @State private var chat: ChatStore?
    @State private var threadsStore: ThreadsStore?
    @State private var agentsStore: AgentsStore?
    @State private var showMenu = false
    @State private var showSettings = false
    @State private var showFiles = ProcessInfo.processInfo.arguments.contains("--open-files")
    @State private var showAgents = ProcessInfo.processInfo.arguments.contains("--open-agents")
    @State private var showArchived = ProcessInfo.processInfo.arguments.contains("--open-archived")
    /// When set, the Live Agents sheet opens scrolled to this agent.
    @State private var focusAgentId: String?

    var body: some View {
        Group {
            if let pairing, let chat, let threadsStore, let agentsStore {
                switch pairing.phase {
                case .paired(let bearer):
                    ChatView(showMenu: $showMenu, onOpenAgent: { agentId in
                        focusAgentId = agentId
                        showAgents = true
                    })
                        .task(id: bearer) {
                            threadsStore.bind(bearer: bearer)
                            chat.bind(bearer: bearer)
                            agentsStore.bind(bearer: bearer)
                            chat.onThreadIcon = { [weak threadsStore] threadId, icon in
                                threadsStore?.applyIconUpdate(threadId: threadId, icon: icon)
                            }
                            chat.onAgentEvent = { [weak agentsStore] event in
                                agentsStore?.applyEvent(event)
                            }
                            await threadsStore.loadThreads()
                            if threadsStore.activeThreadId == nil {
                                await threadsStore.createNewThread()
                            }
                            if let id = threadsStore.activeThreadId {
                                await chat.switchTo(threadId: id)
                                await agentsStore.switchTo(threadId: id)
                            }
                        }
                        .onChange(of: pairing.phase) { _, newPhase in
                            if case .paired = newPhase { return }
                            chat.unbind()
                            threadsStore.unbind()
                            agentsStore.unbind()
                        }
                        .onChange(of: threadsStore.activeThreadId) { _, newId in
                            guard let newId else { return }
                            Task {
                                await chat.switchTo(threadId: newId)
                                await agentsStore.switchTo(threadId: newId)
                            }
                        }
                        .environment(chat)
                        .environment(threadsStore)
                        .environment(agentsStore)
                default:
                    PairingView(showMenu: $showMenu)
                        .environment(pairing)
                }
            } else {
                ProgressView().tint(BoopColor.textSecondary)
            }
        }
        .task {
            if pairing == nil      { pairing = PairingStore(settings: settings) }
            if chat == nil         { chat    = ChatStore(settings: settings) }
            if threadsStore == nil { threadsStore = ThreadsStore(settings: settings) }
            if agentsStore == nil  { agentsStore = AgentsStore(settings: settings) }
        }
        .sheet(isPresented: $showMenu) {
            MenuSheet(
                onFiles:      { showFiles = true },
                onLiveAgents: { focusAgentId = nil; showAgents = true },
                onArchived:   { showArchived = true },
                onSettings:   { showSettings = true }
            )
        }
        .sheet(isPresented: $showSettings) {
            SettingsView(onUnpair: { pairing?.reset() }).environment(settings)
        }
        .sheet(isPresented: $showFiles) {
            if let pairing, case .paired(let bearer) = pairing.phase, let threadsStore {
                FilesScreen(bearer: bearer)
                    .environment(settings)
                    .environment(threadsStore)
                    .presentationDragIndicator(.hidden)
            }
        }
        .sheet(isPresented: $showAgents) {
            if let agentsStore, let threadsStore {
                AgentView(focusAgentId: focusAgentId)
                    .environment(agentsStore)
                    .environment(threadsStore)
                    .environment(settings)
                    .presentationDragIndicator(.hidden)
            }
        }
        .sheet(isPresented: $showArchived) {
            if let pairing, case .paired(let bearer) = pairing.phase, let threadsStore {
                ArchivedScreen(bearer: bearer)
                    .environment(settings)
                    .environment(threadsStore)
                    .presentationDragIndicator(.hidden)
            }
        }
    }
}
