import Foundation

/// Shared `URLSession` that bypasses the system proxy resolver.
///
/// macOS' and the iOS Simulator's network stack walks the system proxy
/// settings on every URLRequest. When the resolver can't reach the
/// configured PAC URL (common on corporate VPNs / dev networks) it
/// blocks each request for up to ~60s before giving up. Bypassing
/// proxies makes every request fly. See the side-by-side video against
/// Telegram (which uses lower-level networking) for the prior 15-60s
/// per-request bleed.
private let httpSession: URLSession = {
    let config = URLSessionConfiguration.default
    config.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
    config.connectionProxyDictionary = [:]  // empty = no proxy
    return URLSession(configuration: config)
}()

/// HTTP + SSE client for the Boop iOS channel. All endpoints live at
/// `<serverURL>/channels/ios/*`. Pairing endpoints are unauthenticated;
/// everything else requires the bearer token.
struct BoopClient {
    let baseURL: URL
    let bearer: String?

    enum ClientError: LocalizedError {
        case http(Int, String)
        case decode(Error)
        case transport(Error)
        case bearerMissing

        var errorDescription: String? {
            switch self {
            case .http(let code, let body): return "HTTP \(code): \(body)"
            case .decode(let err): return "Decode failed: \(err.localizedDescription)"
            case .transport(let err): return err.localizedDescription
            case .bearerMissing: return "Not paired yet"
            }
        }
    }

    // MARK: - Pairing

    func pairCreate(deviceId: String) async throws -> PairCreateResponse {
        try await postJSON(
            path: "/channels/ios/pair/create",
            body: ["deviceId": deviceId],
            authorized: false,
        )
    }

    func pairCheck(deviceId: String) async throws -> PairCheckResponse {
        try await postJSON(
            path: "/channels/ios/pair/check",
            body: ["deviceId": deviceId],
            authorized: false,
        )
    }

    // MARK: - Authed

    func sendInbound(text: String, threadId: String) async throws -> InboundResponse {
        try await postJSON(
            path: "/channels/ios/inbound",
            body: ["text": text, "threadId": threadId],
            authorized: true,
        )
    }

    func fetchMessages(threadId: String, limit: Int = 50) async throws -> MessagesResponse {
        guard let bearer else { throw ClientError.bearerMissing }
        var components = URLComponents(
            url: baseURL.appendingPathComponent("/channels/ios/messages"),
            resolvingAgainstBaseURL: false,
        )!
        components.queryItems = [
            URLQueryItem(name: "threadId", value: threadId),
            URLQueryItem(name: "limit", value: String(limit)),
        ]
        var req = URLRequest(url: components.url!)
        req.httpMethod = "GET"
        req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        return try await perform(req)
    }

    // MARK: - Threads

    func listThreads() async throws -> ThreadsResponse {
        guard let bearer else { throw ClientError.bearerMissing }
        var req = URLRequest(url: baseURL.appendingPathComponent("/channels/ios/threads"))
        req.httpMethod = "GET"
        req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        return try await perform(req)
    }

    func createThread() async throws -> CreateThreadResponse {
        guard let bearer else { throw ClientError.bearerMissing }
        var req = URLRequest(url: baseURL.appendingPathComponent("/channels/ios/threads/create"))
        req.httpMethod = "POST"
        req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        return try await perform(req)
    }

    // MARK: - Files

    func fetchFiles(limit: Int = 100) async throws -> FilesResponse {
        guard let bearer else { throw ClientError.bearerMissing }
        var components = URLComponents(
            url: baseURL.appendingPathComponent("/channels/ios/files"),
            resolvingAgainstBaseURL: false,
        )!
        components.queryItems = [URLQueryItem(name: "limit", value: String(limit))]
        var req = URLRequest(url: components.url!)
        req.httpMethod = "GET"
        req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        return try await perform(req)
    }

    // MARK: - Agents

    func listAgents(threadId: String, status: String? = nil, limit: Int = 30) async throws -> AgentsResponse {
        guard let bearer else { throw ClientError.bearerMissing }
        var components = URLComponents(
            url: baseURL.appendingPathComponent("/channels/ios/agents"),
            resolvingAgainstBaseURL: false,
        )!
        var items: [URLQueryItem] = [
            URLQueryItem(name: "threadId", value: threadId),
            URLQueryItem(name: "limit", value: String(limit)),
        ]
        if let status { items.append(URLQueryItem(name: "status", value: status)) }
        components.queryItems = items
        var req = URLRequest(url: components.url!)
        req.httpMethod = "GET"
        req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        return try await perform(req)
    }

    func fetchAgentLogs(agentId: String, limit: Int = 200) async throws -> AgentLogsResponse {
        guard let bearer else { throw ClientError.bearerMissing }
        var components = URLComponents(
            url: baseURL.appendingPathComponent("/channels/ios/agents/\(agentId)/logs"),
            resolvingAgainstBaseURL: false,
        )!
        components.queryItems = [URLQueryItem(name: "limit", value: String(limit))]
        var req = URLRequest(url: components.url!)
        req.httpMethod = "GET"
        req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        return try await perform(req)
    }

    func archiveThread(threadId: String) async throws {
        guard let bearer else { throw ClientError.bearerMissing }
        var req = URLRequest(
            url: baseURL.appendingPathComponent("/channels/ios/threads/\(threadId)/archive"),
        )
        req.httpMethod = "POST"
        req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        let _: EmptyResponse = try await perform(req)
    }

    private struct EmptyResponse: Decodable { let ok: Bool? }

    // MARK: - Internals

    private func postJSON<T: Decodable>(
        path: String,
        body: [String: Any],
        authorized: Bool,
    ) async throws -> T {
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if authorized {
            guard let bearer else { throw ClientError.bearerMissing }
            req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        }
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        return try await perform(req)
    }

    private func perform<T: Decodable>(_ req: URLRequest) async throws -> T {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await httpSession.data(for: req)
        } catch {
            throw ClientError.transport(error)
        }
        guard let http = response as? HTTPURLResponse else {
            throw ClientError.http(-1, "no response")
        }
        guard (200..<300).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw ClientError.http(http.statusCode, body)
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw ClientError.decode(error)
        }
    }
}

// MARK: - SSE

/// Parsed SSE event off `/channels/ios/stream`. Only the event kinds the
/// server's STREAM_EVENTS allowlist forwards: `assistant_delta`,
/// `assistant_message`, `assistant_ack`, `thinking`, `error`. Each holds
/// the conversationId so the consumer can filter, plus its payload.
enum StreamEvent: Sendable {
    case delta(conversationId: String, text: String, seq: Int?)
    case message(conversationId: String, content: String)
    case ack(conversationId: String, content: String)
    case thinking(conversationId: String, text: String)
    case error(conversationId: String, source: String?, message: String)
    case threadIcon(conversationId: String, threadId: String, icon: String)
    case attachments(conversationId: String, attachments: [Attachment])
    case agentSpawned(conversationId: String, agentId: String, name: String, task: String)
    case agentTool(conversationId: String, agentId: String, toolName: String)
    case agentDone(conversationId: String, agentId: String, status: String)

    var conversationId: String {
        switch self {
        case .delta(let id, _, _),
             .message(let id, _),
             .ack(let id, _),
             .thinking(let id, _),
             .error(let id, _, _),
             .threadIcon(let id, _, _),
             .attachments(let id, _),
             .agentSpawned(let id, _, _, _),
             .agentTool(let id, _, _),
             .agentDone(let id, _, _):
            return id
        }
    }
}

/// AsyncStream of SSE events from `/channels/ios/stream`.
///
/// Implementation uses `URLSessionDataDelegate.didReceive(_ data:)` so we
/// get streaming chunks as the server flushes them. `URLSession.bytes(for:)`
/// turned out unreliable for SSE — it tended to wait for "completion" and
/// never yielded body chunks until the connection closed.
struct SSEConnection {
    let baseURL: URL
    let bearer: String
    let threadId: String     // ← NEW

    func subscribe() -> AsyncStream<StreamEvent> {
        let baseURL = self.baseURL
        let bearer = self.bearer
        let threadId = self.threadId
        return AsyncStream<StreamEvent>(StreamEvent.self, bufferingPolicy: .unbounded) { continuation in
            let delegate = SSEDelegate(onEvent: { event in
                continuation.yield(event)
            }, onFinish: {
                continuation.finish()
            })
            let configuration = URLSessionConfiguration.ephemeral  // no cache, no persistent cookies
            configuration.timeoutIntervalForRequest = 0       // never time out per-request
            configuration.timeoutIntervalForResource = 0      // never time out the whole resource
            configuration.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
            configuration.networkServiceType = .responsiveData // prioritise low-latency delivery
            configuration.httpMaximumConnectionsPerHost = 4
            configuration.connectionProxyDictionary = [:]      // bypass system proxy (PAC) — see httpSession comment
            configuration.httpAdditionalHeaders = [
                "Cache-Control": "no-cache",
                "Pragma": "no-cache",
            ]
            let session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)

            var components = URLComponents(
                url: baseURL.appendingPathComponent("/channels/ios/stream"),
                resolvingAgainstBaseURL: false,
            )!
            components.queryItems = [URLQueryItem(name: "threadId", value: threadId)]
            var request = URLRequest(url: components.url!)
            request.httpMethod = "GET"
            request.networkServiceType = .responsiveData
            request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
            request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
            request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
            request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")  // disable gzip — kills SSE streaming

            let task = session.dataTask(with: request)
            task.resume()

            continuation.onTermination = { @Sendable _ in
                task.cancel()
                session.invalidateAndCancel()
            }
        }
    }
}

/// URLSession delegate that parses SSE on the fly from `didReceive data`
/// callbacks and emits typed StreamEvents through a closure.
private final class SSEDelegate: NSObject, URLSessionDataDelegate, @unchecked Sendable {
    private let onEvent: @Sendable (StreamEvent) -> Void
    private let onFinish: @Sendable () -> Void
    private var lineBuffer = ""
    private var eventName: String?
    private var dataBuffer = ""

    init(
        onEvent: @escaping @Sendable (StreamEvent) -> Void,
        onFinish: @escaping @Sendable () -> Void,
    ) {
        self.onEvent = onEvent
        self.onFinish = onFinish
    }

    func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive response: URLResponse,
        completionHandler: @escaping (URLSession.ResponseDisposition) -> Void,
    ) {
        if let http = response as? HTTPURLResponse, http.statusCode == 200 {
            completionHandler(.allow)
        } else {
            completionHandler(.cancel)
        }
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard let chunk = String(data: data, encoding: .utf8) else { return }
        lineBuffer.append(chunk)

        // Process complete lines; keep any trailing partial line in the buffer.
        while let newlineRange = lineBuffer.range(of: "\n") {
            let line = String(lineBuffer[..<newlineRange.lowerBound])
            lineBuffer.removeSubrange(..<newlineRange.upperBound)
            handle(line: line)
        }
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didCompleteWithError error: Error?,
    ) {
        onFinish()
    }

    private func handle(line rawLine: String) {
        // SSE allows `\r\n`; strip a trailing CR if present.
        let line = rawLine.hasSuffix("\r") ? String(rawLine.dropLast()) : rawLine

        if line.isEmpty {
            // End of one event — flush.
            if let name = eventName, !dataBuffer.isEmpty,
               let parsed = SSEDelegate.parseEvent(name: name, dataString: dataBuffer)
            {
                onEvent(parsed)
            }
            eventName = nil
            dataBuffer = ""
            return
        }
        if line.hasPrefix(":") { return } // comment / heartbeat

        if line.hasPrefix("event:") {
            eventName = String(line.dropFirst("event:".count))
                .trimmingCharacters(in: .whitespaces)
        } else if line.hasPrefix("data:") {
            let chunk = String(line.dropFirst("data:".count))
                .trimmingCharacters(in: .whitespaces)
            if !dataBuffer.isEmpty { dataBuffer.append("\n") }
            dataBuffer.append(chunk)
        }
    }

    private static func parseEvent(name: String, dataString: String) -> StreamEvent? {
        guard let payloadData = dataString.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: payloadData),
              let dict = object as? [String: Any],
              let conversationId = dict["conversationId"] as? String
        else { return nil }

        switch name {
        case "assistant_delta":
            let text = (dict["text"] as? String)
                ?? (dict["delta"] as? String)
                ?? (dict["content"] as? String)
                ?? ""
            guard !text.isEmpty else { return nil }
            return .delta(conversationId: conversationId, text: text, seq: dict["seq"] as? Int)

        case "assistant_message":
            let content = (dict["content"] as? String) ?? ""
            return .message(conversationId: conversationId, content: content)

        case "assistant_ack":
            let content = (dict["content"] as? String) ?? ""
            guard !content.isEmpty else { return nil }
            return .ack(conversationId: conversationId, content: content)

        case "thinking":
            let text = (dict["t"] as? String) ?? (dict["text"] as? String) ?? ""
            return .thinking(conversationId: conversationId, text: text)

        case "error":
            let message = (dict["message"] as? String) ?? "server error"
            let source = dict["source"] as? String
            return .error(conversationId: conversationId, source: source, message: message)

        case "thread_icon":
            guard let threadId = dict["threadId"] as? String,
                  let icon = dict["icon"] as? String
            else { return nil }
            return .threadIcon(conversationId: conversationId, threadId: threadId, icon: icon)

        case "assistant_attachments":
            guard let raw = dict["attachments"] as? [[String: Any]] else { return nil }
            let decoder = JSONDecoder()
            let parsed: [Attachment] = raw.compactMap { dict in
                guard let data = try? JSONSerialization.data(withJSONObject: dict),
                      let att = try? decoder.decode(Attachment.self, from: data)
                else { return nil }
                return att
            }
            guard !parsed.isEmpty else { return nil }
            return .attachments(conversationId: conversationId, attachments: parsed)

        case "agent_spawned":
            guard let agentId = dict["agentId"] as? String,
                  let name = dict["name"] as? String
            else { return nil }
            let task = (dict["task"] as? String) ?? ""
            return .agentSpawned(conversationId: conversationId, agentId: agentId, name: name, task: task)

        case "agent_tool":
            guard let agentId = dict["agentId"] as? String,
                  let toolName = dict["toolName"] as? String
            else { return nil }
            return .agentTool(conversationId: conversationId, agentId: agentId, toolName: toolName)

        case "agent_done":
            guard let agentId = dict["agentId"] as? String else { return nil }
            let status = (dict["status"] as? String) ?? "completed"
            return .agentDone(conversationId: conversationId, agentId: agentId, status: status)

        default:
            return nil
        }
    }
}
