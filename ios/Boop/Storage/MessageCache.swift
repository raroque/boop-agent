import Foundation

/// Disk-backed cache for chat messages + the threads list. Owns the
/// filesystem layout under `Caches/`. Writes are debounced (500ms)
/// and use atomic replacement (`*.tmp` + replaceItem) to avoid torn
/// files when iOS suspends mid-write.
///
/// Design: one shared debounce timer for all threads, but the
/// latest payload per thread is held in `pendingPayloads`. Each
/// scheduleWrite refreshes the timer and overwrites the payload.
/// When the timer fires (or `flushAll` is called) every pending
/// payload writes. This means `flushAll` from
/// `scenePhase = .background` ACTUALLY persists what was pending —
/// the simpler "cancel the task" design we considered loses the
/// payload along with the timer.
///
/// All public methods are async so callers can `await` from any
/// context. The cache itself is a singleton.
actor MessageCache {
    static let shared = MessageCache()

    private let fm = FileManager.default
    private let threadsDir: URL
    private let threadsListURL: URL
    private var pendingPayloads: [String: CachedThread] = [:]
    private var pendingThreadsList: CachedThreadsList?
    private var debounceTask: Task<Void, Never>?
    private let debounceNanos: UInt64 = 500_000_000  // 500ms

    private init() {
        let caches = fm.urls(for: .cachesDirectory, in: .userDomainMask).first!
        self.threadsDir = caches.appendingPathComponent("threads", isDirectory: true)
        self.threadsListURL = caches.appendingPathComponent("threads-list.json")
        try? fm.createDirectory(at: threadsDir, withIntermediateDirectories: true)
    }

    // MARK: - Per-thread

    func readThread(_ threadId: String) async -> CachedThread? {
        let url = fileURL(for: threadId)
        guard let data = try? Data(contentsOf: url) else { return nil }
        guard let decoded = try? JSONDecoder().decode(CachedThread.self, from: data) else {
            return nil  // corrupt → caller treats as miss
        }
        guard decoded.schemaVersion == CacheSchema.currentVersion else {
            return nil  // forward/backward incompat → caller treats as miss
        }
        return decoded
    }

    /// Schedules a debounced write. The latest payload per thread
    /// wins; subsequent calls within the 500ms window coalesce into a
    /// single disk write. The global debounce timer resets on every
    /// call.
    func scheduleWrite(_ payload: CachedThread) {
        pendingPayloads[payload.threadId] = payload
        debounceTask?.cancel()
        let nanos = debounceNanos
        debounceTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: nanos)
            if Task.isCancelled { return }
            await self?.flushAll()
        }
    }

    /// Force-flush every pending write. Synchronous on disk. Use
    /// from `scenePhase = .background` so anything pending lands
    /// before iOS suspends us.
    func flushAll() async {
        debounceTask?.cancel()
        debounceTask = nil
        let toWrite = pendingPayloads
        pendingPayloads.removeAll()
        for (_, payload) in toWrite {
            writeNow(payload)
        }
        if let listPayload = pendingThreadsList {
            pendingThreadsList = nil
            writeThreadsListNow(listPayload)
        }
    }

    private func writeNow(_ payload: CachedThread) {
        let url = fileURL(for: payload.threadId)
        let tmp = url.appendingPathExtension("tmp")
        guard let data = try? JSONEncoder().encode(payload) else { return }
        do {
            try data.write(to: tmp, options: .atomic)
            _ = try fm.replaceItemAt(url, withItemAt: tmp)
        } catch {
            print("[MessageCache] writeNow(\(payload.threadId)) failed: \(error.localizedDescription)")
            // Best-effort. Server is SoT; next mutation will retry.
            try? fm.removeItem(at: tmp)
        }
    }

    // MARK: - Threads list

    func readThreadsList() async -> CachedThreadsList? {
        guard let data = try? Data(contentsOf: threadsListURL) else { return nil }
        guard let decoded = try? JSONDecoder().decode(CachedThreadsList.self, from: data) else {
            return nil
        }
        guard decoded.schemaVersion == CacheSchema.currentVersion else { return nil }
        return decoded
    }

    /// Schedules a debounced write of the threads list. Subsequent
    /// calls within the 500ms window coalesce into one disk write,
    /// matching the per-thread `scheduleWrite` behaviour. Called from
    /// `ThreadsStore` on every list mutation including fanout-driven
    /// ones that can fire many times per second.
    func scheduleWriteThreadsList(_ payload: CachedThreadsList) {
        pendingThreadsList = payload
        debounceTask?.cancel()
        let nanos = debounceNanos
        debounceTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: nanos)
            if Task.isCancelled { return }
            await self?.flushAll()
        }
    }

    private func writeThreadsListNow(_ payload: CachedThreadsList) {
        let tmp = threadsListURL.appendingPathExtension("tmp")
        guard let data = try? JSONEncoder().encode(payload) else { return }
        do {
            try data.write(to: tmp, options: .atomic)
            _ = try fm.replaceItemAt(threadsListURL, withItemAt: tmp)
        } catch {
            print("[MessageCache] writeThreadsList failed: \(error.localizedDescription)")
            try? fm.removeItem(at: tmp)
        }
    }

    // MARK: - Purge

    /// Wipes the entire cache. Call on unpair so the next pair starts
    /// clean.
    func purgeAll() async {
        debounceTask?.cancel()
        debounceTask = nil
        pendingPayloads.removeAll()
        pendingThreadsList = nil
        try? fm.removeItem(at: threadsDir)
        try? fm.removeItem(at: threadsListURL)
        try? fm.createDirectory(at: threadsDir, withIntermediateDirectories: true)
    }

    /// Purges a single thread's cache. Used when archive/delete makes
    /// the local file pointless (optional — server is SoT, leaving it
    /// is fine, but cleanup keeps Caches/ tidy).
    func purgeThread(_ threadId: String) async {
        pendingPayloads[threadId] = nil
        try? fm.removeItem(at: fileURL(for: threadId))
    }

    private func fileURL(for threadId: String) -> URL {
        threadsDir.appendingPathComponent("\(threadId).json")
    }
}
