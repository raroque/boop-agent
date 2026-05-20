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
    }

    /// Switch the active thread. Cancels the current stream, clears
    /// messages, fetches history for the new thread, restarts the stream.
    func switchTo(threadId: String) async {
        guard threadId != self.threadId else { return }
        streamTask?.cancel()
        streamTask = nil
        self.threadId = threadId
        streamingMessageId = nil
        await loadHistory()
        startStreaming()
    }

    func loadHistory() async {
        guard let bearer, let baseURL = settings.serverBaseURL, let threadId else { return }
        let client = BoopClient(baseURL: baseURL, bearer: bearer)
        do {
            let response = try await client.fetchMessages(threadId: threadId, limit: 50)
            let mapped = response.messages
                .reversed()
                .map { $0.toMessage(defaultThreadId: threadId) }
            perThread[threadId] = mapped
        } catch {
            sendError = "Couldn't load history: \(error.localizedDescription)"
        }
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
    }

    /// Merge attachments onto the most recent assistant message. The server
    /// emits `assistant_attachments` AFTER `assistant_message`, so the
    /// finalize path has already run and the message exists.
    private func attachToLatestAssistant(_ attachments: [Attachment]) {
        mutateActive { msgs in
            guard let idx = msgs.lastIndex(where: { $0.role == .assistant }) else { return }
            var current = msgs[idx].attachments
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
        guard !trimmed.isEmpty, let bearer, let baseURL = settings.serverBaseURL, let threadId else { return }

        // Optimistic: clear any stale error banner the moment a send starts.
        sendError = nil
        isAwaitingReply = true

        let localId = "local-\(UUID().uuidString)"
        appendActive(Message(id: localId, threadId: threadId, role: .user,
                             content: trimmed, createdAt: Date()))

        let client = BoopClient(baseURL: baseURL, bearer: bearer)
        do {
            let response = try await client.sendInbound(text: trimmed, threadId: threadId)
            // Replace the optimistic local id with the canonical Convex id.
            // This keeps merge-by-id trivial during background sync.
            if let serverId = response.userMessageId {
                mutateActive { msgs in
                    if let idx = msgs.firstIndex(where: { $0.id == localId }) {
                        msgs[idx].id = serverId
                    }
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
