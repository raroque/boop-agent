import Foundation

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

    func sendInbound(text: String) async throws -> InboundResponse {
        try await postJSON(
            path: "/channels/ios/inbound",
            body: ["text": text],
            authorized: true,
        )
    }

    func fetchMessages(limit: Int = 50) async throws -> MessagesResponse {
        guard let bearer else { throw ClientError.bearerMissing }
        var components = URLComponents(
            url: baseURL.appendingPathComponent("/channels/ios/messages"),
            resolvingAgainstBaseURL: false,
        )!
        components.queryItems = [URLQueryItem(name: "limit", value: String(limit))]
        var req = URLRequest(url: components.url!)
        req.httpMethod = "GET"
        req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        return try await perform(req)
    }

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
            (data, response) = try await URLSession.shared.data(for: req)
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

    var conversationId: String {
        switch self {
        case .delta(let id, _, _),
             .message(let id, _),
             .ack(let id, _),
             .thinking(let id, _),
             .error(let id, _, _):
            return id
        }
    }
}

/// AsyncStream of SSE events from `/channels/ios/stream`. Iterating the
/// stream blocks until the next event or disconnect. The task is
/// cancellable — call `.cancel()` on the for-await loop's Task to tear
/// down the underlying URLSession stream.
struct SSEConnection {
    let baseURL: URL
    let bearer: String

    func subscribe() -> AsyncStream<StreamEvent> {
        let baseURL = self.baseURL
        let bearer = self.bearer
        return AsyncStream<StreamEvent>(StreamEvent.self) { continuation in
            let task = Task {
                await Self.run(baseURL: baseURL, bearer: bearer) { event in
                    continuation.yield(event)
                }
                continuation.finish()
            }
            continuation.onTermination = { @Sendable _ in task.cancel() }
        }
    }

    private static func run(
        baseURL: URL,
        bearer: String,
        yield: @Sendable (StreamEvent) -> Void,
    ) async {
        var req = URLRequest(url: baseURL.appendingPathComponent("/channels/ios/stream"))
        req.httpMethod = "GET"
        req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        req.timeoutInterval = 0 // no client-side timeout — server pings every 25s

        let session = URLSession(configuration: .default)
        let bytes: URLSession.AsyncBytes
        let response: URLResponse
        do {
            (bytes, response) = try await session.bytes(for: req)
        } catch {
            return
        }
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return }

        var eventName: String?
        var dataBuffer = ""

        do {
            for try await line in bytes.lines {
                if Task.isCancelled { break }
                if line.isEmpty {
                    if let name = eventName, !dataBuffer.isEmpty,
                       let parsed = parseEvent(name: name, dataString: dataBuffer)
                    {
                        yield(parsed)
                    }
                    eventName = nil
                    dataBuffer = ""
                    continue
                }
                if line.hasPrefix(":") { continue } // comment / heartbeat
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
        } catch {
            // Stream dropped — caller decides whether to reconnect.
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

        default:
            return nil
        }
    }
}
