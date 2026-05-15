import Foundation
import Observation

/// Single source of truth for the list of open threads on this device.
/// One per app session; loads on bind, refreshes after thread events.
@MainActor
@Observable
final class ThreadsStore {
    private(set) var threads: [BoopThread] = []
    private(set) var activeThreadId: String?
    private(set) var loadError: String?

    private let settings: AppSettings
    private var bearer: String?

    init(settings: AppSettings) {
        self.settings = settings
    }

    func bind(bearer: String) {
        self.bearer = bearer
    }

    func unbind() {
        bearer = nil
        threads.removeAll()
        activeThreadId = nil
        loadError = nil
    }

    func loadThreads() async {
        guard let bearer, let baseURL = settings.serverBaseURL else { return }
        let client = BoopClient(baseURL: baseURL, bearer: bearer)
        do {
            let response = try await client.listThreads()
            let mapped = response.threads.map { $0.toThread() }
            self.threads = mapped
            if activeThreadId == nil || !mapped.contains(where: { $0.id == activeThreadId }) {
                activeThreadId = mapped.first?.id
            }
        } catch {
            loadError = "Couldn't load threads: \(error.localizedDescription)"
        }
    }

    func selectThread(_ id: String) {
        activeThreadId = id
        if let idx = threads.firstIndex(where: { $0.id == id }) {
            threads[idx].unread = false
        }
    }

    func createNewThread() async {
        guard let bearer, let baseURL = settings.serverBaseURL else { return }
        guard threads.count < 4 else { return }
        let client = BoopClient(baseURL: baseURL, bearer: bearer)
        do {
            let created = try await client.createThread()
            await loadThreads()
            activeThreadId = created.threadId
        } catch {
            loadError = "Couldn't create thread: \(error.localizedDescription)"
        }
    }

    /// Called when an SSE event for some thread arrives. Updates the local
    /// thread's lastMessageAt and unread flag if it's not the active thread.
    func noteIncomingMessage(threadId: String) {
        guard let idx = threads.firstIndex(where: { $0.id == threadId }) else { return }
        threads[idx].lastMessageAt = Date()
        if threadId != activeThreadId {
            threads[idx].unread = true
        }
    }

    func applyIconUpdate(threadId: String, icon: String) {
        guard let idx = threads.firstIndex(where: { $0.id == threadId }) else { return }
        threads[idx].icon = icon
    }
}
