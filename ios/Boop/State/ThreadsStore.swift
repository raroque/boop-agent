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
    private var fanoutTask: Task<Void, Never>?

    init(settings: AppSettings) {
        self.settings = settings
    }

    func bind(bearer: String) {
        self.bearer = bearer
        startFanout()
    }

    /// Loads the open threads list from disk and paints the dock bar
    /// instantly. Safe to call before the bearer is set — paints local
    /// UI only, doesn't touch the network. `loadThreads()` should fire
    /// right after to refresh + write the cache back.
    func hydrateFromCache() async {
        guard let cached = await MessageCache.shared.readThreadsList() else { return }
        self.threads = cached.open.map { $0.toThread() }
        if let active = cached.activeThreadId,
           threads.contains(where: { $0.id == active }) {
            self.activeThreadId = active
        } else {
            self.activeThreadId = threads.first?.id
        }
    }

    /// Persists the current open list + active thread id to disk.
    /// Fire-and-forget. The archived list is intentionally empty in
    /// the cache for now; archived browsing always hits the server.
    private func writeListCache() async {
        let payload = CachedThreadsList(
            schemaVersion: CacheSchema.currentVersion,
            lastSyncedAt: Date().timeIntervalSince1970 * 1000,
            open: threads.map { $0.toCachedRow() },
            archived: [],
            activeThreadId: activeThreadId
        )
        await MessageCache.shared.scheduleWriteThreadsList(payload)
    }

    func unbind() {
        fanoutTask?.cancel()
        fanoutTask = nil
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
            // Honor any pending notification deep-link before falling
            // back to "first thread wins". If the linked thread isn't in
            // the open set anymore (e.g. it was archived since the push
            // landed), we silently ignore it and let the default kick in.
            if let pending = settings.pendingDeepLinkThreadId,
               mapped.contains(where: { $0.id == pending }) {
                activeThreadId = pending
                settings.pendingDeepLinkThreadId = nil
                if let idx = threads.firstIndex(where: { $0.id == pending }) {
                    threads[idx].unread = false
                }
            } else if activeThreadId == nil || !mapped.contains(where: { $0.id == activeThreadId }) {
                activeThreadId = mapped.first?.id
                settings.pendingDeepLinkThreadId = nil
            }
            Task { await writeListCache() }
        } catch {
            loadError = "Couldn't load threads: \(error.localizedDescription)"
        }
    }

    func selectThread(_ id: String) {
        activeThreadId = id
        if let idx = threads.firstIndex(where: { $0.id == id }) {
            threads[idx].unread = false
        }
        Task { await writeListCache() }
    }

    func createNewThread() async {
        guard let bearer, let baseURL = settings.serverBaseURL else { return }
        guard threads.count < 4 else { return }
        let client = BoopClient(baseURL: baseURL, bearer: bearer)
        do {
            let created = try await client.createThread()
            await loadThreads()
            activeThreadId = created.threadId
            Task { await writeListCache() }
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
        Task { await writeListCache() }
    }

    func applyIconUpdate(threadId: String, icon: String) {
        guard let idx = threads.firstIndex(where: { $0.id == threadId }) else { return }
        threads[idx].icon = icon
        Task { await writeListCache() }
    }

    // MARK: - Fanout (device-wide unread badge SSE)

    /// Opens (or re-opens) the device-wide `/channels/ios/fanout` SSE so
    /// inactive threads can light up an unread dot when a message lands
    /// on them. Reconnects with exponential backoff up to 30s — matches
    /// the per-thread `ChatStore` policy.
    private func startFanout() {
        fanoutTask?.cancel()
        guard let bearer, let baseURL = settings.serverBaseURL else { return }
        let bearerCopy = bearer
        fanoutTask = Task { [weak self] in
            var backoff: UInt64 = 1_000_000_000
            while !Task.isCancelled {
                let stream = FanoutConnection(baseURL: baseURL, bearer: bearerCopy).subscribe()
                backoff = 1_000_000_000
                for await event in stream {
                    if Task.isCancelled { return }
                    await MainActor.run { self?.applyActivity(event) }
                }
                if Task.isCancelled { return }
                try? await Task.sleep(nanoseconds: backoff)
                backoff = min(backoff * 2, 30_000_000_000)
            }
        }
    }

    private func applyActivity(_ event: ThreadActivity) {
        switch event {
        case .message(let threadId):
            noteIncomingMessage(threadId: threadId)
        case .icon(let threadId, let icon):
            applyIconUpdate(threadId: threadId, icon: icon)
        }
    }

    /// Permanently deletes a thread (archived or open). Only used from
    /// the ArchivedScreen today — the open-thread bar archives instead
    /// of deletes, so the user has a chance to recover. Surfaces any
    /// failure on `loadError`. Idempotent server-side, so racing two
    /// deletes is fine.
    func deleteThread(_ id: String) async -> Bool {
        guard let bearer, let baseURL = settings.serverBaseURL else { return false }
        let client = BoopClient(baseURL: baseURL, bearer: bearer)
        do {
            try await client.deleteThread(threadId: id)
        } catch {
            loadError = "Couldn't delete: \(error.localizedDescription)"
            return false
        }
        // Open list usually doesn't contain archived threads, but if
        // someone calls this on an open one, drop it locally too.
        if let _ = threads.firstIndex(where: { $0.id == id }) {
            let wasActive = (activeThreadId == id)
            threads.removeAll { $0.id == id }
            if wasActive {
                activeThreadId = threads.first?.id
                if activeThreadId == nil { await createNewThread() }
            }
        }
        Task { await writeListCache() }
        return true
    }

    /// Restores a previously-archived thread and makes it active.
    /// Surfaces `loadError` on 4-open conflict.
    func unarchiveThread(_ id: String) async {
        guard let bearer, let baseURL = settings.serverBaseURL else { return }
        let client = BoopClient(baseURL: baseURL, bearer: bearer)
        do {
            try await client.unarchiveThread(threadId: id)
        } catch BoopClient.ClientError.http(409, _) {
            loadError = "Archive one open thread first — only 4 can be open at a time."
            return
        } catch {
            loadError = "Couldn't restore: \(error.localizedDescription)"
            return
        }
        await loadThreads()
        activeThreadId = id
        Task { await writeListCache() }
    }

    /// Archives a thread on the server, drops it from the local list, and
    /// picks a sensible next-active. If this was the last open thread,
    /// transparently creates a new one so chat is always usable.
    func archiveThread(_ id: String) async {
        guard let bearer, let baseURL = settings.serverBaseURL else { return }
        let client = BoopClient(baseURL: baseURL, bearer: bearer)
        do {
            try await client.archiveThread(threadId: id)
        } catch {
            loadError = "Couldn't archive: \(error.localizedDescription)"
            return
        }

        let wasActive = (activeThreadId == id)
        threads.removeAll { $0.id == id }

        if wasActive {
            if let next = threads.first {
                activeThreadId = next.id
            } else {
                activeThreadId = nil
                await createNewThread()
            }
        }
        Task { await writeListCache() }
    }
}
