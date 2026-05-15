import Foundation
import Observation

/// Single source of truth for the chat screen — messages, streaming
/// state, connection state. Owns the SSE subscription task and the
/// HTTP client. Reconnects on stream drop with exponential backoff.
@MainActor
@Observable
final class ChatStore {
    private(set) var messages: [Message] = []
    private(set) var connectionState: ConnectionState = .idle
    private(set) var sendError: String?

    enum ConnectionState: Equatable {
        case idle
        case connecting
        case connected
        case disconnected(String?)
    }

    private let settings: AppSettings
    private var bearer: String?
    private var streamTask: Task<Void, Never>?
    private var streamingMessageId: String?

    init(settings: AppSettings) {
        self.settings = settings
    }

    var isReady: Bool { bearer != nil }

    func bind(bearer: String) {
        self.bearer = bearer
    }

    func unbind() {
        streamTask?.cancel()
        streamTask = nil
        bearer = nil
        messages.removeAll()
        connectionState = .idle
        sendError = nil
        streamingMessageId = nil
    }

    func loadHistory() async {
        guard let bearer, let baseURL = settings.serverBaseURL else { return }
        let client = BoopClient(baseURL: baseURL, bearer: bearer)
        do {
            let response = try await client.fetchMessages(limit: 50)
            // Server returns newest-first; flip for chronological display.
            messages = response.messages
                .reversed()
                .map { $0.toMessage() }
        } catch {
            sendError = "Couldn't load history: \(error.localizedDescription)"
        }
    }

    func startStreaming() {
        streamTask?.cancel()
        guard let bearer, let baseURL = settings.serverBaseURL else { return }
        let bearerCopy = bearer
        connectionState = .connecting
        streamTask = Task { [weak self] in
            await self?.streamLoop(baseURL: baseURL, bearer: bearerCopy)
        }
    }

    private func streamLoop(baseURL: URL, bearer: String) async {
        var backoff: UInt64 = 1_000_000_000 // 1s
        while !Task.isCancelled {
            connectionState = .connecting
            let stream = SSEConnection(baseURL: baseURL, bearer: bearer).subscribe()
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
        let expected = "ios:\(settings.deviceId)"
        guard event.conversationId == expected else { return }

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
            break // surface later if we add a "thinking" indicator
        }
    }

    private func appendDelta(_ chunk: String) {
        if let id = streamingMessageId, let idx = messages.firstIndex(where: { $0.id == id }) {
            messages[idx].content.append(chunk)
        } else {
            let id = "stream-\(UUID().uuidString)"
            streamingMessageId = id
            messages.append(
                Message(
                    id: id,
                    role: .assistant,
                    content: chunk,
                    createdAt: Date(),
                    isStreaming: true,
                ),
            )
        }
    }

    private func finalizeMessage(_ content: String) {
        if let id = streamingMessageId, let idx = messages.firstIndex(where: { $0.id == id }) {
            messages[idx].content = content
            messages[idx].isStreaming = false
            streamingMessageId = nil
            return
        }
        // Unsolicited (proactive nudges, automation results) — append fresh.
        messages.append(
            Message(
                id: "final-\(UUID().uuidString)",
                role: .assistant,
                content: content,
                createdAt: Date(),
            ),
        )
    }

    private func appendAck(_ content: String) {
        messages.append(
            Message(
                id: "ack-\(UUID().uuidString)",
                role: .assistant,
                content: content,
                createdAt: Date(),
            ),
        )
    }

    func send(_ text: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let bearer, let baseURL = settings.serverBaseURL else { return }

        let localId = "local-\(UUID().uuidString)"
        messages.append(
            Message(
                id: localId,
                role: .user,
                content: trimmed,
                createdAt: Date(),
            ),
        )

        let client = BoopClient(baseURL: baseURL, bearer: bearer)
        do {
            _ = try await client.sendInbound(text: trimmed)
            sendError = nil
        } catch {
            sendError = "Send failed: \(error.localizedDescription)"
        }
    }
}
