import SwiftUI

struct RootView: View {
    @Environment(AppSettings.self) private var settings
    @State private var pairing: PairingStore?
    @State private var chat: ChatStore?
    @State private var showSettings = false

    var body: some View {
        Group {
            if let pairing, let chat {
                switch pairing.phase {
                case .paired(let bearer):
                    ChatView(showSettings: $showSettings)
                        .task(id: bearer) {
                            chat.bind(bearer: bearer)
                            await chat.loadHistory()
                            chat.startStreaming()
                        }
                        .onChange(of: pairing.phase) { _, new in
                            if case .paired = new { return }
                            chat.unbind()
                        }
                        .environment(chat)
                default:
                    PairingView(showSettings: $showSettings)
                        .environment(pairing)
                }
            } else {
                ProgressView()
            }
        }
        .task {
            if pairing == nil { pairing = PairingStore(settings: settings) }
            if chat == nil { chat = ChatStore(settings: settings) }
        }
        .sheet(isPresented: $showSettings) {
            if let pairing {
                SettingsView(onUnpair: { pairing.reset() })
                    .environment(settings)
            }
        }
    }
}
