import Foundation
import Observation

/// Single source of truth for the chat screen — messages, streaming
/// state, connection state. Keyed off an active threadId set via
/// switchTo(threadId:). Owns the SSE subscription task and the HTTP
/// client. Reconnects on stream drop with exponential backoff.
@MainActor
@Observable
final class ChatStore {
    /// Per-thread message buffers. The view layer reads `messages`
    /// (computed below) which projects the active thread's array.
    /// Switching threads is now a pointer swap, not a wipe.
    private(set) var perThread: [String: [Message]] = [:]

    var messages: [Message] {
        get { threadId.flatMap { perThread[$0] } ?? [] }
    }
    private(set) var connectionState: ConnectionState = .idle
    private(set) var sendError: String?
    /// True from the moment the user taps send until the first reply
    /// fragment (delta/ack/message/error) arrives. Drives the typing
    /// bubble in the UI so the user doesn't stare at empty space while
    /// the dispatcher is thinking.
    private(set) var isAwaitingReply: Bool = false
    /// Picked attachments staged in the composer. UI-only state — the
    /// upload + /inbound extension is deferred. When the user taps Send
    /// with chips present, they get cleared + a "coming soon" toast.
    /// See spec §3.5.3.
    private(set) var attachmentChips: [DraftAttachment] = []

    enum ConnectionState: Equatable {
        case idle
        case connecting
        case connected
        case disconnected(String?)
    }

    /// Forwarded when the dispatcher's `set_thread_icon` tool fires. The
    /// listener (ThreadsStore via RootView) applies the icon to the
    /// matching thread so the dock tab updates the moment the agent
    /// picks one.
    var onThreadIcon: ((_ threadId: String, _ icon: String) -> Void)?

    /// Forwarded for `agent_spawned` / `agent_tool` / `agent_done` SSE
    /// events. RootView wires this to `AgentsStore.applyEvent(_:)` so the
    /// chat pill and Live Agents sheet update in real time.
    var onAgentEvent: ((StreamEvent) -> Void)?

    private let settings: AppSettings
    private var bearer: String?
    private var threadId: String?
    private var streamTask: Task<Void, Never>?
    private var streamingMessageId: String?

    init(settings: AppSettings) { self.settings = settings }

    func addChip(_ chip: DraftAttachment) {
        attachmentChips.append(chip)
    }

    func removeChip(id: UUID) {
        attachmentChips.removeAll { $0.id == id }
    }

    func clearChips() {
        attachmentChips.removeAll()
    }

    var isReady: Bool { bearer != nil }

    func bind(bearer: String) { self.bearer = bearer }

    func unbind() {
        streamTask?.cancel()
        streamTask = nil
        bearer = nil
        threadId = nil
        perThread.removeAll()
        connectionState = .idle
        sendError = nil
        streamingMessageId = nil
        isAwaitingReply = false
        attachmentChips.removeAll()
    }

    /// Switch the active thread. Reads cache for instant paint, then
    /// fires a background server refresh that merges by message id.
    /// Idempotent on same-thread tap (no-op).
    func switchTo(threadId: String) async {
        guard threadId != self.threadId else { return }
        streamTask?.cancel()
        streamTask = nil
        self.threadId = threadId
        streamingMessageId = nil

        // Cache-first paint: if we already have it in memory, nothing
        // to do. Otherwise hydrate from disk so the chat shows
        // immediately. The await releases the main actor — if the user
        // taps a third thread before we resume, `self.threadId` won't
        // match `threadId` anymore. Bail in that case; the newer call
        // handles its own hydration.
        if perThread[threadId] == nil {
            let cached = await MessageCache.shared.readThread(threadId)
            guard self.threadId == threadId else { return }
            perThread[threadId] = cached?.messages.map { $0.toMessage() } ?? []
        }

        // Background sync — does NOT block the UI. SSE picks up the
        // stream in parallel.
        Task { await refreshFromServer(threadId: threadId) }
        startStreaming()
    }

    /// Background sync: fetch the latest 50 messages and merge into
    /// the cache by Convex `_id`. Falls back to a content+timestamp
    /// match for any leftover `local-…` optimistic ids (defense in
    /// depth — Task 4 already stamps them at send-time).
    private func refreshFromServer(threadId: String) async {
        guard let bearer, let baseURL = settings.serverBaseURL else { return }
        let client = BoopClient(baseURL: baseURL, bearer: bearer)
        let response: MessagesResponse
        do {
            response = try await client.fetchMessages(threadId: threadId, limit: 50)
        } catch {
            // Cache stays as-is; SSE will keep painting new ones.
            return
        }

        let server = response.messages
            .reversed()
            .map { $0.toMessage(defaultThreadId: threadId) }
        let merged = mergeMessages(local: perThread[threadId] ?? [], server: server)
        perThread[threadId] = merged

        // Schedule a debounced cache write — fire and forget.
        Task { await writeCacheForThread(threadId) }
    }

    /// Merge server-fetched messages into the local buffer.
    /// 1. For each server message: if local has the id, replace.
    ///    Else if local has a `local-…` user message with the same
    ///    content within ±5s, replace its id with the server one.
    ///    Else insert sorted by createdAt.
    /// 2. Cap at 200; drop oldest by createdAt if over.
    private func mergeMessages(local: [Message], server: [Message]) -> [Message] {
        var out = local
        for s in server {
            // (a) Exact id match — replace in place, but preserve any
            // SSE-injected attachments the server's /messages row may
            // not have committed yet (attachments arrive on a separate
            // post-turn side-channel; refresh races the persist).
            if let idx = out.firstIndex(where: { $0.id == s.id }) {
                var merged = s
                let serverIds = Set(s.attachments.map { $0.id })
                let extra = out[idx].attachments.filter { !serverIds.contains($0.id) }
                merged.attachments = s.attachments + extra
                out[idx] = merged
                continue
            }
            // (b) Heuristic: local-prefixed user message with same content
            // and a ±5s timestamp window. Reconciles any unstamped optimistic
            // sends (e.g. when /inbound failed before stamping).
            if s.role == .user,
               let idx = out.firstIndex(where: { m in
                   m.id.hasPrefix("local-")
                       && m.role == .user
                       && m.content == s.content
                       && abs(m.createdAt.timeIntervalSince(s.createdAt)) < 5
               }) {
                out[idx] = s
                continue
            }
            // (c) Insert sorted by createdAt.
            let insertion = out.firstIndex(where: { $0.createdAt > s.createdAt }) ?? out.count
            out.insert(s, at: insertion)
        }
        // (d) Cap at 200 by dropping oldest.
        if out.count > 200 {
            out.sort { $0.createdAt < $1.createdAt }
            out = Array(out.suffix(200))
        }
        return out
    }

    private func writeCacheForThread(_ threadId: String) async {
        // Filter out client-synthetic ids — only canonical Convex ids
        // (or the `local-<uuid>` optimistic-send ids, which the merge
        // heuristic can later reconcile) belong on disk. `stream-`,
        // `ack-`, and `final-` ids are runtime-only — they'd cause
        // duplicate inserts or frozen-bubble rendering on cold launch.
        let msgs = (perThread[threadId] ?? []).filter {
            !$0.id.hasPrefix("stream-")
                && !$0.id.hasPrefix("ack-")
                && !$0.id.hasPrefix("final-")
        }
        let payload = CachedThread(
            schemaVersion: CacheSchema.currentVersion,
            threadId: threadId,
            lastSyncedAt: Date().timeIntervalSince1970 * 1000,
            messages: msgs.map { $0.toCached() }
        )
        await MessageCache.shared.scheduleWrite(payload)
    }

    func startStreaming() {
        streamTask?.cancel()
        guard let bearer, let baseURL = settings.serverBaseURL, let threadId else { return }
        let bearerCopy = bearer
        let threadIdCopy = threadId
        connectionState = .connecting
        streamTask = Task { [weak self] in
            await self?.streamLoop(baseURL: baseURL, bearer: bearerCopy, threadId: threadIdCopy)
        }
    }

    private func streamLoop(baseURL: URL, bearer: String, threadId: String) async {
        var backoff: UInt64 = 1_000_000_000 // 1s
        while !Task.isCancelled {
            connectionState = .connecting
            let stream = SSEConnection(baseURL: baseURL, bearer: bearer, threadId: threadId).subscribe()
            connectionState = .connected
            backoff = 1_000_000_000 // reset on successful connect

            for await event in stream {
                if Task.isCancelled { return }
                handle(event: event)
            }

            if Task.isCancelled { return }
            connectionState = .disconnected("reconnecting…")
            try? await Task.sleep(nanoseconds: backoff)
            backoff = min(backoff * 2, 30_000_000_000) // cap at 30s
        }
    }

    private func handle(event: StreamEvent) {
        let expected = "ios:\(settings.deviceId):\(threadId ?? "")"
        guard event.conversationId == expected else { return }

        // Metadata-only events (thread_icon, assistant_attachments, agent_*)
        // don't represent the dispatcher producing user-facing text, so they
        // shouldn't clear the typing bubble or be treated as the
        // assistant's primary signal of life.
        switch event {
        case .threadIcon, .attachments, .agentSpawned, .agentTool, .agentDone:
            break
        default:
            isAwaitingReply = false
        }

        switch event {
        case .delta(_, let text, _):
            appendDelta(text)
        case .message(_, let content):
            finalizeMessage(content)
        case .ack(_, let content):
            appendAck(content)
        case .error(_, _, let message):
            sendError = message
        case .thinking:
            break // signal of life handled above; visual indicator not needed yet
        case .threadIcon(_, let threadId, let icon):
            onThreadIcon?(threadId, icon)
        case .attachments(_, let attachments):
            attachToLatestAssistant(attachments)
        case .agentSpawned, .agentTool, .agentDone:
            onAgentEvent?(event)
        }

        // After applying the event, schedule a cache write for the
        // active thread. Metadata-only events (thread_icon, agent_*)
        // don't change `messages` so don't bother.
        switch event {
        case .delta, .message, .ack, .attachments:
            if let tid = threadId { Task { await writeCacheForThread(tid) } }
        default:
            break
        }
    }

    /// Merge attachments onto the most recent assistant message. The server
    /// emits `assistant_attachments` AFTER `assistant_message`, so the
    /// finalize path has already run and the message exists.
    private func attachToLatestAssistant(_ attachments: [Attachment]) {
        mutateActive { msgs in
            guard let idx = msgs.lastIndex(where: { $0.role == .assistant }) else { return }
            var current = msgs[idx].attachments
            // Dedup by attachment id (storage id + kind) — defends against the
            // server replaying or the SSE socket reconnecting and replaying.
            for a in attachments where !current.contains(where: { $0.id == a.id }) {
                current.append(a)
            }
            msgs[idx].attachments = current
        }
    }

    private func appendDelta(_ chunk: String) {
        guard let threadId else { return }
        mutateActive { msgs in
            if let id = streamingMessageId, let idx = msgs.firstIndex(where: { $0.id == id }) {
                msgs[idx].content.append(chunk)
            } else {
                let id = "stream-\(UUID().uuidString)"
                streamingMessageId = id
                msgs.append(Message(id: id, threadId: threadId, role: .assistant,
                                    content: chunk, createdAt: Date(), isStreaming: true))
            }
        }
    }

    private func finalizeMessage(_ content: String) {
        guard let threadId else { return }
        mutateActive { msgs in
            if let id = streamingMessageId, let idx = msgs.firstIndex(where: { $0.id == id }) {
                msgs[idx].content = content
                msgs[idx].isStreaming = false
                streamingMessageId = nil
                return
            }
            // Unsolicited (proactive nudges, automation results) — append fresh.
            msgs.append(Message(id: "final-\(UUID().uuidString)", threadId: threadId, role: .assistant,
                                content: content, createdAt: Date()))
        }
    }

    private func appendAck(_ content: String) {
        guard let threadId else { return }
        mutateActive { msgs in
            msgs.append(Message(id: "ack-\(UUID().uuidString)", threadId: threadId, role: .assistant,
                                content: content, createdAt: Date()))
        }
    }

    func send(_ text: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)

        // Send-with-chips stub: chips present → clear them and surface
        // a transient toast. Text (if any) still sends normally below.
        if !attachmentChips.isEmpty {
            attachmentChips.removeAll()
            sendError = "Attachments coming soon"
            // Clear the toast after a short delay so it reads as transient.
            let toastText = sendError
            Task { [weak self] in
                try? await Task.sleep(nanoseconds: 2_500_000_000)
                guard let self else { return }
                if self.sendError == toastText { self.sendError = nil }
            }
        }

        guard !trimmed.isEmpty, let bearer, let baseURL = settings.serverBaseURL, let threadId else { return }

        // Only clear the error banner if it's NOT the "coming soon" toast
        // we just set above — we want that to stay visible for ~2.5s.
        if sendError != "Attachments coming soon" {
            sendError = nil
        }
        isAwaitingReply = true

        let localId = "local-\(UUID().uuidString)"
        appendActive(Message(id: localId, threadId: threadId, role: .user,
                             content: trimmed, createdAt: Date()))

        let client = BoopClient(baseURL: baseURL, bearer: bearer)
        do {
            let response = try await client.sendInbound(text: trimmed, threadId: threadId)
            if let serverId = response.userMessageId {
                // Target the originating thread by id, NOT the active
                // thread — user may have switched threads during the await.
                var buf = perThread[threadId] ?? []
                if let idx = buf.firstIndex(where: { $0.id == localId }) {
                    buf[idx].id = serverId
                    perThread[threadId] = buf
                }
            }
        } catch {
            sendError = "Send failed: \(error.localizedDescription)"
            isAwaitingReply = false
        }
    }

    // MARK: - Per-thread mutation helpers

    private func mutateActive(_ block: (inout [Message]) -> Void) {
        guard let tid = threadId else { return }
        var buf = perThread[tid] ?? []
        block(&buf)
        perThread[tid] = buf
    }

    private func appendActive(_ message: Message) {
        mutateActive { $0.append(message) }
    }
}
