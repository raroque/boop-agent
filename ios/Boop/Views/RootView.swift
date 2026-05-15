import SwiftUI

struct RootView: View {
    @Environment(AppSettings.self) private var settings
    @State private var pairing: PairingStore?
    @State private var chat: ChatStore?
    @State private var threadsStore: ThreadsStore?
    @State private var showMenu = false
    @State private var showSettings = false

    var body: some View {
        Group {
            if let pairing, let chat, let threadsStore {
                switch pairing.phase {
                case .paired(let bearer):
                    ChatView(showMenu: $showMenu)
                        .task(id: bearer) {
                            threadsStore.bind(bearer: bearer)
                            chat.bind(bearer: bearer)
                            await threadsStore.loadThreads()
                            if threadsStore.activeThreadId == nil {
                                // No threads yet — create the first one for this device.
                                await threadsStore.createNewThread()
                            }
                            if let id = threadsStore.activeThreadId {
                                await chat.switchTo(threadId: id)
                            }
                        }
                        .onChange(of: pairing.phase) { _, newPhase in
                            if case .paired = newPhase { return }
                            chat.unbind()
                            threadsStore.unbind()
                        }
                        .onChange(of: threadsStore.activeThreadId) { _, newId in
                            guard let newId else { return }
                            Task { await chat.switchTo(threadId: newId) }
                        }
                        .environment(chat)
                        .environment(threadsStore)
                default:
                    PairingView(showMenu: $showMenu)
                        .environment(pairing)
                }
            } else {
                ProgressView().tint(BoopColor.textSecondary)
            }
        }
        .task {
            if pairing == nil { pairing = PairingStore(settings: settings) }
            if chat == nil    { chat    = ChatStore(settings: settings) }
            if threadsStore == nil { threadsStore = ThreadsStore(settings: settings) }
        }
        .sheet(isPresented: $showMenu) {
            MenuSheet(
                onFiles:      { /* Plan B */ },
                onLiveAgents: { /* Plan B */ },
                onArchived:   { /* Plan B */ },
                onSettings:   { showSettings = true }
            )
        }
        .sheet(isPresented: $showSettings) {
            SettingsView(onUnpair: { pairing?.reset() }).environment(settings)
        }
    }
}
