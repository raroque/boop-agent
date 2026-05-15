import Foundation

struct Message: Identifiable, Equatable {
    enum Role: String, Codable {
        case user
        case assistant
        case system
    }

    let id: String
    let role: Role
    var content: String
    let createdAt: Date
    var isStreaming: Bool = false
}

/// Decoded shape of `convex.query(api.messages.list, ...)` returned by
/// `GET /channels/ios/messages`. The server returns newest-first; the
/// client reverses for chronological display.
struct ServerMessage: Decodable {
    let _id: String
    let role: String
    let content: String
    let _creationTime: Double

    func toMessage() -> Message {
        Message(
            id: _id,
            role: Message.Role(rawValue: role) ?? .system,
            content: content,
            createdAt: Date(timeIntervalSince1970: _creationTime / 1000.0),
        )
    }
}

struct MessagesResponse: Decodable {
    let conversationId: String
    let messages: [ServerMessage]
}

struct PairCreateResponse: Decodable {
    let deviceId: String
    let code: String
    let expiresAt: Double
}

struct PairCheckResponse: Decodable {
    let paired: Bool
    let bearerToken: String?
}

struct InboundResponse: Decodable {
    let ok: Bool
    let conversationId: String
}

struct ServerError: Decodable, Error {
    let error: String
}
